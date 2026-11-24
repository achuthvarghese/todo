from django.contrib.auth.decorators import login_required
from django.shortcuts import render


@login_required
def index(request):
    context = {"title": "Home"}
    return render(request, "base/index.html", context)
