from ninja import NinjaAPI

from config.version import VERSION
from identity.api import router as identity_router
from ops.api import router as ops_router
from shared.api_errors import register_error_handlers

api = NinjaAPI(title="viajecito", version=VERSION, urls_namespace="api")
register_error_handlers(api)
api.add_router("", ops_router, tags=["ops"])
api.add_router("", identity_router)
