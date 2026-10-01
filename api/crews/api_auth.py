"""Ninja-side crew authorization, shared by every milestone's endpoints.

Lives in ``crews`` rather than ``shared`` because it needs the crew membership model and ``shared``
may not depend on any other project package (see the import-linter contracts).
"""

from uuid import UUID

from django.http import HttpRequest
from ninja.errors import AuthenticationError

from crews.adapters.django_store import DjangoCrewStore
from crews.domain import NotMember
from crews.models import CrewMembership
from crews.use_cases.authz import require_active_member
from shared.api_errors import ApiError


def current_person(request: HttpRequest):
    """The authenticated person of a request, or ``AuthenticationError`` (rendered as 401)."""
    person = getattr(request, "auth", None) or getattr(request, "user", None)
    if person is None or not person.is_authenticated:
        raise AuthenticationError()
    return person


def member_of_crew(request: HttpRequest, crew_id: UUID | str) -> CrewMembership:
    """The caller's active membership of the crew.

    Anonymous callers get ``401 unauthenticated``. Non-members, removed members and unknown crews
    all get the same ``404 not_found`` so an endpoint never reveals that a crew or trip exists.
    """
    person = current_person(request)
    try:
        require_active_member(str(person.pk), str(crew_id), DjangoCrewStore())
    except NotMember as exc:
        raise ApiError(404, "not_found", "Not found") from exc
    return CrewMembership.objects.select_related("crew").get(
        crew_id=crew_id, person_id=person.pk, status=CrewMembership.Status.ACTIVE
    )
