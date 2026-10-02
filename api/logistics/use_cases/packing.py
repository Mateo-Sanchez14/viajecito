from logistics.copy.es_ar import PACKING_LABELS
from logistics.domain import LogisticsError
from logistics.packing import TEMPLATES


def apply_template(trip_id, person_id, key, store):
    template = TEMPLATES.get(key)
    if template is None:
        raise LogisticsError("unknown_template", "Unknown packing template")
    with store.atomic():
        for section in template.sections:
            for item in section.items:
                store.ensure_item(
                    trip_id,
                    person_id,
                    item.key,
                    section.key,
                    PACKING_LABELS[key][item.key],
                    item.default_quantity,
                )
        store.mark_applied(trip_id, person_id, key)
