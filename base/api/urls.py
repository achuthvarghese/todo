from django.urls import include, path

from base.api import views

urlpatterns = [
    path("", views.api_root, name="api-root"),
    path("tasks/", views.task_list, name="task-list"),
    path("tasks/<uuid:pk>", views.task_detail, name="task-detail"),
    path("auth/", include("rest_framework.urls", namespace="rest_framework")),
]
