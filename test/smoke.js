'use strict';
/* 端到端冒烟测试：用内存数据桩替换 mysql2 连接池，覆盖全部 HTTP API */
const Module = require('module');
const bcrypt = require('bcryptjs');

// ---------- 内存“数据库” ----------
const db = {
  admins: [],
  qualifications: [],
  query_logs: [],
  _seq: { admins: 0, qualifications: 0, query_logs: 0 },
};
function todayStr() { return new Date().toISOString().slice(0, 10); }
function deriveStatus(r) {
  const t = todayStr();
  if (r.status === 'revoked') return 'revoked';
  if (r.valid_from > t) return 'pending';
  if (r.valid_until < t) return 'expired';
  return 'valid';
}

// 极简 SQL 分派：按特征字符串识别
async function fakeQuery(sql, params = []) {
  const s = sql.replace(/\s+/g, ' ');

  if (/SELECT 1/.test(s)) return [[], []];
  if (/CREATE TABLE/.test(s)) return [{}, {}];
  if (/SELECT COUNT\(\*\) AS c FROM admins/.test(s)) return [[{ c: db.admins.length }], []];

  if (/INSERT INTO admins/.test(s)) {
    const [username, hash, name, email, role] = params;
    if (db.admins.some((a) => a.username === username)) {
      const e = new Error('duplicate'); e.code = 'ER_DUP_ENTRY'; throw e;
    }
    const row = { id: ++db._seq.admins, username, password_hash: hash, display_name: name, email, role, is_active: 1, created_at: new Date().toISOString() };
    db.admins.push(row);
    return [{ insertId: row.id, affectedRows: 1 }, []];
  }
  if (/FROM admins WHERE username/.test(s)) {
    return [db.admins.filter((a) => a.username === params[0]), []];
  }
  if (/FROM admins WHERE id/.test(s) && !/UPDATE|DELETE/.test(s)) {
    return [db.admins.filter((a) => a.id === params[0]), []];
  }
  if (/UPDATE admins SET password_hash = \? WHERE id/.test(s)) {
    const a = db.admins.find((x) => x.id === params[1]);
    if (a) a.password_hash = params[0];
    return [{ affectedRows: a ? 1 : 0 }, []];
  }
  if (/SELECT id, username, display_name, email, role, is_active, created_at\s+FROM admins ORDER/.test(s)) {
    return [db.admins.map(({ password_hash, ...rest }) => rest), []];
  }
  if (/UPDATE admins SET username/.test(s)) {
    const [username, display_name, email, role, isActive, maybeHash, idRaw] = params;
    const withHash = sql.includes('password_hash=?');
    const id = withHash ? idRaw : maybeHash;
    if (db.admins.some((a) => a.username === username && a.id !== id)) {
      const e = new Error('dup'); e.code = 'ER_DUP_ENTRY'; throw e;
    }
    const a = db.admins.find((x) => x.id === id);
    if (!a) return [{ affectedRows: 0 }, []];
    Object.assign(a, { username, display_name, email, role, is_active: isActive });
    if (withHash) a.password_hash = maybeHash;
    return [{ affectedRows: 1 }, []];
  }
  if (/DELETE FROM admins WHERE id/.test(s)) {
    const i = db.admins.findIndex((x) => x.id === params[0]);
    if (i < 0) return [{ affectedRows: 0 }, []];
    db.admins.splice(i, 1);
    return [{ affectedRows: 1 }, []];
  }

  // ---- qualifications ----
  if (/INSERT INTO qualifications/.test(s)) {
    if (params.length >= 9) {
      const [dealer_name, store_code, brand, region, parent_agent, valid_from, valid_until, opened_at, status] = params;
      // 导入流程已先做 FOR UPDATE 查重；单条 POST 需要模拟唯一索引
      if (!this?._importFlow && db.qualifications.some((q) => q.store_code === store_code && q.brand === brand)) {
        const e = new Error('dup'); e.code = 'ER_DUP_ENTRY'; throw e;
      }
      const row = { id: ++db._seq.qualifications, dealer_name, store_code, brand, region, parent_agent, valid_from, valid_until, opened_at, status, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      db.qualifications.push(row);
      return [{ insertId: row.id, affectedRows: 1 }, []];
    }
  }
  if (/DELETE FROM qualifications WHERE id/.test(s)) {
    const i = db.qualifications.findIndex((x) => x.id === params[0]);
    if (i < 0) return [{ affectedRows: 0 }, []];
    db.qualifications.splice(i, 1);
    return [{ affectedRows: 1 }, []];
  }
  if (/UPDATE qualifications SET dealer_name=\?, region=\?/.test(s)) {
    // CSV 导入分支：... WHERE store_code=? AND brand=?
    const [dealer_name, region, parent_agent, valid_from, valid_until, opened_at, status, ub, store_code, brand] = params;
    const target = db.qualifications.find((q) => q.store_code === store_code && q.brand === brand);
    if (!target) return [{ affectedRows: 0 }, []];
    if (db.qualifications.some((q) => q !== target && q.store_code === store_code && q.brand === brand)) {
      const e = new Error('dup'); e.code = 'ER_DUP_ENTRY'; throw e;
    }
    Object.assign(target, { dealer_name, region, parent_agent, valid_from, valid_until, opened_at, status });
    return [{ affectedRows: 1 }, []];
  }
  if (/UPDATE qualifications SET\s+dealer_name=\?, store_code/.test(s)) {
    // PUT /:id：... WHERE id=?
    const [dealer_name, store_code, brand, region, parent_agent, valid_from, valid_until, opened_at, status, ub, id] = params;
    if (db.qualifications.some((q) => q.id !== id && q.store_code === store_code && q.brand === brand)) {
      const e = new Error('dup'); e.code = 'ER_DUP_ENTRY'; throw e;
    }
    const q = db.qualifications.find((x) => x.id === id);
    if (!q) return [{ affectedRows: 0 }, []];
    Object.assign(q, { dealer_name, store_code, brand, region, parent_agent, valid_from, valid_until, opened_at, status });
    return [{ affectedRows: 1 }, []];
  }
  if (/FROM qualifications WHERE status = 'active'\s+AND store_code/.test(s)) {
    const [code, like] = params;
    const kw = like.slice(1, -1).replace(/\\%/g, '%').replace(/\\_/g, '_');
    const rows = db.qualifications
      .filter((q) => q.status === 'active' && q.store_code === code && q.dealer_name.includes(kw))
      .sort((a, b) => a.brand.localeCompare(b.brand, 'zh') || b.valid_until.localeCompare(a.valid_until))
      .map((q) => ({ ...q }));
    return [rows, []];
  }
  if (/FROM qualifications WHERE store_code=\? AND brand=\? FOR UPDATE/.test(s)) {
    return [db.qualifications.filter((q) => q.store_code === params[0] && q.brand === params[1]), []];
  }
  if (/SELECT COUNT\(\*\) AS total FROM qualifications/.test(s)) {
    const list = filterList(s, params);
    return [[{ total: list.length }], []];
  }
  if (/ORDER BY updated_at/.test(s) && /LIMIT \? OFFSET \?/.test(s)) {
    const list = filterList(s, params);
    const limit = params[params.length - 2];
    const offset = params[params.length - 1];
    return [list.slice(offset, offset + limit).map((q) => ({ ...q })), []];
  }
  if (/COUNT\(\*\) c FROM admins/.test(s)) return [[{ c: db.admins.length }], []];
  if (/COUNT\(\*\) c FROM query_logs/.test(s)) return [[{ c: db.query_logs.length }], []];
  if (/COUNT\(DISTINCT store_code\)/.test(s)) return [[{ c: new Set(db.qualifications.map((q) => q.store_code)).size }], []];
  if (/COUNT\(DISTINCT brand\)/.test(s)) return [[{ c: new Set(db.qualifications.map((q) => q.brand)).size }], []];
  if (/COUNT\(\*\) c FROM qualifications/.test(s)) {
    const t = todayStr();
    if (/BETWEEN/.test(s)) {
      return [[{ c: db.qualifications.filter((q) => q.status === 'active' && q.valid_until >= params[0] && q.valid_until <= params[1]).length }], []];
    }
    if (/valid_from <= \? AND valid_until >=/.test(s)) {
      return [[{ c: db.qualifications.filter((q) => q.status === 'active' && q.valid_from <= t && q.valid_until >= t).length }], []];
    }
    if (/valid_until < \?/.test(s)) {
      return [[{ c: db.qualifications.filter((q) => q.status === 'active' && q.valid_until < t).length }], []];
    }
    if (/status='revoked'/.test(s)) {
      return [[{ c: db.qualifications.filter((q) => q.status === 'revoked').length }], []];
    }
    return [[{ c: db.qualifications.length }], []];
  }
  if (/FROM qualifications WHERE store_code=\? AND brand=\? FOR UPDATE/.test(s)) {
    return [db.qualifications.filter((q) => q.store_code === params[0] && q.brand === params[1]), []];
  }
  if (/INSERT INTO query_logs/.test(s)) {
    db.query_logs.push({ id: ++db._seq.query_logs });
    return [{ insertId: db._seq.query_logs }, []];
  }
  throw new Error('Fake DB: unhandled SQL: ' + s.slice(0, 120));
}

function filterList(sql, params) {
  const hasWhere = /WHERE/.test(sql);
  const hasLike = /LIKE/.test(sql);
  const hasValid = /valid_from <= \? AND valid_until >=/.test(sql);
  const hasExpired = /valid_until < \?/.test(sql);
  const hasPending = /valid_from > \?/.test(sql);
  const hasRevoked = /status='revoked'/.test(sql);
  const paging = params.slice(-2); // 末尾两个永远是 limit/offset
  const condParams = params.slice(0, hasPaging(params) ? params.length - 2 : undefined);
  function hasPaging() { return /LIMIT \? OFFSET \?/.test(sql); }

  let list = db.qualifications.slice();
  let pi = 0;
  if (hasLike) {
    const like = condParams[pi++];
    const kw = like.slice(1, -1).replace(/\\%/g, '%').replace(/\\_/g, '_');
    list = list.filter((q) => [q.dealer_name, q.store_code, q.brand, q.region, q.parent_agent].some((v) => v.includes(kw)));
  }
  const t = todayStr();
  if (hasValid) {
    const from = condParams[pi++];
    const until = condParams[pi++];
    list = list.filter((q) => q.status === 'active' && q.valid_from <= from && q.valid_until >= until);
  } else if (hasExpired) {
    const day = condParams[pi++];
    list = list.filter((q) => q.status === 'active' && q.valid_until < day);
  } else if (hasPending) {
    const day = condParams[pi++];
    list = list.filter((q) => q.status === 'active' && q.valid_from > day);
  } else if (hasRevoked) {
    list = list.filter((q) => q.status === 'revoked');
  }
  list = list.map((q) => ({ ...q, state: deriveStatus(q) }));
  list.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || '') || b.id - a.id);
  return list;
}

function makeConn() {
  return {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    query(sql, params) { return fakeQuery.call({ _importFlow: true }, sql, params); },
  };
}

// ---------- 注入桩到 require 缓存 ----------
const dbPath = require.resolve('../src/config/db');
require.cache[dbPath] = {
  id: dbPath, filename: dbPath, loaded: true,
  exports: {
    pool: { query: (sql, params) => fakeQuery(sql, params), async getConnection() { return makeConn(); } },
    initSchema: async () => {},
    ping: async () => {},
  },
};
// 邮件桩：不真正发送
const mailPath = require.resolve('../src/config/mailer');
require.cache[mailPath] = {
  id: mailPath, filename: mailPath, loaded: true,
  exports: { getTransporter: () => null, sendMail: async () => {}, sendResetPasswordMail: async () => {} },
};

process.env.INIT_ADMIN_USERNAME = 'admin';
process.env.INIT_ADMIN_PASSWORD = 'Admin@123456';

// ---------- 启动真实 express（不调 listen，直接 supertest 风格：用 http 注入） ----------
const express = require('express');
const path = require('path');
// 复用 server.js 里的 app 结构较难（它会 listen），这里重建同样的中间件装配
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use('/api/query', require('../src/routes/query'));
app.use('/api/auth', require('../src/routes/auth'));
app.use('/api/qualifications', require('../src/routes/qualifications'));
app.use('/api/admins', require('../src/routes/admins'));
app.use(express.static(path.join(__dirname, '..', 'public')));

const server = app.listen(0);

function req(method, urlPath, { token, body, form } = {}) {
  return new Promise((resolve, reject) => {
    const http = require('http');
    const payload = form ? form.payload : (body ? JSON.stringify(body) : null);
    const r = http.request({
      port: server.address().port, path: urlPath, method,
      headers: {
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(payload && !form ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...(form ? form.getHeaders() : {}),
      },
    }, (res) => {
      let chunks = '';
      res.on('data', (d) => (chunks += d));
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(chunks); } catch (e) {}
        resolve({ status: res.statusCode, json, text: chunks });
      });
    });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

let pass = 0, failCount = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { failCount++; console.error('  ✗', name, extra !== undefined ? JSON.stringify(extra) : ''); }
}

(async () => {
  // 初始管理员（模拟 server 的 ensureInitialAdmin）
  db._seq.admins = 1;
  db.admins.push({
    id: 1, username: 'admin', password_hash: bcrypt.hashSync('Admin@123456', 10),
    display_name: '超管', email: null, role: 'super_admin', is_active: 1, created_at: new Date().toISOString(),
  });

  console.log('1) 公开查询');
  let r = await req('GET', '/api/query?dealer_name=&store_code=S1');
  check('缺少经销商名 -> 422', r.status === 422);

  console.log('2) 登录与鉴权');
  r = await req('POST', '/api/auth/login', { body: { username: 'admin', password: 'wrong' } });
  check('错误密码 401', r.status === 401);
  r = await req('POST', '/api/auth/login', { body: { username: 'admin', password: 'Admin@123456' } });
  check('正确登录 200 且返回 token', r.status === 200 && !!r.json.data.token, r.json);
  const token = r.json.data.token;
  check('登录角色 super_admin', r.json.data.admin.role === 'super_admin');
  r = await req('GET', '/api/auth/me', { token });
  check('/me 鉴权通过', r.status === 200 && r.json.data.username === 'admin');
  r = await req('GET', '/api/qualifications');
  check('未带 token 访问后台 401', r.status === 401);

  console.log('3) 资质 CRUD');
  r = await req('POST', '/api/qualifications', { token, body: {
    dealer_name: '华东电器有限公司', store_code: 'SH-001', brand: '海尔', region: '上海浦东',
    parent_agent: '海尔上海', valid_from: '2025-01-01', valid_until: '2026-12-31', opened_at: '2024-06-01',
  } });
  check('新增资质成功', r.status === 200, r.json);
  r = await req('POST', '/api/qualifications', { token, body: {
    dealer_name: '华东电器有限公司', store_code: 'SH-001', brand: '海尔', region: '上海浦东',
    valid_from: '2025-01-01', valid_until: '2026-12-31',
  } });
  check('门店+品牌重复 -> 409', r.status === 409);
  r = await req('POST', '/api/qualifications', { token, body: {
    dealer_name: '测试', store_code: 'X1', brand: 'B', region: 'R',
    valid_from: '2026-01-01', valid_until: '2025-01-01',
  } });
  check('起止日期倒置 -> 422', r.status === 422);
  r = await req('POST', '/api/qualifications', { token, body: {
    dealer_name: '华东电器有限公司', store_code: 'SH-001', brand: '美的', region: '上海浦东',
    parent_agent: '美的华东', valid_from: '2023-01-01', valid_until: '2024-01-01',
  } });
  check('再加一条已过期记录', r.status === 200, r.json);
  r = await req('GET', '/api/qualifications?state=valid', { token });
  check('状态筛选 valid 返回 1 条', r.json.data.list.length === 1, r.json.data.list.map((x) => x.brand));
  r = await req('GET', '/api/qualifications?state=expired', { token });
  check('状态筛选 expired 返回 1 条', r.json.data.list.length === 1);
  r = await req('PUT', '/api/qualifications/1', { token, body: {
    dealer_name: '华东电器有限公司', store_code: 'SH-001', brand: '海尔', region: '上海市浦东新区',
    parent_agent: '海尔上海分公司', valid_from: '2025-01-01', valid_until: '2027-12-31', opened_at: '2024-06-01',
  } });
  check('编辑资质成功', r.status === 200, r.json);

  console.log('4) 客户查询返回字段');
  r = await req('GET', '/api/query?dealer_name=' + encodeURIComponent('华东') + '&store_code=SH-001');
  check('模糊查询命中', r.status === 200 && r.json.data && r.json.data.brands.length === 2, r.json.data && r.json.data.brands);
  const auth = r.json.data.authorizations.find((a) => a.brand === '海尔');
  check('含授权品牌/区域/有效期/上级代理', !!(auth.region && auth.valid_from && auth.parent_agent));
  check('含开通时间', r.json.data.opened_at === '2024-06-01');
  check('过期行状态 expired', r.json.data.authorizations.find((a) => a.brand === '美的').state === 'expired');
  r = await req('GET', '/api/query?dealer_name=' + encodeURIComponent('不存在') + '&store_code=ZZ');
  check('未命中 data=null', r.status === 200 && r.json.data === null);

  console.log('5) CSV 导入');
  const csv = Buffer.concat([
    Buffer.from([0xEF, 0xBB, 0xBF]),
    Buffer.from('经销商名称,门店编号,授权品牌,授权区域,上级代理,有效期开始,有效期截止,开通时间,状态\n' +
      '华东电器有限公司,SH-001,海尔,上海市浦东新区,海尔上海分公司,2025-02-01,2028-12-31,2024-06-01,有效\n' +
      '北京商家,BJ-9,格力,北京朝阳区,格力北京,2025/3/1,2026/3/1,2025-2-1,有效\n'),
  ]);
  // 手写 multipart/form-data，避免引入 form-data 依赖
  function multipart(content, filename) {
    const boundary = '----smokeboundary' + Math.random().toString(16).slice(2);
    const head = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: text/csv\r\n\r\n`
    );
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
    return {
      getHeaders() {
        return { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': Buffer.concat([head, content, tail]).length };
      },
      payload: Buffer.concat([head, content, tail]),
    };
  }
  const form = multipart(csv, 'q.csv');
  r = await req('POST', '/api/qualifications/import', { token, form });
  check('导入：1 更新 + 1 新增', r.status === 200 && r.json.data.inserted === 1 && r.json.data.updated === 1, r.json);
  const badCsv = Buffer.from('经销商名称,门店编号,授权品牌,授权区域,有效期开始,有效期截止\n' +
    'X,S1,B,R,2025-01-01,2026-01-01\n' +
    'X,S1,B,R2,bad-date,2026-01-01\n');
  const form2 = multipart(badCsv, 'bad.csv');
  r = await req('POST', '/api/qualifications/import', { token, form: form2 });
  check('坏数据整批拒绝 422 且带行级错误', r.status === 422 && r.json.errors.length >= 1, r.json);

  console.log('6) 多管理员与权限');
  r = await req('POST', '/api/admins', { token, body: {
    username: 'editor1', password: 'Editor@123', display_name: '录入员甲', email: 'e@example.com', role: 'admin',
  } });
  check('超管创建普通管理员', r.status === 200, r.json);
  r = await req('POST', '/api/auth/login', { body: { username: 'editor1', password: 'Editor@123' } });
  const token2 = r.json.data.token;
  r = await req('GET', '/api/admins', { token: token2 });
  check('普通管理员访问账号列表 -> 403', r.status === 403);
  r = await req('GET', '/api/qualifications', { token: token2 });
  check('普通管理员可访问资质', r.status === 200);
  r = await req('POST', '/api/auth/change-password', { token: token2, body: { old_password: 'Editor@123', new_password: 'NewPass@456' } });
  check('普通管理员改自己密码', r.status === 200, r.json);
  r = await req('POST', '/api/auth/login', { body: { username: 'editor1', password: 'NewPass@456' } });
  check('新密码可登录', r.status === 200);
  r = await req('DELETE', '/api/admins/1', { token });
  check('超管不能删除自己 -> 409', r.status === 409);

  console.log('7) 统计');
  r = await req('GET', '/api/qualifications/stats/summary', { token });
  check('统计返回', r.status === 200 && r.json.data.qualifications >= 3, r.json.data);

  console.log('8) 静态页面');
  r = await req('GET', '/');
  check('首页 200 且为 HTML', r.status === 200 && r.text.includes('经销授权资质查询'));
  r = await req('GET', '/admin/login.html');
  check('后台登录页 200', r.status === 200 && r.text.includes('后台管理登录'));

  server.close();
  console.log(`\n结果：${pass} 通过，${failCount} 失败`);
  process.exit(failCount ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
