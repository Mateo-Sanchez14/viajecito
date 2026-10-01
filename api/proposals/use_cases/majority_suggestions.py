from messaging.reminders import ReminderDraft
from proposals.copy import es_ar
from proposals.domain.card import clean_title
from proposals.domain.tally import compute_tally
from proposals.ports import ProposalStore
from proposals.use_cases.tally import in_person_ids

SUGGESTABLE_STATUSES = ("proposed", "discussing")


def majority_drafts(store: ProposalStore, trips, *, public_origin: str) -> list[ReminderDraft]:
    """One ``MAJORITY_SUGGESTION`` per open proposal whose +1s are a majority of the people who
    are ``in``. The dedupe key is fixed per proposal, so it is suggested once, ever."""
    drafts: list[ReminderDraft] = []
    for trip in trips:
        records = store.list_for_trip(trip.id, statuses=SUGGESTABLE_STATUSES)
        if not records:
            continue
        in_ids = in_person_ids(trip.id)
        votes = store.votes_for([r.id for r in records])
        for record in records:
            tally = compute_tally(votes[record.id], in_ids, None)
            if not tally.majority:
                continue
            drafts.append(
                ReminderDraft(
                    crew_id=trip.crew_id,
                    trip_id=trip.id,
                    body=es_ar.MAJORITY_SUGGESTION.format(
                        title=clean_title(record.title),
                        up=tally.up_in,
                        in_count=tally.in_count,
                        url=f"{public_origin}{record.web_path}",
                    ),
                    dedupe_key=f"proposals:majority:{record.id}",
                    timezone=trip.timezone,
                    subject_type="proposal",
                    subject_id=record.id,
                    title=clean_title(record.title),
                    url_path=record.web_path,
                )
            )
    return drafts
