import re
import tempfile
from io import StringIO
from pathlib import Path

from django.core.management import CommandError, call_command
from django.test import SimpleTestCase
from django.urls import get_script_prefix

from base.management.commands.build_static_site import normalise_base_path


class BuildStaticSiteTests(SimpleTestCase):
    def build(self, *args):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        out = Path(tmp.name) / "site"
        call_command(
            "build_static_site", "--output", str(out), *args, stdout=StringIO()
        )
        return out

    def test_writes_pages_assets_and_pages_files(self):
        out = self.build(
            "--base-path", "/todo/", "--site-origin", "https://user.github.io"
        )
        for name in (
            "index.html",
            "tasks/index.html",
            "board/index.html",
            "stats/index.html",
            "404.html",
            ".nojekyll",
            "robots.txt",
            "sitemap.xml",
            "static/base/css/app.css",
            "static/base/js/local.js",
        ):
            self.assertTrue((out / name).is_file(), name)
        self.assertEqual(get_script_prefix(), "/")

    def test_links_use_the_base_path(self):
        out = self.build("--base-path", "todo")
        for page in ("index.html", "tasks/index.html", "stats/index.html"):
            html = (out / page).read_text()
            for url in re.findall(r'(?:href|src)="(/[^"]*)"', html):
                self.assertTrue(url.startswith("/todo/"), f"{page}: {url}")

    def test_app_pages_are_static_demo_without_accounts(self):
        out = self.build("--base-path", "/todo/")
        html = (out / "tasks/index.html").read_text()
        self.assertIn('data-mode="static"', html)
        self.assertIn('id="reset-demo"', html)
        self.assertIn('<meta name="robots" content="noindex, nofollow">', html)
        self.assertNotIn("csrf", html.lower())
        self.assertNotIn("Sign out", html)
        landing = (out / "index.html").read_text()
        self.assertNotIn("/accounts/", landing)
        self.assertIn('href="/todo/tasks/"', landing)

    def test_canonical_and_seo_files_use_the_public_address(self):
        out = self.build(
            "--base-path", "/todo/", "--site-origin", "https://user.github.io/"
        )
        landing = (out / "index.html").read_text()
        self.assertIn(
            '<link rel="canonical" href="https://user.github.io/todo/">', landing
        )
        self.assertIn('"url":"https://user.github.io/todo/"', landing)
        robots = (out / "robots.txt").read_text()
        self.assertIn("Disallow: /todo/tasks/", robots)
        self.assertIn("Sitemap: https://user.github.io/todo/sitemap.xml", robots)
        self.assertIn(
            "<loc>https://user.github.io/todo/</loc>", (out / "sitemap.xml").read_text()
        )

    def test_root_base_path_and_no_origin(self):
        out = self.build()
        self.assertIn('href="/tasks/"', (out / "index.html").read_text())
        self.assertFalse((out / "sitemap.xml").exists())

    def test_rejects_bad_origin_and_project_folder(self):
        with self.assertRaises(CommandError):
            self.build("--site-origin", "user.github.io")
        for folder in (".", "base"):
            with self.assertRaisesMessage(CommandError, "isn't an earlier build"):
                call_command("build_static_site", "--output", folder, stdout=StringIO())
        self.assertTrue(Path("base/views.py").is_file())

    def test_rebuilds_over_an_earlier_build(self):
        out = self.build()
        (out / "old.html").write_text("stale")
        call_command("build_static_site", "--output", str(out), stdout=StringIO())
        self.assertFalse((out / "old.html").exists())
        self.assertTrue((out / "index.html").is_file())

    def test_normalise_base_path(self):
        cases = {
            "": "/",
            "/": "/",
            "todo": "/todo/",
            "/todo": "/todo/",
            "a/b/": "/a/b/",
        }
        for value, expected in cases.items():
            self.assertEqual(normalise_base_path(value), expected)
