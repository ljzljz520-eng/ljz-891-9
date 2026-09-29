const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { QueryLog, Dealer } = require('../models');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// 查询日志列表
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
    const keyword = (req.query.keyword || '').trim();
    const hit = req.query.hit;

    const where = {};
    if (keyword) {
      where[Op.or] = [
        { queryName: { [Op.like]: `%${keyword}%` } },
        { queryStoreNo: { [Op.like]: `%${keyword}%` } }
      ];
    }
    if (hit === 'true') where.hit = true;
    if (hit === 'false') where.hit = false;

    const { count, rows } = await QueryLog.findAndCountAll({
      where,
      include: [{ model: Dealer, as: 'dealer', attributes: ['id', 'name', 'storeNo'], required: false }],
      order: [['createdAt', 'DESC']],
      limit: pageSize,
      offset: (page - 1) * pageSize
    });

    res.json({
      success: true,
      data: { list: rows, total: count, page, pageSize }
    });
  } catch (err) {
    console.error('获取查询日志失败:', err);
    res.status(500).json({ success: false, message: '服务器内部错误' });
  }
});

module.exports = router;
