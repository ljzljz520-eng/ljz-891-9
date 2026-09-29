-- ============================================================
-- 品牌经销资质查询系统 数据库结构 (MySQL 8.0+ / 兼容 5.7)
-- ============================================================

CREATE TABLE IF NOT EXISTS admins (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username      VARCHAR(64)  NOT NULL COMMENT '登录用户名',
  password_hash VARCHAR(100) NOT NULL COMMENT 'bcrypt 密码哈希',
  display_name  VARCHAR(64)  NOT NULL COMMENT '姓名/昵称',
  email         VARCHAR(128) DEFAULT NULL COMMENT '邮箱（用于找回密码）',
  role          ENUM('super_admin','admin') NOT NULL DEFAULT 'admin'
                COMMENT 'super_admin=可管理账号；admin=维护资质',
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_admins_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='后台管理员';

CREATE TABLE IF NOT EXISTS qualifications (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  dealer_name       VARCHAR(128) NOT NULL COMMENT '经销商名称',
  store_code        VARCHAR(64)  NOT NULL COMMENT '门店编号',
  brand             VARCHAR(64)  NOT NULL COMMENT '授权品牌',
  region            VARCHAR(128) NOT NULL COMMENT '授权区域',
  parent_agent      VARCHAR(128) NOT NULL DEFAULT '' COMMENT '上级代理',
  valid_from        DATE         NOT NULL COMMENT '授权开始日期',
  valid_until       DATE         NOT NULL COMMENT '授权截止日期',
  opened_at         DATE         DEFAULT NULL COMMENT '门店开通时间',
  status            ENUM('active','revoked') NOT NULL DEFAULT 'active'
                    COMMENT 'active=有效授权；revoked=已撤销',
  created_by        INT UNSIGNED DEFAULT NULL,
  updated_by        INT UNSIGNED DEFAULT NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_qual_store_brand (store_code, brand),
  KEY idx_qual_dealer (dealer_name),
  KEY idx_qual_valid (valid_until),
  KEY idx_qual_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='经销商品牌授权资质（每行 = 某门店对某品牌的一条授权）';

CREATE TABLE IF NOT EXISTS query_logs (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  dealer_name VARCHAR(128) NOT NULL,
  store_code  VARCHAR(64)  NOT NULL,
  hit_count   INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '命中授权条数',
  ip          VARCHAR(45)  DEFAULT NULL,
  user_agent  VARCHAR(255) DEFAULT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_logs_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='客户查询日志';
