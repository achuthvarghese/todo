"""Task statistics for one user, calculated in that user's time zone."""

from collections import Counter
from datetime import datetime, time, timedelta

from django.utils import timezone

from base.models import Task

WEEKS = 8
HEATMAP_WEEKS = 12
OLDEST_LIMIT = 5
WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
AGE_BUCKETS = [
    ("lt_1d", "< 1 day", timedelta(days=1)),
    ("1_7d", "1–7 days", timedelta(days=7)),
    ("1_4w", "1–4 weeks", timedelta(weeks=4)),
    ("gt_4w", "> 4 weeks", None),
]


def _start_of_week(day):
    return day - timedelta(days=day.weekday())


def _local_midnight(day, tz):
    return timezone.make_aware(datetime.combine(day, time.min), tz)


def compute_stats(user, tz, now=None):
    now = now or timezone.now()
    today = timezone.localtime(now, tz).date()
    this_week = _start_of_week(today)

    tasks = list(
        Task.objects.filter(owner=user).only(
            "id", "title", "status", "created_at", "completed_at"
        )
    )
    counts = Counter(t.status for t in tasks)
    total = len(tasks)
    done = counts[Task.STATUS.DONE]
    completed = [t for t in tasks if t.status == Task.STATUS.DONE and t.completed_at]
    open_tasks = [t for t in tasks if t.status != Task.STATUS.DONE]

    def local_day(dt):
        return timezone.localtime(dt, tz).date()

    done_days = Counter(local_day(t.completed_at) for t in completed)
    created_days = Counter(local_day(t.created_at) for t in tasks)

    def count_between(counter, start, end):
        return sum(n for day, n in counter.items() if start <= day < end)

    week = timedelta(weeks=1)
    weekly = []
    for i in range(WEEKS - 1, -1, -1):
        start = this_week - i * week
        weekly.append(
            {
                "week_start": start.isoformat(),
                "count": count_between(done_days, start, start + week),
            }
        )

    heat_start = this_week - (HEATMAP_WEEKS - 1) * week
    daily = []
    for i in range(HEATMAP_WEEKS * 7):
        day = heat_start + timedelta(days=i)
        daily.append(
            {
                "date": day.isoformat(),
                "count": done_days.get(day, 0),
                "future": day > today,
            }
        )

    by_weekday = Counter(day.weekday() for day in done_days.elements())
    weekdays = [
        {"day": name, "count": by_weekday[i]} for i, name in enumerate(WEEKDAYS)
    ]

    age_counts = Counter()
    for t in open_tasks:
        age = now - t.created_at
        for key, _, limit in AGE_BUCKETS:
            if limit is None or age < limit:
                age_counts[key] += 1
                break
    open_ages = [
        {"key": key, "label": label, "count": age_counts[key]}
        for key, label, _ in AGE_BUCKETS
    ]

    durations = [(t.completed_at - t.created_at).total_seconds() for t in completed]
    avg_days = round(sum(durations) / len(durations) / 86400, 1) if durations else None

    oldest = sorted(open_tasks, key=lambda t: t.created_at)[:OLDEST_LIMIT]

    return {
        "timezone": str(tz),
        "generated_at": now.isoformat(),
        "total": total,
        "counts": {
            "pending": counts[Task.STATUS.PENDING],
            "in_progress": counts[Task.STATUS.IN_PROGRESS],
            "done": done,
        },
        "open": len(open_tasks),
        "completion_rate": round(done / total * 100) if total else 0,
        "done_this_week": count_between(done_days, this_week, this_week + week),
        "done_last_week": count_between(done_days, this_week - week, this_week),
        "created_this_week": count_between(created_days, this_week, this_week + week),
        "avg_days_to_done": avg_days,
        "weekly": weekly,
        "daily": daily,
        "weekdays": weekdays,
        "open_ages": open_ages,
        "oldest_open": [
            {
                "id": str(t.id),
                "title": t.title,
                "status": t.status,
                "created_at": t.created_at.isoformat(),
                "age_days": (now - t.created_at).days,
            }
            for t in oldest
        ],
    }
