from django.contrib import admin

from proposals.models import Comment, Proposal, Vote


class VoteInline(admin.TabularInline):
    model = Vote
    extra = 0


@admin.register(Proposal)
class ProposalAdmin(admin.ModelAdmin):
    list_display = ("title", "trip", "category", "status", "created_at")
    list_filter = ("status", "category")
    search_fields = ("title", "canonical_url")
    inlines = [VoteInline]


@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    list_display = ("proposal", "author", "created_at")
