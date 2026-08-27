"""Самопроверка пакетного маппинга аудиофайлов на сцены."""

from app.utils.audio_utils import extract_file_number, natural_sort_key, map_scene_audio_files


def test_extract_file_number():
    assert extract_file_number("voice_01.wav") == 1
    assert extract_file_number("scene_12.mp3") == 12
    assert extract_file_number("03_audio.wav") == 3
    assert extract_file_number("intro.wav") is None


def test_natural_sort_key():
    assert natural_sort_key("voice_2.wav") < natural_sort_key("voice_10.wav")
    assert sorted(["v2", "v10", "v1"], key=natural_sort_key) == ["v1", "v2", "v10"]


def _f(name, num):
    return {"filename": name, "number": num}


def test_map_by_number():
    scenes = ["s1", "s2", "s3"]
    files = [_f("voice_03.wav", 3), _f("voice_01.wav", 1), _f("voice_02.wav", 2)]
    matches, unmatched = map_scene_audio_files(scenes, files)
    assert matches == [
        {"scene_id": "s1", "filename": "voice_01.wav"},
        {"scene_id": "s2", "filename": "voice_02.wav"},
        {"scene_id": "s3", "filename": "voice_03.wav"},
    ]
    assert unmatched == []


def test_map_by_number_leaves_gap_unmatched():
    scenes = ["s1", "s2"]
    files = [_f("voice_02.wav", 2), _f("voice_09.wav", 9)]
    matches, unmatched = map_scene_audio_files(scenes, files)
    assert matches == [{"scene_id": "s2", "filename": "voice_02.wav"}]
    assert unmatched == ["voice_09.wav"]


def test_map_by_natural_order_without_numbers():
    scenes = ["s1", "s2", "s3"]
    files = [_f("b.wav", None), _f("a.wav", None), _f("c.wav", None)]
    matches, unmatched = map_scene_audio_files(scenes, files)
    assert matches == [
        {"scene_id": "s1", "filename": "a.wav"},
        {"scene_id": "s2", "filename": "b.wav"},
        {"scene_id": "s3", "filename": "c.wav"},
    ]
    assert unmatched == []
