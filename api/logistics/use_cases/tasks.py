from crews.use_cases.active_member_ids import active_member_ids
from logistics.domain import LogisticsError, transition_changes, validate_task
from logistics.ports import TaskStore


def validate_owner(owner_id, crew_id):
    if owner_id is not None and str(owner_id) not in active_member_ids(str(crew_id)):
        raise LogisticsError("invalid_owner", "Owner must be an active crew member")


def create_task(trip_id, crew_id, actor_id, fields, store: TaskStore):
    fields = validate_task(fields)
    validate_owner(fields.get("owner_id"), crew_id)
    with store.atomic():
        return store.create(trip_id, actor_id, fields)


def update_task(task_id, crew_id, actor_id, fields, store: TaskStore, now):
    with store.atomic():
        task = store.get(task_id, lock=True)
        if task is None:
            raise LogisticsError("not_found", "Not found")
        if "owner_id" in fields:
            validate_owner(fields["owner_id"], crew_id)
        return store.update(task_id, transition_changes(task, fields, actor_id, now))
