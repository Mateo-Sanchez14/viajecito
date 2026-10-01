from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from identity.models import Person, WhatsAppIdentity


@admin.register(Person)
class PersonAdmin(UserAdmin):
    ordering = ("phone",)
    list_display = ("phone", "display_name", "is_active", "is_staff")
    search_fields = ("phone", "display_name")
    fieldsets = (
        (None, {"fields": ("phone", "password")}),
        ("Profile", {"fields": ("display_name", "locale")}),
        (
            "Permissions",
            {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")},
        ),
    )
    add_fieldsets = ((None, {"classes": ("wide",), "fields": ("phone", "password1", "password2")}),)


@admin.register(WhatsAppIdentity)
class WhatsAppIdentityAdmin(admin.ModelAdmin):
    list_display = ("jid", "lid", "person")
    search_fields = ("jid", "lid")
