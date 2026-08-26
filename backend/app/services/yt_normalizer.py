import re
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

_SUFFIX_MULT = {
    "k": 1_000.0, "к": 1_000.0, "тыс": 1_000.0,
    "m": 1_000_000.0, "м": 1_000_000.0, "млн": 1_000_000.0,
    "b": 1_000_000_000.0, "млрд": 1_000_000_000.0,
}


def _to_float(num_str: str) -> float:
    num_str = num_str.replace(" ", "").replace("\u00a0", "").replace("\t", "")
    if "," in num_str and "." in num_str:
        num_str = num_str.replace(",", "")
    elif "," in num_str:
        parts = num_str.split(",")
        if len(parts) > 1 and all(len(p) == 3 for p in parts[1:]):
            num_str = num_str.replace(",", "")
        else:
            num_str = num_str.replace(",", ".")
    elif "." in num_str:
        parts = num_str.split(".")
        if len(parts) > 1 and all(len(p) == 3 for p in parts[1:]):
            num_str = num_str.replace(".", "")
    return float(num_str)


def sanitize_channel_query(channel_raw: str) -> Optional[str]:
    """
    Очищает составные названия каналов из поиска YouTube
    'freeCodeCamp.org and Radu Mariescu-Istodor' -> 'freeCodeCamp.org'
    'HYBE LABELS and 3 more' -> 'HYBE LABELS'
    'ITZY from VIP Seat and 2 more' -> 'ITZY'
    """
    if not channel_raw:
        return None
    s = str(channel_raw).strip()
    if not s:
        return None

    if s.startswith('UC') and len(s) == 24 and re.match(r'^UC[a-zA-Z0-9_-]{22}$', s):
        return s

    s = re.split(r'\s+(?:and|&|feat\.?|featuring|from)\s+', s, flags=re.IGNORECASE)[0].strip()
    s = re.sub(r'\s+and\s+\d+\s+more.*$', '', s, flags=re.IGNORECASE).strip()

    s = s.strip(" \t\n\r'\".,-")
    return s if s else None


def expand_ambiguous_keyword(keyword: str, lang: str = "ru") -> str:
    """
    Предотвращает ложный поиск K-Pop групп (ITZY) и фильмов вместо IT-технологий.
    """
    k = keyword.strip()
    if k.lower() == 'it':
        return 'IT programming tech' if lang == 'en' else 'IT технологии программирование'
    elif k.lower() == 'ai':
        return 'AI artificial intelligence' if lang == 'en' else 'AI искусственный интеллект'
    elif k.lower() == 'ml':
        return 'machine learning' if lang == 'en' else 'машинное обучение'
    return k


def parse_count(val: Any) -> int:
    """
    Преобразует int, float или строки вида '1.2M', '45.3K', '12 тыс.',
    '1 200 500 просмотров', '1,234,567 views', '1.24M subscribers' в чистый int.
    """
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
    """
    Парсит секунды из int, '12:34', '1:02:30' или ISO-формата 'PT12M34S'.
    """
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
    """
    Вычисляет точное количество часов с момента публикации (для VPH и фильтра days_back).
    Понимает ISO дату и относительные строки (ru/en/es: '2 days ago', '5 часов назад',
    '1 месяц назад', 'yesterday', 'вчера'). При нераспознанной/пустой дате возвращает
    999999.0, чтобы старые видео не проходили фильтр свежести.
    """
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
    """Извлекает 11-значный video_id из ссылки любого формата или возвращает id."""
    if not url_or_id:
        return ""
    s = str(url_or_id).strip()
    if len(s) == 11 and re.match(r"^[a-zA-Z0-9_-]{11}$", s):
        return s
    match = re.search(r"(?:v=|\/|youtu\.be\/|shorts\/)([a-zA-Z0-9_-]{11})", s)
    return match.group(1) if match else s.split("?")[0].split("/")[-1]


if __name__ == "__main__":
    assert parse_count("1.2M") == 1_200_000
    assert parse_count("45.3K") == 45_300
    assert parse_count("12 тыс.") == 12_000
    assert parse_count("1 200 500 просмотров") == 1_200_500
    assert parse_count("1,234,567 views") == 1_234_567
    assert parse_count("1.24M subscribers") == 1_240_000
    assert parse_count("1,2 млн просмотров") == 1_200_000
    assert parse_count("2.5K subscribers") == 2_500
    assert parse_count(None) == 0
    assert parse_count(1234) == 1234
    assert parse_duration_to_seconds("12:34") == 754
    assert parse_duration_to_seconds("1:02:30") == 3750
    assert parse_duration_to_seconds("PT12M34S") == 754
    assert parse_duration_to_seconds(95) == 95
    assert parse_duration_to_seconds("") == 0
    assert parse_published_to_hours("2 days ago") == 48.0
    assert parse_published_to_hours("5 часов назад") == 5.0
    assert parse_published_to_hours("1 неделю назад") == 168.0
    assert parse_published_to_hours("1 month ago") > 500
    assert parse_published_to_hours("1 year ago") > 8000
    assert parse_published_to_hours("3 years ago") > 20000
    assert parse_published_to_hours("18 hours ago") == 18.0
    assert parse_published_to_hours("3 дня назад") == 72.0
    assert parse_published_to_hours("2 недели назад") == 336.0
    assert parse_published_to_hours("yesterday") == 24.0
    assert parse_published_to_hours("вчера") == 24.0
    assert parse_published_to_hours("") == 999999.0
    assert parse_published_to_hours("Streamed 3 days ago") == 72.0
    assert extract_video_id("https://youtu.be/dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    assert extract_video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3") == "dQw4w9WgXcQ"
    assert extract_video_id("dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    assert sanitize_channel_query("freeCodeCamp.org and Radu Mariescu-Istodor") == "freeCodeCamp.org"
    assert sanitize_channel_query("HYBE LABELS and 3 more") == "HYBE LABELS"
    assert sanitize_channel_query("ITZY from VIP Seat and 2 more") == "ITZY"
    assert sanitize_channel_query("UC_x5XG1OV2P6uZZ5FSM9Ttw") == "UC_x5XG1OV2P6uZZ5FSM9Ttw"
    assert sanitize_channel_query("") is None
    assert expand_ambiguous_keyword("IT", "ru") == "IT технологии программирование"
    assert expand_ambiguous_keyword("IT", "en") == "IT programming tech"
    assert expand_ambiguous_keyword("нейросети", "ru") == "нейросети"
    print("self-check OK")
