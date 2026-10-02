from django.conf import settings


def nag_lead_days():
    return getattr(settings, "LOGISTICS_NAG_LEAD_DAYS", 3)


def public_origin():
    return getattr(settings, "PUBLIC_ORIGIN", "").rstrip("/")
