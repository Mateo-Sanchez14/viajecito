from django.contrib import admin
from django.urls import path

from config.api import api
from messaging.webhooks import gowa_webhook

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", api.urls),
    path("hooks/gowa/", gowa_webhook),
]
