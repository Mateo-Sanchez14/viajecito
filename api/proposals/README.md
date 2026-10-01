# proposals

Links and ideas the crew may do on a trip. A link dropped in the WhatsApp group (or added on the web)
becomes a proposal with a preview, a category, votes and comments, and a status that moves
`proposed → discussing → chosen → booked`, with `discarded` from anywhere.

## Layout

`domain/` (status graph, tally and majority, classifier, card, verbs, rules; pure) · `use_cases/`
(store-based: `create_proposal`, `capture_link`, `transition_proposal`, `cast_vote`, `add_comment`,
`update_proposal`, `list_proposals`, `apply_preview`, `majority_suggestions`) · `adapters/` (Django store,
linkpreview bridge, LLM classifier, wiring) · `api.py` + `schemas.py` · `bot/` (WhatsApp handlers) ·
`copy/es_ar.py` (all bot copy).

## What `ProposalsConfig.ready()` registers

| Registry | Entry |
|---|---|
| `register_handler(20, …)` | `bot/quoted_card.py`: reply to a proposal card (`+1`, `elegida`, `descartar`, `comentario: …`) |
| `register_handler(30, …)` | `bot/link_capture.py`: a message with a URL becomes a proposal and one threaded card |
| `register_subcommand("propuestas")` | `/viaje propuestas`: top 5 open proposals |
| `register_reminder_rule("proposals.majority")` | suggests choosing a proposal once a majority of the people `in` voted +1 (`proposals:majority:<id>`, once per proposal ever) |
| `events.subscribe("linkpreview.preview_fetched")` | fills a placeholder title/price/category when the unfurl lands |

`transition_proposal` publishes `proposal.status_changed` (`proposal_id`, `trip_id`, `from_status`,
`to_status`, `actor_id`, `occurred_at`) inside the transition's transaction; the web, the bot and the
automatic `proposed → discussing` (first comment or first non-zero vote) all go through it.

## Rules worth knowing

- Dedupe key: `(trip, canonical_url)` after stripping tracking parameters (Maps short links after the
  redirect). The same link again adds the sender's +1 (unless they voted) and the text as a comment.
- Majority counts only +1s of participants whose RSVP is `in`, needs at least 2 of them and more than half.
- The classifier is rule-based (host table + keywords); an OpenAI-compatible LLM is consulted only when the
  rules are below 0.5 confidence, and any failure keeps the rule result. A category a person edits is
  never re-classified.
- A thumbnail is served only by `GET /api/proposals/{id}/thumbnail` (member-authorized); nothing is
  linked from `/media/`.

## Settings (`proposals/conf.py`, read with defaults)

`PUBLIC_ORIGIN` (card links; must be `https://` in production), `PROPOSALS_LLM_CLASSIFIER_ENABLED` (`0`),
`PROPOSALS_LLM_BASE_URL`, `PROPOSALS_LLM_API_KEY`, `PROPOSALS_LLM_MODEL`.

## Try it

```sh
LINKPREVIEW_FETCHER=static uv run python manage.py runserver 0.0.0.0:8000
uv run python manage.py replay_gowa proposals/tests/fixtures/gowa/group_link.json
```
