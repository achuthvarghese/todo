from django.shortcuts import render


def index(request):
    context = {
        "title": "Home",
    }
    template = "base/index.html"
    return render(request, template, context)
