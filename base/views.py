from django.contrib.auth import login
from django.contrib.auth.decorators import login_required
from django.shortcuts import redirect, render
from django.urls import reverse_lazy
from django.views.decorators.http import require_GET
from django.views.generic import CreateView

from base.forms import SignUpForm


@require_GET
def home(request):
    if request.user.is_authenticated:
        return _legacy_index(request)
    context = {
        "page_title": "todo. — a bold, simple task manager",
        "page_description": (
            "Plan it. Do it. A bold, simple task manager with a list, a "
            "drag-and-drop board and statistics. Free to use."
        ),
    }
    return render(request, "base/landing.html", context)


@login_required
def _legacy_index(request):
    return render(request, "base/index.html", {"title": "Home", "noindex": True})


class SignUpView(CreateView):
    form_class = SignUpForm
    template_name = "registration/signup.html"
    success_url = reverse_lazy("base:home")
    extra_context = {
        "page_title": "Create an account — todo.",
        "page_description": (
            "Create a free todo. account to organise your tasks in a list or "
            "on a board and track your progress."
        ),
    }

    def dispatch(self, request, *args, **kwargs):
        if request.user.is_authenticated:
            return redirect(self.success_url)
        return super().dispatch(request, *args, **kwargs)

    def form_valid(self, form):
        response = super().form_valid(form)
        login(self.request, self.object)
        return response


@require_GET
def robots_txt(request):
    return render(request, "robots.txt", content_type="text/plain")
