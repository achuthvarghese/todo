import uuid

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from base.models import Task


class TaskApiTests(APITestCase):
    def setUp(self):
        self.task = Task.objects.create(title="Existing task")
        self.list_url = reverse("base:task-list")
        self.detail_url = reverse("base:task-detail", args=[self.task.pk])

    def test_list_tasks(self):
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([t["title"] for t in response.data], ["Existing task"])

    def test_create_task(self):
        response = self.client.post(self.list_url, {"title": "New"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["status"], Task.STATUS.PENDING)
        self.assertTrue(Task.objects.filter(title="New").exists())

    def test_create_rejects_blank_title(self):
        response = self.client.post(self.list_url, {"title": "  "}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_rejects_long_title(self):
        response = self.client.post(self.list_url, {"title": "x" * 61}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_retrieve_task(self):
        response = self.client.get(self.detail_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id"], str(self.task.pk))

    def test_missing_task_returns_404(self):
        for method in ("get", "put", "delete"):
            with self.subTest(method=method):
                url = reverse("base:task-detail", args=[uuid.uuid4()])
                response = getattr(self.client, method)(url)
                self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_update_task(self):
        response = self.client.put(
            self.detail_url,
            {"title": "Renamed", "status": Task.STATUS.DONE},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.task.refresh_from_db()
        self.assertEqual(self.task.title, "Renamed")
        self.assertEqual(self.task.status, Task.STATUS.DONE)

    def test_delete_task(self):
        response = self.client.delete(self.detail_url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Task.objects.filter(pk=self.task.pk).exists())


class TaskAdminTests(APITestCase):
    def test_mark_done_action(self):
        admin_user = get_user_model().objects.create_superuser(
            "admin", "admin@example.com", "pass"
        )
        self.client.force_login(admin_user)
        tasks = [Task.objects.create(title=f"Task {i}") for i in range(2)]
        response = self.client.post(
            reverse("admin:base_task_changelist"),
            {"action": "mark_done", "_selected_action": [t.pk for t in tasks]},
            follow=True,
        )
        self.assertContains(response, "2 tasks were successfully marked as done.")
        self.assertEqual(
            Task.objects.filter(status=Task.STATUS.DONE).count(), len(tasks)
        )
