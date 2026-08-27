import pytest
from app.schemas.audio import BackgroundMusicSchema
from app.infrastructure.media.ducking import build_ducking_filtergraph
from app.utils.audio_utils import clean_voice_tags, split_emotion_tag


def test_ducking_filtergraph():
    s = BackgroundMusicSchema(base_volume=0.35, ducked_volume=0.12)
    fg = build_ducking_filtergraph(s, 30.0)
    assert "sidechaincompress=" in fg
    assert "alimiter=" in fg


def test_audio_tag_cleaner():
    raw = "[emotion: happy] Привет мир! *(смеется)* [instruct: voice design]"
    clean = clean_voice_tags(raw)
    assert clean == "Привет мир!"


def test_ducking_filtergraph_preview():
    s = BackgroundMusicSchema(base_volume=0.35, ducked_volume=0.12)
    fg = build_ducking_filtergraph(s, 30.0)
    assert "sidechaincompress=threshold=0.080:ratio=2.92:" in fg
    assert "afade=t=in:st=0:d=1.0" in fg
    assert "afade=t=out:st=28.50:d=1.5" in fg
    assert fg.endswith("[out]")
    fgp = build_ducking_filtergraph(s, 30.0, is_preview=True)
    assert "afade" not in fgp
    assert "[0:a][music_ducked]amix" in fgp


def test_split_emotion_tag():
    t, e = split_emotion_tag(" [emotion: angry] Какого черта это упало? ")
    assert t == "Какого черта это упало?" and e == "angry"
    t2, e2 = split_emotion_tag("Стало страшно? [emotion: whisper] скорее нет")
    assert e2 is None and "[emotion" not in t2
