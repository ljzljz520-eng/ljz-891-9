const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { Admin } = require('../models');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate, requireRole('super_admin'));

// 管理员列表
router.get('/', async (req, res) => {
  try {
    const list = await Admin.findAll({ order: [['createdAt', 'DESC']] });
    res.json({ success: true, data: list.map((a) => a.toSafeJSON()) });
  } catch (err) {
    console.error('获取管理员列表失败:', err);
    res.status(500).json({ success: false, message: '服务器内部错误' });
  }
});

// 新增管理员
router.post('/', async (req, res) => {
  try {
    const { username, password, email, role, remark } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: '用户名和密码必填' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: '密码长度至少 6 位' });
    }
    if (role && !['super_admin', 'admin'].includes(role)) {
      return res.status(400).json({ success: false, message: '角色不合法' });
    }
    const exists = await Admin.findOne({ where: { username: String(username).trim() } });
    if (exists) {
      return res.status(409).json({ success: false, message: '用户名已存在' });
    }
    const admin = await Admin.create({
      username: String(username).trim(),
      password,
      email: email || null,
      role: role || 'admin',
      remark: remark || null,
      status: 'active'
    });
    res.status(201).json({ success: true, message: '管理员创建成功', data: admin.toSafeJSON() });
  } catch (err) {
    console.error('新增管理员失败:', err);
    res.status(500).json({ success: false, message: '服务器内部错误' });
  }
});

// 更新管理员（角色、状态、邮箱、备注）
router.put('/:id', async (req, res) => {
  try {
    const admin = await Admin.findByPk(req.params.id);
    if (!admin) {
      return res.status(404).json({ success: false, message: '管理员不存在' });
    }
    const { email, role, status, remark, password } = req.body;
    if (role && !['super_admin', 'admin'].includes(role)) {
      return res.status(400).json({ success: false, message: '角色不合法' });
    }
    // 不允许超级管理员把自己降级或禁用
    if (admin.id === req.admin.id) {
      if (role && role !== 'super_admin') {
        return res.status(400).json({ success: false, message: '不能修改自己的超级管理员角色' });
      }
      if (status && status !== 'active') {
        return res.status(400).json({ success: false, message: '不能禁用自己的账号' });
      }
    }
    if (email !== undefined) admin.email = email;
    if (role !== undefined) admin.role = role;
    if (status !== undefined) admin.status = status;
    if (remark !== undefined) admin.remark = remark;
    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ success: false, message: '密码长度至少 6 位' });
      }
      admin.password = password;
    }
    await admin.save();
    res.json({ success: true, message: '管理员信息已更新', data: admin.toSafeJSON() });
  } catch (err) {
    console.error('更新管理员失败:', err);
    res.status(500).json({ success: false, message: '服务器内部错误' });
  }
});

// 删除管理员
router.delete('/:id', async (req, res) => {
  try {
    if (Number(req.params.id) === req.admin.id) {
      return res.status(400).json({ success: false, message: '不能删除自己的账号' });
    }
    const admin = await Admin.findByPk(req.params.id);
    if (!admin) {
      return res.status(404).json({ success: false, message: '管理员不存在' });
    }
    await admin.destroy();
    res.json({ success: true, message: '管理员已删除' });
  } catch (err) {
    console.error('删除管理员失败:', err);
    res.status(500).json({ success: false, message: '服务器内部错误' });
  }
});

module.exports = router;
