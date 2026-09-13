"""轻量级 CSRF 防护（基于 session 令牌，不引入额外依赖）。"""
import hmac
import secrets

from flask import abort, g, request, session


def generate_csrf_token() -> str:
    token = session.get("_csrf_token")
    if not token:
        token = secrets.token_urlsafe(32)
        session["_csrf_token"] = token
    return token


def validate_csrf(token: str) -> bool:
    expected = session.get("_csrf_token")
    return bool(expected) and bool(token) and hmac.compare_digest(str(expected), str(token))


def init_csrf(app):
    @app.before_request
    def _csrf_protect():
        if request.method in ("POST", "PUT", "PATCH", "DELETE"):
            token = request.form.get("_csrf_token") or request.headers.get("X-CSRFToken")
            if not validate_csrf(token):
                abort(400, description="表单已过期或校验失败，请返回刷新页面后重试。")

    app.jinja_env.globals["csrf_token"] = generate_csrf_token
