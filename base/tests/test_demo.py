from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import CommandError, call_command
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from base.demo import DEMO_PASSWORD, DEMO_USERNAME
from base.models import Task

User = get_user_model()


def seed(**kwargs):
    out = StringIO()
    call_command("seed_demo", stdout=out, **kwargs)
    return out.getvalue()


class SeedDemoTests(TestCase):
    @override_settings(DEBUG=False)
    def test_refuses_outside_development(self):
        with self.assertRaisesMessage(CommandError, "only runs in development"):
            seed()
        self.assertFalse(User.objects.filter(username=DEMO_USERNAME).exists())

    @override_settings(DEBUG=True)
    def test_creates_regular_demo_user_with_tasks(self):
        output = seed()
        user = User.objects.get(username=DEMO_USERNAME)
        self.assertTrue(user.check_password(DEMO_PASSWORD))
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)
        tasks = Task.objects.filter(owner=user)
        self.assertEqual(tasks.count(), 60)
        statuses = set(tasks.values_list("status", flat=True))
        self.assertEqual(statuses, {"pending", "in_progress", "done"})
        now = timezone.now()
        for task in tasks:
            self.assertLessEqual(task.created_at, now)
            if task.status == Task.STATUS.DONE:
                self.assertIsNotNone(task.completed_at)
                self.assertGreaterEqual(task.completed_at, task.created_at)
                self.assertLessEqual(task.completed_at, now)
            else:
                self.assertIsNone(task.completed_at)
        # Spread over the past weeks so the statistics page has something to show.
        oldest = tasks.order_by("created_at").first().created_at
        self.assertGreater((now - oldest).days, 50)
        self.assertIn(DEMO_PASSWORD, output)

    @override_settings(DEBUG=True)
    def test_rerun_resets_tasks_and_password(self):
        seed(tasks=10)
        user = User.objects.get(username=DEMO_USERNAME)
        user.set_password("changed")
        user.save()
        Task.objects.create(owner=user, title="Extra")
        other = User.objects.create_user("bob")
        Task.objects.create(owner=other, title="Bob's")
        seed(tasks=10)
        user.refresh_from_db()
        self.assertTrue(user.check_password(DEMO_PASSWORD))
        self.assertEqual(Task.objects.filter(owner=user).count(), 10)
        self.assertEqual(Task.objects.filter(owner=other).count(), 1)

    @override_settings(DEBUG=True)
    def test_does_not_touch_a_staff_user_with_that_name(self):
        User.objects.create_user(DEMO_USERNAME, password="secret", is_staff=True)
        with self.assertRaisesMessage(CommandError, "staff user"):
            seed()
        self.assertTrue(
            User.objects.get(username=DEMO_USERNAME).check_password("secret")
        )

    @override_settings(DEBUG=True)
    def test_same_seed_gives_same_data(self):
        seed(tasks=15, seed=3)
        first = list(Task.objects.values_list("title", "status").order_by("created_at"))
        seed(tasks=15, seed=3)
        second = list(
            Task.objects.values_list("title", "status").order_by("created_at")
        )
        self.assertEqual(first, second)


class DemoLoginHintTests(TestCase):
    def setUp(self):
        User.objects.create_user(DEMO_USERNAME, password=DEMO_PASSWORD)

    @override_settings(DEBUG=True)
    def test_shown_on_login_page_in_development(self):
        response = self.client.get(reverse("login"))
        self.assertContains(response, "Development demo")
        self.assertContains(response, DEMO_PASSWORD)

    @override_settings(DEBUG=False)
    def test_hidden_in_production(self):
        response = self.client.get(reverse("login"))
        self.assertNotContains(response, "Development demo")
        self.assertNotContains(response, DEMO_PASSWORD)

    @override_settings(DEBUG=True)
    def test_hidden_on_other_pages_and_without_demo_user(self):
        self.assertNotContains(self.client.get(reverse("signup")), DEMO_PASSWORD)
        User.objects.filter(username=DEMO_USERNAME).delete()
        self.assertNotContains(self.client.get(reverse("login")), "Development demo")

    @override_settings(DEBUG=True)
    def test_demo_credentials_work(self):
        response = self.client.post(
            reverse("login"), {"username": DEMO_USERNAME, "password": DEMO_PASSWORD}
        )
        self.assertRedirects(response, reverse("base:tasks"))
