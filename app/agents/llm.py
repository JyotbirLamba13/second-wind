"""Optional LLM access. Every caller must work when this returns None."""
from __future__ import annotations

import json
import re
from typing import Optional

from ..config import Settings

_DISCLAIMER = "You do research and triage only. Never give legal opinions."


class LLM:
    def __init__(self, settings: Settings):
        self.model = settings.model
        self.client = None
        self.input_tokens = 0
        self.output_tokens = 0
        if settings.anthropic_key:
            try:
                import anthropic

                self.client = anthropic.Anthropic(api_key=settings.anthropic_key)
            except ImportError:
                pass

    @property
    def enabled(self) -> bool:
        return self.client is not None

    def json_call(self, system: str, prompt: str, max_tokens: int = 700) -> Optional[dict]:
        if not self.client:
            return None
        try:
            msg = self.client.messages.create(
                model=self.model,
                max_tokens=max_tokens,
                system=f"{system}\n{_DISCLAIMER}\nReply with one JSON object and nothing else.",
                messages=[{"role": "user", "content": prompt}],
            )
        except Exception:
            return None
        self.input_tokens += msg.usage.input_tokens
        self.output_tokens += msg.usage.output_tokens
        text = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")
        m = re.search(r"\{.*\}", text, re.S)
        try:
            return json.loads(m.group(0)) if m else None
        except json.JSONDecodeError:
            return None
