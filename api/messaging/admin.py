from django.contrib import admin

from messaging.models import InboundMessage, JobLock, OutboundMessage


@admin.register(OutboundMessage)
class OutboundMessageAdmin(admin.ModelAdmin):
    list_display = ("created_at", "kind", "to_jid", "status", "attempts")
    list_filter = ("kind", "status")
    readonly_fields = ("created_at",)


@admin.register(InboundMessage)
class InboundMessageAdmin(admin.ModelAdmin):
    list_display = ("received_at", "chat_id", "sender_name", "status", "attempts")
    list_filter = ("status", "event")
    search_fields = ("gowa_message_id", "chat_id", "body")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(JobLock)
class JobLockAdmin(admin.ModelAdmin):
    list_display = ("name", "locked_until", "locked_by")
