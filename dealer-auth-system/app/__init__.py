"""应用工厂。"""
import datetime as dt
import secrets

import click
from flask import Flask

from .config import get_config
from .extensions import db, login_manager
from .models import ROLE_ADMIN, Admin
from .security import init_csrf


def create_app(config_object=None):
    app = Flask(__name__, instance_relative_config=True)
    app.config.from_object(config_object or get_config())

    db.init_app(app)
    login_manager.init_app(app)
    init_csrf(app)

    @login_manager.user_loader
    def load_user(admin_id):
        return db.session.get(Admin, int(admin_id))

    from .blueprints.public import bp as public_bp
    from .blueprints.admin import bp as admin_bp
    app.register_blueprint(public_bp)
    app.register_blueprint(admin_bp, url_prefix="/admin")

    @app.context_processor
    def inject_globals():
        return {
            "SITE_NAME": app.config["SITE_NAME"],
            "COMPANY_NAME": app.config["COMPANY_NAME"],
            "SUPPORT_EMAIL": app.config["SUPPORT_EMAIL"],
            "SUPPORT_PHONE": app.config["SUPPORT_PHONE"],
            "current_year": dt.date.today().year,
        }

    @app.template_filter("datefmt")
    def datefmt(value, fmt="%Y-%m-%d"):
        return value.strftime(fmt) if value else "—"

    _register_commands(app)
    return app


def _register_commands(app):
    @app.cli.command("init-db")
    def init_db():
        """创建所有数据表（已存在则跳过，幂等）。"""
        db.create_all()
        click.echo("数据表已就绪。")

    @app.cli.command("create-admin")
    @click.option("--username", prompt=True)
    @click.option("--email", default=None)
    @click.option("--password", prompt=True, hide_input=True, confirmation_prompt=True)
    def create_admin(username, email, password):
        """创建超级管理员（用户名重复则报错）。"""
        if db.session.query(Admin).filter_by(username=username).first():
            click.echo(f"用户名 {username} 已存在。")
            raise SystemExit(1)
        admin = Admin(username=username, email=email or None,
                      role=ROLE_ADMIN, display_name=username, active=True)
        admin.set_password(password)
        db.session.add(admin)
        db.session.commit()
        click.echo(f"超级管理员 {username} 创建成功。")

    @app.cli.command("reset-password")
    @click.option("--username", prompt=True)
    @click.option("--password", prompt=True, hide_input=True, confirmation_prompt=True)
    def reset_password(username, password):
        """命令行重置管理员密码。"""
        admin = db.session.query(Admin).filter_by(username=username).first()
        if not admin:
            click.echo("用户不存在。")
            raise SystemExit(1)
        admin.set_password(password)
        db.session.commit()
        click.echo(f"{username} 的密码已重置。")
