const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { Dealer, Authorization, QueryLog, Admin } = require('../models');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// 仪表盘统计
router.get('/overview', async (req, res) => {
  try {
    const [dealerCount, authCount, activeAuthCount, queryCount, hitCount, adminCount] = await Promise.all([
      Dealer.count(),
      Authorization.count(),
      Authorization.count({ where: { status: 'active' } }),
      QueryLog.count(),
      QueryLog.count({ where: { hit: true } }),
      Admin.count()
    ]);

    // 近 7 天查询趋势
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      days.push(d);
    }
    const trend = await Promise.all(days.map(async (day) => {
      const next = new Date(day);
      next.setDate(next.getDate() + 1);
      const [total, hit] = await Promise.all([
        QueryLog.count({ where: { createdAt: { [Op.gte]: day, [Op.lt]: next } } }),
        QueryLog.count({ where: { createdAt: { [Op.gte]: day, [Op.lt]: next }, hit: true } })
      ]);
      return { date: `${day.getMonth() + 1}/${day.getDate()}`, total, hit };
    }));

    res.json({
      success: true,
      data: {
        dealerCount,
        authCount,
        activeAuthCount,
        queryCount,
        hitCount,
        adminCount,
        trend
      }
    });
  } catch (err) {
    console.error('获取统计数据失败:', err);
    res.status(500).json({ success: false, message: '服务器内部错误' });
  }
});

module.exports = router;
