const jwt = require('jsonwebtoken');
const { Admin } = require('../models');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret_change_me';

// 验证 JWT，挂载 admin 到 req
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      return res.status(401).json({ success: false, message: '未登录或登录已过期' });
    }
    const decoded = jwt.verify(token, JWT_SECRET);
    const admin = await Admin.findByPk(decoded.id);
    if (!admin) {
      return res.status(401).json({ success: false, message: '账号不存在' });
    }
    if (admin.status !== 'active') {
      return res.status(403).json({ success: false, message: '账号已被禁用' });
    }
    req.admin = admin;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: '登录已过期，请重新登录' });
    }
    return res.status(401).json({ success: false, message: '无效的登录凭证' });
  }
}

// 角色校验
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.admin || !roles.includes(req.admin.role)) {
      return res.status(403).json({ success: false, message: '无权限执行此操作' });
    }
    next();
  };
}

module.exports = { authenticate, requireRole, JWT_SECRET };
