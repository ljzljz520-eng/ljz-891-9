"""邮件发送：基于 smtplib，支持 SSL(465)/STARTTLS(587)。未配置 SMTP 时写日志。"""
import smtplib
import ssl
from email.header import Header
from email.mime.text import MIMEText
from email.utils import formataddr, formatdate

from flask import current_app, render_template


def _send_one(app, to_email: str, subject: str, html: str):
    cfg = app.config
    msg = MIMEText(html, "html", "utf-8")
    msg["Subject"] = Header(subject, "utf-8")
    msg["From"] = formataddr((str(Header(cfg["SITE_NAME"], "utf-8")), cfg["MAIL_FROM"]))
    msg["To"] = to_email
    msg["Date"] = formatdate(localtime=True)

    if cfg["MAIL_USE_SSL"]:
        ctx = ssl.create_default_context()
        with smtplib.SMTP_SSL(cfg["MAIL_HOST"], cfg["MAIL_PORT"],
                              timeout=cfg["MAIL_TIMEOUT"], context=ctx) as server:
            server.login(cfg["MAIL_USERNAME"], cfg["MAIL_PASSWORD"])
            server.sendmail(cfg["MAIL_FROM"], [to_email], msg.as_string())
    else:
        with smtplib.SMTP(cfg["MAIL_HOST"], cfg["MAIL_PORT"],
                          timeout=cfg["MAIL_TIMEOUT"]) as server:
            server.ehlo()
            if cfg["MAIL_USE_TLS"]:
                server.starttls(context=ssl.create_default_context())
                server.ehlo()
            server.login(cfg["MAIL_USERNAME"], cfg["MAIL_PASSWORD"])
            server.sendmail(cfg["MAIL_FROM"], [to_email], msg.as_string())


def send_email(to_email: str, subject: str, template: str, **ctx) -> bool:
    """发送模板邮件。成功/未配置均不抛异常（返回布尔），避免阻塞业务。"""
    app = current_app._get_current_object()
    html = render_template(template, **ctx)
    if not app.config.get("MAIL_HOST") or not app.config.get("MAIL_USERNAME"):
        app.logger.warning("未配置 SMTP，邮件未实际发送 -> %s: %s", to_email, subject)
        return False
    try:
        _send_one(app, to_email, subject, html)
        return True
    except Exception as exc:  # noqa: BLE001
        app.logger.error("发送邮件给 %s 失败: %s", to_email, exc)
        return False
