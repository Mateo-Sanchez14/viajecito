from django.db import migrations

from ski.seed import load_resorts


def seed(apps, schema_editor):
    load_resorts(apps.get_model("ski", "Resort"))


def unseed(apps, schema_editor):
    import json

    from ski.seed import FIXTURE

    slugs = [entry["slug"] for entry in json.loads(FIXTURE.read_text(encoding="utf-8"))]
    apps.get_model("ski", "Resort").objects.filter(slug__in=slugs, trip_links__isnull=True).delete()


class Migration(migrations.Migration):
    dependencies = [("ski", "0001_initial")]
    operations = [migrations.RunPython(seed, unseed)]
