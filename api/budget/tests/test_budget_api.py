import pytest

from logistics.tests.conftest import send
from proposals.models import Proposal

pytestmark = pytest.mark.django_db


def test_forecast_and_fx_auth(trip, ana, stranger, as_person, anon):
    url = f"/api/trips/{trip.pk}/budget"
    client = as_person(ana)
    assert anon.get(url).status_code == 401 and as_person(stranger).get(url).status_code == 404
    Proposal.objects.create(
        trip=trip,
        author=ana,
        title="Cabin",
        category="lodging",
        status="chosen",
        est_price="10000",
        currency="ARS",
        price_basis="total",
    )
    assert client.get(url).json()["unconverted"]
    result = send(client, "put", url + "/fx_rates", {"rates": {"ARS": "1000"}})
    assert result.status_code == 200 and result.json()["total"] == "10.00"
    trip.refresh_from_db()
    assert trip.fx_rates["ARS"] == "1000"
    for rates in [{"USD": "1"}, {"ARS": "0"}, {"ars": "10"}, {"ARS": "NaN"}]:
        assert (
            send(client, "put", url + "/fx_rates", {"rates": rates}).json()["code"]
            == "invalid_fx_rates"
        )


def test_destination_proposal_can_have_budget(trip, ana, as_person):
    Proposal.objects.create(
        trip=trip,
        author=ana,
        title="Village",
        category="destination",
        status="booked",
        est_price="15",
        currency="USD",
    )
    response = as_person(ana).get(f"/api/trips/{trip.pk}/budget")
    assert response.status_code == 200 and response.json()["committed"] == "15.00"
