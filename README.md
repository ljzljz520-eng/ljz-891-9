# 品牌经销资质查询系统

客户输入**经销商名称 + 门店编号**，查询门店获得的**授权品牌、授权区域、有效期、上级代理、开通时间**；
后台支持**多名管理员**维护资质、逐条增删改与 **CSV 批量导入**，并提供管理员找回密码邮件。

技术栈：Node.js 18+ / Express 4 / MySQL 5.7+（8.0 兼容）/ 原生 HTML+CSS+JS（无需构建）。

---

## 一、功能一览

### 客户查询端（免登录）
- 页面：`http://你的域名/`
- 输入经销商名称（模糊匹配）+ 门店编号（精确匹配）
- 返回：门店信息、授权品牌清单、每个品牌的授权区域 / 上级代理 / 有效期 / 开通时间 / 实时状态
- 状态自动计算：**有效 / 未生效 / 已过期**；已撤销记录不对客户展示
- 查询限流：每 IP 每分钟 30 次；所有查询写入 `query_logs`

### 管理后台（`/admin/login.html`）
- **概览**：授权总数、有效/30 天内到期/已过期/已撤销数量、门店数、品牌数、今日查询数
- **资质管理**：关键字搜索、状态筛选、分页、新增 / 编辑 / 删除 / 撤销
- **CSV 导入**：模板下载、先校验后写库、逐行错误提示、`门店编号+品牌` 冲突自动更新；支持“仅校验不写入”试运行
- **管理员账号**（仅超级管理员）：多管理员、两种角色、启用/停用、重置密码
  - `super_admin` 超级管理员：管理账号 + 全部资质
  - `admin` 管理员：维护资质
- 登录 JWT 鉴权（默认 12 小时）、登录限流、修改密码、邮箱找回密码（15 分钟有效链接）

---

## 二、目录结构

```
├── src/
│   ├── server.js               # 入口：建表、初始管理员、启动 HTTP
│   ├── config/
│   │   ├── index.js            # 读取 .env
│   │   ├── db.js               # MySQL 连接池 + 自动建表
│   │   └── mailer.js           # SMTP（nodemailer）
│   ├── middleware/             # JWT 鉴权、错误处理
│   ├── routes/                 # query / auth / qualifications / admins
│   ├── utils/                  # CSV 解析、日期校验
│   ├── sql/schema.sql          # 三张表结构
│   └── scripts/init-db.js      # 手动初始化脚本
├── public/                     # 前端（客户页 + 后台页）
├── samples/qualifications_sample.csv
├── deploy/                     # 建库 SQL、Nginx、systemd 示例
├── test/smoke.js               # 端到端冒烟测试（npm test，无需 MySQL）
└── .env.example                # 配置样例
```

---

## 三、部署说明

### 1. 准备环境
- Node.js ≥ 18
- MySQL ≥ 5.7（或 8.0），账号需有目标库的 `SELECT/INSERT/UPDATE/DELETE` 权限
- 一个能发信的 SMTP 账号（仅“找回密码”功能需要；不配置不影响其余功能）

### 2. 获取代码并安装依赖
```bash
mkdir -p /opt/dealer-qualification && cd /opt/dealer-qualification
# 放入本项目代码后：
npm ci --omit=dev   # 或 npm install --omit=dev
```

### 3. 配置数据库参数
```bash
mysql -uroot -p < deploy/database.sql     # 建库 + 建账号（先改文件里的密码）
cp .env.example .env
vi .env
```
`.env` 中**数据库参数**逐项填写：

| 参数 | 说明 | 示例 |
|---|---|---|
| `DB_HOST` | MySQL 主机 | `127.0.0.1` |
| `DB_PORT` | 端口 | `3306` |
| `DB_USER` | 应用账号 | `dealer_app` |
| `DB_PASSWORD` | 账号密码（与 database.sql 中保持一致） | `********` |
| `DB_NAME` | 库名 | `dealer_qualification` |
| `DB_CONNECTION_LIMIT` | 连接池大小 | `10` |

> 应用首次启动会自动执行 `src/sql/schema.sql` 创建三张表
> （`admins` 管理员、`qualifications` 资质、`query_logs` 查询日志）。
> 也可手动执行 `mysql -udealer_app -p dealer_qualification < src/sql/schema.sql`。

### 4. 配置邮件参数（SMTP）
`.env` 中填写，用于后台“忘记密码”发送重置链接：

| 参数 | 说明 |
|---|---|
| `SMTP_HOST` | SMTP 服务器地址 |
| `SMTP_PORT` | 端口，SSL 一般 `465`，STARTTLS 一般 `587` |
| `SMTP_SECURE` | `465` 填 `true`；`587` 填 `false` |
| `SMTP_USER` | 发信账号 |
| `SMTP_PASS` | **登录密码或 SMTP 授权码**（QQ/163 等必须用授权码，不是网页登录密码） |
| `MAIL_FROM` | 发件人显示，如 `"品牌资质系统 <no-reply@your.com>"` |
| `PUBLIC_BASE_URL` | 系统对外访问地址，重置邮件链接用，如 `https://qual.example.com` |

常见服务商：

| 邮箱 | SMTP_HOST | SSL 端口 |
|---|---|---|
| QQ 邮箱 | `smtp.qq.com` | 465（授权码） |
| 163 邮箱 | `smtp.163.com` | 465（授权码） |
| 腾讯企业邮 | `smtp.exmail.qq.com` | 465 |
| 阿里企业邮 | `smtp.qiye.aliyun.com` | 465 |
| Gmail | `smtp.gmail.com` | 465（应用专用密码） |

> 不配置 SMTP 时系统正常运行，仅找回密码接口提示“邮件服务未配置”。

### 5. 其他必改配置
- `JWT_SECRET`：**务必改成随机长字符串**：`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- `INIT_ADMIN_USERNAME` / `INIT_ADMIN_PASSWORD`：数据库中没有任何管理员时，首次启动自动创建的超级管理员。
  **上线请立刻登录后台修改默认密码**。
- `PORT`（默认 3000）、`TRUST_PROXY`（在 Nginx 后保持 `1`）、`CSV_MAX_SIZE_KB`（默认 5MB）

### 6. 启动
```bash
npm start                 # 前台启动验证
# 生产环境推荐 systemd：
sudo cp deploy/dealer-qualification.service.example /etc/systemd/system/dealer-qualification.service
sudo systemctl daemon-reload && sudo systemctl enable --now dealer-qualification
# 前面建议再放 Nginx（示例见 deploy/nginx.conf.example），并配置 HTTPS
```
启动成功日志：
```
[db] MySQL 连接成功
[db] 数据表已就绪
[init] 已创建初始超级管理员: admin（请尽快登录并修改密码）
[mail] SMTP 已配置: smtp.example.com:465
[server] 品牌经销资质查询系统已启动: http://localhost:3000
```

健康检查：`GET /healthz` 返回 `{"ok":true,"db":true}`。

### 7. 升级 / 备份
- 表结构使用 `CREATE TABLE IF NOT EXISTS`，重复启动安全；后续表结构变更建议自行加迁移脚本。
- 备份：`mysqldump -udealer_app -p dealer_qualification > backup_$(date +%F).sql`

---

## 四、CSV 导入格式

UTF-8 编码、首行表头（中英文表头均可，空格不敏感），**每行 = 某门店对某品牌的一条授权**：

| 列名（中文） | 必填 | 说明 |
|---|---|---|
| 经销商名称 | 是 | |
| 门店编号 | 是 | 与品牌组成唯一键 |
| 授权品牌 | 是 | 与门店编号组成唯一键 |
| 授权区域 | 是 | 如“上海市浦东新区” |
| 上级代理 | 否 | 没有可留空 |
| 有效期开始 | 是 | `YYYY-MM-DD`（兼容 `2025/1/5`、`2025年1月5日`） |
| 有效期截止 | 是 | 同上 |
| 开通时间 | 否 | 同上 |
| 状态 | 否 | `有效`/`已撤销`（或 active/revoked），空值按“有效”处理 |

- 下载模板：后台「CSV 导入」页，或登录后 `GET /api/qualifications/template.csv`
- 示例文件：`samples/qualifications_sample.csv`
- 规则：
  - 文件内任一行业务校验失败 → **整批拒绝，不写库**，返回所有错误所在行号与原因
  - `(门店编号, 品牌)` 已存在 → 用 CSV 内容**更新**；不存在 → **新增**
  - 导入在事务中执行，失败自动回滚

---

## 五、主要 HTTP API

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| GET | `/api/query?dealer_name=&store_code=` | 无 | 客户查询 |
| POST | `/api/auth/login` | 无 | 管理员登录 |
| GET | `/api/auth/me` | 管理员 | 当前用户 |
| POST | `/api/auth/forgot-password` | 无 | 发送重置邮件 |
| POST | `/api/auth/reset-password` | 重置令牌 | 设置新密码 |
| POST | `/api/auth/change-password` | 管理员 | 修改自己密码 |
| GET | `/api/qualifications?keyword=&state=&page=&page_size=` | 管理员 | 资质列表 |
| GET | `/api/qualifications/stats/summary` | 管理员 | 概览统计 |
| POST/PUT/DELETE | `/api/qualifications[ /:id]` | 管理员 | 单条维护 |
| POST | `/api/qualifications/import?dry_run=1` | 管理员 | CSV 上传（multipart 字段 `file`） |
| GET | `/api/qualifications/template.csv` | 管理员 | 模板下载 |
| GET/POST/PUT/DELETE | `/api/admins[...]` | 超级管理员 | 账号管理 |

统一响应：`{ "code": 0, "message": "success", "data": ... }`，非 0 为业务错误。

---

## 六、测试

```bash
npm test
```
端到端冒烟测试使用内存数据桩（无需 MySQL/SMTP），覆盖：鉴权与角色、资质 CRUD、
客户查询状态派生、CSV 新增/更新/整批拒绝、管理员管理、统计、静态页面（29 项断言）。

---

## 七、安全清单（上线自查）

- [ ] 修改默认超级管理员密码，删除多余账号
- [ ] `JWT_SECRET` 使用随机值
- [ ] MySQL 只授权目标库，应用账号禁止远程 root
- [ ] 站点启用 HTTPS（Nginx + 证书）
- [ ] `PUBLIC_BASE_URL` 与实际域名一致（否则重置链接打不开）
- [ ] 定期 `mysqldump` 备份 `qualifications` 与 `admins` 表
