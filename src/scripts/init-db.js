'use strict';
/**
 * 手动初始化数据库脚本：建表 + 创建初始管理员（幂等，可重复执行）
 * 用法：npm run init-db
 */
const bcrypt = require('bcryptjs');
const config = require('../config');
const { pool, initSchema } = require('../config/db');

(async () => {
  try {
    await initSchema();
    console.log('✓ 数据表创建/检查完成');

    const [[{ c }]] = await pool.query('SELECT COUNT(*) AS c FROM admins');
    if (c === 0) {
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
      console.log(`✓ 已创建初始超级管理员: ${config.initAdmin.username} / ${config.initAdmin.password}`);
    } else {
      console.log('→ 已存在管理员账号，跳过初始账号创建');
    }
    process.exit(0);
  } catch (e) {
    console.error('初始化失败:', e.message);
    process.exit(1);
  }
})();
