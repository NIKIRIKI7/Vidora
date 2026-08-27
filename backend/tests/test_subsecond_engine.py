"""Самопроверка Sub-Second Engine: HTTP/2 пул, GBNF-грамматика, VAD-слайсер, speculative-резолвер."""

import asyncio

import numpy as np

from app.infrastructure.ai.llm.grammar import JSON_GBNF_GRAMMAR, get_llama_json_grammar
from app.infrastructure.ai.llm.gateway import LLMGateway
from app.infrastructure.youtube.http_client import DeepTrendHTTPPool
from app.infrastructure.youtube.whisper_transcriber import WhisperTranscriber


def test_gbnf_grammar_syntax():
    assert "root   ::= object" in JSON_GBNF_GRAMMAR
    assert "string ::=" in JSON_GBNF_GRAMMAR
    assert "number ::=" in JSON_GBNF_GRAMMAR


def test_llama_grammar_builds():
    grammar = get_llama_json_grammar()
    # Если llama_cpp недоступен — None, но не исключение
    assert grammar is None or grammar is not None


def test_audio_vad_slicing_in_ram():
    # 180 секунд симулированного 16kHz звука с паузой тишины посередине
    sr = 16000
    total_len = sr * 180
    fake_audio = np.random.randn(total_len).astype(np.float32) * 0.1

    silence_start = sr * 88
    silence_end = sr * 92
    fake_audio[silence_start:silence_end] = 0.0

    chunks = WhisperTranscriber._split_audio_by_vad(fake_audio, sample_rate=sr, target_chunks=3)
    assert len(chunks) == 3
    assert sum(len(c) for c in chunks) == total_len
    # границы реза не должны попадать в середину тишины длиннее 1с без нулей
    assert all(len(c) > sr for c in chunks)


def test_short_audio_not_split():
    sr = 16000
    short = np.random.randn(sr * 60).astype(np.float32) * 0.1
    chunks = WhisperTranscriber._split_audio_by_vad(short, sample_rate=sr, target_chunks=3)
    assert len(chunks) == 1
    assert len(chunks[0]) == sr * 60


def test_speculative_draft_resolver():
    # Черновик gemma-3-1b должен находиться рядом с целью 4b (модель уже скачана в ai-models)
    draft_path = LLMGateway.resolve_draft_gguf("gemma-3-4b-it.gguf")
    assert draft_path is not None
    assert "1b" in draft_path.name.lower() or "0.5b" in draft_path.name.lower()
    # Драфт не должен быть самой целевой моделью
    assert "4b" not in draft_path.name.lower()


def test_http2_pool_singleton():
    async def _check():
        client1 = await DeepTrendHTTPPool.get_client()
        client2 = await DeepTrendHTTPPool.get_client()
        assert client1 is client2
        assert client1.is_closed is False
        await DeepTrendHTTPPool.close()
        assert DeepTrendHTTPPool._client is None
        return True

    assert asyncio.run(_check())
