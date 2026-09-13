"""数据模型：管理员 / 经销商资质 / 操作日志。"""
import datetime as dt

from flask_login import UserMixin
from sqlalchemy import Index
from werkzeug.security import check_password_hash, generate_password_hash

from .extensions import db

ROLE_ADMIN = "admin"   # 超级管理员：全部权限
ROLE_OPERATOR = "operator"  # 运营：维护资质，不可管理账号

ROLE_LABELS = {ROLE_ADMIN: "超级管理员", ROLE_OPERATOR: "运营管理员"}


class Admin(UserMixin, db.Model):
    __tablename__ = "admins"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(64), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    email = db.Column(db.String(128), unique=True, nullable=True)
    display_name = db.Column(db.String(64), nullable=True)
    role = db.Column(db.String(16), nullable=False, default=ROLE_OPERATOR,
                     server_default=ROLE_OPERATOR)
    active = db.Column(db.Boolean, nullable=False, default=True, server_default="1")
    created_at = db.Column(db.DateTime, nullable=False, default=dt.datetime.utcnow)
    last_login_at = db.Column(db.DateTime, nullable=True)

    def set_password(self, raw: str):
        self.password_hash = generate_password_hash(raw)

    def check_password(self, raw: str) -> bool:
        return check_password_hash(self.password_hash, raw)

    @property
    def is_active(self) -> bool:
        return bool(self.active)

    @property
    def is_admin(self) -> bool:
        return self.role == ROLE_ADMIN

    @property
    def role_label(self) -> str:
        return ROLE_LABELS.get(self.role, self.role)

    def __repr__(self):
        return f"<Admin {self.username}>"


class Dealer(db.Model):
    """经销商授权资质。一个门店编号对应一条资质记录。"""
    __tablename__ = "dealers"

    id = db.Column(db.Integer, primary_key=True)
    dealer_name = db.Column(db.String(128), nullable=False, comment="经销商名称")
    store_code = db.Column(db.String(64), nullable=False, unique=True, comment="门店编号")
    brands = db.Column(db.Text, nullable=False, default="", comment="授权品牌，竖线 | 分隔")
    region = db.Column(db.String(128), nullable=False, default="", comment="授权区域")
    valid_from = db.Column(db.Date, nullable=True, comment="授权有效期起")
    valid_until = db.Column(db.Date, nullable=True, comment="授权有效期止")
    parent_agent = db.Column(db.String(128), nullable=False, default="", comment="上级代理")
    opened_at = db.Column(db.Date, nullable=True, comment="开通时间")
    remark = db.Column(db.String(255), nullable=False, default="", comment="备注")

    created_at = db.Column(db.DateTime, nullable=False, default=dt.datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=dt.datetime.utcnow,
                           onupdate=dt.datetime.utcnow)
    created_by_id = db.Column(db.Integer, db.ForeignKey("admins.id"), nullable=True)
    updated_by_id = db.Column(db.Integer, db.ForeignKey("admins.id"), nullable=True)

    __table_args__ = (
        Index("ix_dealers_name_code", "dealer_name", "store_code"),
    )

    @property
    def brand_list(self):
        return [b.strip() for b in (self.brands or "").split("|") if b.strip()]

    @property
    def brands_display(self) -> str:
        return "、".join(self.brand_list)

    @property
    def status(self) -> str:
        """依据授权有效期动态判定：valid / expired / unknown"""
        today = dt.date.today()
        if self.valid_until and self.valid_until < today:
            return "expired"
        if self.valid_from and self.valid_from > today:
            return "pending"
        return "valid"

    @property
    def status_label(self) -> str:
        return {"valid": "授权有效", "expired": "已过期", "pending": "未生效"}.get(
            self.status, "未知")

    def valid_range_display(self) -> str:
        fmt = lambda d: d.strftime("%Y-%m-%d") if d else "—"
        return f"{fmt(self.valid_from)} 至 {fmt(self.valid_until)}"

    def __repr__(self):
        return f"<Dealer {self.dealer_name} [{self.store_code}]>"


class AuditLog(db.Model):
    __tablename__ = "audit_logs"

    id = db.Column(db.Integer, primary_key=True)
    admin_id = db.Column(db.Integer, db.ForeignKey("admins.id"), nullable=True)
    admin_name = db.Column(db.String(64), nullable=False, default="")
    action = db.Column(db.String(32), nullable=False, comment="create/update/delete/import/login...")
    target = db.Column(db.String(128), nullable=False, default="")
    detail = db.Column(db.String(500), nullable=False, default="")
    ip = db.Column(db.String(64), nullable=False, default="")
    created_at = db.Column(db.DateTime, nullable=False, default=dt.datetime.utcnow)


def write_audit_log(admin, action: str, target: str = "", detail: str = "", ip: str = ""):
    try:
        db.session.add(AuditLog(
            admin_id=admin.id if admin else None,
            admin_name=admin.username if admin else "system",
            action=action,
            target=target[:128],
            detail=detail[:500],
            ip=ip[:64],
        ))
        db.session.commit()
    except Exception:  # 日志失败不影响主流程
        db.session.rollback()
