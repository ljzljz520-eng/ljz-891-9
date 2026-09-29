const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { Dealer, Authorization } = require('../models');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// 经销商列表（分页 + 搜索）
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 10));
    const keyword = (req.query.keyword || '').trim();
    const status = req.query.status;

    const where = {};
    if (keyword) {
      where[Op.or] = [
        { name: { [Op.like]: `%${keyword}%` } },
        { storeNo: { [Op.like]: `%${keyword}%` } },
        { parentAgent: { [Op.like]: `%${keyword}%` } }
      ];
    }
    if (status) where.status = status;

    const { count, rows } = await Dealer.findAndCountAll({
      where,
      include: [{ model: Authorization, as: 'authorizations', required: false }],
      order: [['createdAt', 'DESC']],
      limit: pageSize,
      offset: (page - 1) * pageSize,
      distinct: true
    });

    res.json({
      success: true,
      data: {
        list: rows.map((d) => ({
          ...d.toJSON(),
          authorizationCount: d.authorizations ? d.authorizations.length : 0
        })),
        total: count,
        page,
        pageSize
      }
    });
  } catch (err) {
    console.error('获取经销商列表失败:', err);
    res.status(500).json({ success: false, message: '服务器内部错误' });
  }
});

// 获取单个经销商详情（含授权）
router.get('/:id', async (req, res) => {
  try {
    const dealer = await Dealer.findByPk(req.params.id, {
      include: [{ model: Authorization, as: 'authorizations', order: [['createdAt', 'DESC']] }]
    });
    if (!dealer) {
      return res.status(404).json({ success: false, message: '经销商不存在' });
    }
    res.json({ success: true, data: dealer });
  } catch (err) {
    console.error('获取经销商详情失败:', err);
    res.status(500).json({ success: false, message: '服务器内部错误' });
  }
});

// 新增经销商
router.post('/', async (req, res) => {
  try {
    const { name, storeNo, region, parentAgent, contactPerson, contactPhone, contactEmail, activatedAt, status, remark } = req.body;
    if (!name || !storeNo) {
      return res.status(400).json({ success: false, message: '经销商名称和门店编号必填' });
    }
    const exists = await Dealer.findOne({ where: { name: String(name).trim(), storeNo: String(storeNo).trim() } });
    if (exists) {
      return res.status(409).json({ success: false, message: '该经销商名称与门店编号已存在' });
    }
    const dealer = await Dealer.create({
      name: String(name).trim(),
      storeNo: String(storeNo).trim(),
      region: region || null,
      parentAgent: parentAgent || null,
      contactPerson: contactPerson || null,
      contactPhone: contactPhone || null,
      contactEmail: contactEmail || null,
      activatedAt: activatedAt || new Date(),
      status: status || 'active',
      remark: remark || null
    });
    res.status(201).json({ success: true, message: '经销商创建成功', data: dealer });
  } catch (err) {
    console.error('新增经销商失败:', err);
    res.status(500).json({ success: false, message: '服务器内部错误' });
  }
});

// 更新经销商
router.put('/:id', async (req, res) => {
  try {
    const dealer = await Dealer.findByPk(req.params.id);
    if (!dealer) {
      return res.status(404).json({ success: false, message: '经销商不存在' });
    }
    const fields = ['name', 'storeNo', 'region', 'parentAgent', 'contactPerson', 'contactPhone', 'contactEmail', 'activatedAt', 'status', 'remark'];
    const update = {};
    for (const f of fields) {
      if (req.body[f] !== undefined) update[f] = req.body[f];
    }
    // 检查唯一冲突
    if (update.name || update.storeNo) {
      const dup = await Dealer.findOne({
        where: {
          name: update.name || dealer.name,
          storeNo: update.storeNo || dealer.storeNo,
          id: { [Op.ne]: dealer.id }
        }
      });
      if (dup) {
        return res.status(409).json({ success: false, message: '该经销商名称与门店编号已存在' });
      }
    }
    await dealer.update(update);
    res.json({ success: true, message: '经销商信息已更新', data: dealer });
  } catch (err) {
    console.error('更新经销商失败:', err);
    res.status(500).json({ success: false, message: '服务器内部错误' });
  }
});

// 删除经销商（级联删除授权）
router.delete('/:id', async (req, res) => {
  try {
    const dealer = await Dealer.findByPk(req.params.id);
    if (!dealer) {
      return res.status(404).json({ success: false, message: '经销商不存在' });
    }
    await dealer.destroy();
    res.json({ success: true, message: '经销商及其授权已删除' });
  } catch (err) {
    console.error('删除经销商失败:', err);
    res.status(500).json({ success: false, message: '服务器内部错误' });
  }
});

module.exports = router;
