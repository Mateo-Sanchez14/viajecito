"""Rule-based proposal classifier: a host table and Spanish/English keywords (pure)."""

import re
import unicodedata
from dataclasses import dataclass
from urllib.parse import urlsplit

from linkpreview.domain.urls import host_of, is_maps_url

CATEGORIES = ("lodging", "transport", "activity", "food", "gear", "destination", "other")
HOST_CONFIDENCE = 0.9
KEYWORD_CONFIDENCE = 0.6
PRIORITY = ("lodging", "transport", "gear", "food", "activity")  # tie-breaker between keyword hits


@dataclass(frozen=True)
class Classification:
    category: str
    confidence: float


@dataclass(frozen=True)
class ClassificationInput:
    url: str
    title: str
    description: str
    site_name: str
    has_coordinates: bool


def fold(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(c for c in decomposed if not unicodedata.combining(c)).casefold()


def _host(*names: str) -> re.Pattern[str]:
    return re.compile(rf"(^|\.)(?:{'|'.join(names)})$")


_HOSTS: tuple[tuple[str, re.Pattern[str]], ...] = (
    (
        "lodging",
        _host(
            r"booking\.com",
            r"airbnb\.[a-z.]+",
            r"hotels\.com",
            r"expedia\.[a-z.]+",
            r"hostelworld\.com",
            r"vrbo\.com",
        ),
    ),
    (
        "transport",
        _host(
            r"despegar\.[a-z.]+",
            r"aerolineas\.com\.ar",
            r"latamairlines\.com",
            r"flybondi\.com",
            r"jetsmart\.com",
            r"skyairline\.com",
            r"plataforma10\.com",
            r"turbus\.cl",
            r"busbud\.com",
            r"rentalcars\.com",
        ),
    ),
    ("destination", _host(r"wikipedia\.org")),
)
_TRIPADVISOR = _host(r"tripadvisor\.[a-z.]+")

_KEYWORDS: dict[str, re.Pattern[str]] = {
    category: re.compile(rf"\b(?:{pattern})\b")
    for category, pattern in {
        "lodging": r"hotel(?:es)?|hostels?|cabanas?|deptos?|departamentos?|apart\w*|refugios?"
        r"|alojamientos?",
        "transport": r"vuelos?|pasajes?|bus|buses|micros?|autos?|alquiler de auto|transfers?",
        "gear": r"rentals?|alquiler de equipos?|esquies|esqui|tablas?|snowboards?",
        "food": r"restaurants?|restaurantes?|restos?|parrillas?",
        "activity": r"excursion|excursiones|clases?|pases?|lifts?|tickets?|tours?|entradas?",
    }.items()
}


class RuleBasedClassifier:
    def classify(self, data: ClassificationInput, text: str) -> Classification:
        host = host_of(data.url)
        keywords = self._keyword_category(data, text)
        if is_maps_url(data.url) or data.has_coordinates and host.startswith(("maps.", "google.")):
            if keywords == "lodging":
                return Classification("lodging", KEYWORD_CONFIDENCE)
            return Classification("destination", HOST_CONFIDENCE)
        for category, pattern in _HOSTS:
            if pattern.search(host):
                return Classification(category, HOST_CONFIDENCE)
        if _TRIPADVISOR.search(host) and "/restaurant_review" in urlsplit(data.url).path.lower():
            return Classification("food", HOST_CONFIDENCE)
        if keywords:
            return Classification(keywords, KEYWORD_CONFIDENCE)
        return Classification("other", 0.0)

    @staticmethod
    def _keyword_category(data: ClassificationInput, text: str) -> str | None:
        haystack = fold(f"{data.title} {data.description} {text}")
        hits = {name: len(rx.findall(haystack)) for name, rx in _KEYWORDS.items()}
        best = max(hits.values())
        if best == 0:
            return None
        return next(name for name in PRIORITY if hits[name] == best)
