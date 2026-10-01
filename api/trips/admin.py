from django.contrib import admin

from trips.models import Participation, Trip


class ParticipationInline(admin.TabularInline):
    model = Participation
    extra = 0


@admin.register(Trip)
class TripAdmin(admin.ModelAdmin):
    list_display = ("name", "crew", "type", "status", "start_on", "end_on")
    list_filter = ("type", "status")
    inlines = [ParticipationInline]
