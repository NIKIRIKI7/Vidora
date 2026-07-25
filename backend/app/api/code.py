import os
import re
import httpx
from pathlib import Path
from fastapi import APIRouter
from app.schemas import CodeGenerationRequest

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
router = APIRouter(prefix="/api/v1/code", tags=["code"])

def _extract_tsx(data: str) -> str:
    match = re.search(r"```tsx\s*(.*?)\s*```", data, re.DOTALL)
    return match.group(1) if match else data

def _save_code(request: CodeGenerationRequest, tsx_code: str):
    try:
        proj_path = os.path.normpath(os.path.join(str(BACKEND_DIR), request.project_path)) if not os.path.isabs(request.project_path) else request.project_path
        code_dir = Path(proj_path) / "code" / "a-roll"
        code_dir.mkdir(parents=True, exist_ok=True)
        code_file = code_dir / f"{request.target_id}.tsx"
        code_file.write_text(tsx_code, encoding="utf-8")
    except Exception as fs_err:
        print(f"[CODE API] Ошибка сохранения файла: {fs_err}")

@router.post("/generate")
async def generate_code(request: CodeGenerationRequest):
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
                json={"model": "gpt-4o", "messages": [{"role": "user", "content": request.prompt}], "max_tokens": 4096},
                timeout=120.0,
            )
            if res.status_code != 200:
                return {"status": "error", "tsx_code": f"// OpenAI error: {res.status_code}"}
            data = res.json()["choices"][0]["message"]["content"]
            tsx_code = _extract_tsx(data)
            _save_code(request, tsx_code)
            return {"status": "ok", "tsx_code": tsx_code}

    try:
        async with httpx.AsyncClient() as client:
            res = await client.post(
                "http://127.0.0.1:11434/api/generate",
                json={"model": "qwen2.5-coder", "prompt": request.prompt, "stream": False},
                timeout=60.0,
            )
            if res.status_code == 200:
                data = res.json().get("response", "")
                tsx_code = _extract_tsx(data)
                _save_code(request, tsx_code)
                return {"status": "ok", "tsx_code": tsx_code}
            return {"status": "error", "tsx_code": "// Generation error"}
    except Exception:
        return {"status": "fallback", "tsx_code": f"// Ollama unavailable. Prompt: {request.prompt[:50]}..."}
