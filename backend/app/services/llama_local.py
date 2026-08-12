import asyncio
import os
import threading
from pathlib import Path

_AI_MODELS_DIR = Path(__file__).resolve().parents[2] / "ai-models"

_model = None
_model_lock = threading.Lock()
_gen_lock = threading.Lock()


def resolve_gguf(engine: str):
    """Ищет .gguf в ai-models по имени движка: 'gemma3:1b' -> gemma-3-1b-it-Q4_K_M.gguf."""
    norm = engine.lower().replace(":", "").replace("-", "").replace("_", "")
    for p in sorted(_AI_MODELS_DIR.glob("*.gguf")):
        if norm in p.stem.lower().replace("-", "").replace("_", ""):
            return p
    return None


def _get_model(gguf_path: Path):
    global _model
    if _model is None:
        from llama_cpp import Llama
        _model = Llama(
            model_path=str(gguf_path),
            n_ctx=16384,
            n_threads=max(os.cpu_count() or 4, 4),
            # ponytail: GPU-слои выставляются переменной окружения; CPU-по умолчанию безопасно
            n_gpu_layers=int(os.environ.get("VIDORA_LLAMA_GPU_LAYERS", "0")),
            verbose=False,
        )
    return _model


def _generate_sync(engine: str, system_prompt: str, user_prompt: str, tools: list = None, available_functions: dict = None) -> str:
    import json
    import inspect

    gguf = resolve_gguf(engine)
    if gguf is None:
        return None

    llm = _get_model(gguf)
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    max_loops = 5
    for _ in range(max_loops):
        kwargs = {}
        if tools:
            kwargs["tools"] = tools

        with _gen_lock:
            out = llm.create_chat_completion(
                messages=messages,
                temperature=0.6,
                max_tokens=4096,
                **kwargs
            )

        msg = out["choices"][0]["message"]

        if "tool_calls" in msg and msg["tool_calls"]:
            messages.append(msg)
            for tool_call in msg["tool_calls"]:
                func_name = tool_call["function"]["name"]
                try:
                    args = json.loads(tool_call["function"]["arguments"])
                except Exception:
                    args = {}

                print(f"[LOCAL LLM TOOL CALL] ИИ вызывает инструмент: {func_name}({args})")

                if available_functions and func_name in available_functions:
                    func = available_functions[func_name]
                    try:
                        if inspect.iscoroutinefunction(func):
                            result = asyncio.run(func(**args))
                        else:
                            result = func(**args)
                    except Exception as e:
                        result = f"Error: {str(e)}"
                else:
                    result = "Function not found"

                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call["id"],
                    "name": func_name,
                    "content": str(result)
                })
        else:
            return msg.get("content", "")

    return msg.get("content", "")


async def local_generate(engine: str, system_prompt: str, user_prompt: str, tools: list = None, available_functions: dict = None) -> str | None:
    """Возвращает ответ локальной GGUF-модели или None, если под движок нет .gguf в ai-models."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _generate_sync, engine, system_prompt, user_prompt, tools, available_functions)


if __name__ == "__main__":
    # самопроверка: реальная загрузка gemma3:1b из ai-models и генерация
    import time

    async def _check():
        t0 = time.time()
        text = await local_generate(
            "gemma3:1b",
            "Ты тестовая модель. Отвечай одним словом.",
            "Скажи привет",
        )
        assert text, "модель вернула пустой ответ"
        print(f"[llama_local] OK за {time.time() - t0:.1f}s: {text.strip()[:80]}")

    asyncio.run(_check())