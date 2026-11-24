from django.contrib.auth import login
from django.contrib.auth.decorators import login_required
from django.shortcuts import redirect, render
from django.urls import reverse_lazy
from django.views.decorators.http import require_GET
from django.views.generic import CreateView

from base.forms import SignUpForm

LANDING_CONTEXT = {
    "page_title": "todo. — a bold, simple task manager",
    "page_description": (
        "Plan it. Do it. A bold, simple task manager with a list, a "
        "drag-and-drop board and statistics. Free to use."
    ),
}

# section -> (template, title). Also used by the static site build.
APP_PAGES = {
    "tasks": ("base/tasks.html", "Tasks"),
    "board": ("base/board.html", "Board"),
    "stats": ("base/stats.html", "Statistics"),
}


def app_page_context(section):
    _, title = APP_PAGES[section]
    return {"section": section, "page_title": f"{title} — todo.", "noindex": True}


@require_GET
def home(request):
    if request.user.is_authenticated:
        return redirect("base:tasks")
    return render(request, "base/landing.html", LANDING_CONTEXT)


def _app_page(section):
    @login_required
    @require_GET
    def view(request):
        return render(request, APP_PAGES[section][0], app_page_context(section))

    return view


tasks = _app_page("tasks")
board = _app_page("board")
stats = _app_page("stats")


class SignUpView(CreateView):
    form_class = SignUpForm
    template_name = "registration/signup.html"
    success_url = reverse_lazy("base:tasks")
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
