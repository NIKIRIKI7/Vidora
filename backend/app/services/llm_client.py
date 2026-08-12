import os
from openai import AsyncOpenAI


class MultiProviderClient:
    """Единый OpenAI-совместимый клиент: RouterAI — основной, AITUNNEL — резерв."""

    def __init__(self, router_key: str = "", aitunnel_key: str = ""):
        self.routerai = AsyncOpenAI(
            api_key=router_key or os.getenv("ROUTERAI_API_KEY", ""),
            base_url="https://routerai.ru/api/v1",
        )
        self.aitunnel = AsyncOpenAI(
            api_key=aitunnel_key or os.getenv("AITUNNEL_API_KEY", ""),
            base_url="https://api.aitunnel.ru/v1/",
        )

    async def chat(self, model: str, messages: list[dict], **kwargs) -> str | None:
        if self.routerai.api_key:
            try:
                print("[INFO] Попытка через RouterAI...")
                routerai_settings = {
                    "provider": {
                        "allow_fallbacks": True,
                        "order": ["openai", "anthropic", "google"],
                    }
                }
                response = await self.routerai.chat.completions.create(
                    model=model,
                    messages=messages,
                    extra_body=routerai_settings,
                    **kwargs,
                )
                return response.choices[0].message.content
            except Exception as exc:
                print(f"[WARN] Ошибка RouterAI: {exc}. Переключение на AITUNNEL...")

        if not self.aitunnel.api_key:
            return None
        try:
            response = await self.aitunnel.chat.completions.create(
                model=_aitunnel_model(model),
                messages=messages,
                **kwargs,
            )
            return response.choices[0].message.content
        except Exception as exc:
            print(f"[WARN] Ошибка AITUNNEL: {exc}")
            return None


def _aitunnel_model(model: str) -> str:
    # AITUNNEL использует нативные id без префикса провайдера: openai/gpt-5.1 -> gpt-5.1
    return model.split("/", 1)[-1]


if __name__ == "__main__":
    import asyncio

    assert _aitunnel_model("openai/gpt-5.1") == "gpt-5.1"
    assert _aitunnel_model("anthropic/claude-sonnet-5") == "claude-sonnet-5"
    assert _aitunnel_model("google/gemini-3.1-pro-preview") == "gemini-3.1-pro-preview"
    assert _aitunnel_model("minimax/speech-2.8-hd") == "speech-2.8-hd"
    print("llm_client model mapping OK")

    async def _demo():
        ai = MultiProviderClient()
        if not (ai.routerai.api_key or ai.aitunnel.api_key):
            print("Ключи не заданы — заполните backend/.env (ROUTERAI_API_KEY / AITUNNEL_API_KEY)")
            return
        answer = await ai.chat(
            model="anthropic/claude-sonnet-5",
            messages=[{"role": "user", "content": "Напиши функцию сортировки массива на Python"}],
        )
        print(answer)

    asyncio.run(_demo())