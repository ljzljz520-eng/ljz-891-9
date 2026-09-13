"""通用工具：文本规范化、日期解析、CSV 字段校验。"""
import datetime as dt
import re


def clean_str(value) -> str:
    """去空白，全角空格/制表/换行统一处理。"""
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value).replace("　", " ")).strip()


_DATE_FORMATS = (
    "%Y-%m-%d", "%Y/%m/%d", "%Y.%m.%d", "%Y年%m月%d日",
    "%Y-%m-%d %H:%M:%S", "%Y/%m/%d %H:%M:%S",
    "%Y%m%d", "%d/%m/%Y", "%m/%d/%Y",
)


def parse_date(value):
    """尽量宽松地解析日期，失败返回 None。"""
    s = clean_str(value)
    if not s:
        return None
    for fmt in _DATE_FORMATS:
        try:
            return dt.datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    # 截取前 10 位再试
    head = s[:10]
    for fmt in ("%Y-%m-%d", "%Y/%m/%d"):
        try:
            return dt.datetime.strptime(head, fmt).date()
        except ValueError:
            continue
    return None


def normalize_brands(raw) -> str:
    """品牌字段：支持 | 、 ； ; ， , / 分隔，去重保序，返回 | 连接字符串。"""
    text = clean_str(raw)
    parts = re.split(r"[|｜、;；,，/]+", text)
    seen = set()
    result = []
    for p in parts:
        p = p.strip()
        if p and p not in seen:
            seen.add(p)
            result.append(p)
    return "|".join(result)


def validate_dealer_fields(data: dict) -> list:
    """返回错误信息列表（空列表表示通过）。"""
    errors = []
    if not data.get("dealer_name"):
        errors.append("经销商名称不能为空")
    elif len(data["dealer_name"]) > 128:
        errors.append("经销商名称过长（≤128 字）")
    if not data.get("store_code"):
        errors.append("门店编号不能为空")
    elif len(data["store_code"]) > 64:
        errors.append("门店编号过长（≤64 字）")
    if not data.get("brands"):
        errors.append("授权品牌不能为空（多个品牌用 | 分隔）")
    for key, label, limit in (
        ("brands", "授权品牌", 500),
        ("region", "授权区域", 128),
        ("parent_agent", "上级代理", 128),
        ("remark", "备注", 255),
    ):
        val = data.get(key, "")
        if len(val) > limit:
            errors.append(f"{label}过长（≤{limit} 字）")
    vf, vu = data.get("valid_from"), data.get("valid_until")
    if vf and vu and vf > vu:
        errors.append("授权起始日期不能晚于截止日期")
    return errors
