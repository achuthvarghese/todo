from rest_framework import viewsets

from base.api.serializers import TaskSerializer
from base.models import Task


class TaskViewSet(viewsets.ModelViewSet):
    """
    List, create, retrieve, update, partially update and delete the
    signed-in user's tasks.
    """

    serializer_class = TaskSerializer

    def get_queryset(self):
        return Task.objects.filter(owner=self.request.user)

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)
