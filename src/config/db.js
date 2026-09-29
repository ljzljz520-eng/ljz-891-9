'use strict';
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const config = require('./index');

const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  waitForConnections: true,
  connectionLimit: config.db.connectionLimit,
  charset: 'utf8mb4_general_ci',
  dateStrings: true,
});

/** 读取 schema.sql 并按分号拆成独立语句执行（幂等：CREATE TABLE IF NOT EXISTS） */
async function initSchema() {
  const sqlFile = path.join(__dirname, '..', 'sql', 'schema.sql');
  const raw = fs.readFileSync(sqlFile, 'utf8');
  const statements = raw
    .split(/;\s*(?:\r?\n|--)/g)
    .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
    .filter(Boolean);
  for (const stmt of statements) {
    await pool.query(stmt);
  }
}

async function ping() {
  await pool.query('SELECT 1');
}

module.exports = { pool, initSchema, ping };
