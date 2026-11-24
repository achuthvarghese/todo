import uuid

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from base.models import Task

User = get_user_model()


class TaskApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user("alice", password="pass")
        self.other = User.objects.create_user("bob", password="pass")
        self.client.force_authenticate(self.user)
        self.task = Task.objects.create(owner=self.user, title="Existing task")
        self.other_task = Task.objects.create(owner=self.other, title="Bob's task")
        self.list_url = reverse("base:task-list")
        self.detail_url = reverse("base:task-detail", args=[self.task.pk])

    def test_list_only_own_tasks(self):
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([t["title"] for t in response.data], ["Existing task"])

    def test_create_task_sets_owner(self):
        response = self.client.post(
            self.list_url,
            {"title": "New", "owner": self.other.pk, "id": str(uuid.uuid4())},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        task = Task.objects.get(title="New")
        self.assertEqual(task.owner, self.user)
        self.assertEqual(str(task.pk), response.data["id"])
        self.assertEqual(task.status, Task.STATUS.PENDING)
        self.assertEqual(task.description, "")
        self.assertNotIn("owner", response.data)

    def test_create_rejects_blank_title(self):
        response = self.client.post(self.list_url, {"title": "  "}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_rejects_long_title(self):
        response = self.client.post(self.list_url, {"title": "x" * 61}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_rejects_unknown_status(self):
        response = self.client.post(
            self.list_url, {"title": "x", "status": "archived"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_retrieve_task(self):
        response = self.client.get(self.detail_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id"], str(self.task.pk))

    def test_missing_task_returns_404(self):
        url = reverse("base:task-detail", args=[uuid.uuid4()])
        for method in ("get", "put", "delete"):
            with self.subTest(method=method):
                response = getattr(self.client, method)(url)
                self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_other_users_task_returns_404(self):
        url = reverse("base:task-detail", args=[self.other_task.pk])
        for method in ("get", "put", "delete"):
            with self.subTest(method=method):
                response = getattr(self.client, method)(
                    url, {"title": "Hijacked"}, format="json"
                )
                self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.other_task.refresh_from_db()
        self.assertEqual(self.other_task.title, "Bob's task")

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


class AnonymousAccessTests(APITestCase):
    def test_api_requires_login(self):
        task = Task.objects.create(
            owner=User.objects.create_user("alice"), title="Private"
        )
        urls = [
            reverse("base:api-root"),
            reverse("base:task-list"),
            reverse("base:task-detail", args=[task.pk]),
        ]
        for url in urls:
            with self.subTest(url=url):
                response = self.client.get(url)
                self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_api_enforces_csrf_for_session_auth(self):
        user = User.objects.create_user("alice", password="pass")
        client = self.client_class(enforce_csrf_checks=True)
        client.force_login(user)
        response = client.post(reverse("base:task-list"), {"title": "x"})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class PageTests(TestCase):
    def test_index_redirects_to_login(self):
        response = self.client.get(reverse("base:index"))
        self.assertRedirects(response, f"{reverse('login')}?next=/")

    def test_login_and_index(self):
        User.objects.create_user("alice", password="pass")
        response = self.client.post(
            reverse("login"), {"username": "alice", "password": "pass"}
        )
        self.assertRedirects(response, reverse("base:index"))
        response = self.client.get(reverse("base:index"))
        self.assertContains(response, "Signed in as alice")

    def test_login_page_shows_error(self):
        response = self.client.post(
            reverse("login"), {"username": "nobody", "password": "wrong"}
        )
        self.assertContains(response, "didn't match")

    def test_logout(self):
        self.client.force_login(User.objects.create_user("alice"))
        response = self.client.post(reverse("logout"))
        self.assertRedirects(response, reverse("login"))


class TaskAdminTests(TestCase):
    def test_mark_done_action(self):
        admin_user = User.objects.create_superuser("admin", "admin@example.com", "pw")
        self.client.force_login(admin_user)
        tasks = [Task.objects.create(owner=admin_user, title=f"T{i}") for i in range(2)]
        response = self.client.post(
            reverse("admin:base_task_changelist"),
            {"action": "mark_done", "_selected_action": [t.pk for t in tasks]},
            follow=True,
        )
        self.assertContains(response, "2 tasks were successfully marked as done.")
        self.assertEqual(Task.objects.filter(status=Task.STATUS.DONE).count(), 2)
