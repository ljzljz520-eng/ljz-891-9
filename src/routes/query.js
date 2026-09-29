'use strict';
const express = require('express');
const rateLimit = require('express-rate-limit');
const { pool } = require('../config/db');
const { ok, fail, deriveStatus } = require('../utils/helpers');

const router = express.Router();

// 公开查询限流：每 IP 每分钟 30 次
const queryLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { code: 429, message: '查询过于频繁，请稍后再试' },
});

/**
 * GET /api/query?dealer_name=&store_code=
 * 返回门店下各品牌授权资质（仅 status=active 的记录，再由有效期派生状态）
 */
router.get('/', queryLimiter, async (req, res, next) => {
  try {
    const dealerName = String(req.query.dealer_name || '').trim();
    const storeCode = String(req.query.store_code || '').trim();
    if (!dealerName) return fail(res, '请输入经销商名称', 422);
    if (!storeCode) return fail(res, '请输入门店编号', 422);
    if (dealerName.length > 128 || storeCode.length > 64) {
      return fail(res, '查询条件过长', 422);
    }

    // 转义 LIKE 通配符，避免客户输入的 % _ 被当成模式字符
    const likeParam = `%${dealerName.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
    const [rows] = await pool.query(
      `SELECT id, dealer_name, store_code, brand, region, parent_agent,
              valid_from, valid_until, opened_at, status
         FROM qualifications
        WHERE status = 'active'
          AND store_code = ?
          AND dealer_name LIKE ? ESCAPE '\\\\'
        ORDER BY brand ASC, valid_until DESC`,
      [storeCode, likeParam]
    );

    const today = new Date().toISOString().slice(0, 10);
    const authorizations = rows.map((r) => {
      const state = deriveStatus(r, today);
      return {
        brand: r.brand,
        region: r.region,
        parent_agent: r.parent_agent || '—',
        valid_from: r.valid_from,
        valid_until: r.valid_until,
        opened_at: r.opened_at || '—',
        state,
      };
    });

    let data = null;
    if (rows.length) {
      const brands = authorizations.map((a) => a.brand);
      const hasValid = authorizations.some((a) => ['valid', 'pending'].includes(a.state));
      data = {
        dealer_name: rows[0].dealer_name,
        store_code: rows[0].store_code,
        region: rows[0].region,
        opened_at: rows.map((r) => r.opened_at).find(Boolean) || '—',
        brands,
        authorizations,
        overall_state: hasValid ? 'authorized' : 'expired',
      };
    }

    // 记录查询日志（不阻塞响应）
    pool.query(
      'INSERT INTO query_logs (dealer_name, store_code, hit_count, ip, user_agent) VALUES (?,?,?,?,?)',
      [dealerName, storeCode, rows.length, (req.ip || '').slice(0, 45), String(req.get('user-agent') || '').slice(0, 255)]
    ).catch((e) => console.error('[query_log]', e.message));

    return ok(res, data, 'ok');
  } catch (e) {
    return next(e);
  }
});

module.exports = router;
