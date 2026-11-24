import zoneinfo

from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from base.api.serializers import TaskSerializer
from base.models import Task
from base.stats import compute_stats


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


class StatsView(APIView):
    """
    Statistics for the signed-in user's tasks. Pass ?tz=<IANA zone> (for
    example Europe/London) to group days and weeks in that time zone.
    """

    def get(self, request):
        tz_name = request.query_params.get("tz")
        tz = timezone.get_current_timezone()
        if tz_name:
            try:
                tz = zoneinfo.ZoneInfo(tz_name)
            except (zoneinfo.ZoneInfoNotFoundError, ValueError):
                return Response(
                    {"tz": ["Unknown time zone."]}, status=status.HTTP_400_BAD_REQUEST
                )
        return Response(compute_stats(request.user, tz))
