const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticate } = require('../middleware/auth');
const { importCsv } = require('../services/csvImport');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const ok = /csv|excel|text|plain|octet-stream|vnd.ms-excel|vnd.openxmlformats/.test(file.mimetype) ||
      /\.csv$/i.test(file.originalname);
    if (ok) return cb(null, true);
    cb(new Error('仅支持 CSV 文件'));
  }
});

router.use(authenticate);

// CSV 导入
router.post('/csv', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: '请上传 CSV 文件' });
    }
    const mode = req.query.mode === 'insert' ? 'insert' : 'upsert';
    const result = await importCsv(req.file.buffer, { mode });
    res.json({ success: true, message: '导入完成', data: result });
  } catch (err) {
    console.error('CSV 导入失败:', err);
    res.status(500).json({ success: false, message: '导入失败：' + err.message });
  }
});

// 下载 CSV 导入模板
router.get('/template', (req, res) => {
  const template = '经销商名称,门店编号,品牌,授权区域,有效期开始,有效期结束,上级代理,开通时间,联系人,联系电话,联系邮箱,备注\n' +
    '示例商贸有限公司,D001,示例品牌,华东区,2025-01-01,2026-12-31,示例省代,2025-01-15,张三,13800000000,zhangsan@example.com,\n';
  // 加 BOM 以便 Excel 正确识别中文
  const buffer = Buffer.from('﻿' + template, 'utf-8');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="dealer_import_template.csv"');
  res.send(buffer);
});

module.exports = router;
