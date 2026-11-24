"""Build a static copy of todo. for GitHub Pages (or any static host).

The real templates, CSS and JavaScript are rendered once into HTML files. In
the static build the app pages keep tasks in the visitor's browser
(localStorage, seeded with sample data) because there is no server.
"""

import shutil
from pathlib import Path

from django.conf import settings
from django.contrib.auth.models import AnonymousUser
from django.core.management.base import BaseCommand, CommandError
from django.template.loader import render_to_string
from django.test import RequestFactory, override_settings
from django.urls import get_script_prefix, reverse, set_script_prefix

from base import views

STATIC_SOURCE = Path(settings.BASE_DIR) / "base" / "static"


def normalise_base_path(value):
    value = "/" + value.strip("/") + "/"
    return "/" if value == "//" else value


class Command(BaseCommand):
    help = "Render a static, browser-only demo of the app into a folder."

    def add_arguments(self, parser):
        parser.add_argument("--output", default="_site", help="Folder to write to.")
        parser.add_argument(
            "--base-path",
            default="/",
            help="URL path the site is served from, e.g. /todo/ for a GitHub "
            "project page.",
        )
        parser.add_argument(
            "--site-origin",
            default="",
            help="Public origin for canonical links, e.g. https://user.github.io",
        )

    def handle(self, *args, output, base_path, site_origin, **options):
        base_path = normalise_base_path(base_path)
        site_origin = site_origin.rstrip("/")
        if site_origin and not site_origin.startswith(("https://", "http://")):
            raise CommandError("--site-origin must start with https:// or http://")
        out = Path(output).resolve()
        if out.exists():
            # Only replace an empty folder or one this command built before.
            if not out.is_dir() or (
                any(out.iterdir()) and not (out / ".nojekyll").is_file()
            ):
                raise CommandError(
                    f"{out} already exists and isn't an earlier build; "
                    "choose an empty or new folder."
                )
            shutil.rmtree(out)
        out.mkdir(parents=True)

        previous_prefix = get_script_prefix()
        set_script_prefix(base_path)
        try:
            with override_settings(
                STATIC_DEMO=True,
                SITE_ORIGIN=site_origin,
                STATIC_URL=f"{base_path}static/",
                ALLOWED_HOSTS=["*"],
            ):
                self._build(out, base_path, site_origin)
        finally:
            set_script_prefix(previous_prefix)

        pages = sorted(p.relative_to(out).as_posix() for p in out.rglob("*.html"))
        self.stdout.write(
            self.style.SUCCESS(
                f"Built {len(pages)} pages into {out}: {', '.join(pages)}"
            )
        )

    def _render(self, template, path, context):
        script_name = get_script_prefix().rstrip("/")
        path_info = path[len(script_name) :] if script_name else path
        request = RequestFactory().get(path_info, SCRIPT_NAME=script_name)
        request.user = AnonymousUser()
        return render_to_string(template, context, request=request)

    def _write(self, out, relative, content):
        target = out / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")

    def _build(self, out, base_path, site_origin):
        home = reverse("base:home")
        self._write(
            out,
            "index.html",
            self._render("base/landing.html", home, views.LANDING_CONTEXT),
        )
        for section, (template, _) in views.APP_PAGES.items():
            path = reverse(f"base:{section}")
            html = self._render(template, path, views.app_page_context(section))
            self._write(out, Path(path[len(base_path) :]) / "index.html", html)
        self._write(
            out,
            "404.html",
            self._render(
                "404.html",
                f"{base_path}404.html",
                {"page_title": "Page not found — todo.", "noindex": True},
            ),
        )

        app_paths = "".join(
            f"Disallow: {reverse(f'base:{section}')}\n" for section in views.APP_PAGES
        )
        sitemap_line = (
            f"\nSitemap: {site_origin}{base_path}sitemap.xml\n" if site_origin else ""
        )
        self._write(
            out, "robots.txt", f"User-agent: *\n{app_paths}Allow: /\n{sitemap_line}"
        )
        if site_origin:
            self._write(
                out,
                "sitemap.xml",
                '<?xml version="1.0" encoding="UTF-8"?>\n'
                '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                f"  <url><loc>{site_origin}{home}</loc><priority>1.0</priority></url>\n"
                "</urlset>\n",
            )
        # Tell GitHub Pages not to run Jekyll over the files.
        self._write(out, ".nojekyll", "")
        shutil.copytree(STATIC_SOURCE, out / "static")
