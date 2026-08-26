import os
import re
import httpx
from pathlib import Path
from fastapi import APIRouter
from app.schemas import CodeGenerationRequest
from app.services.llm_client import MultiProviderClient
from app.services.history_logger import add_log, save_code_revision

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
router = APIRouter(prefix="/api/v1/code", tags=["code"])

def _save_revision(request: CodeGenerationRequest, tsx_code: str):
    try:
        save_code_revision(request.project_path, request.target_id, tsx_code, request.prompt)
    except Exception as log_err:
        print(f"[CODE API] Ошибка сохранения ревизии: {log_err}")

def _extract_tsx(data: str) -> str:
    match = re.search(r"```tsx\s*(.*?)\s*```", data, re.DOTALL)
    if match:
        return match.group(1)
    # Обрезанный ответ: открывающий ```tsx есть, закрывающего нет — вырезаем хотя бы фенс
    if "```" in data:
        return data.split("```", 1)[1].lstrip()
    return data

def _save_code(request: CodeGenerationRequest, tsx_code: str):
    try:
        proj_path = os.path.normpath(os.path.join(str(BACKEND_DIR), request.project_path)) if not os.path.isabs(request.project_path) else request.project_path
        code_dir = Path(proj_path) / "code" / "a-roll"
        code_dir.mkdir(parents=True, exist_ok=True)
        code_file = code_dir / f"{request.target_id}.tsx"
        code_file.write_text(tsx_code, encoding="utf-8")
        _save_revision(request, tsx_code)
    except Exception as fs_err:
        print(f"[CODE API] Ошибка сохранения файла: {fs_err}")

# OpenAI-совместимые шлюзы: движок → модель. RouterAI — основной, AITUNNEL — резерв.
LLM_GATEWAY_MODELS = {
    "routerai_gpt4o": "openai/gpt-5.1",
    "routerai_claude": "anthropic/claude-sonnet-5",
}

@router.post("/generate")
async def generate_code(request: CodeGenerationRequest):
    try:
        engine = request.engine or "ollama"
        api_keys_dict = request.api_keys.model_dump() if request.api_keys else {}

        if engine == "claude":
            api_key = api_keys_dict.get('anthropic') or os.environ.get('ANTHROPIC_API_KEY', '')
            if not api_key:
                return {"status": "error", "tsx_code": "// Claude API key not configured"}
            async with httpx.AsyncClient() as client:
                res = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={"x-api-key": api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                    json={"model": "claude-sonnet-4-20250514", "max_tokens": 4096, "messages": [{"role": "user", "content": request.prompt}]},
                    timeout=120.0,
                )
                if res.status_code != 200:
                    return {"status": "error", "tsx_code": f"// Claude error: {res.status_code}"}
                data = res.json()["content"][0]["text"]
                tsx_code = _extract_tsx(data)
                _save_code(request, tsx_code)
                return {"status": "ok", "tsx_code": tsx_code}

        elif engine == "openai":
            api_key = api_keys_dict.get('openai') or os.environ.get('OPENAI_API_KEY', '')
            if not api_key:
                return {"status": "error", "tsx_code": "// OpenAI API key not configured"}
            async with httpx.AsyncClient() as client:
                res = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    json={"model": "gpt-5.1", "messages": [{"role": "user", "content": request.prompt}], "max_tokens": 4096},
                    timeout=120.0,
                )
                if res.status_code != 200:
                    return {"status": "error", "tsx_code": f"// OpenAI error: {res.status_code}"}
                data = res.json()["choices"][0]["message"]["content"]
                tsx_code = _extract_tsx(data)
                _save_code(request, tsx_code)
                return {"status": "ok", "tsx_code": tsx_code}

        # OpenAI-совместимые шлюзы: движок → модель. RouterAI — основной, AITUNNEL — резерв.
        if engine in LLM_GATEWAY_MODELS or "/" in engine:
            model = LLM_GATEWAY_MODELS.get(engine, engine)
            routerai_key = api_keys_dict.get("routerai", "")
            aitunnel_key = api_keys_dict.get("aitunnel", "")

            if not routerai_key and not aitunnel_key:
                return {"status": "error", "tsx_code": f"// Ошибка: Ключи API для RouterAI или AITUNNEL не настроены.\n// Перейдите в Настройки -> AI Движки и укажите ключ для работы с {engine}."}

            client = MultiProviderClient(
                router_key=routerai_key,
                aitunnel_key=aitunnel_key,
            )
            try:
                data = await client.chat(
                    model=model,
                    messages=[{"role": "user", "content": request.prompt}],
                    max_tokens=4096,
                )
                if data:
                    tsx_code = _extract_tsx(data)
                    _save_code(request, tsx_code)
                    return {"status": "ok", "tsx_code": tsx_code}
                return {"status": "error", "tsx_code": "// Ошибка: Провайдер вернул пустой ответ (возможно, неверный ключ или недостаточный баланс)."}
            except Exception as api_err:
                return {"status": "error", "tsx_code": f"// Ошибка API ({model}): {api_err}"}

        # Локальная GGUF-модель из ai-models (llama_cpp) — фоллбэк на Ollama
        try:
            from app.services.llama_local import resolve_gguf, local_generate
            if resolve_gguf(engine):
                text = await local_generate(engine, "", request.prompt)
                if text:
                    tsx_code = _extract_tsx(text)
                    _save_code(request, tsx_code)
                    return {"status": "ok", "tsx_code": tsx_code}
        except Exception:
            pass

        try:
            async with httpx.AsyncClient() as client:
                res = await client.post(
                    "http://127.0.0.1:11434/api/generate",
                    json={"model": engine if engine != "ollama" else "qwen2.5-coder", "prompt": request.prompt, "stream": False},
                    timeout=60.0,
                )
                if res.status_code == 200:
                    data = res.json().get("response", "")
                    tsx_code = _extract_tsx(data)
                    _save_code(request, tsx_code)
                    return {"status": "ok", "tsx_code": tsx_code}
                return {"status": "error", "tsx_code": f"// Generation error: {res.status_code}"}
        except Exception:
            return {"status": "fallback", "tsx_code": f"// Ollama unavailable. Prompt: {request.prompt[:50]}..."}
    except Exception as global_err:
        import traceback
        traceback.print_exc()
        return {"status": "error", "tsx_code": f"// Внутренняя ошибка сервера: {str(global_err)}"}

if __name__ == "__main__":
    assert LLM_GATEWAY_MODELS["routerai_gpt4o"] == "openai/gpt-5.1"
    assert LLM_GATEWAY_MODELS["routerai_claude"] == "anthropic/claude-sonnet-5"
    assert "/" in "google/gemini-3.1-pro-preview"
    print("code.py gateway mapping OK")
