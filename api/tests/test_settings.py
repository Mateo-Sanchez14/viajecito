import importlib

import pytest
from django.conf import settings


@pytest.fixture(autouse=True)
def _restore_base_settings(monkeypatch):
    """Reload base with the pristine environment after each test that mutated it."""
    yield monkeypatch
    monkeypatch.undo()
    import config.settings.base as base

    importlib.reload(base)


def _reload_base(monkeypatch, **env):
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    import config.settings.base as base

    return importlib.reload(base)


def test_public_origin_maps_to_allowed_hosts_and_csrf(monkeypatch):
    base = _reload_base(monkeypatch, PUBLIC_ORIGIN="https://viajecito.example.com")
    assert "viajecito.example.com" in base.ALLOWED_HOSTS
    assert base.CSRF_TRUSTED_ORIGINS == ["https://viajecito.example.com"]


def test_public_origin_with_port_keeps_port_in_csrf_not_hosts(monkeypatch):
    base = _reload_base(monkeypatch, PUBLIC_ORIGIN="http://localhost:3000")
    assert "localhost" in base.ALLOWED_HOSTS
    assert base.CSRF_TRUSTED_ORIGINS == ["http://localhost:3000"]


def test_database_path_and_media_root_come_from_env(monkeypatch, tmp_path):
    base = _reload_base(
        monkeypatch,
        DATABASE_PATH=str(tmp_path / "x.sqlite3"),
        MEDIA_ROOT=str(tmp_path / "media"),
        STATIC_ROOT=str(tmp_path / "static"),
    )
    assert str(base.DATABASES["default"]["NAME"]) == str(tmp_path / "x.sqlite3")
    assert str(base.MEDIA_ROOT) == str(tmp_path / "media")
    assert str(base.STATIC_ROOT) == str(tmp_path / "static")


def test_data_directories_are_created_on_import(monkeypatch, tmp_path):
    media = tmp_path / "m" / "media"
    _reload_base(
        monkeypatch,
        DATABASE_PATH=str(tmp_path / "d" / "db.sqlite3"),
        MEDIA_ROOT=str(media),
        STATIC_ROOT=str(tmp_path / "s" / "static"),
    )
    assert media.is_dir()
    assert (tmp_path / "d").is_dir()
    assert (tmp_path / "s" / "static").is_dir()


def test_cookie_and_locale_settings():
    assert settings.SESSION_COOKIE_HTTPONLY is True
    assert settings.SESSION_COOKIE_SAMESITE == "Lax"
    assert settings.CSRF_COOKIE_SAMESITE == "Lax"
    assert settings.SESSION_COOKIE_AGE == 60 * 60 * 24 * 30
    assert settings.SESSION_SAVE_EVERY_REQUEST is True
    assert settings.USE_TZ is True
    assert settings.TIME_ZONE == "UTC"
    assert settings.LANGUAGE_CODE == "es-ar"


def test_test_settings_use_file_based_database():
    name = str(settings.DATABASES["default"]["TEST"]["NAME"])
    assert name.endswith(".sqlite3")
    assert "/data/test/" in name


def test_prod_settings_enable_secure_cookies(monkeypatch):
    monkeypatch.setenv("DJANGO_SECRET_KEY", "x" * 50)
    monkeypatch.setenv("OTP_PEPPER", "p" * 32)
    monkeypatch.setenv("GOWA_WEBHOOK_SECRET", "w" * 32)
    import config.settings.prod as prod

    prod = importlib.reload(prod)
    assert prod.SESSION_COOKIE_SECURE is True
    assert prod.CSRF_COOKIE_SECURE is True
    assert prod.DEBUG is False


@pytest.mark.parametrize("flag", ["SESSION_COOKIE_SECURE", "CSRF_COOKIE_SECURE"])
def test_non_prod_cookies_not_secure(flag):
    assert getattr(settings, flag) is False


def test_only_api_env_file_is_read(monkeypatch):
    import environs

    calls = []
    monkeypatch.setattr(
        environs.Env, "read_env", lambda self, *args, **kwargs: calls.append((args, kwargs))
    )
    base = _reload_base(monkeypatch)
    assert calls == [((base.BASE_DIR / ".env",), {"recurse": False})]


def test_otp_defaults_and_prod_requires_a_pepper(monkeypatch):
    base = _reload_base(monkeypatch)
    assert base.OTP_DELIVERY_ENABLED is True
    assert (base.OTP_CODE_TTL_SECONDS, base.OTP_MAX_ATTEMPTS) == (300, 5)
    assert base.OTP_SEND_SYNC is False
    monkeypatch.setenv("DJANGO_SECRET_KEY", "x" * 50)
    monkeypatch.delenv("OTP_PEPPER", raising=False)
    import config.settings.prod as prod

    with pytest.raises(Exception, match="OTP_PEPPER"):
        importlib.reload(prod)


def test_prod_rejects_an_empty_pepper(monkeypatch):
    from django.core.exceptions import ImproperlyConfigured

    monkeypatch.setenv("DJANGO_SECRET_KEY", "x" * 50)
    monkeypatch.setenv("OTP_PEPPER", "")
    import config.settings.prod as prod

    with pytest.raises(ImproperlyConfigured, match="OTP_PEPPER"):
        importlib.reload(prod)


def test_trust_cf_connecting_ip_defaults_off_and_on_in_prod(monkeypatch):
    assert _reload_base(monkeypatch).TRUST_CF_CONNECTING_IP is False
    monkeypatch.setenv("DJANGO_SECRET_KEY", "x" * 50)
    monkeypatch.setenv("OTP_PEPPER", "p" * 32)
    monkeypatch.setenv("GOWA_WEBHOOK_SECRET", "w" * 32)
    import config.settings.prod as prod

    assert importlib.reload(prod).TRUST_CF_CONNECTING_IP is True
    monkeypatch.setenv("TRUST_CF_CONNECTING_IP", "0")
    assert importlib.reload(prod).TRUST_CF_CONNECTING_IP is False


def test_gowa_webhook_defaults(monkeypatch):
    base = _reload_base(monkeypatch)
    assert base.GOWA_WEBHOOK_SECRET == "" and base.GOWA_DEVICE_ID == ""
    assert base.MESSAGING_PROCESS_SYNC is False
    assert (base.INBOUND_STUCK_MINUTES, base.ROSTER_SYNC_HOURS) == (2, 24)


@pytest.mark.parametrize("value", [None, ""])
def test_prod_requires_a_webhook_secret(monkeypatch, value):
    from django.core.exceptions import ImproperlyConfigured

    monkeypatch.setenv("DJANGO_SECRET_KEY", "x" * 50)
    monkeypatch.setenv("OTP_PEPPER", "p" * 32)
    if value is None:
        monkeypatch.delenv("GOWA_WEBHOOK_SECRET", raising=False)
    else:
        monkeypatch.setenv("GOWA_WEBHOOK_SECRET", value)
    import config.settings.prod as prod

    expected = Exception if value is None else ImproperlyConfigured  # unset: environs EnvError
    with pytest.raises(expected, match="GOWA_WEBHOOK_SECRET"):
        importlib.reload(prod)
