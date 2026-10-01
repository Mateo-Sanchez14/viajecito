from django.contrib import admin

from messaging.models import OutboundMessage


@admin.register(OutboundMessage)
class OutboundMessageAdmin(admin.ModelAdmin):
    list_display = ("created_at", "kind", "to_jid", "status", "attempts")
    list_filter = ("kind", "status")
    readonly_fields = ("created_at",)
