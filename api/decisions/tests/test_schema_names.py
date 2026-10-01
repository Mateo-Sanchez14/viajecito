from config.api import api


def test_request_schemas_keep_the_names_the_web_uses():
    names = set(api.get_openapi_schema()["components"]["schemas"])
    assert {"AvailabilityAnswerIn", "CloseDecisionIn"} <= names
    assert not {"AnswerIn", "DecisionCloseIn"} & names
