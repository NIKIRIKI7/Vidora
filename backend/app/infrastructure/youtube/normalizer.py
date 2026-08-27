import re
from datetime import datetime, timezone
from typing import Any, Optional, Tuple

_SUFFIX_MULT = {
    "k": 1_000.0, "к": 1_000.0, "тыс": 1_000.0,
    "m": 1_000_000.0, "м": 1_000_000.0, "млн": 1_000_000.0,
    "b": 1_000_000_000.0, "млрд": 1_000_000_000.0,
}


def normalize_language_code(lang_raw: Optional[str]) -> Tuple[str, str, str]:
    """Нормализует любые варианты языковых строк ('English (US)', 'en-US', 'EN', 'Русский', 'ru')
    в кортеж: (iso_code, region_code, lang_name)."""
    if not lang_raw:
        return "ru", "RU", "Russian"

    s = str(lang_raw).strip().lower()

    if s.startswith("en") or "english" in s or "us" in s or "uk" in s:
        return "en", "US", "English"
    elif s.startswith("ru") or "рус" in s or "russian" in s:
        return "ru", "RU", "Russian"
    elif s.startswith("es") or "исп" in s or "spanish" in s or "español" in s:
        return "es", "ES", "Spanish"
    elif s.startswith("de") or "нем" in s or "german" in s or "deutsch" in s:
        return "de", "DE", "German"
    elif s.startswith("fr") or "фран" in s or "french" in s or "français" in s:
        return "fr", "FR", "French"
    else:
        clean = re.sub(r"[^a-z]", "", s)[:2]
        if clean == "en":
            return "en", "US", "English"
        return "ru", "RU", "Russian"


def clean_search_keyword(keyword: str) -> str:
    """Базовая очистка поискового запроса от управляющих символов."""
    return re.sub(r"[\r\n\t]+", " ", str(keyword or "")).strip()


def _to_float(num_str: str) -> float:
    num_str = num_str.replace(" ", "").replace("\u00a0", "").replace("\t", "")
    if "," in num_str and "." in num_str:
        num_str = num_str.replace(",", "")
    elif "," in num_str:
        parts = num_str.split(",")
        num_str = num_str.replace(",", "") if len(parts) > 1 and all(
            len(p) == 3 for p in parts[1:]) else num_str.replace(",", ".")
    elif "." in num_str:
        parts = num_str.split(".")
        if len(parts) > 1 and all(len(p) == 3 for p in parts[1:]):
            num_str = num_str.replace(".", "")
    return float(num_str)


def sanitize_channel_query(channel_raw: str) -> Optional[str]:
    if not channel_raw:
        return None
    s = str(channel_raw).strip()
    if not s:
        return None
    if s.startswith("UC") and len(s) == 24 and re.match(r"^UC[a-zA-Z0-9_-]{22}$", s):
        return s
    s = re.split(r"\s+(?:and|&|feat\.?|featuring|from)\s+", s, flags=re.IGNORECASE)[0].strip()
    s = re.sub(r"\s+and\s+\d+\s+more.*$", "", s, flags=re.IGNORECASE).strip()
    s = s.strip(" \t\n\r'\".,-")
    return s if s else None


def parse_count(val: Any) -> int:
    if val is None:
        return 0
    if isinstance(val, (int, float)):
        return int(val)
    text = str(val).strip().lower()
    m = re.match(r"([\d.,\s]+)\s*([kmbкмб]|млн|млрд|тыс)?", text)
    if not m:
        return 0
    num_str = m.group(1)
    suffix = m.group(2) or ""
    multiplier = _SUFFIX_MULT.get(suffix, 1.0)
    try:
        return int(_to_float(num_str) * multiplier)
    except (ValueError, TypeError):
        nums = re.findall(r"\d+", text)
        return int(nums[0]) if nums else 0


def parse_duration_to_seconds(val: Any) -> int:
    if val is None:
        return 0
    if isinstance(val, (int, float)):
        return int(val)
    s = str(val).strip().upper()
    if not s:
        return 0
    if s.startswith("PT"):
        m = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", s)
        if m:
            h = int(m.group(1) or 0)
            mi = int(m.group(2) or 0)
            sec = int(m.group(3) or 0)
            return h * 3600 + mi * 60 + sec
    parts = s.split(":")
    try:
        if len(parts) == 3:
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(float(parts[2]))
        elif len(parts) == 2:
            return int(parts[0]) * 60 + int(float(parts[1]))
        elif len(parts) == 1 and parts[0].isdigit():
            return int(parts[0])
    except ValueError:
        pass
    return 0


def parse_published_to_hours(published_str: str) -> float:
    if not published_str:
        return 999999.0
    text = str(published_str).strip()
    for fmt in ("%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            pub_dt = datetime.strptime(text, fmt)
            if pub_dt.tzinfo is None:
                pub_dt = pub_dt.replace(tzinfo=timezone.utc)
            return max(0.1, (datetime.now(timezone.utc) - pub_dt).total_seconds() / 3600.0)
        except ValueError:
            continue
    lower = text.lower()
    nums = re.findall(r"\d+", lower)
    count = int(nums[0]) if nums else 1
    if "вчера" in lower or "yesterday" in lower:
        return 24.0
    if any(w in lower for w in ("minute", "минут", "minuto", "sec", "сек", "segundo", "just now", "только что")):
        return max(0.1, count / 60.0)
    if any(w in lower for w in ("hour", "час", "hora")):
        return max(1.0, float(count))
    if any(w in lower for w in ("day", "дн", "ден", "día", "dia")):
        return max(1.0, float(count * 24.0))
    if any(w in lower for w in ("week", "недел", "semana")):
        return max(1.0, float(count * 24.0 * 7.0))
    if any(w in lower for w in ("month", "месяц", "mes")):
        return max(1.0, float(count * 24.0 * 30.4))
    if any(w in lower for w in ("year", "год", "лет", "año", "ano")):
        return max(1.0, float(count * 24.0 * 365.25))
    return 999999.0


def extract_video_id(url_or_id: str) -> str:
    if not url_or_id:
        return ""
    s = str(url_or_id).strip()
    if len(s) == 11 and re.match(r"^[a-zA-Z0-9_-]{11}$", s):
        return s
    match = re.search(r"(?:v=|\/|youtu\.be\/|shorts\/)([a-zA-Z0-9_-]{11})", s)
    return match.group(1) if match else s.split("?")[0].split("/")[-1]


def clean_vtt(raw_vtt: str) -> str:
    cleaned = re.sub(r"<[^>]+>", "", raw_vtt)
    cleaned = re.sub(r"[\d]{2}:[\d]{2}:[\d]{2}\.[\d]{3} --> .*", "", cleaned)
    cleaned = re.sub(r"WEBVTT|Kind: captions|Language: .*", "", cleaned)
    lines = [l.strip() for l in cleaned.split("\n") if l.strip()]
    unique_lines = []
    for line in lines:
        if not unique_lines or unique_lines[-1] != line:
            unique_lines.append(line)
    return re.sub(r"\s+", " ", " ".join(unique_lines)).strip()
