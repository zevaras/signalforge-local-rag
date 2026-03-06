"""In-memory metrics for dashboard: capacity, upload stats, model performance."""
import time
from collections import deque
from threading import Lock

# Rolling window for latency (last N requests)
_LATENCY_HISTORY_SIZE = 50
_latency_history: deque[float] = deque(maxlen=_LATENCY_HISTORY_SIZE)
_lock = Lock()

# Counters (reset on server restart)
ask_success_count: int = 0
ask_error_count: int = 0
last_ask_latency_ms: float | None = None

# Last upload batch
last_upload_count: int = 0
last_upload_duration_ms: float = 0.0


def record_ask_success(latency_ms: float) -> None:
    with _lock:
        global ask_success_count, last_ask_latency_ms
        ask_success_count += 1
        last_ask_latency_ms = latency_ms
        _latency_history.append(latency_ms)


def record_ask_error() -> None:
    with _lock:
        global ask_error_count
        ask_error_count += 1


def record_upload_batch(count: int, duration_ms: float) -> None:
    with _lock:
        global last_upload_count, last_upload_duration_ms
        last_upload_count = count
        last_upload_duration_ms = duration_ms


def _avg_latency_unsafe() -> float | None:
    if not _latency_history:
        return None
    return sum(_latency_history) / len(_latency_history)


def get_metrics() -> dict:
    with _lock:
        return {
            "ask_success_count": ask_success_count,
            "ask_error_count": ask_error_count,
            "last_ask_latency_ms": last_ask_latency_ms,
            "avg_ask_latency_ms": _avg_latency_unsafe(),
            "last_upload_count": last_upload_count,
            "last_upload_duration_ms": last_upload_duration_ms,
        }
