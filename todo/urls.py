"""todo URL Configuration

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
"""

from django.contrib import admin
from django.contrib.auth import views as auth_views
from django.contrib.sitemaps.views import sitemap
from django.urls import include, path

from base.sitemaps import PublicPagesSitemap
from base.views import SignUpView, robots_txt

urlpatterns = [
    path("admin/", admin.site.urls),
    path(
        "accounts/login/",
        auth_views.LoginView.as_view(
            redirect_authenticated_user=True,
            extra_context={
                "page_title": "Sign in — todo.",
                "page_description": (
                    "Sign in to todo. to see your task list, board and statistics."
                ),
            },
        ),
        name="login",
    ),
    path("accounts/signup/", SignUpView.as_view(), name="signup"),
    path("accounts/", include("django.contrib.auth.urls")),
    path("api/auth/", include("rest_framework.urls", namespace="rest_framework")),
    path("robots.txt", robots_txt, name="robots"),
    path(
        "sitemap.xml",
        sitemap,
        {"sitemaps": {"pages": PublicPagesSitemap}},
        name="sitemap",
    ),
    path("", include("base.urls")),
]
