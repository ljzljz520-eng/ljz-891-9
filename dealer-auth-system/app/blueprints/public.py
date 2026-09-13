"""面向客户的公开查询页面。"""
from flask import Blueprint, current_app, flash, redirect, render_template, request, url_for

from ..limiter import rate_limited
from ..models import Dealer
from ..utils import clean_str

bp = Blueprint("public", __name__)


@bp.route("/")
def index():
    return render_template("index.html")


@bp.route("/query", methods=["POST", "GET"])
def query():
    name = clean_str(request.values.get("dealer_name", ""))
    code = clean_str(request.values.get("store_code", ""))
    error = None
    dealer = None

    if request.method == "POST":
        client_ip = request.headers.get("X-Forwarded-For", request.remote_addr or "").split(",")[0].strip()
        if rate_limited(f"query:{client_ip}", current_app.config["QUERY_RATE_LIMIT"]):
            flash("查询过于频繁，请稍后再试。", "error")
            return render_template("result.html", dealer=None, name=name, code=code), 429

        if not name or not code:
            flash("请同时填写经销商名称和门店编号。", "error")
            return render_template("result.html", dealer=None, name=name, code=code), 400

        # 名称与编号同时精确匹配，防止仅凭其一枚举
        dealer = (Dealer.query
                  .filter(Dealer.dealer_name == name, Dealer.store_code == code)
                  .first())
        if dealer is None:
            current_app.logger.info("未命中查询: name=%r code=%r ip=%s", name, code, client_ip)
    else:
        return redirect(url_for("public.index"))

    status_code = 200
    return render_template("result.html", dealer=dealer, name=name, code=code), status_code


@bp.route("/healthz")
def healthz():
    return {"status": "ok"}
