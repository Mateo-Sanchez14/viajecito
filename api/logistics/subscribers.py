from logistics.adapters.django_store import DjangoTaskStore
from logistics.use_cases.proposal_status import react_to_proposal


def on_proposal_status_changed(**payload):
    react_to_proposal(DjangoTaskStore(), **payload)
