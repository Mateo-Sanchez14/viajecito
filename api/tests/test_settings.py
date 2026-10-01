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
