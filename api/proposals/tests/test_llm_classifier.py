import json

import httpx
import pytest
import respx

from proposals.adapters import wiring
from proposals.adapters.llm_classifier import LlmClassifier
from proposals.domain.classifier import ClassificationInput, RuleBasedClassifier
from proposals.use_cases.classify import classify_with_fallback

BASE = "https://llm.example.net/v1"


def data(title="Algo raro"):
    return ClassificationInput(
        url="https://x.example/p", title=title, description="", site_name="", has_coordinates=False
    )


def answer(category):
    return httpx.Response(
        200, json={"choices": [{"message": {"content": json.dumps({"category": category})}}]}
    )


@respx.mock
def test_the_llm_is_asked_with_the_page_text_and_returns_its_category():
    route = respx.post(f"{BASE}/chat/completions").mock(return_value=answer("food"))
    result = LlmClassifier(BASE, "key", "small-model").classify(data("Cena rica"), "vamos?")
    assert (result.category, result.source) == ("food", "llm")
    request = route.calls.last.request
    assert request.headers["authorization"] == "Bearer key"
    body = json.loads(request.content)
    assert body["model"] == "small-model" and body["temperature"] == 0
    assert "Cena rica" in body["messages"][0]["content"]


@respx.mock
@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(500),
        httpx.Response(200, json={"choices": []}),
        httpx.Response(200, json={"choices": [{"message": {"content": "not json"}}]}),
        answer("spaceship"),
    ],
)
def test_any_failure_raises_and_the_caller_keeps_the_rule_result(response):
    respx.post(f"{BASE}/chat/completions").mock(return_value=response)
    llm = LlmClassifier(BASE, "", "m")
    with pytest.raises(Exception):  # noqa: B017 - any failure type is acceptable
        llm.classify(data(), "")
    result = classify_with_fallback(RuleBasedClassifier(), llm, data(), "")
    assert (result.category, result.source) == ("other", "rules")


@respx.mock
def test_timeouts_are_failures_too():
    respx.post(f"{BASE}/chat/completions").mock(side_effect=httpx.ReadTimeout("slow"))
    result = classify_with_fallback(RuleBasedClassifier(), LlmClassifier(BASE, "", "m"), data(), "")
    assert result.category == "other"


@respx.mock
def test_it_only_runs_for_low_confidence_results():
    route = respx.post(f"{BASE}/chat/completions").mock(return_value=answer("food"))
    llm = LlmClassifier(BASE, "", "m")
    assert classify_with_fallback(RuleBasedClassifier(), llm, data("Hotel Sur"), "").category == (
        "lodging"
    )
    assert not route.called
    result = classify_with_fallback(RuleBasedClassifier(), llm, data("Algo raro"), "")
    assert (result.category, result.source) == ("food", "llm")


def test_the_llm_is_off_unless_enabled_and_configured(settings):
    assert wiring.llm_classifier() is None
    settings.PROPOSALS_LLM_CLASSIFIER_ENABLED = True
    assert wiring.llm_classifier() is None  # no URL/model yet
    settings.PROPOSALS_LLM_BASE_URL = BASE
    settings.PROPOSALS_LLM_MODEL = "m"
    assert isinstance(wiring.llm_classifier(), LlmClassifier)
