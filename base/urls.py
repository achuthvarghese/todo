from django.urls import include, path

from base import views

app_name = "base"

urlpatterns = [
    path("", views.home, name="home"),
    path("tasks/", views.tasks, name="tasks"),
    path("board/", views.board, name="board"),
    path("stats/", views.stats, name="stats"),
    path("api/", include("base.api.urls")),
]
