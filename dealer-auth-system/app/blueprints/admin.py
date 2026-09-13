"""管理后台：登录、资质维护、CSV 导入、管理员账号、操作日志。"""
import datetime as dt
import functools
import io
import csv

from flask import (Blueprint, Response, abort, current_app, flash, redirect,
                   render_template, request, url_for)
from flask_login import current_user, login_required, login_user, logout_user
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from sqlalchemy import or_

from ..extensions import db
from ..importer import HEADER_ALIASES, import_csv
from ..limiter import rate_limited
from ..mailer import send_email
from ..models import (ROLE_ADMIN, ROLE_LABELS, ROLE_OPERATOR, Admin, AuditLog,
                      Dealer, write_audit_log)
from ..utils import clean_str, normalize_brands, parse_date, validate_dealer_fields

bp = Blueprint("admin", __name__)

RESET_SALT = "admin-reset-password"


def admin_required(view):
    @functools.wraps(view)
    @login_required
    def wrapped(*args, **kwargs):
        if not current_user.is_admin:
            abort(403)
        return view(*args, **kwargs)
    return wrapped


def client_ip():
    return request.headers.get("X-Forwarded-For", request.remote_addr or "").split(",")[0].strip()


# ---------------------------------------------------------------- 认证
@bp.route("/login", methods=["GET", "POST"])
def login():
    if current_user.is_authenticated:
        return redirect(url_for("admin.dashboard"))
    if request.method == "POST":
        ip = client_ip()
        if rate_limited(f"login:{ip}", current_app.config["LOGIN_RATE_LIMIT"], 300):
            flash("尝试次数过多，请 5 分钟后再试。", "error")
            return render_template("admin/login.html"), 429
        username = clean_str(request.form.get("username"))
        password = request.form.get("password", "")
        user = db.session.query(Admin).filter_by(username=username, active=True).first()
        if user and user.check_password(password):
            login_user(user, remember=bool(request.form.get("remember")))
            user.last_login_at = dt.datetime.utcnow()
            db.session.commit()
            write_audit_log(user, "login", target=user.username, ip=ip)
            next_url = request.args.get("next", "")
            return redirect(next_url or url_for("admin.dashboard"))
        flash("用户名或密码错误。", "error")
    return render_template("admin/login.html")


@bp.route("/logout", methods=["POST"])
@login_required
def logout():
    write_audit_log(current_user, "logout", target=current_user.username, ip=client_ip())
    logout_user()
    flash("您已退出登录。", "success")
    return redirect(url_for("admin.login"))


@bp.route("/forgot-password", methods=["GET", "POST"])
def forgot_password():
    email_sent_to = None
    if request.method == "POST":
        email = clean_str(request.form.get("email")).lower()
        user = db.session.query(Admin).filter(Admin.email == email, Admin.active.is_(True)).first()
        if user:
            token = _get_serializer().dumps({"id": user.id})
            url = f"{current_app.config['MAIL_BASE_URL']}{url_for('admin.reset_password', token=token)}"
            send_email(user.email, "重置管理员密码", "mail/reset_password.html",
                       user=user, reset_url=url, expiry_minutes=30)
            write_audit_log(user, "reset_request", target=user.username, ip=client_ip())
        # 无论邮箱是否存在都提示成功，避免邮箱枚举
        email_sent_to = request.form.get("email")
        flash("如果该邮箱存在，重置链接将在几分钟内送达（30 分钟内有效）。", "success")
    return render_template("admin/forgot_password.html", email_sent_to=email_sent_to)


@bp.route("/reset-password/<token>", methods=["GET", "POST"])
def reset_password(token):
    user = _verify_reset_token(token)
    if user is None:
        flash("重置链接无效或已过期，请重新申请。", "error")
        return redirect(url_for("admin.forgot_password"))
    if request.method == "POST":
        pw1 = request.form.get("password", "")
        pw2 = request.form.get("password2", "")
        if len(pw1) < 8:
            flash("密码长度至少 8 位。", "error")
        elif pw1 != pw2:
            flash("两次输入的密码不一致。", "error")
        else:
            user.set_password(pw1)
            db.session.commit()
            write_audit_log(user, "reset_done", target=user.username, ip=client_ip())
            flash("密码已重置，请使用新密码登录。", "success")
            return redirect(url_for("admin.login"))
    return render_template("admin/reset_password.html", token=token)


@bp.route("/profile", methods=["GET", "POST"])
@login_required
def profile():
    if request.method == "POST":
        current_user.display_name = clean_str(request.form.get("display_name")) or current_user.username
        current_user.email = clean_str(request.form.get("email")) or None
        old_pw = request.form.get("old_password", "")
        new_pw = request.form.get("new_password", "")
        if new_pw:
            if not current_user.check_password(old_pw):
                flash("当前密码不正确，资料未保存。", "error")
            elif len(new_pw) < 8:
                flash("新密码长度至少 8 位，资料未保存。", "error")
            else:
                current_user.set_password(new_pw)
                db.session.commit()
                write_audit_log(current_user, "profile", target=self_name(), ip=client_ip())
                flash("资料与密码已更新。", "success")
                return redirect(url_for("admin.profile"))
        else:
            db.session.commit()
            flash("资料已更新。", "success")
            return redirect(url_for("admin.profile"))
    return render_template("admin/profile.html")


def self_name():
    return current_user.username


def _get_serializer():
    return URLSafeTimedSerializer(current_app.config["SECRET_KEY"], salt=RESET_SALT)


def _verify_reset_token(token, max_age=1800):
    try:
        payload = _get_serializer().loads(token, max_age=max_age)
    except (BadSignature, SignatureExpired):
        return None
    user = db.session.get(Admin, payload.get("id"))
    if user and user.active:
        return user
    return None


# ---------------------------------------------------------------- 首页
@bp.route("/")
@login_required
def dashboard():
    total = Dealer.query.count()
    today = dt.date.today()
    valid = Dealer.query.filter(
        or_(Dealer.valid_until.is_(None), Dealer.valid_until >= today)).count()
    expired = total - valid
    stats = {"total": total, "valid": valid, "expired": expired,
             "admins": Admin.query.count()}
    recent = Dealer.query.order_by(Dealer.updated_at.desc()).limit(8).all()
    logs = AuditLog.query.order_by(AuditLog.id.desc()).limit(10).all()
    return render_template("admin/dashboard.html", stats=stats, recent=recent, logs=logs)


# ---------------------------------------------------------------- 经销商 CRUD
def _read_dealer_form(form):
    return {
        "dealer_name": clean_str(form.get("dealer_name")),
        "store_code": clean_str(form.get("store_code")),
        "brands": normalize_brands(form.get("brands")),
        "region": clean_str(form.get("region")),
        "valid_from": parse_date(form.get("valid_from")) if clean_str(form.get("valid_from")) else None,
        "valid_until": parse_date(form.get("valid_until")) if clean_str(form.get("valid_until")) else None,
        "parent_agent": clean_str(form.get("parent_agent")),
        "opened_at": parse_date(form.get("opened_at")) if clean_str(form.get("opened_at")) else None,
        "remark": clean_str(form.get("remark")),
    }


@bp.route("/dealers")
@login_required
def dealer_list():
    q = clean_str(request.args.get("q"))
    status = clean_str(request.args.get("status"))
    page = max(1, request.args.get("page", 1, type=int))
    query = Dealer.query
    if q:
        like = f"%{q}%"
        query = query.filter(or_(
            Dealer.dealer_name.like(like), Dealer.store_code.like(like),
            Dealer.brands.like(like), Dealer.region.like(like)))
    today = dt.date.today()
    if status == "expired":
        query = query.filter(Dealer.valid_until.isnot(None), Dealer.valid_until < today)
    elif status == "valid":
        query = query.filter(or_(Dealer.valid_until.is_(None), Dealer.valid_until >= today))
    pagination = query.order_by(Dealer.id.desc()).paginate(page=page, per_page=20, error_out=False)
    return render_template("admin/dealers/list.html", pagination=pagination, q=q, status=status)


@bp.route("/dealers/new", methods=["GET", "POST"])
@login_required
def dealer_new():
    if request.method == "POST":
        data = _read_dealer_form(request.form)
        errors = validate_dealer_fields(data)
        if data["store_code"] and Dealer.query.filter_by(store_code=data["store_code"]).first():
            errors.append(f"门店编号已存在：{data['store_code']}")
        if errors:
            for e in errors:
                flash(e, "error")
            return render_template("admin/dealers/form.html", d=data, mode="new")
        dealer = Dealer(**data, created_by_id=current_user.id, updated_by_id=current_user.id)
        db.session.add(dealer)
        db.session.commit()
        write_audit_log(current_user, "create", target=data["store_code"],
                        detail=f"新增经销商：{data['dealer_name']}", ip=client_ip())
        flash("资质记录已创建。", "success")
        return redirect(url_for("admin.dealer_list"))
    return render_template("admin/dealers/form.html", d={}, mode="new")


@bp.route("/dealers/<int:dealer_id>/edit", methods=["GET", "POST"])
@login_required
def dealer_edit(dealer_id):
    dealer = db.get_or_404(Dealer, dealer_id)
    if request.method == "POST":
        data = _read_dealer_form(request.form)
        errors = validate_dealer_fields(data)
        dup = Dealer.query.filter(Dealer.store_code == data["store_code"],
                                  Dealer.id != dealer_id).first() if data["store_code"] else None
        if dup:
            errors.append(f"门店编号已被其他记录占用：{data['store_code']}")
        if errors:
            for e in errors:
                flash(e, "error")
            return render_template("admin/dealers/form.html", d=data, mode="edit", dealer_id=dealer_id)
        changed = []
        for attr in ("dealer_name", "store_code", "brands", "region", "valid_from",
                     "valid_until", "parent_agent", "opened_at", "remark"):
            new_val = data.get(attr, "")
            if getattr(dealer, attr) != new_val:
                changed.append(attr)
                setattr(dealer, attr, new_val)
        dealer.updated_by_id = current_user.id
        db.session.commit()
        write_audit_log(current_user, "update", target=dealer.store_code,
                        detail=f"修改字段：{'、'.join(changed) or '无'}", ip=client_ip())
        flash("资质记录已更新。", "success")
        return redirect(url_for("admin.dealer_list"))
    return render_template("admin/dealers/form.html", d=dealer, mode="edit", dealer_id=dealer_id)


@bp.route("/dealers/<int:dealer_id>/delete", methods=["POST"])
@login_required
def dealer_delete(dealer_id):
    dealer = db.get_or_404(Dealer, dealer_id)
    name, code = dealer.dealer_name, dealer.store_code
    db.session.delete(dealer)
    db.session.commit()
    write_audit_log(current_user, "delete", target=code, detail=f"删除经销商：{name}", ip=client_ip())
    flash(f"已删除 {name}（{code}）。", "success")
    return redirect(url_for("admin.dealer_list"))


# ---------------------------------------------------------------- CSV
@bp.route("/dealers/import", methods=["GET", "POST"])
@login_required
def dealer_import():
    result = None
    if request.method == "POST":
        file = request.files.get("csv_file")
        if not file or not file.filename:
            flash("请选择要导入的 CSV 文件。", "error")
            return render_template("admin/dealers/import.html", result=None)
        if not file.filename.lower().endswith(".csv"):
            flash("仅支持 .csv 文件（UTF-8 或 GBK 编码）。", "error")
            return render_template("admin/dealers/import.html", result=None)
        update = bool(request.form.get("update_existing"))
        result = import_csv(file, current_user, update_existing=update)
        write_audit_log(current_user, "import", target=file.filename,
                        detail=f"新增 {result['created']}，更新 {result['updated']}，"
                               f"跳过 {result['skipped']}，错误 {len(result['errors'])}",
                        ip=client_ip())
    return render_template("admin/dealers/import.html", result=result)


@bp.route("/dealers/template.csv")
@login_required
def dealer_template():
    headers = [HEADER_ALIASES[k][0] + ("*" if k in ("dealer_name", "store_code", "brands") else "")
               for k in ("dealer_name", "store_code", "brands", "region", "valid_from",
                         "valid_until", "parent_agent", "opened_at", "remark")]
    buf = io.StringIO()
    buf.write("﻿")  # UTF-8 BOM，Excel 打开不乱码
    writer = csv.writer(buf)
    writer.writerow(headers)
    writer.writerow(["示例品牌运营有限公司", "SH-0001", "示例品牌A|示例品牌B", "上海市",
                     "2026-01-01", "2026-12-31", "华东大区代理", "2026-01-15", "示例行，导入前请删除"])
    return Response(buf.getvalue(), mimetype="text/csv; charset=utf-8",
                    headers={"Content-Disposition": "attachment; filename=dealer_import_template.csv"})


# ---------------------------------------------------------------- 管理员账号
@bp.route("/admins")
@admin_required
def admin_list():
    items = Admin.query.order_by(Admin.id.asc()).all()
    return render_template("admin/admins/list.html", items=items, role_labels=ROLE_LABELS)


@bp.route("/admins/new", methods=["GET", "POST"])
@admin_required
def admin_new():
    if request.method == "POST":
        username = clean_str(request.form.get("username"))
        email = clean_str(request.form.get("email")) or None
        role = request.form.get("role") if request.form.get("role") in (ROLE_ADMIN, ROLE_OPERATOR) else ROLE_OPERATOR
        password = request.form.get("password", "")
        errors = []
        if not username or len(username) < 3:
            errors.append("用户名至少 3 个字符")
        if db.session.query(Admin).filter_by(username=username).first():
            errors.append("用户名已存在")
        if email and db.session.query(Admin).filter_by(email=email).first():
            errors.append("邮箱已被使用")
        if len(password) < 8:
            errors.append("密码至少 8 位")
        if errors:
            for e in errors:
                flash(e, "error")
            return render_template("admin/admins/form.html", a=request.form, mode="new")
        admin = Admin(username=username, email=email, role=role,
                      display_name=clean_str(request.form.get("display_name")) or username,
                      active=bool(request.form.get("active")))
        admin.set_password(password)
        db.session.add(admin)
        db.session.commit()
        login_url = f"{current_app.config['MAIL_BASE_URL']}{url_for('admin.login')}"
        if email:
            send_email(email, "管理员账号已开通", "mail/admin_welcome.html",
                       admin=admin, login_url=login_url, password=password)
        write_audit_log(current_user, "admin_create", target=username,
                        detail=f"角色：{ROLE_LABELS[role]}{'，已发邮件' if email else ''}", ip=client_ip())
        flash(f"账号 {username} 已创建" + ("，开通邮件已发送。" if email else "。"), "success")
        return redirect(url_for("admin.admin_list"))
    return render_template("admin/admins/form.html", a={}, mode="new")


@bp.route("/admins/<int:admin_id>/edit", methods=["GET", "POST"])
@admin_required
def admin_edit(admin_id):
    admin = db.get_or_404(Admin, admin_id)
    if request.method == "POST":
        email = clean_str(request.form.get("email")) or None
        if email and db.session.query(Admin).filter(Admin.email == email, Admin.id != admin_id).first():
            flash("邮箱已被其他账号使用。", "error")
            return render_template("admin/admins/form.html", a=admin, mode="edit", admin_id=admin_id)
        new_role = request.form.get("role")
        if new_role in (ROLE_ADMIN, ROLE_OPERATOR):
            # 防止最后一个超管被降级
            if admin.is_admin and new_role != ROLE_ADMIN and \
                    Admin.query.filter_by(role=ROLE_ADMIN, active=True).count() <= 1:
                flash("系统至少保留一个超级管理员，无法降级该账号。", "error")
                return render_template("admin/admins/form.html", a=admin, mode="edit", admin_id=admin_id)
            admin.role = new_role
        admin.email = email
        admin.display_name = clean_str(request.form.get("display_name")) or admin.username
        new_active = bool(request.form.get("active"))
        if not new_active and admin.id == current_user.id:
            flash("不能停用当前登录的账号。", "error")
        elif not new_active and admin.is_admin and \
                Admin.query.filter_by(role=ROLE_ADMIN, active=True).count() <= 1:
            flash("系统至少保留一个启用的超级管理员。", "error")
        else:
            admin.active = new_active
        new_pw = request.form.get("password", "")
        if new_pw:
            if len(new_pw) < 8:
                flash("新密码至少 8 位，其他信息未保存。", "error")
                return render_template("admin/admins/form.html", a=admin, mode="edit", admin_id=admin_id)
            admin.set_password(new_pw)
        db.session.commit()
        write_audit_log(current_user, "admin_update", target=admin.username,
                        detail=f"角色 {admin.role}，启用 {admin.active}，{'已重置密码' if new_pw else ''}",
                        ip=client_ip())
        flash("账号信息已保存。", "success")
        return redirect(url_for("admin.admin_list"))
    return render_template("admin/admins/form.html", a=admin, mode="edit", admin_id=admin_id)


@bp.route("/admins/<int:admin_id>/delete", methods=["POST"])
@admin_required
def admin_delete(admin_id):
    admin = db.get_or_404(Admin, admin_id)
    if admin.id == current_user.id:
        abort(400, description="不能删除自己的账号。")
    if admin.is_admin and Admin.query.filter_by(role=ROLE_ADMIN, active=True).count() <= 1:
        abort(400, description="至少保留一个超级管理员。")
    username = admin.username
    db.session.delete(admin)
    db.session.commit()
    write_audit_log(current_user, "admin_delete", target=username, ip=client_ip())
    flash(f"账号 {username} 已删除。", "success")
    return redirect(url_for("admin.admin_list"))


# ---------------------------------------------------------------- 日志
@bp.route("/logs")
@login_required
def logs():
    page = max(1, request.args.get("page", 1, type=int))
    pagination = AuditLog.query.order_by(AuditLog.id.desc()).paginate(
        page=page, per_page=30, error_out=False)
    return render_template("admin/logs.html", pagination=pagination)
