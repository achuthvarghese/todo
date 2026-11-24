from django.contrib import admin, messages
from django.utils import timezone
from django.utils.translation import ngettext

from base.models import Task


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = ("title", "owner", "status", "created_at", "completed_at")
    list_filter = ("status",)
    search_fields = ("title", "owner__username")
    list_select_related = ("owner",)
    actions = ("mark_done",)

    @admin.action(description="Mark selected tasks as Done")
    def mark_done(self, request, queryset):
        try:
            updated = queryset.count()
            queryset.exclude(status=Task.STATUS.DONE).update(
                status=Task.STATUS.DONE, completed_at=timezone.now()
            )
        except Exception:
            self.message_user(
                request,
                "The selected tasks could not be marked as done.",
                messages.ERROR,
            )
            return
        self.message_user(
            request,
            ngettext(
                "%d task was successfully marked as done.",
                "%d tasks were successfully marked as done.",
                updated,
            )
            % updated,
            messages.SUCCESS,
        )
