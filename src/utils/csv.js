'use strict';
const { parse } = require('csv-parse/sync');
const { parseDate, normalizeStatus } = require('./helpers');

/**
 * 支持的中英文表头（大小写/空格不敏感）
 * 每行 = 一个门店对一个品牌的一条授权
 */
const COLUMN_MAP = {
  '经销商名称': 'dealer_name', dealer: 'dealer_name', dealername: 'dealer_name', '经销商': 'dealer_name',
  '门店编号': 'store_code', store: 'store_code', storecode: 'store_code', '门店号': 'store_code',
  '授权品牌': 'brand', brand: 'brand',
  '授权区域': 'region', region: 'region', '区域': 'region',
  '上级代理': 'parent_agent', parentagent: 'parent_agent', parent: 'parent_agent',
  '有效期开始': 'valid_from', validfrom: 'valid_from', startdate: 'valid_from', '授权开始': 'valid_from',
  '有效期截止': 'valid_until', validuntil: 'valid_until', enddate: 'valid_until', '授权截止': 'valid_until', '到期日期': 'valid_until',
  '开通时间': 'opened_at', openedat: 'opened_at', '门店开通时间': 'opened_at',
  '状态': 'status', status: 'status',
};

const REQUIRED = ['dealer_name', 'store_code', 'brand', 'region', 'valid_from', 'valid_until'];

/**
 * 解析并校验 CSV 文本
 * @returns {{ rows: Array, errors: Array<{line:number,message:string}>, headerNotice?:string }}
 */
function parseQualificationCsv(text) {
  // 去掉 UTF-8 BOM
  const clean = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;

  let records;
  try {
    records = parse(clean, {
      columns: (header) => header.map((h) => COLUMN_MAP[String(h).replace(/[\s*]/g, '').toLowerCase()] || null),
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    });
  } catch (e) {
    const err = new Error('CSV 格式错误，无法解析：' + e.message);
    err.statusCode = 400;
    throw err;
  }

  if (!records.length) return { rows: [], errors: [{ line: 0, message: '文件中没有数据行' }] };

  const presentCols = new Set();
  Object.keys(records[0]).forEach((k) => k && presentCols.add(k));
  const missingCols = REQUIRED.filter((c) => !presentCols.has(c));
  if (missingCols.length) {
    const names = {
      dealer_name: '经销商名称', store_code: '门店编号', brand: '授权品牌',
      region: '授权区域', valid_from: '有效期开始', valid_until: '有效期截止',
    };
    const err = new Error('缺少必需列：' + missingCols.map((c) => names[c]).join('、'));
    err.statusCode = 400;
    throw err;
  }

  const rows = [];
  const errors = [];
  const seen = new Set();

  records.forEach((rec, i) => {
    const line = i + 2; // 含表头，人类阅读行号
    const row = {
      dealer_name: (rec.dealer_name || '').trim(),
      store_code: (rec.store_code || '').trim(),
      brand: (rec.brand || '').trim(),
      region: (rec.region || '').trim(),
      parent_agent: (rec.parent_agent || '').trim(),
      valid_from: parseDate(rec.valid_from),
      valid_until: parseDate(rec.valid_until),
      opened_at: parseDate(rec.opened_at),
      status: 'active',
    };

    let bad = false;
    const need = {
      dealer_name: '经销商名称', store_code: '门店编号', brand: '授权品牌',
      region: '授权区域', valid_from: '有效期开始', valid_until: '有效期截止',
    };
    for (const [field, label] of Object.entries(need)) {
      const v = row[field];
      if (v === '' || v === null) { errors.push({ line, message: `${label}不能为空` }); bad = true; }
    }
    if (rec.valid_from && !row.valid_from) { errors.push({ line, message: '有效期开始日期格式不正确（应为 YYYY-MM-DD）' }); bad = true; }
    if (rec.valid_until && !row.valid_until) { errors.push({ line, message: '有效期截止日期格式不正确（应为 YYYY-MM-DD）' }); bad = true; }
    if (rec.opened_at && !row.opened_at) { errors.push({ line, message: '开通时间日期格式不正确（应为 YYYY-MM-DD）' }); bad = true; }
    if (row.valid_from && row.valid_until && row.valid_from > row.valid_until) {
      errors.push({ line, message: '有效期开始不能晚于截止' }); bad = true;
    }
    if (rec.status !== undefined && String(rec.status).trim() !== '') {
      const st = normalizeStatus(rec.status);
      if (!st) { errors.push({ line, message: `状态值无法识别：${rec.status}（请填 有效/已撤销）` }); bad = true; }
      else row.status = st;
    }

    if (!bad) {
      const key = `${row.store_code}||${row.brand}`;
      if (seen.has(key)) {
        errors.push({ line, message: `文件内重复：门店 ${row.store_code} 对品牌 ${row.brand} 出现多次` });
      } else {
        seen.add(key);
        rows.push(row);
      }
    }
  });

  return { rows, errors };
}

module.exports = { parseQualificationCsv, COLUMN_MAP, REQUIRED };
