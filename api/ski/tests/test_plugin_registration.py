from trips import plugins


def test_ski_trip_type_is_registered_with_generic_modules_plus_ski():
    ski = plugins.get("ski")
    assert ski.modules == plugins.get("generic").modules + ("ski",)
    assert ski.label_key == "trips.types.ski"
    assert ski.packing_templates == ("ski", "border")
    assert ski.reminder_rules == ("ski.snow_refresh",)


def test_ready_is_idempotent():
    from django.apps import apps

    apps.get_app_config("ski").ready()
    apps.get_app_config("ski").ready()
    assert [p.key for p in plugins.all()].count("ski") == 1
