import pytest

from proposals.domain.classifier import ClassificationInput, RuleBasedClassifier
from proposals.use_cases.classify import classify_with_fallback


def classify(url="https://example.com/x", title="", description="", text="", **kwargs):
    return RuleBasedClassifier().classify(
        ClassificationInput(
            url=url,
            title=title,
            description=description,
            site_name="",
            has_coordinates=False,
            **kwargs,
        ),
        text,
    )


@pytest.mark.parametrize(
    ("url", "category"),
    [
        ("https://www.booking.com/hotel/ar/x.html", "lodging"),
        ("https://www.airbnb.com.ar/rooms/1", "lodging"),
        ("https://www.airbnb.cl/rooms/1", "lodging"),
        ("https://www.hotels.com/ho1", "lodging"),
        ("https://www.expedia.com.ar/x", "lodging"),
        ("https://www.hostelworld.com/hostels/x", "lodging"),
        ("https://www.vrbo.com/1", "lodging"),
        ("https://www.despegar.com.ar/vuelos", "transport"),
        ("https://www.aerolineas.com.ar/x", "transport"),
        ("https://www.latamairlines.com/ar/es", "transport"),
        ("https://www.flybondi.com/ar", "transport"),
        ("https://jetsmart.com/ar", "transport"),
        ("https://www.skyairline.com", "transport"),
        ("https://www.plataforma10.com/x", "transport"),
        ("https://www.turbus.cl/x", "transport"),
        ("https://www.busbud.com/x", "transport"),
        ("https://www.rentalcars.com/x", "transport"),
        ("https://www.tripadvisor.com.ar/Restaurant_Review-g1-d2-Parrilla.html", "food"),
        ("https://es.wikipedia.org/wiki/Bariloche", "destination"),
        ("https://www.google.com/maps/place/Algo/@-41.1,-71.3,17z", "destination"),
        ("https://maps.app.goo.gl/abc", "destination"),
    ],
)
def test_host_rules_have_confidence_0_9(url, category):
    result = classify(url=url)
    assert (result.category, result.confidence) == (category, 0.9)


@pytest.mark.parametrize(
    ("title", "category"),
    [
        ("Hostel en el centro", "lodging"),
        ("Cabaña para 6 personas", "lodging"),
        ("Departamento en Palermo", "lodging"),
        ("Depto con vista", "lodging"),
        ("Refugio Frey", "lodging"),
        ("Vuelo a Bariloche", "transport"),
        ("Pasaje de micro a Mendoza", "transport"),
        ("Alquiler de auto en Salta", "transport"),
        ("Transfer al aeropuerto", "transport"),
        ("Alquiler de equipo de esquí", "gear"),
        ("Tabla de snowboard", "gear"),
        ("Parrilla Don Julio", "food"),
        ("Restaurant del puerto", "food"),
        ("Excursión al glaciar", "activity"),
        ("Pase de lift de 3 días", "activity"),
        ("Entradas para el show", "activity"),
        ("Tour por la ciudad", "activity"),
    ],
)
def test_keyword_rules_have_confidence_0_6(title, category):
    result = classify(title=title)
    assert (result.category, result.confidence) == (category, 0.6)


def test_keywords_ignore_accents_and_case():
    assert classify(title="CABANA con vista").category == "lodging"
    assert classify(title="ESQUIES").category == "gear"
    assert classify(title="Excursion").category == "activity"


def test_keywords_in_the_description_and_the_message_text_count():
    assert classify(description="el mejor hostel").category == "lodging"
    assert classify(text="miren este vuelo").category == "transport"


def test_unmatched_links_are_other_with_zero_confidence():
    result = classify(title="Nota del diario", url="https://diario.example/nota")
    assert (result.category, result.confidence) == ("other", 0.0)


def test_host_beats_keywords():
    assert classify(url="https://www.booking.com/x", title="Vuelo + tour").category == "lodging"


def test_the_most_frequent_keyword_category_wins_and_ties_follow_priority():
    assert classify(title="Tour, excursión y entradas, más un hotel").category == "activity"
    assert classify(title="Hotel y vuelo").category == "lodging"


def test_keywords_match_whole_words():
    assert classify(title="Autobiografía de un viajero").category == "other"
    assert classify(title="Busco ideas").category == "other"


def test_maps_places_are_destinations_unless_the_name_says_lodging():
    maps = "https://www.google.com/maps/place/Refugio+Frey/@-41.2,-71.4,17z"
    assert classify(url=maps, title="Refugio Frey").category == "lodging"
    assert classify(url=maps, title="Cerro Otto").category == "destination"
    result = classify(url=maps, title="Hotel Llao Llao")
    assert (result.category, result.confidence) == ("lodging", 0.6)


# --- the LLM path is only for low-confidence results ------------------------------------------


class FakeLlm:
    def __init__(self, result=None, error=None):
        self.result, self.error, self.calls = result, error, 0

    def classify(self, data, text):
        self.calls += 1
        if self.error:
            raise self.error
        return self.result


def data(**kw):
    return ClassificationInput(
        url="https://x.example/p",
        title=kw.get("title", ""),
        description="",
        site_name="",
        has_coordinates=False,
    )


def test_llm_is_used_only_below_half_confidence():
    from proposals.domain.classifier import Classification

    llm = FakeLlm(Classification("food", 0.8))
    rules = RuleBasedClassifier()
    assert classify_with_fallback(rules, llm, data(), "").category == "food"
    assert llm.calls == 1
    assert classify_with_fallback(rules, llm, data(title="Hotel"), "").category == "lodging"
    assert llm.calls == 1  # rules were confident enough: no second call


def test_llm_failure_or_absence_falls_back_to_the_rule_result():
    rules = RuleBasedClassifier()
    failing = FakeLlm(error=TimeoutError("slow"))
    result = classify_with_fallback(rules, failing, data(), "")
    assert (result.category, result.confidence) == ("other", 0.0)
    assert classify_with_fallback(rules, None, data(), "").category == "other"


def test_llm_answers_with_unknown_categories_are_ignored():
    from proposals.domain.classifier import Classification

    llm = FakeLlm(Classification("spaceship", 0.9))
    assert classify_with_fallback(RuleBasedClassifier(), llm, data(), "").category == "other"
