'use strict';
const jwt = require('jsonwebtoken');
const config = require('../config');
const { fail } = require('../utils/helpers');

function signToken(admin) {
  return jwt.sign(
    { sub: admin.id, username: admin.username, role: admin.role, name: admin.display_name },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
}

/** 解析 Bearer Token，挂载 req.admin */
function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return fail(res, '未登录或登录已过期', 401, 401);
  try {
    req.admin = jwt.verify(token, config.jwt.secret);
    return next();
  } catch (e) {
    return fail(res, '登录已过期，请重新登录', 401, 401);
  }
}

/** 仅超级管理员 */
function superAdminRequired(req, res, next) {
  if (!req.admin || req.admin.role !== 'super_admin') {
    return fail(res, '需要超级管理员权限', 403, 403);
  }
  next();
}

module.exports = { signToken, authRequired, superAdminRequired };
