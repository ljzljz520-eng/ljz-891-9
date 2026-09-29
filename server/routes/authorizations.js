const express = require('express');
const router = express.Router();
const { Authorization, Dealer } = require('../models');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// 某经销商的授权列表
router.get('/dealer/:dealerId', async (req, res) => {
  try {
    const list = await Authorization.findAll({
      where: { dealerId: req.params.dealerId },
      order: [['createdAt', 'DESC']]
    });
    res.json({ success: true, data: list });
  } catch (err) {
    console.error('获取授权列表失败:', err);
    res.status(500).json({ success: false, message: '服务器内部错误' });
  }
});

// 新增授权
router.post('/', async (req, res) => {
  try {
    const { dealerId, brand, authorizedRegion, validFrom, validTo, status, remark } = req.body;
    if (!dealerId || !brand) {
      return res.status(400).json({ success: false, message: '经销商和品牌必填' });
    }
    const dealer = await Dealer.findByPk(dealerId);
    if (!dealer) {
      return res.status(404).json({ success: false, message: '经销商不存在' });
    }
    const auth = await Authorization.create({
      dealerId,
      brand: String(brand).trim(),
      authorizedRegion: authorizedRegion || null,
      validFrom: validFrom || null,
      validTo: validTo || null,
      status: status || 'active',
      remark: remark || null
    });
    res.status(201).json({ success: true, message: '授权已添加', data: auth });
  } catch (err) {
    console.error('新增授权失败:', err);
    res.status(500).json({ success: false, message: '服务器内部错误' });
  }
});

// 更新授权
router.put('/:id', async (req, res) => {
  try {
    const auth = await Authorization.findByPk(req.params.id);
    if (!auth) {
      return res.status(404).json({ success: false, message: '授权记录不存在' });
    }
    const fields = ['brand', 'authorizedRegion', 'validFrom', 'validTo', 'status', 'remark'];
    const update = {};
    for (const f of fields) {
      if (req.body[f] !== undefined) update[f] = req.body[f];
    }
    await auth.update(update);
    res.json({ success: true, message: '授权已更新', data: auth });
  } catch (err) {
    console.error('更新授权失败:', err);
    res.status(500).json({ success: false, message: '服务器内部错误' });
  }
});

// 删除授权
router.delete('/:id', async (req, res) => {
  try {
    const auth = await Authorization.findByPk(req.params.id);
    if (!auth) {
      return res.status(404).json({ success: false, message: '授权记录不存在' });
    }
    await auth.destroy();
    res.json({ success: true, message: '授权已删除' });
  } catch (err) {
    console.error('删除授权失败:', err);
    res.status(500).json({ success: false, message: '服务器内部错误' });
  }
});

module.exports = router;
