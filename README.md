# ToDo

A small task manager built with Django and Django REST framework. Each user
signs in and manages their own list of tasks; every task has a title, an
optional description and a status (Pending, In progress or Done).

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
python manage.py createsuperuser     # creates a user you can sign in with
python manage.py runserver
```

Open http://127.0.0.1:8000/ and sign in. Add more users from the admin site
at http://127.0.0.1:8000/admin/.

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

`status` is one of `pending`, `in_progress` or `done`. Tasks belonging to
other users are never listed and return `404`.

## Development

```bash
DJANGO_DEBUG=1 python manage.py test     # run the test suite
black . && isort .                       # format code
DJANGO_DEBUG=1 python manage.py makemigrations   # after model changes
```

GitHub Actions runs black, isort, the tests, a missing-migrations check and
`check --deploy` on every push and pull request to `master`.

## License

See [LICENSE](LICENSE).
