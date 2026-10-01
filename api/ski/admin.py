from django.contrib import admin

from ski.models import (
    GearPlan,
    LiftPass,
    Resort,
    SkiProfile,
    SnowFetchState,
    SnowReport,
    TripResort,
)


@admin.register(Resort)
class ResortAdmin(admin.ModelAdmin):
    list_display = ("name", "country", "region", "provider", "active")
    list_filter = ("country", "active", "provider")
    search_fields = ("name", "slug")


@admin.register(TripResort)
class TripResortAdmin(admin.ModelAdmin):
    list_display = ("trip", "resort", "nights", "position")


@admin.register(SnowReport)
class SnowReportAdmin(admin.ModelAdmin):
    """History: browse only."""

    list_display = ("resort", "source", "observed_at", "base_cm", "new_24h_cm")
    list_filter = ("source",)
    readonly_fields = [f.name for f in SnowReport._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(SnowFetchState)
class SnowFetchStateAdmin(admin.ModelAdmin):
    list_display = ("resort", "last_success_at", "consecutive_failures", "last_error")


@admin.register(SkiProfile)
class SkiProfileAdmin(admin.ModelAdmin):
    """Sizes, height and weight are sensitive: never in a list display or a search."""

    list_display = ("person", "discipline", "level")
    list_filter = ("discipline", "level")


@admin.register(LiftPass)
class LiftPassAdmin(admin.ModelAdmin):
    list_display = ("trip", "person", "resort", "status")


@admin.register(GearPlan)
class GearPlanAdmin(admin.ModelAdmin):
    list_display = ("trip", "person", "item", "mode")
