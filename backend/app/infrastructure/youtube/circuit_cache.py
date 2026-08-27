"""3-уровневый TTL-кэш и Circuit Breakers для DeepTrend Core 2.0."""

import time
from typing import Any, Dict, List, Optional, Tuple


class DeepTrendCircuitCache:
    """
    L1: поисковые запросы и ранние сигналы (TTL 5 мин)
    L2: подписчики каналов и метаданные (TTL 2 часа)
    L3: детали видео, субтитры, транскрипты (TTL 24 часа)
    + Rolling Seen History: недавно показанные видео опускаются вниз выдачи.
    """

    _l1: Dict[str, Tuple[float, Any]] = {}
    _l2: Dict[str, Tuple[float, Any]] = {}
    _l3: Dict[str, Tuple[float, Any]] = {}

    _L1_TTL = 300.0
    _L2_TTL = 7200.0
    _L3_TTL = 86400.0

    _recently_shown_videos: Dict[str, float] = {}
    _SEEN_WINDOW_SEC = 3600.0

    _circuits: Dict[str, Dict[str, Any]] = {}
    _CIRCUIT_MAX_FAILURES = 3
    _CIRCUIT_COOLDOWN = 300.0

    @classmethod
    def get_l1(cls, key: str) -> Optional[Any]:
        return cls._get(cls._l1, key)

    @classmethod
    def set_l1(cls, key: str, value: Any, ttl: Optional[float] = None) -> None:
        cls._set(cls._l1, key, value, ttl or cls._L1_TTL)

    @classmethod
    def get_l2(cls, key: str) -> Optional[Any]:
        return cls._get(cls._l2, key)

    @classmethod
    def set_l2(cls, key: str, value: Any, ttl: Optional[float] = None) -> None:
        cls._set(cls._l2, key, value, ttl or cls._L2_TTL)

    @classmethod
    def get_l3(cls, key: str) -> Optional[Any]:
        return cls._get(cls._l3, key)

    @classmethod
    def set_l3(cls, key: str, value: Any, ttl: Optional[float] = None) -> None:
        cls._set(cls._l3, key, value, ttl or cls._L3_TTL)

    @classmethod
    def mark_videos_as_seen(cls, video_ids: List[str]) -> None:
        now = time.time()
        for v_id in video_ids:
            cls._recently_shown_videos[v_id] = now
        cutoff = now - cls._SEEN_WINDOW_SEC
        cls._recently_shown_videos = {k: v for k, v in cls._recently_shown_videos.items() if v > cutoff}

    @classmethod
    def is_video_recently_seen(cls, video_id: str) -> bool:
        last_seen = cls._recently_shown_videos.get(video_id, 0)
        return (time.time() - last_seen) < cls._SEEN_WINDOW_SEC

    @classmethod
    def is_service_available(cls, service_name: str) -> bool:
        circuit = cls._circuits.get(service_name)
        return not circuit or circuit.get("open_until", 0.0) <= time.time()

    @classmethod
    def record_service_success(cls, service_name: str) -> None:
        if service_name in cls._circuits:
            cls._circuits[service_name] = {"failures": 0, "open_until": 0.0}

    @classmethod
    def record_service_failure(cls, service_name: str, error_msg: str = "") -> None:
        now = time.time()
        circuit = cls._circuits.setdefault(service_name, {"failures": 0, "open_until": 0.0})
        circuit["failures"] = circuit.get("failures", 0) + 1
        if circuit["failures"] >= cls._CIRCUIT_MAX_FAILURES:
            circuit["open_until"] = now + cls._CIRCUIT_COOLDOWN

    @classmethod
    def clear_all(cls) -> None:
        cls._l1.clear()
        cls._l2.clear()
        cls._l3.clear()
        cls._circuits.clear()
        cls._recently_shown_videos.clear()

    @staticmethod
    def _get(cache: Dict[str, Tuple[float, Any]], key: str) -> Optional[Any]:
        if key in cache:
            expiry, data = cache[key]
            if time.time() < expiry:
                return data
            del cache[key]
        return None

    @staticmethod
    def _set(cache: Dict[str, Tuple[float, Any]], key: str, value: Any, ttl: float) -> None:
        cache[key] = (time.time() + ttl, value)
