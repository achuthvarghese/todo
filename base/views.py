from django.shortcuts import render

from base.models import Task


def index(request):
    tasks = Task.objects.all()
    context = {
        "title": "Home",
        "tasks": tasks,
    }
    template = "base/index.html"
    return render(request, template, context)
