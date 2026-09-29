const express = require('express');
const router = express.Router();
const { Dealer, Authorization } = require('../models');
const { authenticate } = require('../middleware/auth');
const mailer = require('../services/mailer');

router.use(authenticate);

// 邮件配置状态
router.get('/status', (req, res) => {
  res.json({
    success: true,
    data: {
      configured: mailer.isConfigured(),
      smtpHost: process.env.SMTP_HOST || null,
      smtpUser: process.env.SMTP_USER || null,
      smtpFrom: process.env.SMTP_FROM || null
    }
  });
});

// 发送测试邮件
router.post('/test', async (req, res) => {
  try {
    const { to } = req.body;
    if (!to) {
      return res.status(400).json({ success: false, message: '请提供收件邮箱' });
    }
    await mailer.sendTestEmail(to);
    res.json({ success: true, message: '测试邮件已发送' });
  } catch (err) {
    console.error('发送测试邮件失败:', err);
    res.status(500).json({ success: false, message: '发送失败：' + err.message });
  }
});

// 向指定经销商发送资质确认邮件
router.post('/send-qualification/:dealerId', async (req, res) => {
  try {
    const dealer = await Dealer.findByPk(req.params.dealerId, {
      include: [{ model: Authorization, as: 'authorizations' }]
    });
    if (!dealer) {
      return res.status(404).json({ success: false, message: '经销商不存在' });
    }
    const to = dealer.contactEmail;
    if (!to) {
      return res.status(400).json({ success: false, message: '该经销商未设置联系邮箱，请先在经销商信息中填写邮箱' });
    }
    await mailer.sendQualificationEmail({
      to,
      dealer,
      authorizations: dealer.authorizations || []
    });
    res.json({ success: true, message: `资质确认邮件已发送至 ${to}` });
  } catch (err) {
    console.error('发送资质邮件失败:', err);
    res.status(500).json({ success: false, message: '发送失败：' + err.message });
  }
});

module.exports = router;
