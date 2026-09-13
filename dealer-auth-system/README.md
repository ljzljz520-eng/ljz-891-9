# 品牌经销资质查询系统

客户输入 **经销商名称 + 门店编号**，公开查询其授权品牌、授权区域、有效期、上级代理、开通时间；
后台支持多管理员（超级管理员 / 运营管理员）维护资质、CSV 批量导入、操作审计、邮件通知。

## 功能一览

### 客户侧（无需登录）
- `/` 查询表单：经销商名称 + 门店编号，二者同时精确匹配才返回结果（防止枚举）
- 结果卡片：授权品牌（标签）、授权区域、有效期、上级代理、开通时间、备注
- 授权状态按有效期实时判定：**授权有效 / 已过期 / 未生效**
- 未命中展示统一的“未查询到”提示；单 IP 限流（默认 20 次/分钟）

### 管理后台 `/admin`
| 模块 | 能力 |
|---|---|
| 概览 | 资质总数 / 有效 / 过期统计、最近更新、最新日志 |
| 资质维护 | 新增 / 编辑 / 删除，列表搜索（名称、编号、品牌、区域）与状态过滤、分页 |
| CSV 导入 | 在线下载模板、编码自动识别（UTF-8/GBK）、逐行校验、错误行号与原因汇总、重复编号跳过或更新 |
| 管理员账号 | 超级管理员可增删改账号、分配角色、启停账号、重置密码；开户自动发邮件 |
| 密码找回 | 邮箱收取一次性重置链接（30 分钟有效） |
| 操作日志 | 登录、增删改、导入、账号管理全部留痕（操作人、IP、详情） |

角色：
- **超级管理员 admin**：全部权限（含账号管理），系统始终保留至少一个启用的超管；
- **运营管理员 operator**：只能维护经销商资质与导入，不能管理账号。

## 技术栈

- 后端：Python 3.10+ / Flask 3 / SQLAlchemy / Flask-Login
- 数据库：**MySQL 8（推荐）**，同时兼容 PostgreSQL、SQLite（本地试用）
- 前端：Jinja2 模板 + 原生 CSS（无需构建）
- 部署：gunicorn + nginx（提供 systemd / Docker Compose 两种方式）

## 一、参数配置（重点）

在项目根目录创建 `.env`（可由 `.env.example` 复制），**所有参数均为环境变量**：

```bash
cp .env.example .env
```

### 1. 应用参数

| 变量 | 必填 | 说明 |
|---|---|---|
| `SECRET_KEY` | ✅ | 会话/重置令牌密钥，务必随机：`python3 -c "import secrets;print(secrets.token_hex(32))"` |
| `FLASK_ENV` | | `production`（默认）/ `development` |
| `SITE_NAME` / `COMPANY_NAME` | | 站点名与公司署名 |
| `SUPPORT_EMAIL` / `SUPPORT_PHONE` | | 查询页底部客服信息 |
| `QUERY_RATE_LIMIT` | | 公开查询每 IP 每分钟上限，默认 20 |
| `SESSION_COOKIE_SECURE` | | 站点走 HTTPS 设为 `true` |
| `MAX_UPLOAD_MB` | | CSV 上传大小上限，默认 5 |

### 2. 数据库参数

| 变量 | 说明 |
|---|---|
| `DATABASE_URL` | 数据库连接串（见下） |
| `DB_POOL_RECYCLE` | 连接回收秒数，MySQL 建议 280（小于服务端 `wait_timeout`） |

```bash
# MySQL 8（生产推荐）
DATABASE_URL=mysql+pymysql://dealer:数据库密码@127.0.0.1:3306/dealer_auth?charset=utf8mb4
# PostgreSQL（需 pip install psycopg[binary]）
DATABASE_URL=postgresql+psycopg://dealer:密码@127.0.0.1:5432/dealer_auth
# SQLite（仅本地试用，无需建库）
DATABASE_URL=sqlite:///dealer_auth.db
```

MySQL 建库建账号（utf8mb4 以支持 emoji/生僻字）：

```sql
CREATE DATABASE dealer_auth CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'dealer'@'%' IDENTIFIED BY '换成强密码';
GRANT ALL PRIVILEGES ON dealer_auth.* TO 'dealer'@'%';
FLUSH PRIVILEGES;
```

### 3. 邮件参数（SMTP）

用于「新管理员开户通知」和「忘记密码重置链接」。未配置时系统正常运行，邮件只写日志不报错。

| 变量 | 示例 | 说明 |
|---|---|---|
| `MAIL_HOST` | `smtp.exmail.qq.com` | SMTP 服务器 |
| `MAIL_PORT` | `465`（SSL）/ `587`（STARTTLS） | 端口 |
| `MAIL_USE_SSL` | `true` | 465 一般为 true |
| `MAIL_USE_TLS` | `false` | 587 时设 true（与 SSL 二选一） |
| `MAIL_USERNAME` | `it@example.com` | 发信账号 |
| `MAIL_PASSWORD` | — | 邮箱密码或**授权码/专用密码**（非网页登录密码） |
| `MAIL_FROM` | `it@example.com` | 发件人，一般同账号 |
| `MAIL_BASE_URL` | `https://dealer-auth.example.com` | 邮件链接的站点根地址，**不带尾斜杠** |

常见服务商：

| 服务商 | HOST | 端口/加密 |
|---|---|---|
| 腾讯企业邮 | smtp.exmail.qq.com | 465/SSL |
| QQ 邮箱 | smtp.qq.com | 465/SSL（用授权码） |
| 163 邮箱 | smtp.163.com | 465/SSL（用授权码） |
| 阿里企业邮 | smtp.qiye.aliyun.com | 465/SSL |
| Gmail | smtp.gmail.com | 587/STARTTLS（用 App Password） |

## 二、安装与初始化

```bash
# 1. 安装依赖（建议虚拟环境）
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
pip install gunicorn          # 生产 WSGI 服务器

# 2. 配置环境变量
cp .env.example .env          # 然后按上面的说明编辑，至少填好 SECRET_KEY / DATABASE_URL / MAIL_*

# 3. 建表（幂等，可重复执行）
export FLASK_APP=wsgi:app
flask init-db

# 4. 创建第一个超级管理员
flask create-admin --username admin --email it@example.com --password '强密码'
# 以后忘记密码也可用：flask reset-password --username admin

# 5. 本地试运行（开发）
flask run --host 127.0.0.1 --port 5000
```

生产启动：

```bash
gunicorn -w 4 -b 127.0.0.1:8000 --timeout 30 wsgi:app
```

## 三、部署方式 A：systemd + nginx（推荐的传统方式）

1. 代码放到 `/opt/dealer-auth-system`，建好虚拟环境并完成初始化；
2. 复制服务文件并按实际路径/用户调整：

```bash
sudo cp deploy/dealer-auth.service /etc/systemd/system/
sudo useradd -r -s /usr/sbin/nologin dealerapp
sudo chown -R dealerapp:dealerapp /opt/dealer-auth-system
sudo systemctl daemon-reload
sudo systemctl enable --now dealer-auth
sudo systemctl status dealer-auth
```

3. nginx 反代（证书可用 certbot）：

```bash
sudo cp deploy/nginx.conf.example /etc/nginx/conf.d/dealer-auth.conf
# 修改 server_name、证书路径后
sudo nginx -t && sudo systemctl reload nginx
```

应用仅监听 `127.0.0.1:8000`，由 nginx 提供 HTTPS；确认 `.env` 中 `SESSION_COOKIE_SECURE=true`。

> 日志：journalctl -u dealer-auth -f。如需滚动文件日志，可在 nginx 层或自行配置 logrotate。

## 四、部署方式 B：Docker Compose（自带 MySQL 8）

```bash
cp .env.example .env     # 除应用参数外，compose 还会用到 MYSQL_* 变量
# 编辑 .env：SECRET_KEY、MAIL_*、MYSQL_PASSWORD、MYSQL_ROOT_PASSWORD、MAIL_BASE_URL 等
docker compose build
docker compose up -d
docker compose exec app python -m flask --app wsgi:app create-admin \
    --username admin --email it@example.com --password '强密码'
```

容器启动时自动执行 `flask init-db`（幂等）；MySQL 数据保存在 docker volume `mysql_data`。
应用端口映射在宿主机 `127.0.0.1:8000`，前面仍建议套一层 nginx HTTPS（配置同上）。

compose 读取的数据库变量：`MYSQL_DATABASE`、`MYSQL_USER`、`MYSQL_PASSWORD`、`MYSQL_ROOT_PASSWORD`（均有默认值，生产请覆盖）。

## 五、CSV 导入说明

后台「CSV 导入」页可直接下载带示例行的模板（UTF-8 BOM，Excel 打开不乱码）。
示例文件见 `samples/dealers_sample.csv`。

- 表头（顺序不限；带 * 为必填）：
  `经销商名称*, 门店编号*, 授权品牌*, 授权区域, 有效期起, 有效期止, 上级代理, 开通时间, 备注`
- 多品牌分隔：`|`（同时兼容 `、 ; , /` 及全角变体），自动去重；
- 日期兼容：`2026-01-01`、`2026/1/1`、`2026.01.01`、`2026年1月1日`；
- 编码自动识别 UTF-8（含 BOM）/ GBK / GB18030；空行自动跳过；
- **门店编号全局唯一**：默认跳过重复行并在结果中列出；勾选「更新已存在记录」则按编号更新（仅覆盖文件中出现的列，未提供的列保留原值）；
- 校验不通过的行不会入库，结果页按行号列出全部原因，修正后重新上传即可；数据库级异常则整批回滚；
- 单文件上限 5MB（`.env` 中 `MAX_UPLOAD_MB` 可调，nginx 侧 `client_max_body_size` 同步调整）。

## 六、安全说明

- 密码使用 werkzeug PBKDF2 哈希存储，不存明文；
- 所有写操作带 CSRF Token 校验；Cookie 为 HttpOnly + SameSite=Lax（HTTPS 下加 Secure）；
- 登录限流（8 次/5 分钟/IP）、公开查询限流（20 次/分钟/IP，进程内存实现）；
- 多 gunicorn worker / 多机部署时限流计数不共享，高并发场景建议换成 Redis 实现；
- 后台操作全部写 `audit_logs`；删除操作为物理删除（如需软删除可自行扩展）。

## 七、数据表结构

| 表 | 关键字段 |
|---|---|
| `admins` | username(唯一)、password_hash、email、role(admin/operator)、active、last_login_at |
| `dealers` | dealer_name、store_code(唯一索引)、brands(`|`分隔)、region、valid_from、valid_until、parent_agent、opened_at、remark、created/updated_by_id |
| `audit_logs` | admin_id、admin_name、action、target、detail、ip、created_at |

## 八、常用运维命令

```bash
flask init-db                          # 建表/补建新表（不会删数据）
flask create-admin --username u ...   # 新建超管
flask reset-password --username u     # 命令行重置密码
# 健康检查
curl http://127.0.0.1:8000/healthz    # {"status":"ok"}
```

> 升级代码后：`git pull && pip install -r requirements.txt && flask init-db && sudo systemctl restart dealer-auth`。
> 当前版本使用 `db.create_all()` 建表，不做列变更迁移；如后续字段演进，建议引入 Flask-Migrate(Alembic)。
