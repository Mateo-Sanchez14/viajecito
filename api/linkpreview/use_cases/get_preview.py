from linkpreview import ports
from linkpreview.ports import PreviewRef


def get_preview(preview_id: str) -> PreviewRef | None:
    return ports.default_store().get(preview_id)
