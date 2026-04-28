from collections.abc import AsyncIterator

import anthropic

from llm.client import LLMClient, Message, ModelTier

_MODEL_MAP: dict[ModelTier, str] = {
    ModelTier.FAST: "claude-haiku-4-5",
    ModelTier.STANDARD: "claude-sonnet-4-6",
    ModelTier.POWERFUL: "claude-opus-4-7",
}

# Only enable adaptive thinking for complex reasoning tasks.
# STANDARD calls (call2 scoring, feedback) use small max_tokens budgets
# that are incompatible with thinking — enabling it there causes hangs.
_THINKING_TIERS = {ModelTier.POWERFUL}


def _build_kwargs(
    messages: list[Message],
    system: str | None,
    tier: ModelTier,
    max_tokens: int,
) -> dict:
    kwargs: dict = {
        "model": _MODEL_MAP[tier],
        "max_tokens": max_tokens,
        "messages": [{"role": m.role, "content": m.content} for m in messages],
    }
    if system:
        kwargs["system"] = system
    if tier in _THINKING_TIERS:
        kwargs["thinking"] = {"type": "adaptive"}
    return kwargs


class ClaudeClient(LLMClient):
    def __init__(self, api_key: str | None = None) -> None:
        self._client = anthropic.AsyncAnthropic(api_key=api_key)

    async def complete(
        self,
        messages: list[Message],
        system: str | None = None,
        tier: ModelTier = ModelTier.POWERFUL,
        max_tokens: int = 16000,
    ) -> str:
        kwargs = _build_kwargs(messages, system, tier, max_tokens)
        async with self._client.messages.stream(**kwargs) as s:
            msg = await s.get_final_message()
        return next(b.text for b in msg.content if b.type == "text")

    async def stream(
        self,
        messages: list[Message],
        system: str | None = None,
        tier: ModelTier = ModelTier.POWERFUL,
        max_tokens: int = 64000,
    ) -> AsyncIterator[str]:
        kwargs = _build_kwargs(messages, system, tier, max_tokens)
        async with self._client.messages.stream(**kwargs) as s:
            async for text in s.text_stream:
                yield text
