from django.contrib import admin

from linkpreview.models import LinkPreview


@admin.register(LinkPreview)
class LinkPreviewAdmin(admin.ModelAdmin):
    list_display = ("canonical_url", "title", "fetch_status", "fetch_attempts", "fetched_at")
    list_filter = ("fetch_status",)
    search_fields = ("canonical_url", "title")
    readonly_fields = ("raw",)
