from django.contrib import admin

from ski.models import SkiProfile

SENSITIVE = {"boot_size_eu", "height_cm", "weight_kg"}


def test_sensitive_profile_fields_are_not_in_admin_list_displays_or_searches():
    model_admin = admin.site._registry[SkiProfile]
    assert not SENSITIVE & set(model_admin.list_display)
    assert not SENSITIVE & set(model_admin.get_search_fields(None))
    assert not SENSITIVE & set(model_admin.list_filter)
