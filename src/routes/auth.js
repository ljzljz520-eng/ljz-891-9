'use strict';
const express = require('express');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const config = require('../config');
const { sendResetPasswordMail, getTransporter } = require('../config/mailer');
const { ok, fail } = require('../utils/helpers');
const { signToken, authRequired } = require('../middleware/auth');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { code: 429, message: '尝试次数过多，请 15 分钟后再试' },
});

/** POST /api/auth/login  管理员登录 */
router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    if (!username || !password) return fail(res, '请输入用户名和密码', 422);

    const [rows] = await pool.query(
      'SELECT id, username, password_hash, display_name, email, role, is_active FROM admins WHERE username = ? LIMIT 1',
      [username]
    );
    const admin = rows[0];
    if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
      return fail(res, '用户名或密码错误', 401);
    }
    if (!admin.is_active) return fail(res, '账号已被停用，请联系超级管理员', 403);

    const token = signToken(admin);
    return ok(res, {
      token,
      admin: { id: admin.id, username: admin.username, name: admin.display_name, email: admin.email, role: admin.role },
    }, '登录成功');
  } catch (e) {
    return next(e);
  }
});

/** GET /api/auth/me  当前登录信息 */
router.get('/me', authRequired, async (req, res) => {
  ok(res, { id: req.admin.sub, username: req.admin.username, name: req.admin.name, role: req.admin.role });
});

/** POST /api/auth/forgot-password  发送重置密码邮件 */
router.post('/forgot-password', loginLimiter, async (req, res, next) => {
  try {
    const username = String(req.body.username || '').trim();
    if (!username) return fail(res, '请输入用户名', 422);

    const [rows] = await pool.query(
      'SELECT id, username, display_name, email, is_active FROM admins WHERE username = ? LIMIT 1',
      [username]
    );
    const admin = rows[0];

    // 不暴露用户名是否存在；未配置邮箱时给出明确提示
    if (admin && admin.is_active && admin.email && getTransporter()) {
      const token = jwt.sign({ pwd_reset: admin.id }, config.jwt.secret, { expiresIn: '15m' });
      try {
        await sendResetPasswordMail(admin.email, token, admin.display_name);
      } catch (mailErr) {
        console.error('[mail]', mailErr.message);
        return fail(res, '邮件发送失败，请联系系统管理员检查 SMTP 配置', 502);
      }
    }
    // 用户名不存在 / 无邮箱时同样返回成功，避免被枚举
    return ok(res, null, '若账号存在且已登记邮箱，重置链接将发送至对应邮箱（15 分钟内有效）');
  } catch (e) {
    return next(e);
  }
});

/** POST /api/auth/reset-password  凭邮件令牌重置密码 */
router.post('/reset-password', loginLimiter, async (req, res, next) => {
  try {
    const token = String(req.body.token || '');
    const password = String(req.body.password || '');
    if (!token) return fail(res, '缺少重置令牌', 422);
    if (password.length < 8 || password.length > 64) {
      return fail(res, '新密码长度需为 8-64 位', 422);
    }
    let payload;
    try {
      payload = jwt.verify(token, config.jwt.secret);
    } catch (e) {
      return fail(res, '重置链接无效或已过期，请重新申请', 400);
    }
    if (!payload.pwd_reset) return fail(res, '重置链接无效', 400);

    const hash = bcrypt.hashSync(password, 10);
    await pool.query('UPDATE admins SET password_hash = ?, is_active = 1 WHERE id = ?', [hash, payload.pwd_reset]);
    return ok(res, null, '密码已重置，请使用新密码登录');
  } catch (e) {
    return next(e);
  }
});

/** POST /api/auth/change-password  已登录修改自己的密码 */
router.post('/change-password', authRequired, async (req, res, next) => {
  try {
    const oldPwd = String(req.body.old_password || '');
    const newPwd = String(req.body.new_password || '');
    if (newPwd.length < 8 || newPwd.length > 64) return fail(res, '新密码长度需为 8-64 位', 422);

    const [rows] = await pool.query('SELECT password_hash FROM admins WHERE id = ? LIMIT 1', [req.admin.sub]);
    if (!rows[0] || !bcrypt.compareSync(oldPwd, rows[0].password_hash)) {
      return fail(res, '原密码不正确', 400);
    }
    await pool.query('UPDATE admins SET password_hash = ? WHERE id = ?', [bcrypt.hashSync(newPwd, 10), req.admin.sub]);
    return ok(res, null, '密码修改成功');
  } catch (e) {
    return next(e);
  }
});

module.exports = router;
