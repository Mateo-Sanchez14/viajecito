"""Pure group-safe Today rendering; never resolve or include person phone fallbacks."""

from zoneinfo import ZoneInfo

from itinerary.copy import es_ar as copy


def render_today(trip, snapshot, url, sections=(), tomorrow=False):
    if snapshot.mode == "during":
        lines = [
            copy.HOY_HEADER.format(
                weekday=copy.WEEKDAYS[snapshot.local_date.weekday()],
                day=snapshot.local_date.day,
                trip=trip.name,
            )
        ]
    elif snapshot.mode == "before":
        lines = [
            copy.DIGEST_TOMORROW.format(trip=trip.name)
            if tomorrow
            else copy.HOY_BEFORE.format(days=snapshot.countdown_days, trip=trip.name)
        ]
    elif snapshot.mode == "after":
        lines = [copy.HOY_AFTER.format(trip=trip.name)]
    else:
        lines = [copy.HOY_UNDATED.format(trip=trip.name)]
    tz = ZoneInfo(trip.timezone)
    for entry in snapshot.entries:
        time = entry.starts_at.astimezone(tz).strftime("%H:%M") if entry.starts_at else copy.UNTIMED
        lines.append(
            copy.ENTRY_LINE.format(
                time=time,
                marker="📍 " if entry.is_meeting_point else "",
                title=entry.title,
                location=copy.LOCATION.format(label=entry.location_label)
                if entry.location_label
                else "",
            )
        )
    if not snapshot.entries and snapshot.mode in ("during", "before"):
        lines.append(copy.NO_PLAN.format(url=url))
    if snapshot.pinned_notes and snapshot.mode in ("before", "during"):
        lines.append(copy.PINNED_HEADER)
        lines.extend(n.body for n in snapshot.pinned_notes)
    lines.extend(sections)
    point = snapshot.next_meeting_point
    if point:
        lines.append(
            copy.MEETING_POINT_LINE.format(
                title=point.title,
                time=point.starts_at.astimezone(tz).strftime("%H:%M"),
                location=copy.LOCATION.format(label=point.location_label)
                if point.location_label
                else "",
            )
        )
    link = copy.LINK_LINE.format(url=url)
    budget = max(0, 4000 - len(link) - 1)
    return "\n".join(lines)[:budget] + "\n" + link
