'use strict';

/** 统一成功/失败响应 */
function ok(res, data = null, message = 'success') {
  return res.json({ code: 0, message, data });
}
function fail(res, message = '请求失败', status = 400, code = 1, extra = {}) {
  return res.status(status).json({ code, message, ...extra });
}

/** 解析 YYYY-MM-DD 或 YYYY/MM/D（兼容 Excel 导出的 2024/1/5）。非法返回 null */
function parseDate(input) {
  if (input === null || input === undefined) return null;
  const s = String(input).trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** 授权状态：active 行结合有效期计算 */
function deriveStatus(row, today) {
  if (row.status === 'revoked') return 'revoked';
  if (row.valid_from > today) return 'pending';
  if (row.valid_until < today) return 'expired';
  return 'valid';
}

const STATUS_TEXT = {
  valid: '有效',
  expiring: '即将到期',
  expired: '已过期',
  pending: '未生效',
  revoked: '已撤销',
};

/** 把字符串转成 status 枚举，支持中英文 */
function normalizeStatus(v) {
  const s = String(v || '').trim().toLowerCase();
  if (['revoked', '已撤销', '停用', '无效'].includes(s)) return 'revoked';
  if (['active', '有效', '正常', '生效中', ''].includes(s)) return 'active';
  return null;
}

function normalizeCode(v) {
  return String(v || '').trim();
}

module.exports = {
  ok, fail, parseDate, deriveStatus, STATUS_TEXT, normalizeStatus, normalizeCode,
};
