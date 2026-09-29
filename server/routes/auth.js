const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { Admin } = require('../models');
const { authenticate, JWT_SECRET } = require('../middleware/auth');

// 登录
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: '请输入用户名和密码' });
    }
    const admin = await Admin.findOne({ where: { username: String(username).trim() } });
    if (!admin) {
      return res.status(401).json({ success: false, message: '用户名或密码错误' });
    }
    if (admin.status !== 'active') {
      return res.status(403).json({ success: false, message: '账号已被禁用，请联系超级管理员' });
    }
    const valid = await admin.validatePassword(password);
    if (!valid) {
      return res.status(401).json({ success: false, message: '用户名或密码错误' });
    }
    const token = jwt.sign(
      { id: admin.id, username: admin.username, role: admin.role },
      JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '12h' }
    );
    admin.lastLoginAt = new Date();
    await admin.save();
    res.json({
      success: true,
      message: '登录成功',
      data: { token, admin: admin.toSafeJSON() }
    });
  } catch (err) {
    console.error('登录失败:', err);
    res.status(500).json({ success: false, message: '服务器内部错误' });
  }
});

// 获取当前管理员信息
router.get('/profile', authenticate, async (req, res) => {
  res.json({ success: true, data: req.admin.toSafeJSON() });
});

// 修改密码
router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ success: false, message: '请填写原密码和新密码' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: '新密码长度至少 6 位' });
    }
    const valid = await req.admin.validatePassword(oldPassword);
    if (!valid) {
      return res.status(400).json({ success: false, message: '原密码错误' });
    }
    req.admin.password = newPassword;
    await req.admin.save();
    res.json({ success: true, message: '密码修改成功' });
  } catch (err) {
    console.error('修改密码失败:', err);
    res.status(500).json({ success: false, message: '服务器内部错误' });
  }
});

module.exports = router;
