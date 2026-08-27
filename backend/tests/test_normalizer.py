import pytest
from app.infrastructure.youtube.normalizer import (
    parse_count,
    parse_duration_to_seconds,
    parse_published_to_hours,
    extract_video_id,
    sanitize_channel_query,
    normalize_language_code,
    clean_search_keyword,
    clean_vtt,
)


def test_parse_count():
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


def test_parse_duration():
    assert parse_duration_to_seconds("12:34") == 754
    assert parse_duration_to_seconds("1:02:30") == 3750
    assert parse_duration_to_seconds("PT12M34S") == 754
    assert parse_duration_to_seconds(95) == 95
    assert parse_duration_to_seconds("") == 0


def test_parse_published_to_hours():
    assert parse_published_to_hours("2 days ago") == 48.0
    assert parse_published_to_hours("5 часов назад") == 5.0
    assert parse_published_to_hours("18 hours ago") == 18.0
    assert parse_published_to_hours("yesterday") == 24.0
    assert parse_published_to_hours("вчера") == 24.0
    assert parse_published_to_hours("") == 999999.0


def test_video_id_and_channel_cleaning():
    assert extract_video_id("https://youtu.be/dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    assert extract_video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3") == "dQw4w9WgXcQ"
    assert extract_video_id("dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    assert sanitize_channel_query("freeCodeCamp.org and Radu Mariescu-Istodor") == "freeCodeCamp.org"
    assert sanitize_channel_query("HYBE LABELS and 3 more") == "HYBE LABELS"
    assert sanitize_channel_query("UC_x5XG1OV2P6uZZ5FSM9Ttw") == "UC_x5XG1OV2P6uZZ5FSM9Ttw"
    assert sanitize_channel_query("") is None


def test_normalize_language_code():
    assert normalize_language_code("English (US)") == ("en", "US", "English")
    assert normalize_language_code("en-US") == ("en", "US", "English")
    assert normalize_language_code("en") == ("en", "US", "English")
    assert normalize_language_code("EN") == ("en", "US", "English")
    assert normalize_language_code("Русский") == ("ru", "RU", "Russian")
    assert normalize_language_code("ru") == ("ru", "RU", "Russian")
    assert normalize_language_code("es") == ("es", "ES", "Spanish")
    assert normalize_language_code(None) == ("ru", "RU", "Russian")
    assert normalize_language_code("") == ("ru", "RU", "Russian")


def test_clean_search_keyword():
    assert clean_search_keyword("  AI agents  ") == "AI agents"
    assert clean_search_keyword("C++\nи  нейросети") == "C++ и нейросети"
    assert clean_search_keyword(None) == ""
    assert clean_search_keyword("") == ""


def test_vtt_cleaner():
    sample = (
        "WEBVTT\nKind: captions\nLanguage: en\n"
        "00:00:01.000 --> 00:00:03.000 align:start\n"
        "<c>Привет</c> всем\n"
        "00:00:03.500 --> 00:00:05.000\n"
        "всем\n"
    )
    assert clean_vtt(sample) == "Привет всем всем"
