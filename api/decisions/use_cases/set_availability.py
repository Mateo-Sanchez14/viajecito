from collections.abc import Iterable
from datetime import date

from decisions.domain import rules
from decisions.ports import DecisionStore


def set_availability(
    decision_id: str,
    person_id: str,
    store: DecisionStore,
    answers: Iterable[tuple[date, str | None]],
) -> None:
    """Write the CALLER's answers (``None`` clears a day). Later items win for repeated dates."""
    changes: dict[date, str | None] = {}
    for day, answer in answers:
        if answer is not None and answer not in rules.ANSWERS:
            raise rules.DecisionError(f"answer must be one of {', '.join(rules.ANSWERS)}")
        changes[day] = answer
    with store.atomic():
        decision = store.get(decision_id, for_update=True)
        if decision is None:
            raise rules.DecisionNotFoundError(decision_id)
        if decision.status == rules.STATUS_CLOSED:
            raise rules.DecisionClosedError("the decision is closed")
        rules.validate_answer_dates(decision, list(changes))
        store.apply_answers(decision.trip_id, person_id, changes)
