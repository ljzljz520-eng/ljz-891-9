const { parse } = require('csv-parse/sync');
const { Dealer, Authorization, sequelize } = require('../models');

// CSV 列名映射（支持中英文表头）
const COLUMN_MAP = {
  '经销商名称': 'name',
  '门店名称': 'name',
  'name': 'name',
  '门店编号': 'storeNo',
  '门店编号': 'storeNo',
  'store_no': 'storeNo',
  'storeNo': 'storeNo',
  '品牌': 'brand',
  'brand': 'brand',
  '授权品牌': 'brand',
  '授权区域': 'authorizedRegion',
  '区域': 'region',
  'region': 'region',
  'authorized_region': 'authorizedRegion',
  '有效期开始': 'validFrom',
  '有效期起': 'validFrom',
  'valid_from': 'validFrom',
  'validFrom': 'validFrom',
  '有效期结束': 'validTo',
  '有效期至': 'validTo',
  'valid_to': 'validTo',
  'validTo': 'validTo',
  '上级代理': 'parentAgent',
  '上级代理商': 'parentAgent',
  'parent_agent': 'parentAgent',
  'parentAgent': 'parentAgent',
  '开通时间': 'activatedAt',
  'activated_at': 'activatedAt',
  'activatedAt': 'activatedAt',
  '联系人': 'contactPerson',
  'contact_person': 'contactPerson',
  '联系电话': 'contactPhone',
  'contact_phone': 'contactPhone',
  '联系邮箱': 'contactEmail',
  'contact_email': 'contactEmail',
  '备注': 'remark',
  'remark': 'remark'
};

function normalizeRow(rawRow) {
  const row = {};
  for (const [key, value] of Object.entries(rawRow)) {
    const trimmedKey = key.trim();
    const mapped = COLUMN_MAP[trimmedKey] || COLUMN_MAP[trimmedKey.toLowerCase()];
    if (mapped) {
      row[mapped] = value != null ? String(value).trim() : '';
    }
  }
  return row;
}

// 解析日期，支持 YYYY-MM-DD / YYYY/MM/DD / YYYY-MM-DD HH:mm:ss
function parseDate(value) {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;
  // 纯日期
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(v)) {
    return v.replace(/\//g, '-');
  }
  // 日期时间
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}[ T]\d{1,2}:\d{1,2}/.test(v)) {
    const d = new Date(v.replace(/-/g, '/'));
    if (!isNaN(d.getTime())) return d;
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

async function importCsv(buffer, { mode = 'upsert' } = {}) {
  const content = buffer.toString('utf-8').replace(/^﻿/, ''); // 去除 BOM
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true
  });

  const result = { total: records.length, dealersCreated: 0, dealersUpdated: 0, authCreated: 0, authUpdated: 0, errors: [] };

  for (let i = 0; i < records.length; i++) {
    const row = normalizeRow(records[i]);
    const lineNo = i + 2; // 表头占第 1 行
    try {
      if (!row.name || !row.storeNo) {
        result.errors.push({ line: lineNo, message: '缺少经销商名称或门店编号' });
        continue;
      }
      if (!row.brand) {
        result.errors.push({ line: lineNo, message: '缺少品牌信息' });
        continue;
      }

      const tx = await sequelize.transaction();
      try {
        // 查找或创建经销商
        let dealer = await Dealer.findOne({ where: { name: row.name, storeNo: row.storeNo }, transaction: tx });
        const dealerData = {
          name: row.name,
          storeNo: row.storeNo,
          region: row.region || null,
          parentAgent: row.parentAgent || null,
          contactPerson: row.contactPerson || null,
          contactPhone: row.contactPhone || null,
          contactEmail: row.contactEmail || null,
          activatedAt: parseDate(row.activatedAt) || new Date(),
          remark: row.remark || null
        };
        if (dealer) {
          if (mode === 'upsert') {
            await dealer.update(dealerData, { transaction: tx });
            result.dealersUpdated++;
          }
        } else {
          dealer = await Dealer.create({ ...dealerData, status: 'active' }, { transaction: tx });
          result.dealersCreated++;
        }

        // 查找或创建品牌授权
        const authData = {
          brand: row.brand,
          authorizedRegion: row.authorizedRegion || row.region || null,
          validFrom: parseDate(row.validFrom),
          validTo: parseDate(row.validTo),
          remark: row.remark || null
        };
        let auth = await Authorization.findOne({
          where: { dealerId: dealer.id, brand: row.brand },
          transaction: tx
        });
        if (auth) {
          await auth.update(authData, { transaction: tx });
          result.authUpdated++;
        } else {
          await Authorization.create({ ...authData, dealerId: dealer.id, status: 'active' }, { transaction: tx });
          result.authCreated++;
        }
        await tx.commit();
      } catch (err) {
        await tx.rollback();
        throw err;
      }
    } catch (err) {
      result.errors.push({ line: lineNo, message: err.message });
    }
  }

  return result;
}

module.exports = { importCsv, parseDate };
