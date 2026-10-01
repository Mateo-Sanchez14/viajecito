"""A single person reference component prevents Ninja's last-registration-wins drift."""

from decisions.schemas import PersonRefOut as DecisionsPersonRef
from proposals.schemas import PersonRefOut as ProposalsPersonRef
from ski.schemas import PersonRefOut as SkiPersonRef


def test_milestones_share_the_same_person_reference_schema():
    assert DecisionsPersonRef is ProposalsPersonRef is SkiPersonRef
    from shared.schemas import PersonRefOut

    assert DecisionsPersonRef is PersonRefOut
    assert set(PersonRefOut.model_fields) == {"person_id", "display_name"}
