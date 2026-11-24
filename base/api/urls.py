from django.urls import path
from rest_framework.routers import DefaultRouter

from base.api import views

router = DefaultRouter()
router.register("tasks", views.TaskViewSet, basename="task")

urlpatterns = [
    path("stats/", views.StatsView.as_view(), name="stats"),
    *router.urls,
]
