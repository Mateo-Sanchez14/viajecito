"""Trip-level authorization for Ninja endpoints (see ``crews.api_auth`` for the crew one)."""

from typing import NamedTuple
from uuid import UUID

from django.http import HttpRequest

from crews.api_auth import current_person, member_of_crew
from crews.models import CrewMembership
from shared.api_errors import ApiError
from trips.models import Trip


class TripAccess(NamedTuple):
    trip: Trip
    membership: CrewMembership


def member_of_trip(request: HttpRequest, trip_id: UUID | str) -> TripAccess:
    """The trip and the caller's active membership of its crew.

    Anonymous callers get ``401``; unknown trips and trips of other crews both get
    ``404 not_found``, so a trip's existence is never revealed to outsiders.
    """
    current_person(request)  # anonymous callers get 401 before we look the trip up
    trip = Trip.objects.filter(pk=trip_id).first()
    if trip is None:
        raise ApiError(404, "not_found", "Not found")
    return TripAccess(trip=trip, membership=member_of_crew(request, trip.crew_id))
