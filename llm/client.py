from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass
from enum import Enum


class ModelTier(Enum):
    FAST = "fast"          # Haiku-class: low latency, cheap, simple tasks
    STANDARD = "standard"  # Sonnet-class: balanced speed and capability
    POWERFUL = "powerful"  # Opus-class: complex reasoning and long-horizon tasks


@dataclass
class Message:
    role: str   # "user" or "assistant"
    content: str


class LLMClient(ABC):
    @abstractmethod
    async def complete(
        self,
        messages: list[Message],
        system: str | None = None,
        tier: ModelTier = ModelTier.POWERFUL,
        max_tokens: int = 16000,
    ) -> str:
        """Return the full response text after generation completes."""

    @abstractmethod
    async def stream(
        self,
        messages: list[Message],
        system: str | None = None,
        tier: ModelTier = ModelTier.POWERFUL,
        max_tokens: int = 64000,
    ) -> AsyncIterator[str]:
        """Yield response text tokens as they arrive."""
