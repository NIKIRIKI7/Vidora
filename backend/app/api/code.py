import re
import httpx
from fastapi import APIRouter
from app.schemas import CodeGenerationRequest

router = APIRouter(prefix="/api/v1/code", tags=["code"])

@router.post("/generate")
async def generate_code(request: CodeGenerationRequest):
    try:
        async with httpx.AsyncClient() as client:
            res = await client.post(
                "http://127.0.0.1:11434/api/generate",
                json={"model": "qwen2.5-coder", "prompt": request.prompt, "stream": False},
                timeout=60.0,
            )
            if res.status_code == 200:
                data = res.json().get("response", "")
                match = re.search(r"```tsx\s*(.*?)\s*```", data, re.DOTALL)
                tsx_code = match.group(1) if match else data
                return {"status": "ok", "tsx_code": tsx_code}
            return {"status": "error", "tsx_code": "// Ошибка генерации: неверный статус LLM"}
    except Exception:
        return {
            "status": "fallback",
            "tsx_code": f"// LLM API недоступно. Убедитесь, что сервер Ollama/vLLM запущен.\n// Prompt: {request.prompt[:50]}...",
        }
