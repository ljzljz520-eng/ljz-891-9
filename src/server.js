'use strict';
const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const config = require('./config');
const { pool, initSchema, ping } = require('./config/db');
const { getTransporter } = require('./config/mailer');
const errorHandler = require('./middleware/error');

const app = express();
app.set('trust proxy', config.trustProxy);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

// 请求日志（精简）
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) return next();
  const t = Date.now();
  res.on('finish', () => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - t}ms`);
  });
  next();
});

// 健康检查（不含数据库依赖的探活）
app.get('/healthz', async (req, res) => {
  try {
    await ping();
    res.json({ ok: true, db: true });
  } catch (e) {
    res.status(503).json({ ok: false, db: false, error: e.message });
  }
});

// 业务 API
app.use('/api/query', require('./routes/query'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/qualifications', require('./routes/qualifications'));
app.use('/api/admins', require('./routes/admins'));
app.use('/api', (req, res) => res.status(404).json({ code: 404, message: 'API 不存在' }));

// 静态前端
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h' }));
app.get(/^(?!\/api\/).*/, (req, res, next) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'), (err) => err && next(err));
});

app.use(errorHandler);

async function ensureInitialAdmin() {
  const [[{ c }]] = await pool.query('SELECT COUNT(*) AS c FROM admins');
  if (c > 0) return;
  await pool.query(
    'INSERT INTO admins (username, password_hash, display_name, email, role, is_active) VALUES (?,?,?,?,?,1)',
    [
      config.initAdmin.username,
      bcrypt.hashSync(config.initAdmin.password, 10),
      '超级管理员',
      config.initAdmin.email || null,
      'super_admin',
    ]
  );
  console.log(`[init] 已创建初始超级管理员: ${config.initAdmin.username}（请尽快登录并修改密码）`);
}

async function main() {
  try {
    await ping();
    console.log('[db] MySQL 连接成功');
  } catch (e) {
    console.error('[db] 无法连接 MySQL，请检查 .env 中的 DB_* 参数：', e.message);
    process.exit(1);
  }
  await initSchema();
  console.log('[db] 数据表已就绪');
  await ensureInitialAdmin();

  if (getTransporter()) {
    console.log(`[mail] SMTP 已配置: ${config.smtp.host}:${config.smtp.port}`);
  } else {
    console.log('[mail] 未配置 SMTP，密码找回邮件功能将不可用（不影响其他功能）');
  }

  app.listen(config.port, () => {
    console.log(`[server] 品牌经销资质查询系统已启动: http://localhost:${config.port}`);
  });
}

main().catch((e) => {
  console.error('启动失败:', e);
  process.exit(1);
});
