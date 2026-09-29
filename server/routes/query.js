const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { Dealer, Authorization, QueryLog } = require('../models');

// 公开查询：根据经销商名称 + 门店编号查询资质
router.post('/', async (req, res) => {
  try {
    const { name, storeNo } = req.body;
    if (!name || !storeNo) {
      return res.status(400).json({ success: false, message: '请输入经销商名称和门店编号' });
    }

    const dealer = await Dealer.findOne({
      where: {
        name: { [Op.eq]: String(name).trim() },
        storeNo: { [Op.eq]: String(storeNo).trim() }
      },
      include: [{
        model: Authorization,
        as: 'authorizations',
        where: { status: { [Op.ne]: 'revoked' } },
        required: false
      }]
    });

    const ip = req.ip || req.connection.remoteAddress || '';
    const ua = (req.headers['user-agent'] || '').slice(0, 255);

    if (!dealer) {
      await QueryLog.create({
        dealerId: null,
        queryName: String(name).trim(),
        queryStoreNo: String(storeNo).trim(),
        hit: false,
        ip,
        userAgent: ua
      });
      return res.status(404).json({ success: false, message: '未找到匹配的经销商资质信息，请核对名称与门店编号' });
    }

    await QueryLog.create({
      dealerId: dealer.id,
      queryName: String(name).trim(),
      queryStoreNo: String(storeNo).trim(),
      hit: true,
      ip,
      userAgent: ua
    });

    const auths = (dealer.authorizations || []).map((a) => ({
      id: a.id,
      brand: a.brand,
      authorizedRegion: a.authorizedRegion,
      validFrom: a.validFrom,
      validTo: a.validTo,
      status: a.status
    }));

    res.json({
      success: true,
      data: {
        dealer: {
          id: dealer.id,
          name: dealer.name,
          storeNo: dealer.storeNo,
          region: dealer.region,
          parentAgent: dealer.parentAgent,
          activatedAt: dealer.activatedAt,
          status: dealer.status
        },
        authorizations: auths
      }
    });
  } catch (err) {
    console.error('查询失败:', err);
    res.status(500).json({ success: false, message: '服务器内部错误' });
  }
});

module.exports = router;
