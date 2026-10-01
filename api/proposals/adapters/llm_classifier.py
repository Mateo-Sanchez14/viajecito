"""Optional LLM classifier (OpenAI-compatible chat completions, like gastito)."""

import json

import httpx

from proposals.domain.classifier import CATEGORIES, Classification, ClassificationInput

TIMEOUT_SECONDS = 5.0
LLM_CONFIDENCE = 0.7


class LlmClassifier:
    def __init__(self, base_url: str, api_key: str, model: str) -> None:
        self._url = f"{base_url.rstrip('/')}/chat/completions"
        self._api_key = api_key
        self._model = model

    def classify(self, data: ClassificationInput, text: str) -> Classification:
        """Ask the model for one category. Raises on any failure: the caller keeps the rules."""
        prompt = (
            f"Classify this trip proposal into exactly one of: {', '.join(CATEGORIES)}.\n"
            f"Title: {data.title}\nDescription: {data.description}\nSite: {data.site_name}\n"
            f"URL host: {data.url.split('/')[2] if '//' in data.url else data.url}\n"
            f"Message: {text}\n"
            'Answer with JSON only: {"category": "<one of the list>"}'
        )
        headers = {"Authorization": f"Bearer {self._api_key}"} if self._api_key else {}
        response = httpx.post(
            self._url,
            headers=headers,
            json={
                "model": self._model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0,
            },
            timeout=TIMEOUT_SECONDS,
            follow_redirects=False,
        )
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]
        category = json.loads(content)["category"]
        if category not in CATEGORIES:
            raise ValueError(f"unknown category {category!r}")
        return Classification(category, LLM_CONFIDENCE, source="llm")
