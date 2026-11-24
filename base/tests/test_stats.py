import zoneinfo
from datetime import datetime, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from base.models import Task
from base.stats import compute_stats

User = get_user_model()
UTC = zoneinfo.ZoneInfo("UTC")
# A Wednesday, so "this week" started on Monday 2026-11-23.
NOW = datetime(2026, 11, 25, 12, 0, tzinfo=UTC)


def make_task(owner, title, status=Task.STATUS.PENDING, created=None, completed=None):
    task = Task.objects.create(owner=owner, title=title, status=status)
    fields = {}
    if created:
        fields["created_at"] = created
    if completed:
        fields["completed_at"] = completed
    if fields:
        Task.objects.filter(pk=task.pk).update(**fields)
        task.refresh_from_db()
    return task


class CompletedAtTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("alice")

    def test_set_when_done_and_cleared_when_reopened(self):
        task = Task.objects.create(owner=self.user, title="T")
        self.assertIsNone(task.completed_at)
        task.status = Task.STATUS.DONE
        task.save()
        self.assertIsNotNone(task.completed_at)
        first = task.completed_at
        task.title = "Renamed"
        task.save()
        self.assertEqual(task.completed_at, first)
        task.status = Task.STATUS.PENDING
        task.save(update_fields=["status"])
        task.refresh_from_db()
        self.assertIsNone(task.completed_at)

    def test_created_done(self):
        task = Task.objects.create(owner=self.user, title="T", status="done")
        self.assertIsNotNone(task.completed_at)

    def test_admin_mark_done_sets_completed_at(self):
        admin = User.objects.create_superuser("admin", "a@example.com", "pw")
        self.client.force_login(admin)
        task = Task.objects.create(owner=admin, title="T")
        self.client.post(
            reverse("admin:base_task_changelist"),
            {"action": "mark_done", "_selected_action": [task.pk]},
        )
        task.refresh_from_db()
        self.assertEqual(task.status, Task.STATUS.DONE)
        self.assertIsNotNone(task.completed_at)


class ComputeStatsTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("alice")
        other = User.objects.create_user("bob")
        make_task(other, "Not mine", "done", NOW - timedelta(days=1), NOW)

    def test_empty(self):
        stats = compute_stats(self.user, UTC, now=NOW)
        self.assertEqual(stats["total"], 0)
        self.assertEqual(stats["completion_rate"], 0)
        self.assertIsNone(stats["avg_days_to_done"])
        self.assertEqual(len(stats["weekly"]), 8)
        self.assertEqual(len(stats["daily"]), 84)
        self.assertEqual(sum(w["count"] for w in stats["weekly"]), 0)

    def test_counts_and_rates(self):
        make_task(
            self.user, "a", "done", NOW - timedelta(days=3), NOW - timedelta(days=1)
        )
        make_task(
            self.user, "b", "done", NOW - timedelta(days=10), NOW - timedelta(days=9)
        )
        make_task(self.user, "c", "in_progress", NOW - timedelta(hours=2))
        make_task(self.user, "d", "pending", NOW - timedelta(days=40))
        stats = compute_stats(self.user, UTC, now=NOW)
        self.assertEqual(stats["total"], 4)
        self.assertEqual(stats["counts"], {"pending": 1, "in_progress": 1, "done": 2})
        self.assertEqual(stats["open"], 2)
        self.assertEqual(stats["completion_rate"], 50)
        self.assertEqual(stats["avg_days_to_done"], 1.5)
        # a completed Tue 24th (this week), b completed Mon 16th (last week).
        self.assertEqual(stats["done_this_week"], 1)
        self.assertEqual(stats["done_last_week"], 1)
        self.assertEqual(stats["created_this_week"], 1)
        self.assertEqual(stats["weekly"][-1], {"week_start": "2026-11-23", "count": 1})
        self.assertEqual(stats["weekly"][-2], {"week_start": "2026-11-16", "count": 1})
        weekdays = {d["day"]: d["count"] for d in stats["weekdays"]}
        self.assertEqual(weekdays["Tue"], 1)
        self.assertEqual(weekdays["Mon"], 1)
        ages = {a["key"]: a["count"] for a in stats["open_ages"]}
        self.assertEqual(ages, {"lt_1d": 1, "1_7d": 0, "1_4w": 0, "gt_4w": 1})
        self.assertEqual([t["title"] for t in stats["oldest_open"]], ["d", "c"])
        self.assertEqual(stats["oldest_open"][0]["age_days"], 40)

    def test_daily_grid_marks_today_and_future(self):
        make_task(self.user, "a", "done", NOW - timedelta(days=1), NOW)
        stats = compute_stats(self.user, UTC, now=NOW)
        daily = {d["date"]: d for d in stats["daily"]}
        self.assertEqual(stats["daily"][0]["date"], "2026-09-07")
        self.assertEqual(
            daily["2026-11-25"], {"date": "2026-11-25", "count": 1, "future": False}
        )
        self.assertTrue(daily["2026-11-26"]["future"])

    def test_time_zone_changes_the_day(self):
        # 23:30 UTC on Sunday the 22nd is already Monday the 23rd in Tokyo.
        done_at = datetime(2026, 11, 22, 23, 30, tzinfo=UTC)
        make_task(self.user, "a", "done", done_at - timedelta(hours=1), done_at)
        utc = compute_stats(self.user, UTC, now=NOW)
        tokyo = compute_stats(self.user, zoneinfo.ZoneInfo("Asia/Tokyo"), now=NOW)
        self.assertEqual(utc["done_this_week"], 0)
        self.assertEqual(tokyo["done_this_week"], 1)


class StatsApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user("alice")
        self.url = reverse("base:api-stats")

    def test_requires_login(self):
        self.assertEqual(
            self.client.get(self.url).status_code, status.HTTP_403_FORBIDDEN
        )

    def test_returns_stats(self):
        self.client.force_authenticate(self.user)
        Task.objects.create(owner=self.user, title="T", status="done")
        response = self.client.get(self.url, {"tz": "Europe/London"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["timezone"], "Europe/London")
        self.assertEqual(response.data["counts"]["done"], 1)
        self.assertEqual(response.data["done_this_week"], 1)

    def test_rejects_unknown_time_zone(self):
        self.client.force_authenticate(self.user)
        for tz in ("Mars/Olympus", "../etc/passwd"):
            with self.subTest(tz=tz):
                response = self.client.get(self.url, {"tz": tz})
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
