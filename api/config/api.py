from ninja import NinjaAPI

from config.version import VERSION
from ops.api import router as ops_router

api = NinjaAPI(title="viajecito", version=VERSION, urls_namespace="api")
api.add_router("", ops_router, tags=["ops"])
