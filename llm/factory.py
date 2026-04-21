import os

from llm.client import LLMClient

_SUPPORTED_PROVIDERS = ("claude", "openai", "gemini")


def create_llm_client() -> LLMClient:
    provider = os.getenv("LLM_PROVIDER", "claude").lower()

    if provider == "claude":
        from llm.adapters.claude import ClaudeClient
        return ClaudeClient()

    if provider == "openai":
        from llm.adapters.openai import OpenAIClient  # type: ignore[import]
        return OpenAIClient()

    if provider == "gemini":
        from llm.adapters.gemini import GeminiClient  # type: ignore[import]
        return GeminiClient()

    raise ValueError(
        f"Unknown LLM_PROVIDER {provider!r}. "
        f"Supported values: {', '.join(_SUPPORTED_PROVIDERS)}"
    )
