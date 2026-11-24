from rest_framework.routers import DefaultRouter

from base.api import views

router = DefaultRouter()
router.register("tasks", views.TaskViewSet, basename="task")

urlpatterns = router.urls
