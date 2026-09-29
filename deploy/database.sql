-- ============================================================
-- 部署第一步：创建数据库与应用账号（用 root 执行）
--   mysql -uroot -p < deploy/database.sql
-- 请按实际情况修改下面的库名、账号、密码
-- ============================================================

CREATE DATABASE IF NOT EXISTS dealer_qualification
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_general_ci;

CREATE USER IF NOT EXISTS 'dealer_app'@'127.0.0.1'
  IDENTIFIED BY '请替换为强密码';

GRANT SELECT, INSERT, UPDATE, DELETE
  ON dealer_qualification.*
  TO 'dealer_app'@'127.0.0.1';

FLUSH PRIVILEGES;

-- 表结构由应用首次启动时自动创建（src/sql/schema.sql），
-- 也可手动执行：mysql -udealer_app -p dealer_qualification < src/sql/schema.sql
