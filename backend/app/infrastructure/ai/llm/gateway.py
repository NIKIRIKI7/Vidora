"""Единый шлюз и фасад для работы с языковыми моделями (LLM)."""

import asyncio
import inspect
import json
import os
import re
import threading
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

import httpx
from openai import AsyncOpenAI

from app.core.config import settings
from app.core.logging import add_log
from app.domain.exceptions import ProviderExecutionError


def _aitunnel_model(model: str) -> str:
    return model.split("/", 1)[-1]


class LLMGateway:
    """Шлюз для вызова облачных и локальных LLM с поддержкой fallbacks и tool calling."""

    _models_cache: Dict[str, Any] = {}
    _model_lock = threading.Lock()
    _gen_lock = threading.Lock()

    def __init__(self, api_keys: Optional[Dict[str, Any]] = None):
        keys = api_keys or {}
        router_key = keys.get("routerai") or settings.ROUTERAI_API_KEY
        aitunnel_key = keys.get("aitunnel") or settings.AITUNNEL_API_KEY

        self.routerai = (
            AsyncOpenAI(api_key=router_key, base_url="https://routerai.ru/api/v1")
            if router_key
            else None
        )
        self.aitunnel = (
            AsyncOpenAI(api_key=aitunnel_key, base_url="https://api.aitunnel.ru/v1/")
            if aitunnel_key
            else None
        )
        self.api_keys = keys

    @classmethod
    def get_candidate_model_dirs(cls) -> List[Path]:
        """Все возможные директории хранения встроенных GGUF-моделей Vidora."""
        candidates = [
            settings.AI_MODELS_DIR,
            settings.BASE_DIR / "ai-models",
            settings.BASE_DIR.parent / "ai-models",
            getattr(settings, "CACHE_DIR", None),
            Path.home() / "ai-models",
            Path.cwd() / "ai-models",
            Path.cwd() / "backend" / "ai-models",
        ]
        resolved = []
        for d in candidates:
            if not d:
                continue
            try:
                p = Path(d).resolve()
                if p.is_dir() and p not in resolved:
                    resolved.append(p)
            except Exception:
                pass
        return resolved

    @classmethod
    def find_all_gguf_files(cls) -> List[Path]:
        """Рекурсивный поиск всех .gguf файлов в директориях моделей."""
        found: List[Path] = []
        seen = set()
        for d in cls.get_candidate_model_dirs():
            try:
                for p in d.rglob("*.gguf"):
                    if p.is_file():
                        rp = p.resolve()
                        if rp not in seen:
                            seen.add(rp)
                            found.append(rp)
            except Exception:
                pass
        return sorted(found)

    @staticmethod
    def _match_gguf(engine: str, files: List[Path]) -> Optional[Path]:
        """Fuzzy-подбор GGUF: 'gemma3:4b' -> 'gemma-3-4b-it-Q4_K_M.gguf'."""
        if not engine or not files:
            return None
        engine_str = engine.lower().strip()

        clean_target = re.sub(r"[:\-_.\s]+", "", engine_str)
        for p in files:
            stem_clean = re.sub(r"[:\-_.\s]+", "", p.stem.lower())
            if clean_target and (clean_target in stem_clean or stem_clean in clean_target):
                return p

        tokens = [t for t in re.split(r"[:\-_.\s/]+", engine_str) if t]
        if tokens:
            best, best_overlap = None, 0
            for p in files:
                stem = p.stem.lower()
                overlap = sum(1 for t in tokens if t in stem)
                if overlap > best_overlap:
                    best, best_overlap = p, overlap
            if best and best_overlap >= 1 and tokens[0] in best.stem.lower():
                return best

        families = ("gemma", "qwen", "llama", "deepseek", "mistral", "phi")
        for fam in families:
            if fam in engine_str:
                for p in files:
                    if fam in p.stem.lower():
                        return p

        if len(files) == 1:
            return files[0]
        return None

    @classmethod
    def resolve_gguf(cls, engine: str) -> Optional[Path]:
        """Умный токенный резолвер встроенных GGUF-моделей Vidora."""
        return cls._match_gguf(engine, cls.find_all_gguf_files())

    @classmethod
    def resolve_draft_gguf(cls, target_engine: str) -> Optional[Path]:
        """
        Ищет черновую легковесную модель для Speculative Decoding.
        Для gemma-3-4b -> gemma-3-1b-it.gguf (та же vocab, скрытое измерение может отличаться).
        """
        all_ggufs = cls.find_all_gguf_files()
        target_lower = (target_engine or "").lower()
        target_family = next((f for f in ("gemma", "qwen", "llama", "deepseek", "mistral") if f in target_lower), None)
        if not target_family:
            return None

        candidates = [p for p in all_ggufs if p.name != target_engine and p.name != Path(target_engine).name]
        for p in candidates:
            p_name = p.name.lower()
            if ("1b" in p_name or "0.5b" in p_name) and target_family in p_name:
                return p
        return None

    def _get_local_llama_model(self, path: Path):
        with self._model_lock:
            model = self._models_cache.get(str(path))
            if model is None:
                from llama_cpp import Llama, LlamaRAMCache

                n_gpu_layers = int(os.environ.get("VIDORA_LLAMA_GPU_LAYERS", "0"))

                # 1. Speculative Decoding: черновик 1B -> цель (если лежит рядом и подходит)
                # Отключено по умолчанию: Python-колбэк llama_cpp 0.3.34 падает на длинных
                # промптах (1512 токенов -> ValueError в eval) и пере-префилит контекст каждый шаг.
                # Включить осознанно: VIDORA_LLAMA_DRAFT=1.
                draft_model_instance = None
                draft_path = self.resolve_draft_gguf(path.name)
                if draft_path is not None and draft_path.resolve() != path.resolve():
                    if os.environ.get("VIDORA_LLAMA_DRAFT", "0") == "1":
                        try:
                            from app.infrastructure.ai.llm.speculative import NeuralDraftModel
                            draft_model_instance = NeuralDraftModel(
                                model_path=str(draft_path),
                                n_threads=max(os.cpu_count() or 4, 4),
                                n_gpu_layers=n_gpu_layers,
                            )
                            add_log("INFO", "LLM_SPECULATIVE", f"Speculative Decoding: {draft_path.name} -> {path.name}")
                        except Exception as e:
                            add_log("WARN", "LLM_SPECULATIVE", f"Черновая модель не подключена ({e}); работаем без неё")

                model = Llama(
                    model_path=str(path),
                    draft_model=draft_model_instance,
                    n_ctx=16384,
                    n_batch=512,
                    n_threads=max(os.cpu_count() or 4, 4),
                    n_gpu_layers=n_gpu_layers,
                    verbose=False,
                )
                # 2. KV-кэш в RAM: повторные вызовы с тем же системным промптом пропускают
                #    его prefill (~800 токенов) и генерируют с первой миллисекунды.
                try:
                    model.set_cache(LlamaRAMCache(capacity_bytes=512 * 1024 * 1024))
                except Exception as e:
                    add_log("WARN", "LLM_GATEWAY", f"LlamaRAMCache не инициализирован: {e}")
                self._models_cache[str(path)] = model
            return model

    async def call_local_gguf(
            self, engine: str, system_prompt: str, user_prompt: str, max_tokens: int = 4096,
            json_mode: bool = False,
    ) -> Optional[str]:
        gguf = self.resolve_gguf(engine)
        if gguf is None:
            return None

        def _sync_generate():
            llm = self._get_local_llama_model(gguf)
            messages = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            messages.append({"role": "user", "content": user_prompt})
            with self._gen_lock:
                kwargs: Dict[str, Any] = {
                    "messages": messages,
                    "temperature": 0.6,
                    "max_tokens": max_tokens,
                }
                # GBNF-грамматика: строго валидный JSON с первого токена, без трат на форматирование
                if json_mode:
                    from app.infrastructure.ai.llm.grammar import get_llama_json_grammar
                    grammar = get_llama_json_grammar()
                    if grammar is not None:
                        kwargs["grammar"] = grammar
                    else:
                        kwargs["response_format"] = {"type": "json_object"}
                try:
                    out = llm.create_chat_completion(**kwargs)
                    return out["choices"][0]["message"].get("content", "")
                except Exception:
                    kwargs.pop("grammar", None)
                    kwargs.pop("response_format", None)
                    out = llm.create_chat_completion(**kwargs)
                    return out["choices"][0]["message"].get("content", "")

        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, _sync_generate)

    async def call_ollama(
            self,
            engine: str,
            prompt: str,
            system_prompt: str = "",
            max_tokens: int = 4096,
            json_mode: bool = False,
    ) -> str:
        model = engine if engine and engine != "ollama" else "qwen2.5-coder"
        full_prompt = f"{system_prompt}\n\n{prompt}" if system_prompt else prompt
        payload = {"model": model, "prompt": full_prompt, "stream": False}
        if json_mode:
            payload["format"] = "json"

        async with httpx.AsyncClient(timeout=120.0) as client:
            try:
                res = await client.post("http://127.0.0.1:11434/api/generate", json=payload)
                if res.status_code != 200:
                    raise ProviderExecutionError(f"Ollama HTTP {res.status_code}: {res.text}")
                return res.json().get("response", "")
            except httpx.ConnectError:
                raise ProviderExecutionError("Локальный сервис Ollama недоступен (127.0.0.1:11434)")

    async def call_claude_direct(self, prompt: str, api_key: str, max_tokens: int = 4096) -> str:
        if not api_key:
            raise ProviderExecutionError("Anthropic API key не задан")
        async with httpx.AsyncClient(timeout=120.0) as client:
            res = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": "claude-sonnet-4-20250514",
                    "max_tokens": max_tokens,
                    "messages": [{"role": "user", "content": prompt}],
                },
            )
            if res.status_code != 200:
                raise ProviderExecutionError(f"Claude API error ({res.status_code}): {res.text}")
            return res.json()["content"][0]["text"]

    async def call_openai_direct(self, prompt: str, api_key: str, max_tokens: int = 4096) -> str:
        if not api_key:
            raise ProviderExecutionError("OpenAI API key не задан")
        async with httpx.AsyncClient(timeout=120.0) as client:
            res = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": "gpt-4o",
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": max_tokens,
                },
            )
            if res.status_code != 200:
                raise ProviderExecutionError(f"OpenAI API error ({res.status_code}): {res.text}")
            return res.json()["choices"][0]["message"]["content"]

    async def chat(
            self,
            model: str,
            messages: List[Dict[str, str]],
            tools: Optional[list] = None,
            available_functions: Optional[Dict[str, Callable]] = None,
            **kwargs: Any,
    ) -> Optional[str]:
        if "response_format" in kwargs and any(
                x in model.lower() for x in ["anthropic", "claude", "google", "gemini"]
        ):
            kwargs.pop("response_format", None)
        if tools:
            kwargs.pop("response_format", None)

        clients = []
        if self.routerai:
            clients.append(
                (
                    self.routerai,
                    model,
                    {
                        "extra_body": {
                            "provider": {
                                "allow_fallbacks": True,
                                "order": ["openai", "anthropic", "google"],
                            }
                        }
                    },
                )
            )
        if self.aitunnel:
            clients.append((self.aitunnel, _aitunnel_model(model), {}))

        current_messages = messages.copy()
        for client, active_model, extra_kwargs in clients:
            try:
                for _ in range(5):
                    api_kwargs = {**kwargs, **extra_kwargs}
                    if tools:
                        api_kwargs["tools"] = tools

                    response = await client.chat.completions.create(
                        model=active_model, messages=current_messages, **api_kwargs
                    )
                    msg = response.choices[0].message

                    if getattr(msg, "tool_calls", None):
                        current_messages.append(msg.model_dump(exclude_none=True))
                        for tool_call in msg.tool_calls:
                            func_name = tool_call.function.name
                            try:
                                args = json.loads(tool_call.function.arguments)
                            except Exception:
                                args = {}

                            if available_functions and func_name in available_functions:
                                fn = available_functions[func_name]
                                try:
                                    if inspect.iscoroutinefunction(fn):
                                        result = await fn(**args)
                                    else:
                                        result = fn(**args)
                                except Exception as e:
                                    result = f"Error: {str(e)}"
                            else:
                                result = "Function not found"

                            current_messages.append(
                                {
                                    "role": "tool",
                                    "tool_call_id": tool_call.id,
                                    "name": func_name,
                                    "content": str(result),
                                }
                            )
                    else:
                        return msg.content
            except Exception as e:
                add_log("WARN", "LLM_GATEWAY", f"Ошибка на {client.base_url}: {e}")

        return None

    async def generate_text(
            self,
            prompt: str,
            system_prompt: str = "",
            engine: str = "gemma3:4b",
            json_mode: bool = False,
            max_tokens: int = 4096,
    ) -> str:
        """Унифицированная генерация текста/кода/JSON по названию движка.
        Приоритет: прямые облака -> шлюзы -> встроенный GGUF (llama-cpp) -> Ollama."""
        engine_str = (engine or "gemma3:4b").strip()

        # 1. Прямые облачные провайдеры
        if engine_str == "claude":
            api_key = self.api_keys.get("anthropic") or settings.ANTHROPIC_API_KEY
            return await self.call_claude_direct(prompt, api_key, max_tokens)

        if engine_str == "openai":
            api_key = self.api_keys.get("openai") or settings.OPENAI_API_KEY
            return await self.call_openai_direct(prompt, api_key, max_tokens)

        # 2. Облачные шлюзы RouterAI / AITunnel
        if "/" in engine_str or engine_str in ("routerai_gpt4o", "routerai_claude", "aitunnel"):
            messages = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            messages.append({"role": "user", "content": prompt})
            kwargs: Dict[str, Any] = {"max_tokens": max_tokens}
            if json_mode:
                kwargs["response_format"] = {"type": "json_object"}

            res = await self.chat(model=engine_str, messages=messages, **kwargs)
            if res and res.strip():
                return res

        # 3. Встроенный локальный GGUF (llama-cpp-python) — в приоритете над Ollama
        all_ggufs = self.find_all_gguf_files()
        local_res = None
        try:
            if self.resolve_gguf(engine_str):
                local_res = await self.call_local_gguf(
                    engine=engine_str, system_prompt=system_prompt, user_prompt=prompt,
                    max_tokens=max_tokens, json_mode=json_mode,
                )
            elif all_ggufs:
                local_res = await self.call_local_gguf(
                    engine=all_ggufs[0].name, system_prompt=system_prompt, user_prompt=prompt,
                    max_tokens=max_tokens, json_mode=json_mode,
                )
        except Exception as e:
            add_log("WARN", "LLM_GATEWAY", f"Локальный GGUF не сработал ({e}), пробуем Ollama")
        if local_res and local_res.strip():
            add_log("INFO", "LLM_GATEWAY", f"Сгенерировано локальной моделью: {all_ggufs[0].name if all_ggufs else engine_str}")
            return local_res

        # 4. Ollama — только если нет локальных GGUF-файлов или они упали
        return await self.call_ollama(
            engine_str, prompt, system_prompt, max_tokens=max_tokens, json_mode=json_mode
        )
