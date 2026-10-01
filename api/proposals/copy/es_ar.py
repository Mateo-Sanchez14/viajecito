"""WhatsApp copy of the proposals app (Rioplatense Spanish, voseo): the only Spanish in it."""

CARD = (
    "{emoji} *{title}*\n{category_label}{price_line}\n{site_line}👉 {url}\n"
    'Respondé a este mensaje con +1, -1, "elegida" o "descartar".'
)
CATEGORY_LABELS = {
    "lodging": "Alojamiento",
    "transport": "Transporte",
    "activity": "Actividad",
    "food": "Comida",
    "gear": "Equipo",
    "destination": "Destino",
    "other": "Otro",
}
CATEGORY_EMOJI = {
    "lodging": "🏠",
    "transport": "🚌",
    "activity": "🎿",
    "food": "🍽️",
    "gear": "🧤",
    "destination": "📍",
    "other": "🔗",
}
PRICE_LINE = " · {amount} {currency}{basis}"
PRICE_BASIS = {"total": "", "per_person": " por persona", "per_night": " por noche"}
SITE_LINE = "{site_name}\n"

ALREADY_THERE = "Ya estaba 👀 (la propuso {author}). Te sumé un +1."
ALREADY_THERE_VOTED = "Ya estaba 👀 (la propuso {author})."
NO_ACTIVE_TRIP = "Todavía no hay un viaje activo. Creá uno en {url} y volvé a tirar el link."
TOO_MANY_LINKS = "Guardé los primeros 3 links; el resto mandalo de a poco."

VOTE_LABELS = {1: "+1", 0: "meh", -1: "-1"}
VOTE_RECORDED = "Anotado: {vote_label} para {title} ({up} a favor, {down} en contra)."
PROPOSAL_CLOSED = "{title} está descartada. Reabrila para volver a votar."
STATUS_LABELS = {
    "proposed": "propuesta",
    "discussing": "en discusión",
    "chosen": "elegida",
    "booked": "reservada",
    "discarded": "descartada",
}
STATUS_CHANGED = "Listo, {title} quedó como {status_label}."
INVALID_TRANSITION = "No puedo pasar {title} de {from_label} a {to_label}."
COMMENT_ADDED = "Anotado tu comentario en {title}."
MAJORITY_SUGGESTION = (
    "Parece que ganó {title} ({up} de {in_count}). ¿La marcamos como elegida? "
    'Respondé "elegida" a la tarjeta o entrá a {url}.'
)

HELP_PROPUESTAS = "/viaje propuestas — las más votadas"
PROPUESTAS_HEADER = "Las propuestas más votadas:"
PROPUESTAS_LINE = "{n}) {title} · {status_label} · +{up}/-{down}"
PROPUESTAS_EMPTY = "Todavía no hay propuestas abiertas. Tirá un link en el grupo."
PROPUESTAS_URL = "Todas acá: {url}"
