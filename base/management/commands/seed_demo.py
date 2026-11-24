import random
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from base.demo import DEMO_PASSWORD, DEMO_USERNAME
from base.models import Task

SAMPLE_TASKS = [
    ("Renew car insurance", "Compare the two quotes in the inbox before Friday."),
    ("Book dentist appointment", ""),
    ("Write project README", "Setup steps, environment variables and API overview."),
    ("Plan weekend groceries", "Vegetables, rice, coffee beans, dish soap."),
    ("Send invoice to client", "Attach the timesheet for last month."),
    ("Fix bike brakes", "Front pads are worn; order a new set."),
    ("Return library books", ""),
    ("Sort out old photo backups", "Move everything from the old drive to the NAS."),
    ("Pay electricity bill", ""),
    ("Back up laptop", "External drive is in the desk drawer."),
    ("Call the plumber", "Kitchen tap is dripping again."),
    ("Update CV", "Add the last two projects."),
    ("Water the plants", ""),
    ("Research new phone plan", "Need more data, same price or less."),
    ("Clean out the garage", ""),
    ("Order birthday present for Sam", "Board game or a nice notebook."),
    ("Prepare slides for Monday", "Ten slides max, one chart per slide."),
    ("Book flights for the holidays", "Compare morning and evening departures."),
    ("Cancel unused streaming service", ""),
    ("Change the smoke alarm batteries", ""),
    ("Reply to the landlord", "About the lease renewal."),
    ("Learn 20 new Spanish words", ""),
    ("Fix the wobbly chair", ""),
    ("Bake bread for the weekend", "Start the dough on Friday night."),
]


class Command(BaseCommand):
    help = (
        f"Create (or reset) the '{DEMO_USERNAME}' user with sample tasks spread "
        "over the last 12 weeks. Development only: refuses to run unless "
        "DJANGO_DEBUG is on."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--tasks", type=int, default=60, help="How many tasks to create."
        )
        parser.add_argument(
            "--seed", type=int, default=7, help="Random seed for repeatable data."
        )

    def handle(self, *args, tasks, seed, **options):
        if not settings.DEBUG:
            raise CommandError(
                "seed_demo only runs in development. Set DJANGO_DEBUG=1 and try again."
            )
        if tasks < 1:
            raise CommandError("--tasks must be at least 1.")

        User = get_user_model()
        rng = random.Random(seed)
        now = timezone.now()

        with transaction.atomic():
            user, created = User.objects.get_or_create(username=DEMO_USERNAME)
            if not created and (user.is_staff or user.is_superuser):
                raise CommandError(
                    f"A staff user called '{DEMO_USERNAME}' already exists; "
                    "not touching it."
                )
            user.set_password(DEMO_PASSWORD)
            user.is_active = True
            user.save()
            Task.objects.filter(owner=user).delete()

            for i in range(tasks):
                title, description = SAMPLE_TASKS[i % len(SAMPLE_TASKS)]
                # Older tasks are more likely to be done, recent ones still open.
                # About an eighth are from the last few days so "this week"
                # has activity; the rest are spread over 12 weeks.
                recent = i < max(1, tasks // 8)
                created_at = now - timedelta(
                    days=rng.uniform(0, 3) if recent else rng.uniform(0, 84),
                    hours=rng.uniform(0, 12),
                )
                age_days = (now - created_at).days
                done_chance = 0.85 if age_days > 21 else 0.55 if age_days > 3 else 0.2
                roll = rng.random()
                if roll < done_chance:
                    status = Task.STATUS.DONE
                elif roll < done_chance + (1 - done_chance) / 2:
                    status = Task.STATUS.IN_PROGRESS
                else:
                    status = Task.STATUS.PENDING
                task = Task.objects.create(
                    owner=user, title=title, description=description, status=status
                )
                fields = {"created_at": created_at, "updated_at": created_at}
                if status == Task.STATUS.DONE:
                    finished = created_at + timedelta(
                        days=0 if recent else rng.choice([0, 0, 1, 1, 2, 3, 5, 8]),
                        hours=rng.uniform(1, 10),
                    )
                    fields["completed_at"] = fields["updated_at"] = min(now, finished)
                Task.objects.filter(pk=task.pk).update(**fields)

        counts = {
            label: Task.objects.filter(owner=user, status=value).count()
            for value, label in Task.STATUS.choices
        }
        self.stdout.write(
            self.style.SUCCESS(
                f"{'Created' if created else 'Reset'} user '{DEMO_USERNAME}' with "
                f"{tasks} tasks ({', '.join(f'{n} {k.lower()}' for k, n in counts.items())})."
            )
        )
        self.stdout.write(
            f"Sign in with username '{DEMO_USERNAME}', password '{DEMO_PASSWORD}'."
        )
