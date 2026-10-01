from linkpreview import ports
from linkpreview.ports import PreviewRef
from linkpreview.use_cases.prepare_preview import prepare_preview


def request_preview(url: str) -> PreviewRef:
    """The preview of ``url`` right now (cached, or a ``pending`` row) and queue the unfurl.

    The web path: the request answers at once and the fetch runs off-request.
    """
    prepared = prepare_preview(url)
    if prepared.needs_fetch:
        ports.default_scheduler().schedule(prepared.ref.id)
    return prepared.ref
