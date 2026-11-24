import re
import xml.etree.ElementTree as ET

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

User = get_user_model()


class LandingTests(TestCase):
    def test_anonymous_home_is_indexable_landing(self):
        response = self.client.get(reverse("base:home"))
        self.assertEqual(response.status_code, 200)
        html = response.content.decode()
        self.assertIn('<html lang="en">', html)
        self.assertIn("<title>todo. — a bold, simple task manager</title>", html)
        self.assertIn('<meta name="robots" content="index, follow">', html)
        self.assertIn('<link rel="canonical" href="http://testserver/">', html)
        self.assertIn('<meta name="description" content="Plan it. Do it.', html)
        self.assertIn('property="og:title"', html)
        self.assertIn('"@type":"WebApplication"', html)
        self.assertEqual(len(re.findall(r"<h1[ >]", html)), 1)
        self.assertContains(response, reverse("signup"))

    def test_signed_in_home_is_not_indexed(self):
        self.client.force_login(User.objects.create_user("alice"))
        response = self.client.get(reverse("base:home"))
        self.assertEqual(response.status_code, 200)
        self.assertContains(
            response, '<meta name="robots" content="noindex, nofollow">'
        )


class LoginTests(TestCase):
    def test_login_page_metadata(self):
        response = self.client.get(reverse("login"))
        self.assertContains(response, "<title>Sign in — todo.</title>")
        self.assertContains(response, 'autocomplete="current-password"')
        self.assertContains(response, "<h1>Welcome back</h1>")

    def test_login_and_logout(self):
        User.objects.create_user("alice", password="a-Strong-pass-123")
        response = self.client.post(
            reverse("login"), {"username": "alice", "password": "a-Strong-pass-123"}
        )
        self.assertRedirects(response, reverse("base:home"))
        response = self.client.post(reverse("logout"))
        self.assertRedirects(response, reverse("login"))

    def test_bad_credentials_show_error(self):
        response = self.client.post(
            reverse("login"), {"username": "nobody", "password": "wrong"}
        )
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'role="alert"')

    def test_signed_in_user_is_redirected_away(self):
        self.client.force_login(User.objects.create_user("alice"))
        self.assertRedirects(self.client.get(reverse("login")), reverse("base:home"))


class SignUpTests(TestCase):
    url = reverse("signup")

    def test_page(self):
        response = self.client.get(self.url)
        self.assertContains(response, "<title>Create an account — todo.</title>")
        self.assertContains(response, 'autocomplete="new-password"')

    def test_creates_regular_user_and_signs_in(self):
        response = self.client.post(
            self.url,
            {
                "username": "newbie",
                "password1": "a-Strong-pass-123",
                "password2": "a-Strong-pass-123",
                # Attempts to escalate are ignored.
                "is_staff": "on",
                "is_superuser": "on",
            },
        )
        self.assertRedirects(response, reverse("base:home"))
        user = User.objects.get(username="newbie")
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)
        self.assertEqual(int(self.client.session["_auth_user_id"]), user.pk)

    def test_rejects_mismatched_and_weak_passwords(self):
        for p1, p2 in (("a-Strong-pass-123", "different-pass-456"), ("123", "123")):
            with self.subTest(p1=p1):
                response = self.client.post(
                    self.url, {"username": "x", "password1": p1, "password2": p2}
                )
                self.assertEqual(response.status_code, 200)
                self.assertContains(response, 'aria-invalid="true"')
        self.assertFalse(User.objects.filter(username="x").exists())

    def test_rejects_duplicate_username(self):
        User.objects.create_user("taken")
        response = self.client.post(
            self.url,
            {
                "username": "taken",
                "password1": "a-Strong-pass-123",
                "password2": "a-Strong-pass-123",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(User.objects.filter(username="taken").count(), 1)

    def test_signed_in_user_is_redirected_away(self):
        self.client.force_login(User.objects.create_user("alice"))
        self.assertRedirects(self.client.get(self.url), reverse("base:home"))


class SeoFilesTests(TestCase):
    def test_robots_txt(self):
        response = self.client.get("/robots.txt")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "text/plain")
        body = response.content.decode()
        self.assertIn("Disallow: /api/", body)
        self.assertIn("Disallow: /admin/", body)
        self.assertIn("Sitemap: http://testserver/sitemap.xml", body)

    def test_sitemap_lists_public_pages(self):
        response = self.client.get("/sitemap.xml")
        self.assertEqual(response.status_code, 200)
        ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
        locs = [e.text for e in ET.fromstring(response.content).findall(".//s:loc", ns)]
        self.assertEqual(
            locs,
            [
                "http://testserver/",
                "http://testserver/accounts/signup/",
                "http://testserver/accounts/login/",
            ],
        )
