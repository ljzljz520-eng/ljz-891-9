"""经销商资质 CSV 导入。

表头（支持中英文别名，顺序不限，首行必须是表头）：
    经销商名称*, 门店编号*, 授权品牌*, 授权区域, 有效期起, 有效期止,
    上级代理, 开通时间, 备注
品牌多个值用 | 分隔（也兼容 、 ; , / ）；日期兼容 2026-01-01 / 2026/1/1 / 2026年1月1日 等。
"""
import csv
import io
import datetime as dt

from .extensions import db
from .models import Dealer
from .utils import clean_str, normalize_brands, parse_date, validate_dealer_fields

HEADER_ALIASES = {
    "dealer_name": ("经销商名称", "经销商", "dealer_name", "name"),
    "store_code": ("门店编号", "门店编码", "门店号", "store_code", "storecode", "code"),
    "brands": ("授权品牌", "品牌", "brands", "brand"),
    "region": ("授权区域", "区域", "region", "area"),
    "valid_from": ("有效期起", "授权开始", "开始日期", "valid_from", "start_date"),
    "valid_until": ("有效期止", "有效期至", "授权截止", "到期日期", "valid_until", "end_date"),
    "parent_agent": ("上级代理", "上级代理商", "parent_agent", "agent"),
    "opened_at": ("开通时间", "开通日期", "opened_at", "open_date"),
    "remark": ("备注", "remark", "note"),
}
REQUIRED = ("dealer_name", "store_code")
DATE_FIELDS = ("valid_from", "valid_until", "opened_at")


def _decode(raw: bytes) -> str:
    for enc in ("utf-8-sig", "utf-8", "gbk", "gb18030"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def _map_headers(fieldnames):
    """返回 {规范字段: 实际列名}。"""
    mapping = {}
    normalized = {}
    for name in fieldnames or []:
        key = clean_str(name).lower()
        normalized[key] = name
    for canonical, aliases in HEADER_ALIASES.items():
        for alias in aliases:
            if alias.lower() in normalized:
                mapping[canonical] = normalized[alias.lower()]
                break
    return mapping


def import_csv(file_storage, admin, update_existing: bool = False) -> dict:
    """解析并导入。返回汇总字典：
    {ok, created, updated, skipped, error_count, errors:[{row, messages:[...]}, ...]}
    策略：逐行校验，全部有效行在一个事务中提交，任一致命错误整体回滚；
    数据行错误只收集不阻断其他行。
    """
    result = {"created": 0, "updated": 0, "skipped": 0, "errors": []}
    try:
        text = _decode(file_storage.read())
        reader = csv.DictReader(io.StringIO(text))
    except Exception as exc:  # noqa: BLE001
        result["errors"].append({"row": 0, "messages": [f"文件无法解析：{exc}"]})
        return result

    if not reader.fieldnames:
        result["errors"].append({"row": 0, "messages": ["未找到表头，请使用模板中的列名"]})
        return result

    mapping = _map_headers(reader.fieldnames)
    missing = [HEADER_ALIASES[f][0] for f in REQUIRED if f not in mapping]
    if missing:
        result["errors"].append({"row": 0, "messages": [
            f"缺少必需列：{'、'.join(missing)}，请检查 CSV 表头并对照导入模板"]})
        return result

    pending = []  # (data, lineno, present_fields)
    seen_codes = set()

    for lineno, raw_row in enumerate(reader, start=2):  # 表头是第 1 行
        if not any((v or "").strip() for v in raw_row.values()):
            continue  # 跳过空行
        data = {}
        for field, col in mapping.items():
            data[field] = clean_str(raw_row.get(col, ""))
        data["brands"] = normalize_brands(data.get("brands", ""))
        row_errors = validate_dealer_fields(data)
        for date_field in DATE_FIELDS:
            if data.get(date_field):
                parsed = parse_date(data[date_field])
                if parsed is None:
                    row_errors.append(f"{HEADER_ALIASES[date_field][0]}日期格式无法识别：{data[date_field]}")
                else:
                    data[date_field] = parsed
            else:
                data[date_field] = None
        code = data.get("store_code", "")
        if code and code in seen_codes:
            row_errors.append(f"门店编号在文件内重复：{code}")
        else:
            seen_codes.add(code)
        if row_errors:
            result["errors"].append({"row": lineno, "messages": row_errors})
        else:
            pending.append((data, lineno, set(mapping.keys())))

    if not pending:
        return result

    try:
        for data, lineno, present in pending:
            obj = db.session.query(Dealer).filter_by(store_code=data["store_code"]).first()
            if obj is not None:
                if not update_existing:
                    result["skipped"] += 1
                    result["errors"].append({"row": lineno, "messages": [
                        f"门店编号已存在（{data['store_code']}），已跳过；勾选“更新已存在记录”可覆盖"]})
                    continue
                # 更新模式：仅覆盖 CSV 中实际出现的列，未提供的列保持原值
                for attr in ("dealer_name", "brands", "region", "valid_from",
                             "valid_until", "parent_agent", "opened_at", "remark"):
                    if attr in present:
                        setattr(obj, attr, data.get(attr, ""))
                obj.updated_by_id = admin.id
                result["updated"] += 1
            else:
                db.session.add(Dealer(
                    dealer_name=data["dealer_name"],
                    store_code=data["store_code"],
                    brands=data["brands"],
                    region=data.get("region", ""),
                    valid_from=data.get("valid_from"),
                    valid_until=data.get("valid_until"),
                    parent_agent=data.get("parent_agent", ""),
                    opened_at=data.get("opened_at"),
                    remark=data.get("remark", ""),
                    created_by_id=admin.id,
                    updated_by_id=admin.id,
                ))
                result["created"] += 1
        # 存在“跳过/错误”时仍然提交有效行；仅当数据库层异常才回滚
        db.session.commit()
    except Exception as exc:  # noqa: BLE001
        db.session.rollback()
        result["errors"].append({"row": 0, "messages": [f"写入数据库失败，本次导入全部回滚：{exc}"]})
        result["created"] = result["updated"] = 0
    return result
