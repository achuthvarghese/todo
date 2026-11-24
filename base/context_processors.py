from django.conf import settings
from django.contrib.auth import get_user_model
from django.urls import reverse

from base.demo import DEMO_PASSWORD, DEMO_USERNAME

DEFAULT_DESCRIPTION = (
    "todo. is a bold, simple task manager: list your tasks, move them across "
    "a board and see your progress in clear statistics."
)


def seo(request):
    return {"default_description": DEFAULT_DESCRIPTION}


def demo_login(request):
    """Show the demo account's login details, but only in development."""
    if not settings.DEBUG or request.path != reverse("login"):
        return {}

    if not get_user_model().objects.filter(username=DEMO_USERNAME).exists():
        return {}
    return {"demo_login": {"username": DEMO_USERNAME, "password": DEMO_PASSWORD}}
