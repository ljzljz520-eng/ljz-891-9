const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST;
  if (!host) {
    return null;
  }
  transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT) || 465,
    secure: process.env.SMTP_SECURE !== 'false',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
  return transporter;
}

function isConfigured() {
  return !!getTransporter();
}

// 生成资质邮件 HTML
function buildQualificationEmail({ dealer, authorizations }) {
  const systemName = process.env.SYSTEM_NAME || '品牌经销资质查询系统';
  const rows = authorizations.map((a) => `
    <tr>
      <td style="padding:10px;border:1px solid #e5e7eb;">${a.brand || '-'}</td>
      <td style="padding:10px;border:1px solid #e5e7eb;">${a.authorizedRegion || '-'}</td>
      <td style="padding:10px;border:1px solid #e5e7eb;">${a.validFrom || '-'} 至 ${a.validTo || '-'}</td>
      <td style="padding:10px;border:1px solid #e5e7eb;">
        ${a.status === 'active' ? '<span style="color:#16a34a;">有效</span>' : a.status === 'expired' ? '<span style="color:#dc2626;">已过期</span>' : '<span style="color:#6b7280;">已撤销</span>'}
      </td>
    </tr>
  `).join('');

  return `
  <div style="max-width:640px;margin:0 auto;font-family:'Microsoft YaHei',Arial,sans-serif;color:#1f2937;">
    <div style="background:#1e40af;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0;">
      <h2 style="margin:0;">${systemName}</h2>
      <p style="margin:6px 0 0;opacity:.9;">经销商资质确认函</p>
    </div>
    <div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
      <p>尊敬的 <strong>${dealer.name}</strong>（门店编号：${dealer.storeNo}）：</p>
      <p>您好！经核实，贵门店的品牌经销资质信息如下：</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
        <thead>
          <tr style="background:#f3f4f6;">
            <th style="padding:10px;border:1px solid #e5e7eb;text-align:left;">授权品牌</th>
            <th style="padding:10px;border:1px solid #e5e7eb;text-align:left;">授权区域</th>
            <th style="padding:10px;border:1px solid #e5e7eb;text-align:left;">有效期</th>
            <th style="padding:10px;border:1px solid #e5e7eb;text-align:left;">状态</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="4" style="padding:16px;text-align:center;color:#9ca3af;">暂无授权记录</td></tr>'}</tbody>
      </table>
      <table style="width:100%;font-size:14px;color:#4b5563;">
        <tr><td style="padding:4px 0;width:110px;">所在区域：</td><td>${dealer.region || '-'}</td></tr>
        <tr><td style="padding:4px 0;">上级代理：</td><td>${dealer.parentAgent || '-'}</td></tr>
        <tr><td style="padding:4px 0;">开通时间：</td><td>${dealer.activatedAt ? new Date(dealer.activatedAt).toLocaleString('zh-CN') : '-'}</td></tr>
      </table>
      <p style="margin-top:24px;color:#6b7280;font-size:13px;">本邮件由系统自动发送，请勿直接回复。如有疑问，请联系品牌方管理人员。</p>
    </div>
  </div>`;
}

// 发送资质邮件
async function sendQualificationEmail({ to, dealer, authorizations }) {
  const transporter = getTransporter();
  if (!transporter) {
    throw new Error('邮件服务未配置，请在环境变量中设置 SMTP 参数');
  }
  const systemName = process.env.SYSTEM_NAME || '品牌经销资质查询系统';
  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: `【${systemName}】${dealer.name} 品牌经销资质确认`,
    html: buildQualificationEmail({ dealer, authorizations })
  };
  return transporter.sendMail(mailOptions);
}

// 测试邮件
async function sendTestEmail(to) {
  const transporter = getTransporter();
  if (!transporter) {
    throw new Error('邮件服务未配置');
  }
  const systemName = process.env.SYSTEM_NAME || '品牌经销资质查询系统';
  return transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: `【${systemName}】测试邮件`,
    html: `<div style="font-family:sans-serif;padding:20px;"><h2>邮件配置测试成功</h2><p>这是一封测试邮件，用于验证 SMTP 配置是否正确。</p><p>发送时间：${new Date().toLocaleString('zh-CN')}</p></div>`
  });
}

module.exports = { isConfigured, sendQualificationEmail, sendTestEmail, buildQualificationEmail };
