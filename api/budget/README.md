# Budget forecast

Computed from chosen/booked proposal snapshots through the public use-case bridge. No cached totals or
budget tables. Decimal math uses FX units per unit of trip currency; missing FX/prices are explicit.
Proposal dates take precedence for nights; trip dates are the fallback, unknown dates assume one night.
Same-day dates have zero nights. Totals round once with HALF_UP, then the per-person share; signed
remainder is always reported. Whole pesos for ARS, CLP, PYG and UYU; USD/EUR/BRL use two decimals.

Participants prefer RSVP in, then in+maybe, then one flagged minimum. FX writes go through the core
update_trip use case after member authorization. Run `uv run pytest budget` for domain/API checks.
