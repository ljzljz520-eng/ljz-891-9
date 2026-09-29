'use strict';
require('dotenv').config();

function bool(v, def = false) {
  if (v === undefined) return def;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}
function int(v, def) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

module.exports = {
  port: int(process.env.PORT, 3000),
  env: process.env.NODE_ENV || 'development',
  trustProxy: int(process.env.TRUST_PROXY, 1),

  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: int(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'dealer_qualification',
    connectionLimit: int(process.env.DB_CONNECTION_LIMIT, 10),
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-insecure-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '12h',
  },

  initAdmin: {
    username: process.env.INIT_ADMIN_USERNAME || 'admin',
    password: process.env.INIT_ADMIN_PASSWORD || 'Admin@123456',
    email: process.env.INIT_ADMIN_EMAIL || '',
  },

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: int(process.env.SMTP_PORT, 465),
    secure: bool(process.env.SMTP_SECURE, true),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || process.env.SMTP_USER || 'no-reply@example.com',
  },
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/+$/, ''),

  csvMaxSizeKb: int(process.env.CSV_MAX_SIZE_KB, 5120),
};
