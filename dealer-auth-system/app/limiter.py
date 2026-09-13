"""内存滑动窗口限流（单进程部署足够；多 worker 请换 Redis）。"""
import threading
import time
from collections import defaultdict, deque

_LOCK = threading.Lock()
_HITS = defaultdict(deque)


def rate_limited(key: str, limit: int, window: int = 60) -> bool:
    """超限返回 True。"""
    now = time.monotonic()
    with _LOCK:
        bucket = _HITS[key]
        while bucket and now - bucket[0] > window:
            bucket.popleft()
        if len(bucket) >= limit:
            return True
        bucket.append(now)
        return False
