'use strict';
const nodemailer = require('nodemailer');
const config = require('./index');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!config.smtp.host || !config.smtp.user) return null; // 未配置邮件则禁用
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: { user: config.smtp.user, pass: config.smtp.pass },
  });
  return transporter;
}

async function sendMail({ to, subject, text, html }) {
  const t = getTransporter();
  if (!t) {
    throw new Error('邮件服务未配置：请在 .env 中填写 SMTP_HOST / SMTP_USER / SMTP_PASS');
  }
  await t.sendMail({ from: config.smtp.from, to, subject, text, html: html || text });
}

/** 发送密码重置链接邮件 */
async function sendResetPasswordMail(to, token, username) {
  const link = `${config.publicBaseUrl}/admin/reset.html?token=${encodeURIComponent(token)}`;
  const text = [
    `你好，${username}：`,
    '',
    '我们收到了重置后台登录密码的请求。请在 15 分钟内点击下面的链接设置新密码：',
    link,
    '',
    '如果不是你本人操作，请忽略本邮件，原密码不会改变。',
  ].join('\n');
  const html = `
  <div style="font-family:sans-serif;max-width:560px;margin:auto">
    <h2 style="color:#1e40af">重置后台登录密码</h2>
    <p>你好，<b>${username}</b>：</p>
    <p>请在 <b>15 分钟</b> 内点击按钮设置新密码：</p>
    <p><a href="${link}" style="display:inline-block;background:#1d4ed8;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none">重置密码</a></p>
    <p style="color:#666;font-size:12px;word-break:break-all">如按钮无法打开，请复制链接：<br>${link}</p>
  </div>`;
  await sendMail({ to, subject: '【品牌经销资质系统】重置登录密码', text, html });
}

module.exports = { sendMail, sendResetPasswordMail, getTransporter };
