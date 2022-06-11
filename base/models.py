import uuid

from django.db import models


class Task(models.Model):
    class STATUS(models.TextChoices):
        PENDING = "pending", "Pending"
        IN_PROGRESS = "in_progress", "In Progress"
        DONE = "done", "Done"

    id = models.UUIDField(
        primary_key=True, default=uuid.uuid4, editable=False, unique=True
    )
    title = models.CharField(max_length=60)
    description = models.TextField(null=True, blank=True)
    status = models.CharField(max_length=15, choices=STATUS.choices, default=STATUS.PENDING)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title
