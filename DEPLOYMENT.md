# 部署文档

品牌经销资质查询系统（Brand Dealer Qualification Query System）

---

## 一、环境要求

| 组件 | 版本要求 | 说明 |
|------|----------|------|
| Node.js | >= 16.x（推荐 18.x / 20.x LTS） | 运行环境 |
| npm | >= 8.x | 包管理 |
| MySQL | >= 5.7（推荐 8.0） | 生产数据库 |
| 操作系统 | Linux / Windows / macOS | 均可部署 |
| 内存 | >= 512MB | 建议 1GB 以上 |

> 快速体验可使用 SQLite（无需安装数据库），生产环境请使用 MySQL。

---

## 二、获取代码与安装依赖

```bash
# 1. 进入项目目录
cd dealer-qualification-system

# 2. 安装依赖
npm install

# 3. 创建环境配置文件
cp .env.example .env
```

---

## 三、数据库配置

### 3.1 MySQL 数据库（生产推荐）

**第一步：创建数据库和用户**

登录 MySQL，执行以下 SQL：

```sql
-- 创建数据库（字符集 utf8mb4 以支持中文及 emoji）
CREATE DATABASE dealer_qualification
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- 创建专用用户（请修改密码）
CREATE USER 'dealer_app'@'%' IDENTIFIED BY 'your_strong_password_here';

-- 授权
GRANT ALL PRIVILEGES ON dealer_qualification.* TO 'dealer_app'@'%';
FLUSH PRIVILEGES;
```

**第二步：配置 `.env` 文件**

```env
# 数据库类型
DB_DIALECT=mysql

# MySQL 连接信息
DB_HOST=127.0.0.1        # 数据库服务器地址
DB_PORT=3306             # 数据库端口
DB_NAME=dealer_qualification   # 数据库名
DB_USER=dealer_app       # 数据库用户名
DB_PASSWORD=your_strong_password_here  # 数据库密码

# 连接池（可选）
DB_POOL_MAX=10           # 最大连接数
DB_POOL_MIN=2            # 最小连接数
```

**第三步：启动时自动建表**

系统启动时会自动创建所有数据表（`sync`），无需手动执行建表 SQL。

### 3.2 SQLite 数据库（快速体验）

无需安装 MySQL，将 `.env` 改为：

```env
DB_DIALECT=sqlite
SQLITE_PATH=./data/dealer.db
```

首次启动会自动创建 `data/dealer.db` 文件及数据表。

### 3.3 数据库表结构说明

系统自动创建以下 4 张表：

| 表名 | 说明 | 关键字段 |
|------|------|----------|
| `admins` | 管理员表 | username, password(bcrypt), role, status, lastLoginAt |
| `dealers` | 经销商表 | name, store_no(门店编号), region, parent_agent(上级代理), activated_at(开通时间), status |
| `authorizations` | 品牌授权资质表 | dealer_id, brand, authorized_region, valid_from, valid_to, status |
| `query_logs` | 查询日志表 | dealer_id, query_name, query_store_no, hit, ip, user_agent |

> 唯一约束：`dealers` 表的 `(name, store_no)` 组合唯一，即同一经销商名称+门店编号不可重复。

---

## 四、邮件参数配置

系统使用 Nodemailer 通过 SMTP 发送邮件（资质确认邮件、测试邮件）。

### 4.1 配置 `.env` 文件

```env
# SMTP 服务器地址（如：smtp.example.com）
SMTP_HOST=smtp.example.com

# SMTP 端口（SSL 通常用 465，STARTTLS 用 587，非加密用 25）
SMTP_PORT=465

# 是否使用 SSL/TLS 加密（465 端口设为 true，587 端口设为 false）
SMTP_SECURE=true

# SMTP 登录用户名（通常是完整邮箱地址）
SMTP_USER=noreply@example.com

# SMTP 登录密码（或授权码）
SMTP_PASS=your_smtp_password

# 发件人显示名称及地址
SMTP_FROM=品牌资质查询系统 <noreply@example.com>

# 系统名称（显示在邮件标题和正文中）
SYSTEM_NAME=品牌经销资质查询系统
```

### 4.2 常见邮箱 SMTP 参数参考

| 邮箱服务 | SMTP_HOST | 端口 | 加密方式 | 说明 |
|----------|-----------|------|----------|------|
| 腾讯企业邮箱 | smtp.exmail.qq.com | 465 | SSL | 需使用客户端授权码 |
| 阿里云企业邮箱 | smtp.qiye.aliyun.com | 465 | SSL | 需使用客户端授权码 |
| 163 邮箱 | smtp.163.com | 465 | SSL | 需开启 SMTP 并使用授权码 |
| QQ 邮箱 | smtp.qq.com | 465 | SSL | 需开启 SMTP 并使用授权码 |
| Gmail | smtp.gmail.com | 465 | SSL | 需使用应用专用密码 |
| Outlook/Office365 | smtp.office365.com | 587 | STARTTLS | SMTP_SECURE=false |

### 4.3 验证邮件配置

启动系统后，登录管理后台 → 左侧菜单「邮件设置」→ 查看 SMTP 状态 → 输入收件邮箱 → 点击「发送测试邮件」。收到测试邮件即表示配置正确。

也可直接调用接口测试：

```bash
curl -X POST http://localhost:3000/api/admin/mail/test \
  -H "Authorization: Bearer <你的登录Token>" \
  -H "Content-Type: application/json" \
  -d '{"to":"test@example.com"}'
```

### 4.4 邮件功能说明

- **资质确认邮件**：在经销商管理列表点击「发邮件」，系统自动将该经销商的所有品牌授权信息整理成 HTML 邮件发送至经销商联系邮箱。
- **测试邮件**：用于验证 SMTP 配置是否正确。
- 邮件为 HTML 格式，包含品牌、授权区域、有效期、状态、上级代理、开通时间等完整信息。

---

## 五、其他环境变量

```env
# 服务端口（默认 3000）
PORT=3000

# 运行环境（production / development）
NODE_ENV=production

# JWT 密钥（务必修改为随机长字符串，至少 32 位）
JWT_SECRET=change_me_to_a_long_random_string_at_least_32_chars

# JWT 过期时间（默认 12h）
JWT_EXPIRES_IN=12h

# 初始超级管理员（仅首次初始化数据库时创建）
INIT_ADMIN_USERNAME=admin
INIT_ADMIN_PASSWORD=admin123
INIT_ADMIN_EMAIL=admin@example.com
```

> **安全提示**：生产环境务必修改 `JWT_SECRET` 和初始管理员密码。

---

## 六、启动系统

### 6.1 开发模式

```bash
npm run dev
```

### 6.2 生产模式

```bash
npm start
```

启动成功后输出：

```
数据库连接成功
数据表同步完成
初始化超级管理员成功: admin / admin123
服务已启动: http://localhost:3000
查询首页: http://localhost:3000/
管理后台: http://localhost:3000/admin
```

### 6.3 使用 PM2 守护进程（推荐生产使用）

```bash
# 安装 PM2
npm install -g pm2

# 启动
pm2 start server/app.js --name dealer-system

# 设置开机自启
pm2 save
pm2 startup

# 查看日志
pm2 logs dealer-system
```

---

## 七、访问系统

| 页面 | 地址 | 说明 |
|------|------|------|
| 公开查询首页 | `http://服务器IP:3000/` | 客户输入经销商名称+门店编号查询 |
| 管理后台登录 | `http://服务器IP:3000/login` | 管理员登录 |
| 管理后台 | `http://服务器IP:3000/admin` | 登录后自动跳转 |

**初始管理员账号**：`admin` / `admin123`（请登录后立即修改密码）

---

## 八、CSV 导入说明

### 8.1 下载模板

管理后台 →「CSV 导入」→ 点击「下载 CSV 模板」。

模板格式：

```csv
经销商名称,门店编号,品牌,授权区域,有效期开始,有效期结束,上级代理,开通时间,联系人,联系电话,联系邮箱,备注
示例商贸有限公司,D001,示例品牌,华东区,2025-01-01,2026-12-31,示例省代,2025-01-15,张三,13800000000,zhangsan@example.com,
```

### 8.2 字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| 经销商名称 | 是 | 经销商全称，与门店编号组合唯一 |
| 门店编号 | 是 | 门店唯一编号 |
| 品牌 | 是 | 授权品牌名称 |
| 授权区域 | 否 | 品牌授权区域，为空时取「区域」列 |
| 有效期开始 | 否 | 格式 `YYYY-MM-DD` |
| 有效期结束 | 否 | 格式 `YYYY-MM-DD` |
| 上级代理 | 否 | 上级代理商名称 |
| 开通时间 | 否 | 为空时取当前时间 |
| 联系人/电话/邮箱 | 否 | 经销商联系信息 |
| 备注 | 否 | 备注 |

### 8.3 导入模式

- **存在即更新（upsert）**：经销商名称+门店编号已存在则更新信息，品牌已存在则更新授权；不存在则新建。
- **仅新增（insert）**：仅新建，不更新已有记录。

### 8.4 注意事项

- CSV 文件必须为 UTF-8 编码（模板已带 BOM，Excel 打开中文不乱码）。
- 日期支持 `YYYY-MM-DD` 或 `YYYY/MM/DD` 格式。
- 单次导入不超过 10MB。
- 导入完成后会显示新增/更新条数及错误明细。

---

## 九、Nginx 反向代理（可选）

如需通过域名和 80/443 端口访问，配置 Nginx：

```nginx
server {
    listen 80;
    server_name dealer.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

配置 SSL 证书后可启用 HTTPS（推荐）。

---

## 十、常见问题

**Q1：启动时报数据库连接失败？**
A：检查 `.env` 中数据库地址、端口、用户名、密码是否正确；确认 MySQL 服务已启动；确认数据库已创建且用户有授权。

**Q2：邮件发送失败？**
A：检查 SMTP_HOST、SMTP_PORT、SMTP_USER、SMTP_PASS 是否正确；确认邮箱已开启 SMTP 服务并使用授权码（非登录密码）；确认服务器网络可访问 SMTP 服务器。

**Q3：忘记管理员密码？**
A：可在数据库中直接重置，或删除 `admins` 表后重启（会重新初始化超级管理员，注意备份数据）。

**Q4：如何备份数据？**
A：定期备份 MySQL 数据库（`mysqldump dealer_qualification > backup.sql`）；SQLite 模式直接备份 `data/dealer.db` 文件。

**Q5：前端页面加载慢或样式异常？**
A：前端使用 CDN 加载 Vue 和图标，确保服务器可访问公网。如需完全离线，可将相关库下载到本地 `public/vendor/` 目录并修改页面引用路径。

---

## 十一、技术栈

- **后端**：Node.js + Express + Sequelize
- **前端**：Vue 3 + Element 风格原生 CSS（CDN 引入 Vue）
- **数据库**：MySQL（推荐）/ SQLite（演示）
- **邮件**：Nodemailer
- **认证**：JWT + bcrypt
- **文件上传**：Multer
- **CSV 解析**：csv-parse
