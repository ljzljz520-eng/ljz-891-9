'use strict';
const express = require('express');
const multer = require('multer');
const { pool } = require('../config/db');
const config = require('../config');
const { ok, fail, parseDate, normalizeStatus, deriveStatus } = require('../utils/helpers');
const { parseQualificationCsv } = require('../utils/csv');
const { authRequired } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired); // 本路由全部需要登录

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.csvMaxSizeKb * 1024 },
  fileFilter: (req, file, cb) => {
    const okName = /\.csv$/i.test(file.originalname) || file.mimetype === 'text/csv' || file.mimetype === 'application/vnd.ms-excel';
    cb(okName ? null : new Error('仅支持 .csv 文件'), okName);
  },
});

/** GET /api/qualifications?keyword=&state=&page=&page_size= */
router.get('/', async (req, res, next) => {
  try {
    const keyword = String(req.query.keyword || '').trim();
    const state = String(req.query.state || '').trim(); // valid|expired|pending|revoked
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.page_size, 10) || 20));

    const where = [];
    const params = [];
    if (keyword) {
      const like = `%${keyword.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
      where.push("(dealer_name LIKE ? ESCAPE '\\\\' OR store_code LIKE ? ESCAPE '\\\\' OR brand LIKE ? ESCAPE '\\\\' OR region LIKE ? ESCAPE '\\\\' OR parent_agent LIKE ? ESCAPE '\\\\')");
      params.push(like, like, like, like, like);
    }
    if (['valid', 'expired', 'pending', 'revoked'].includes(state)) {
      const today = new Date().toISOString().slice(0, 10);
      if (state === 'valid') {
        where.push("status='active' AND valid_from <= ? AND valid_until >= ?");
        params.push(today, today);
      } else if (state === 'expired') {
        where.push("status='active' AND valid_until < ?");
        params.push(today);
      } else if (state === 'pending') {
        where.push("status='active' AND valid_from > ?");
        params.push(today);
      } else {
        where.push("status='revoked'");
      }
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM qualifications ${whereSql}`, params);
    const total = countRows[0].total;
    const [rows] = await pool.query(
      `SELECT id, dealer_name, store_code, brand, region, parent_agent,
              valid_from, valid_until, opened_at, status, created_at, updated_at
         FROM qualifications ${whereSql}
        ORDER BY updated_at DESC, id DESC
        LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize]
    );
    const today = new Date().toISOString().slice(0, 10);
    const list = rows.map((r) => ({ ...r, state: deriveStatus(r, today) }));

    return ok(res, { list, total, page, page_size: pageSize });
  } catch (e) {
    return next(e);
  }
});

function validateBody(body) {
  const v = {
    dealer_name: String(body.dealer_name || '').trim(),
    store_code: String(body.store_code || '').trim(),
    brand: String(body.brand || '').trim(),
    region: String(body.region || '').trim(),
    parent_agent: String(body.parent_agent || '').trim(),
    valid_from: parseDate(body.valid_from),
    valid_until: parseDate(body.valid_until),
    opened_at: parseDate(body.opened_at),
    status: normalizeStatus(body.status) || 'active',
  };
  const errors = [];
  for (const [f, label] of Object.entries({ dealer_name: '经销商名称', store_code: '门店编号', brand: '授权品牌', region: '授权区域' })) {
    if (!v[f]) errors.push(`${label}不能为空`);
  }
  if (body.valid_from && !v.valid_from) errors.push('有效期开始格式不正确');
  if (body.valid_until && !v.valid_until) errors.push('有效期截止格式不正确');
  if (!v.valid_from) errors.push('有效期开始必填');
  if (!v.valid_until) errors.push('有效期截止必填');
  if (v.valid_from && v.valid_until && v.valid_from > v.valid_until) errors.push('有效期开始不能晚于截止');
  return { v, errors };
}

/** GET /api/qualifications/stats/summary  首页统计（放在 /:id 之前） */
router.get('/stats/summary', async (req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const [[a]] = await pool.query('SELECT COUNT(*) c FROM admins');
    const [[q]] = await pool.query('SELECT COUNT(*) c FROM qualifications');
    const [[valid]] = await pool.query(
      "SELECT COUNT(*) c FROM qualifications WHERE status='active' AND valid_from <= ? AND valid_until >= ?",
      [today, today]
    );
    const [[expiring]] = await pool.query(
      "SELECT COUNT(*) c FROM qualifications WHERE status='active' AND valid_until BETWEEN ? AND ?",
      [today, in30]
    );
    const [[expired]] = await pool.query(
      "SELECT COUNT(*) c FROM qualifications WHERE status='active' AND valid_until < ?",
      [today]
    );
    const [[revoked]] = await pool.query("SELECT COUNT(*) c FROM qualifications WHERE status='revoked'");
    const [[stores]] = await pool.query('SELECT COUNT(DISTINCT store_code) c FROM qualifications');
    const [[brands]] = await pool.query('SELECT COUNT(DISTINCT brand) c FROM qualifications');
    const [[todayQueries]] = await pool.query(
      'SELECT COUNT(*) c FROM query_logs WHERE created_at >= CURDATE()'
    );
    return ok(res, {
      admins: a.c, qualifications: q.c, valid: valid.c, expiring: expiring.c,
      expired: expired.c, revoked: revoked.c, stores: stores.c, brands: brands.c,
      today_queries: todayQueries.c,
    });
  } catch (e) {
    return next(e);
  }
});

/** GET /api/qualifications/template.csv  下载导入模板 */
router.get('/template.csv', (req, res) => {
  const header = '经销商名称,门店编号,授权品牌,授权区域,上级代理,有效期开始,有效期截止,开通时间,状态';
  const sample = [
    '华东电器有限公司,SH-001,海尔,上海市浦东新区,海尔上海分公司,2025-01-01,2026-12-31,2024-06-01,有效',
    '华东电器有限公司,SH-001,美的,上海市浦东新区,美的华东总代理,2025-03-01,2027-02-28,2024-06-01,有效',
  ].join('\n');
  const csv = '﻿' + header + '\n' + sample + '\n';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="qualification_template.csv"');
  res.send(csv);
});

/** POST /api/qualifications  新增单条 */
router.post('/', async (req, res, next) => {
  try {
    const { v, errors } = validateBody(req.body);
    if (errors.length) return fail(res, errors.join('；'), 422);
    try {
      const [result] = await pool.query(
        `INSERT INTO qualifications
           (dealer_name, store_code, brand, region, parent_agent, valid_from, valid_until, opened_at, status, created_by, updated_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [v.dealer_name, v.store_code, v.brand, v.region, v.parent_agent, v.valid_from, v.valid_until, v.opened_at, v.status, req.admin.sub, req.admin.sub]
      );
      return ok(res, { id: result.insertId }, '新增成功');
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') return fail(res, '该门店对此品牌的授权记录已存在（门店编号+品牌唯一）', 409);
      throw e;
    }
  } catch (e) {
    return next(e);
  }
});

/** PUT /api/qualifications/:id  修改单条 */
router.put('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return fail(res, '无效的记录 ID', 422);
    const { v, errors } = validateBody(req.body);
    if (errors.length) return fail(res, errors.join('；'), 422);
    try {
      const [result] = await pool.query(
        `UPDATE qualifications SET
            dealer_name=?, store_code=?, brand=?, region=?, parent_agent=?,
            valid_from=?, valid_until=?, opened_at=?, status=?, updated_by=?
          WHERE id=?`,
        [v.dealer_name, v.store_code, v.brand, v.region, v.parent_agent, v.valid_from, v.valid_until, v.opened_at, v.status, req.admin.sub, id]
      );
      if (!result.affectedRows) return fail(res, '记录不存在', 404);
      return ok(res, null, '修改成功');
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') return fail(res, '门店编号+品牌与其他记录冲突', 409);
      throw e;
    }
  } catch (e) {
    return next(e);
  }
});

/** DELETE /api/qualifications/:id */
router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [result] = await pool.query('DELETE FROM qualifications WHERE id = ?', [id]);
    if (!result.affectedRows) return fail(res, '记录不存在', 404);
    return ok(res, null, '已删除');
  } catch (e) {
    return next(e);
  }
});



/**
 * POST /api/qualifications/import  CSV 导入
 * form-data: file=@xxx.csv ；query 参数 dry_run=1 仅校验不写库
 * 规则：同一文件内 (门店编号+品牌) 不可重复；与库内冲突则更新（upsert）
 */
router.post('/import', upload.single('file'), async (req, res, next) => {
  let conn;
  try {
    if (!req.file) return fail(res, '请上传 CSV 文件（字段名 file）', 422);
    const dryRun = String(req.query.dry_run || '').toLowerCase() === '1';
    const text = req.file.buffer.toString('utf8');
    const { rows, errors } = parseQualificationCsv(text);

    if (errors.length) {
      return fail(res, `校验未通过，共 ${errors.length} 处错误（未写入任何数据）`, 422, 422, {
        inserted: 0, updated: 0, total: rows.length + errors.length, errors: errors.slice(0, 100),
      });
    }
    if (!rows.length) return fail(res, 'CSV 中没有可导入的数据', 422);
    if (dryRun) {
      return ok(res, { dry_run: true, total: rows.length, inserted: 0, updated: 0 }, `校验通过，共 ${rows.length} 条可导入`);
    }

    conn = await pool.getConnection();
    await conn.beginTransaction();
    let inserted = 0;
    let updated = 0;
    try {
      for (const r of rows) {
        const [exist] = await conn.query(
          'SELECT id, dealer_name, region, parent_agent, valid_from, valid_until, opened_at, status FROM qualifications WHERE store_code=? AND brand=? FOR UPDATE',
          [r.store_code, r.brand]
        );
        if (exist.length === 0) {
          await conn.query(
            `INSERT INTO qualifications
               (dealer_name, store_code, brand, region, parent_agent, valid_from, valid_until, opened_at, status, created_by, updated_by)
             VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
            [r.dealer_name, r.store_code, r.brand, r.region, r.parent_agent, r.valid_from, r.valid_until, r.opened_at, r.status, req.admin.sub, req.admin.sub]
          );
          inserted++;
        } else {
          const cur = exist[0];
          if (
            cur.dealer_name !== r.dealer_name || cur.region !== r.region || cur.parent_agent !== r.parent_agent ||
            cur.valid_from !== r.valid_from || cur.valid_until !== r.valid_until ||
            ((cur.opened_at || null) !== (r.opened_at || null)) || cur.status !== r.status
          ) {
            await conn.query(
              `UPDATE qualifications SET dealer_name=?, region=?, parent_agent=?,
                  valid_from=?, valid_until=?, opened_at=?, status=?, updated_by=?
                WHERE store_code=? AND brand=?`,
              [r.dealer_name, r.region, r.parent_agent, r.valid_from, r.valid_until, r.opened_at, r.status, req.admin.sub, r.store_code, r.brand]
            );
            updated++;
          }
        }
      }
      await conn.commit();
    } catch (e) {
      if (conn) await conn.rollback();
      throw e;
    } finally {
      if (conn) conn.release();
      conn = null;
    }

    return ok(
      res,
      { inserted, updated, unchanged: rows.length - inserted - updated, total: rows.length },
      `导入完成：新增 ${inserted} 条，更新 ${updated} 条，无变化 ${rows.length - inserted - updated} 条`
    );
  } catch (e) {
    if (conn) conn.release();
    return next(e);
  }
});

module.exports = router;
