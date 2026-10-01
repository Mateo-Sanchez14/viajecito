import pytest

from notifications import conf
from notifications.tests.conftest import PRIVATE_KEY, PUBLIC_KEY, b64

pytestmark = pytest.mark.django_db


def test_a_valid_configuration_enables_push(vapid):
    assert conf.push_enabled() is True


@pytest.mark.parametrize("subject", ["mailto:ops@example.test", "https://viajecito.example.test"])
def test_mailto_and_https_subjects_are_accepted(vapid, settings, subject):
    settings.NOTIFICATIONS_VAPID_SUBJECT = subject
    assert conf.push_enabled() is True


@pytest.mark.parametrize(
    "subject", ["http://localhost:3000", "ops@example.test", "ftp://x", "mailto:"]
)
def test_other_subjects_disable_push(vapid, settings, subject):
    settings.NOTIFICATIONS_VAPID_SUBJECT = subject
    assert conf.push_enabled() is False


def test_the_subject_falls_back_to_an_https_public_origin_only(vapid, settings):
    settings.NOTIFICATIONS_VAPID_SUBJECT = ""
    settings.PUBLIC_ORIGIN = "https://viajecito.example.test"
    assert conf.push_enabled() is True
    settings.PUBLIC_ORIGIN = "http://localhost:3000"
    assert conf.push_enabled() is False


@pytest.mark.parametrize("private", ["not a key", b64(b"\x01" * 8), "***"])
def test_an_unparseable_private_key_disables_push(vapid, settings, private):
    settings.NOTIFICATIONS_VAPID_PRIVATE_KEY = private
    assert conf.push_enabled() is False


def test_a_public_key_that_does_not_match_the_private_one_disables_push(vapid, settings):
    other_public = b64(b"\x04" + b"\x09" * 64)
    assert other_public != PUBLIC_KEY
    settings.NOTIFICATIONS_VAPID_PUBLIC_KEY = other_public
    assert conf.push_enabled() is False


def test_the_connect_and_read_timeouts_and_default_budget_are_tight(settings):
    assert conf.push_timeout() == (3, 2)
    assert conf.push_budget_seconds() == 10
    assert PRIVATE_KEY  # fixture material exists


@pytest.mark.parametrize("raw", ["", "   ", ",,", "localhost", "not a host", "*", None, []])
def test_empty_or_mistyped_endpoint_hosts_fall_back_to_the_defaults(settings, raw):
    from notifications.domain.subscriptions import DEFAULT_ENDPOINT_HOSTS

    settings.NOTIFICATIONS_PUSH_ENDPOINT_HOSTS = raw
    assert tuple(conf.endpoint_hosts()) == tuple(DEFAULT_ENDPOINT_HOSTS)


def test_valid_hosts_are_used_and_junk_entries_are_dropped(settings):
    settings.NOTIFICATIONS_PUSH_ENDPOINT_HOSTS = "push.example.test, junk, *.push.other.test"
    assert tuple(conf.endpoint_hosts()) == ("push.example.test", "*.push.other.test")
