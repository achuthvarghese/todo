import uuid

from django.db import models


class Task(models.Model):
    PENDING = "pending"
    DONE = "done"
    STATUS = ((PENDING, PENDING.capitalize()), (DONE, DONE.capitalize()))

    id = models.UUIDField(
        primary_key=True, default=uuid.uuid4, editable=False, unique=True
    )
    title = models.CharField(max_length=60)
    description = models.TextField(null=True, blank=True)
    status = models.CharField(max_length=10, choices=STATUS, default=PENDING)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title
