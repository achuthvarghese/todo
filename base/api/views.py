from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework.reverse import reverse

from base.api.serializers import TaskSerializer
from base.models import Task


@api_view(["GET"])
def api_root(request, format=None):
    """
    Only the root endpoints
    """
    return Response(
        {"tasks": reverse("base:task-list", request=request, format=format)}
    )


@api_view(["GET", "POST"])
def task_list(request):
    """
    List all Tasks, or create a new Task.
    """
    serializer_context = {"request": request}
    if request.method == "GET":
        tasks = Task.objects.filter(owner=request.user)
        serializer = TaskSerializer(tasks, many=True, context=serializer_context)
        return Response(serializer.data)

    serializer = TaskSerializer(data=request.data, context=serializer_context)
    if serializer.is_valid():
        serializer.save(owner=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(["GET", "PUT", "DELETE"])
def task_detail(request, pk):
    """
    Retrieve, update or delete a Task.
    """
    serializer_context = {"request": request}
    task = get_object_or_404(Task, pk=pk, owner=request.user)

    if request.method == "GET":
        serializer = TaskSerializer(task, context=serializer_context)
        return Response(serializer.data)

    if request.method == "PUT":
        serializer = TaskSerializer(task, data=request.data, context=serializer_context)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    task.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)
