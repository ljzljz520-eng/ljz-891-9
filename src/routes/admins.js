'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const { ok, fail } = require('../utils/helpers');
const { authRequired, superAdminRequired } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired, superAdminRequired);

/** GET /api/admins  管理员列表 */
router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, username, display_name, email, role, is_active, created_at
         FROM admins ORDER BY id ASC`
    );
    return ok(res, rows);
  } catch (e) {
    return next(e);
  }
});

function readAdminBody(body) {
  return {
    username: String(body.username || '').trim(),
    display_name: String(body.display_name || '').trim(),
    email: String(body.email || '').trim(),
    role: body.role === 'super_admin' ? 'super_admin' : 'admin',
    is_active: body.is_active === undefined ? 1 : (body.is_active ? 1 : 0),
  };
}

/** POST /api/admins  新建管理员 */
router.post('/', async (req, res, next) => {
  try {
    const v = readAdminBody(req.body);
    const password = String(req.body.password || '');
    if (!/^[A-Za-z0-9_.-]{3,64}$/.test(v.username)) {
      return fail(res, '用户名需为 3-64 位字母、数字或 _ . -', 422);
    }
    if (!v.display_name) return fail(res, '请填写姓名/昵称', 422);
    if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) return fail(res, '邮箱格式不正确', 422);
    if (password.length < 8 || password.length > 64) return fail(res, '初始密码长度需为 8-64 位', 422);

    try {
      const [result] = await pool.query(
        'INSERT INTO admins (username, password_hash, display_name, email, role, is_active) VALUES (?,?,?,?,?,?)',
        [v.username, bcrypt.hashSync(password, 10), v.display_name, v.email || null, v.role, v.is_active]
      );
      return ok(res, { id: result.insertId }, '管理员创建成功');
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') return fail(res, '用户名已存在', 409);
      throw e;
    }
  } catch (e) {
    return next(e);
  }
});

/** PUT /api/admins/:id  编辑资料/角色/启停；body.password 可选（留空不改密码） */
router.put('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return fail(res, '无效 ID', 422);
    const v = readAdminBody(req.body);
    const password = String(req.body.password || '');
    if (password && (password.length < 8 || password.length > 64)) return fail(res, '密码长度需为 8-64 位', 422);
    if (!v.display_name) return fail(res, '请填写姓名/昵称', 422);
    if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) return fail(res, '邮箱格式不正确', 422);

    // 保护：不允许停用/降级自己，避免锁死系统
    if (id === req.admin.sub && (v.role !== 'super_admin' || !v.is_active)) {
      return fail(res, '不能停用或降级当前登录的超级管理员账号', 409);
    }

    let sql;
    let params;
    if (password) {
      sql = `UPDATE admins SET username=?, display_name=?, email=?, role=?, is_active=?, password_hash=? WHERE id=?`;
      params = [v.username, v.display_name, v.email || null, v.role, v.is_active, bcrypt.hashSync(password, 10), id];
    } else {
      sql = `UPDATE admins SET username=?, display_name=?, email=?, role=?, is_active=? WHERE id=?`;
      params = [v.username, v.display_name, v.email || null, v.role, v.is_active, id];
    }
    try {
      const [result] = await pool.query(sql, params);
      if (!result.affectedRows) return fail(res, '管理员不存在', 404);
      return ok(res, null, '保存成功');
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') return fail(res, '用户名已存在', 409);
      throw e;
    }
  } catch (e) {
    return next(e);
  }
});

/** DELETE /api/admins/:id */
router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (id === req.admin.sub) return fail(res, '不能删除自己的账号', 409);
    const [result] = await pool.query('DELETE FROM admins WHERE id = ?', [id]);
    if (!result.affectedRows) return fail(res, '管理员不存在', 404);
    return ok(res, null, '已删除');
  } catch (e) {
    return next(e);
  }
});

module.exports = router;
