"""Contract-derived parallel draft; replace with the real shared schema at integration."""
import json
from pathlib import Path
s = lambda: {"type": "string"}
n = lambda: {"type": "number"}
b = lambda: {"type": "boolean"}
nullable = lambda value: {"anyOf": [value, {"type": "null"}]}
ref = lambda name: {"$ref": f"#/components/schemas/{name}"}
arr = lambda value: {"type": "array", "items": value}
enum = lambda values: {"type": "string", "enum": values.split()}
def obj(props, required=None):
    return {"type": "object", "properties": props, "required": list(props) if required is None else required}
entry = dict(id=s(), trip_id=s(), day_date=nullable(s()), starts_at=nullable(s()), ends_at=nullable(s()), start_time=nullable(s()), end_time=nullable(s()), kind=enum("activity transport lodging meal meeting ski other"), title=s(), location_label=s(), lat=nullable(n()), lng=nullable(n()), is_meeting_point=b(), proposal_id=nullable(s()), source=enum("manual proposal"), position=n(), notes=s())
entry_in = {key: value for key, value in entry.items() if key not in {"id", "trip_id", "starts_at", "ends_at", "proposal_id", "source", "position"}}
schemas = {
    "EntryOut": obj(entry), "EntryCreateIn": obj(entry_in, ["title"]), "EntryPatchIn": obj(entry_in, []),
    "DayOut": obj(dict(date=nullable(s()), title=s(), notes=s(), is_virtual=b(), entries=arr(ref("EntryOut")))),
    "DayIn": obj(dict(title=s(), notes=s()), []), "MoveIn": obj(dict(direction=enum("up down"))),
    "ItineraryOut": obj(dict(timezone=s(), start_on=nullable(s()), end_on=nullable(s()), days=arr(ref("DayOut")), tray=arr(ref("EntryOut")), out_of_range=arr(ref("EntryOut")))),
    "PersonRefOut": obj(dict(person_id=s(), display_name=s())),
    "NoteOut": obj(dict(id=s(), author=ref("PersonRefOut"), body=s(), pinned=b(), created_at=s(), can_delete=b())),
    "NoteCreateIn": obj(dict(body=s(), pinned=b()), ["body"]), "NotePatchIn": obj(dict(body=s(), pinned=b()), []),
    "TodayOut": obj(dict(mode=enum("undated before during after"), local_date=s(), local_time=s(), timezone=s(), countdown_days=nullable(n()), day=nullable(ref("DayOut")), now_entry=nullable(ref("EntryOut")), next_entry=nullable(ref("EntryOut")), next_meeting_point=nullable(ref("EntryOut")), pinned_notes=arr(ref("NoteOut")), recent_notes=arr(ref("NoteOut")), generated_at=s())),
    "ErrorOut": obj(dict(code=s(), message=s())),
}
paths = {}
def endpoint(path, method, output, status=200, request=None, query=None):
    import re
    params = [{"name": name, "in": "path", "required": True, "schema": s()} for name in re.findall(r"\{(.*?)\}", path)]
    if query: params.append({"name": query, "in": "query", "schema": b()})
    responses = {str(status): {"description": "Success"}}
    if output: responses[str(status)]["content"] = {"application/json": {"schema": output}}
    if path.endswith("/today"): responses["304"] = {"description": "Unchanged"}
    for error in (400, 403, 404, 409): responses[str(error)] = {"description": "Error", "content": {"application/json": {"schema": ref("ErrorOut")}}}
    operation = {"parameters": params, "responses": responses}
    if request: operation["requestBody"] = {"required": True, "content": {"application/json": {"schema": ref(request)}}}
    paths.setdefault(path, {})[method] = operation
base = "/api/trips/{trip_id}"
endpoint(base+"/itinerary", "get", ref("ItineraryOut"))
endpoint(base+"/itinerary/days/{date}", "put", ref("DayOut"), request="DayIn")
endpoint(base+"/itinerary/entries", "post", ref("EntryOut"), 201, "EntryCreateIn")
endpoint("/api/itinerary_entries/{entry_id}", "patch", ref("EntryOut"), request="EntryPatchIn")
endpoint("/api/itinerary_entries/{entry_id}", "delete", None, 204)
endpoint("/api/itinerary_entries/{entry_id}/move", "post", ref("DayOut"), request="MoveIn")
endpoint(base+"/notes", "get", arr(ref("NoteOut")), query="pinned")
endpoint(base+"/notes", "post", ref("NoteOut"), 201, "NoteCreateIn")
endpoint("/api/notes/{note_id}", "patch", ref("NoteOut"), request="NotePatchIn")
endpoint("/api/notes/{note_id}", "delete", None, 204)
endpoint(base+"/today", "get", ref("TodayOut"))
Path(__file__).with_name("draft.openapi.json").write_text(json.dumps({"openapi":"3.0.3","info":{"title":"M4 parallel draft","version":"1"},"paths":paths,"components":{"schemas":schemas}}, indent=2)+"\n")
