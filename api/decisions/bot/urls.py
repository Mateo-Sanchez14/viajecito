from decisions import conf


def dates_page_url(crew_id: str, trip_id: str) -> str:
    return f"{conf.public_origin()}{dates_page_path(crew_id, trip_id)}"


def dates_page_path(crew_id: str, trip_id: str) -> str:
    return f"/crews/{crew_id}/trips/{trip_id}/dates"
