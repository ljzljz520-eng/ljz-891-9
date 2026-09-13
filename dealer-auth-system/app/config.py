"""应用配置：所有参数均可通过环境变量（或 .env 文件）覆盖。"""
import os
from pathlib import Path


def _load_dotenv():
    """极简 .env 加载器（无第三方依赖），存在即读取，不覆盖已有环境变量。"""
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.exists():
        return
    for raw in env_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key, value = key.strip(), value.strip().strip('"').strip("'")
        if key not in os.environ:
            os.environ[key] = value


_load_dotenv()


def _bool(name, default=False):
    val = os.environ.get(name)
    if val is None:
        return default
    return val.strip().lower() in ("1", "true", "yes", "on")


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-insecure-key-change-me")

    # --- 数据库 ---
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL", "sqlite:///dealer_auth.db"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_recycle": int(os.environ.get("DB_POOL_RECYCLE", "280")),
        "pool_pre_ping": True,
    }

    # --- 会话/Cookie ---
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SECURE = _bool("SESSION_COOKIE_SECURE", False)
    SESSION_COOKIE_SAMESITE = "Lax"
    PERMANENT_SESSION_LIFETIME = int(os.environ.get("SESSION_LIFETIME", "28800"))  # 8 小时
    REMEMBER_COOKIE_DURATION = int(os.environ.get("REMEMBER_DURATION", "1209600"))  # 14 天

    # --- 上传 ---
    MAX_CONTENT_LENGTH = int(os.environ.get("MAX_UPLOAD_MB", "5")) * 1024 * 1024

    # --- 邮件 ---
    MAIL_HOST = os.environ.get("MAIL_HOST", "")
    MAIL_PORT = int(os.environ.get("MAIL_PORT", "465"))
    MAIL_USE_SSL = _bool("MAIL_USE_SSL", True)
    MAIL_USE_TLS = _bool("MAIL_USE_TLS", False)
    MAIL_USERNAME = os.environ.get("MAIL_USERNAME", "")
    MAIL_PASSWORD = os.environ.get("MAIL_PASSWORD", "")
    MAIL_FROM = os.environ.get("MAIL_FROM", MAIL_USERNAME)
    MAIL_BASE_URL = os.environ.get("MAIL_BASE_URL", "http://127.0.0.1:5000").rstrip("/")
    MAIL_TIMEOUT = int(os.environ.get("MAIL_TIMEOUT", "10"))

    # --- 站点信息 ---
    SITE_NAME = os.environ.get("SITE_NAME", "品牌经销资质查询系统")
    COMPANY_NAME = os.environ.get("COMPANY_NAME", "")
    SUPPORT_EMAIL = os.environ.get("SUPPORT_EMAIL", "")
    SUPPORT_PHONE = os.environ.get("SUPPORT_PHONE", "")

    # --- 限流 ---
    QUERY_RATE_LIMIT = int(os.environ.get("QUERY_RATE_LIMIT", "20"))
    LOGIN_RATE_LIMIT = int(os.environ.get("LOGIN_RATE_LIMIT", "8"))

    # --- 其他 ---
    JSON_AS_ASCII = False


class ProductionConfig(Config):
    DEBUG = False


class DevelopmentConfig(Config):
    DEBUG = True


def get_config():
    env = os.environ.get("FLASK_ENV", "production").lower()
    return DevelopmentConfig if env in ("development", "dev", "testing") else ProductionConfig
