from uuid import UUID

from ninja import Router
from ninja.security import django_auth

from budget.schemas import BudgetOut, FxRatesIn
from budget.use_cases.get_budget import get_budget
from shared.api_errors import ApiError, ErrorOut
from trips.api_auth import member_of_trip
from trips.use_cases.update_trip import update_trip

router = Router(tags=["budget"], auth=django_auth)
COMMON = {400: ErrorOut, 401: ErrorOut, 403: ErrorOut, 404: ErrorOut}


def output(trip_id, access):
    result = get_budget(str(trip_id))
    result["gastito_url"] = access.trip.crew.gastito_group_url
    return result


@router.get("/trips/{trip_id}/budget", response={200: BudgetOut, **COMMON})
def get(request, trip_id: UUID):
    return output(trip_id, member_of_trip(request, trip_id))


@router.put("/trips/{trip_id}/budget/fx_rates", response={200: BudgetOut, **COMMON})
def put_rates(request, trip_id: UUID, payload: FxRatesIn):
    access = member_of_trip(request, trip_id)
    if access.trip.currency in payload.rates:
        raise ApiError(400, "invalid_fx_rates", "Trip currency must not have a manual rate")
    try:
        update_trip(str(trip_id), str(request.user.pk), fx_rates=payload.rates)
    except ValueError as exc:
        raise ApiError(400, "invalid_fx_rates", str(exc)) from exc
    return output(trip_id, access)
