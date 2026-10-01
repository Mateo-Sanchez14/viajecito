from django.contrib import admin

from crews.models import Crew, CrewMembership, Invite, WhatsAppGroupLink


class WhatsAppGroupLinkInline(admin.StackedInline):
    model = WhatsAppGroupLink
    extra = 0


@admin.register(Crew)
class CrewAdmin(admin.ModelAdmin):
    list_display = ("name", "timezone", "created_at")
    inlines = [WhatsAppGroupLinkInline]


@admin.register(CrewMembership)
class CrewMembershipAdmin(admin.ModelAdmin):
    list_display = ("crew", "person", "role", "source", "status")
    list_filter = ("role", "source", "status")


@admin.register(Invite)
class InviteAdmin(admin.ModelAdmin):
    list_display = ("phone", "crew", "invited_by", "accepted_at", "created_at")
