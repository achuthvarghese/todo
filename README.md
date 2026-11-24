# todo.

A bold, simple task manager built with Django and Django REST framework, with
a vibrant neo-brutalist design that works on any screen size from small
phones to wide desktops.

- **List** – add tasks in one line, filter by status, tick them off, edit
  inline and delete with undo.
- **Board** – To do / Doing / Done columns with drag and drop (and keyboard
  move buttons).
- **Statistics** – completion rate, weekly completions, an activity heatmap,
  busiest weekdays, open-task ages and the oldest open tasks.

Anyone can create an account from the sign-up page. Accounts made there are
regular users; only accounts you create with `createsuperuser` or mark as
staff in the admin can use the admin site.

## Requirements

- Python 3.12 or 3.13
- Django 5.2 LTS and Django REST framework (see `requirements.txt`)

## Getting started

```bash
python -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt

export DJANGO_DEBUG=1                # local development only
python manage.py migrate
python manage.py createsuperuser     # optional: an admin account
python manage.py runserver
```

Open http://127.0.0.1:8000/ and choose **Sign up** to create an account. The
admin site is at http://127.0.0.1:8000/admin/.

### Demo data (development only)

To try the app with realistic data, load a demo user with about 60 tasks
spread over the last 12 weeks:

```bash
DJANGO_DEBUG=1 python manage.py seed_demo
```

Then sign in with:

| Username | Password |
|---|---|
| `demo` | `demo-pass-123` |

Running it again resets the demo user's tasks and password. Options:
`--tasks N` (how many tasks) and `--seed N` (different random data). The
command refuses to run unless `DJANGO_DEBUG` is on, and the sign-in page only
shows these details in development, so they never apply in production. The
demo user is a regular account, not an admin.

> **Upgrading an existing checkout:** migrations used to be git-ignored, so an
> old `db.sqlite3` may not match the committed migration (tasks now belong to
> a user). Delete `db.sqlite3` and run `python manage.py migrate` again.

## Configuration

Settings are read from environment variables.

| Variable | Default | Purpose |
|---|---|---|
| `DJANGO_DEBUG` | off | Set to `1` for local development. Never enable in production. |
| `DJANGO_SECRET_KEY` | — | **Required** when `DJANGO_DEBUG` is off. Use a long random value. |
| `DJANGO_ALLOWED_HOSTS` | `localhost,127.0.0.1` in debug, empty otherwise | Comma-separated host names the site is served on. |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | empty | Comma-separated origins, e.g. `https://todo.example.com`. |
| `DJANGO_SECURE_SSL_REDIRECT` | on | Redirect HTTP to HTTPS when debug is off. |
| `DJANGO_SECURE_HSTS_SECONDS` | `0` | HSTS max-age. Raise gradually once HTTPS works. |
| `DJANGO_SECURE_HSTS_INCLUDE_SUBDOMAINS` | off | Add `includeSubDomains` to HSTS. |
| `DJANGO_SECURE_HSTS_PRELOAD` | off | Add `preload` to HSTS. |
| `DJANGO_BEHIND_PROXY` | off | Trust `X-Forwarded-Proto` from a TLS-terminating proxy. |

Generate a secret key with:

```bash
python -c "import secrets; print(secrets.token_urlsafe(50))"
```

For a production deployment also run `python manage.py collectstatic` (files
go to `staticfiles/`) and serve them with your web server, and validate the
settings with `python manage.py check --deploy`.

## REST API

All endpoints require a signed-in session (the web app's login). Requests
that change data must send the `X-CSRFToken` header. The browsable API is
available at `/api/` once signed in.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/` | API root |
| `GET` | `/api/tasks/` | List your tasks, newest first |
| `POST` | `/api/tasks/` | Create a task (`title` required; `description`, `status` optional) |
| `GET` | `/api/tasks/<id>/` | Retrieve a task |
| `PUT` | `/api/tasks/<id>/` | Replace a task's editable fields |
| `PATCH` | `/api/tasks/<id>/` | Update some fields, e.g. `{"status": "done"}` |
| `DELETE` | `/api/tasks/<id>/` | Delete a task |
| `GET` | `/api/stats/?tz=<zone>` | Statistics for your tasks; `tz` is an IANA time zone such as `Europe/London` (default: server time zone) |

`status` is one of `pending`, `in_progress` or `done`. `completed_at` is set
automatically when a task becomes done and cleared when it is reopened.
Tasks belonging to other users are never listed and return `404`.

## Pages and search engines

| Path | Who | Indexed |
|---|---|---|
| `/` | Landing page for visitors; signed-in users go to `/tasks/` | Yes |
| `/accounts/signup/`, `/accounts/login/` | Visitors | Yes |
| `/tasks/`, `/board/`, `/stats/` | Signed-in users | No (`noindex`) |

Public pages have a title, description, canonical URL and Open Graph tags.
`/robots.txt` keeps `/api/`, `/admin/` and the app pages out of search
results and points to `/sitemap.xml`, which lists the public pages.

## Development

```bash
DJANGO_DEBUG=1 python manage.py test     # run the Python test suite
black . && isort .                       # format code
DJANGO_DEBUG=1 python manage.py makemigrations   # after model changes
```

### Browser tests

The `e2e/` folder holds Playwright tests that drive the real app in Chromium,
including checks at screen widths from 320px to 1920px. With the server
running in another terminal:

```bash
cd e2e
npm ci
npx playwright install chromium
BASE_URL=http://127.0.0.1:8000 npm test
```

GitHub Actions runs black, isort, the Python tests, a missing-migrations
check, `check --deploy` and the browser tests on every push and pull request
to `master`.

### Front end

Plain HTML templates, one stylesheet (`base/static/base/css/app.css`) and
small ES modules in `base/static/base/js/` – no build step and no front-end
framework. Task text is always inserted as text, never as HTML.

## License

See [LICENSE](LICENSE).
