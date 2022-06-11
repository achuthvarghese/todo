from django.contrib import admin, messages
from django.utils.translation import ngettext

from base.models import Task


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = ("title", "status", "created_at", "updated_at")
    list_filter = ("status",)
    actions = ("mark_done",)

    @admin.action(description="Mark selected tasks as Done")
    def mark_done(self, request, queryset):
        try:
            updated = queryset.update(status=Task.STATUS.DONE)
            self.message_user(
                request,
                ngettext(
                    "%d story was successfully marked as done.",
                    "%d stories were successfully marked as done.",
                    updated,
                )
                % updated,
                messages.SUCCESS,
            )
        except Exception:
            self.message_user(
                request,
                ngettext(
                    "%d story was not successfully marked as done.",
                    "%d stories were not successfully marked as done.",
                    updated,
                )
                % updated,
                messages.ERROR,
            )
