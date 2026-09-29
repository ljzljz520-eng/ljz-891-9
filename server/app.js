require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const { sequelize, Admin } = require('./models');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'ok', time: new Date().toISOString() });
});

// 路由
app.use('/api/query', require('./routes/query'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin/dealers', require('./routes/dealers'));
app.use('/api/admin/authorizations', require('./routes/authorizations'));
app.use('/api/admin/import', require('./routes/import'));
app.use('/api/admin/admins', require('./routes/admins'));
app.use('/api/admin/logs', require('./routes/logs'));
app.use('/api/admin/stats', require('./routes/stats'));
app.use('/api/admin/mail', require('./routes/mail'));

// 前端路由（SPA 回退）
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
});
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// 404
app.use((req, res) => {
  res.status(404).json({ success: false, message: '接口不存在' });
});

// 错误处理
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({ success: false, message: err.message || '服务器内部错误' });
});

// 初始化数据库并启动
async function start() {
  try {
    await sequelize.authenticate();
    console.log('数据库连接成功');
    await sequelize.sync({ alter: process.env.NODE_ENV === 'development' });
    console.log('数据表同步完成');

    // 初始化超级管理员
    const initUsername = process.env.INIT_ADMIN_USERNAME || 'admin';
    const initPassword = process.env.INIT_ADMIN_PASSWORD || 'admin123';
    const initEmail = process.env.INIT_ADMIN_EMAIL || 'admin@example.com';
    const existing = await Admin.findOne({ where: { username: initUsername } });
    if (!existing) {
      await Admin.create({
        username: initUsername,
        password: initPassword,
        email: initEmail,
        role: 'super_admin',
        status: 'active',
        remark: '系统初始化超级管理员'
      });
      console.log(`初始化超级管理员成功: ${initUsername} / ${initPassword}`);
    }

    app.listen(PORT, () => {
      console.log(`服务已启动: http://localhost:${PORT}`);
      console.log(`查询首页: http://localhost:${PORT}/`);
      console.log(`管理后台: http://localhost:${PORT}/admin`);
    });
  } catch (err) {
    console.error('启动失败:', err);
    process.exit(1);
  }
}

start();

module.exports = app;
