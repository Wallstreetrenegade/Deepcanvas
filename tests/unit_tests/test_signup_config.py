from jiuwenclaw.app_web_handlers import _signups_allowed


def test_signups_are_enabled_by_default(monkeypatch):
    monkeypatch.delenv("DEEPCANVAS_ALLOW_SIGNUPS", raising=False)
    assert _signups_allowed() is True


def test_signups_can_be_closed(monkeypatch):
    monkeypatch.setenv("DEEPCANVAS_ALLOW_SIGNUPS", "false")
    assert _signups_allowed() is False
