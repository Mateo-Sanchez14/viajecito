"""Compose the existing origin setting into the pure draft producer."""

from itinerary.conf import public_origin
from itinerary.use_cases.morning_digest import morning_digest


def morning_rule(ctx):
    return morning_digest(ctx, origin=public_origin())
