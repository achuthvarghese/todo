from django.urls import include, path

from base import views

app_name = "base"

urlpatterns = [
    path("", views.home, name="home"),
    path("api/", include("base.api.urls")),
]
