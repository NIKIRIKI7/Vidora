import os
import json
from openai import AsyncOpenAI


class MultiProviderClient:
    """Единый OpenAI-совместимый клиент: RouterAI — основной, AITUNNEL — резерв."""

    def __init__(self, router_key: str = "", aitunnel_key: str = ""):
        router_key = router_key or os.getenv("ROUTERAI_API_KEY", "")
        aitunnel_key = aitunnel_key or os.getenv("AITUNNEL_API_KEY", "")
        self.routerai = AsyncOpenAI(api_key=router_key, base_url="https://routerai.ru/api/v1") if router_key else None
        self.aitunnel = AsyncOpenAI(api_key=aitunnel_key, base_url="https://api.aitunnel.ru/v1/") if aitunnel_key else None

    async def chat(self, model: str, messages: list[dict], tools: list = None, available_functions: dict = None, **kwargs) -> str | None:
        # Claude и Gemini могут падать при жестко заданном response_format через врапперы
        if "response_format" in kwargs and any(x in model.lower() for x in ["anthropic", "claude", "google", "gemini"]):
            kwargs.pop("response_format", None)
        # При использовании инструментов response_format конфликтует с tool calling у части моделей/шлюзов
        if tools:
            kwargs.pop("response_format", None)

        clients = []
        if self.routerai:
            clients.append((self.routerai, model, {"extra_body": {"provider": {"allow_fallbacks": True, "order": ["openai", "anthropic", "google"]}}}))
        if self.aitunnel:
            clients.append((self.aitunnel, _aitunnel_model(model), {}))

        current_messages = messages.copy()

        for client, active_model, extra_kwargs in clients:
            try:
                print(f"[INFO] Попытка через {client.base_url} (Model: {active_model})...")
                max_loops = 5

                for _ in range(max_loops):
                    api_kwargs = {**kwargs, **extra_kwargs}
                    if tools:
                        api_kwargs["tools"] = tools

                    response = await client.chat.completions.create(
                        model=active_model,
                        messages=current_messages,
                        **api_kwargs,
                    )
                    msg = response.choices[0].message

                    # Если модель хочет использовать инструмент (MCP / Function Calling)
                    if getattr(msg, "tool_calls", None):
                        current_messages.append(msg.model_dump(exclude_none=True))

                        for tool_call in msg.tool_calls:
                            func_name = tool_call.function.name
                            try:
                                args = json.loads(tool_call.function.arguments)
                            except Exception:
                                args = {}

                            print(f"[LLM TOOL CALL] ИИ вызывает инструмент: {func_name}({args})")
                            if available_functions and func_name in available_functions:
                                import inspect
                                try:
                                    if inspect.iscoroutinefunction(available_functions[func_name]):
                                        result = await available_functions[func_name](**args)
                                    else:
                                        result = available_functions[func_name](**args)
                                except Exception as e:
                                    result = f"Error: {str(e)}"
                            else:
                                result = "Function not found"

                            current_messages.append({
                                "role": "tool",
                                "tool_call_id": tool_call.id,
                                "name": func_name,
                                "content": str(result)
                            })
                    else:
                        # Если вызовов инструментов больше нет, возвращаем ответ
                        return msg.content
            except Exception as exc:
                print(f"[WARN] Ошибка {client.base_url}: {exc}")

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
        if not (ai.routerai or ai.aitunnel):
            print("Ключи не заданы — заполните backend/.env (ROUTERAI_API_KEY / AITUNNEL_API_KEY)")
            return
        answer = await ai.chat(
            model="anthropic/claude-sonnet-5",
            messages=[{"role": "user", "content": "Напиши функцию сортировки массива на Python"}],
        )
        print(answer)

    asyncio.run(_demo())