from django.contrib.sitemaps import Sitemap
from django.urls import reverse


class PublicPagesSitemap(Sitemap):
    changefreq = "monthly"

    def items(self):
        return ["base:home", "signup", "login"]

    def location(self, item):
        return reverse(item)

    def priority(self, item):
        return 1.0 if item == "base:home" else 0.6
