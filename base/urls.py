from django.urls import include, path

from base import views

app_name = "base"

urlpatterns = [
    path("", views.index, name="index"),
    path("api/", include("base.api.urls"), name="base-api"),
]
