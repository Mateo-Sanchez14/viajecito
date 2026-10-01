import pytest

from config.api import api

SCHEMA = api.get_openapi_schema()["components"]["schemas"]


def prop(schema: str, name: str) -> dict:
    return SCHEMA[schema]["properties"][name]


def enum_of(schema: str, name: str) -> list[str]:
    return prop(schema, name)["enum"]


@pytest.mark.parametrize(
    ("schema", "field", "values"),
    [
        ("ResortOut", "country", ["AR", "CL"]),
        ("SnowReportOut", "source", ["open_meteo", "manual"]),
        ("PassRowOut", "status", ["needed", "bought", "season_pass", "not_needed"]),
        ("GearRowOut", "mode", ["own", "rent", "borrow"]),
        ("LevelGroupOut", "discipline", ["ski", "snowboard", "both"]),
        ("SkiProfileOut", "discipline", ["ski", "snowboard", "both"]),
        (
            "LevelGroupOut",
            "level",
            ["first_time", "beginner", "intermediate", "advanced", "expert"],
        ),
        (
            "SkiProfileOut",
            "level",
            ["first_time", "beginner", "intermediate", "advanced", "expert"],
        ),
        (
            "GearRowOut",
            "item",
            ["skis", "board", "boots", "poles", "helmet", "goggles", "jacket", "pants", "other"],
        ),
    ],
)
def test_output_fields_are_closed_unions(schema, field, values):
    assert enum_of(schema, field) == values


def test_status_text_is_bounded_like_the_model():
    assert prop("ManualReportIn", "status_text")["maxLength"] == 280


@pytest.mark.parametrize("schema", ["PassIn", "GearItemIn"])
def test_currency_is_a_three_letter_code(schema):
    options = prop(schema, "currency")
    lengths = [o.get("maxLength") for o in options.get("anyOf", [options])]
    assert 3 in lengths
