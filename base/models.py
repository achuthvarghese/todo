import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


class Task(models.Model):
    class STATUS(models.TextChoices):
        PENDING = "pending", "Pending"
        IN_PROGRESS = "in_progress", "In Progress"
        DONE = "done", "Done"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="tasks"
    )
    title = models.CharField(max_length=60)
    description = models.TextField(blank=True, default="")
    status = models.CharField(
        max_length=15, choices=STATUS.choices, default=STATUS.PENDING
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    completed_at = models.DateTimeField(null=True, blank=True, editable=False)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["owner", "status"])]

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        # Keep completed_at in step with the status so statistics can tell
        # when a task was finished.
        if self.status == self.STATUS.DONE:
            if self.completed_at is None:
                self.completed_at = timezone.now()
        else:
            self.completed_at = None
        update_fields = kwargs.get("update_fields")
        if update_fields is not None and "status" in update_fields:
            kwargs["update_fields"] = {*update_fields, "completed_at"}
        super().save(*args, **kwargs)
