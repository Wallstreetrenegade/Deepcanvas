# Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.

from jiuwenclaw.security import ws_origin


def test_is_allowed_browser_origin_accepts_default_local_hosts():
    assert ws_origin.is_allowed_browser_origin("http://localhost") is True
    assert ws_origin.is_allowed_browser_origin("http://127.0.0.1") is True


def test_is_allowed_browser_origin_accepts_configured_host(monkeypatch):
    monkeypatch.setenv("ALLOWED_WS_ORIGIN_HOSTS", "deepcanvas-d2h2.onrender.com")

    assert ws_origin.is_allowed_browser_origin("https://deepcanvas-d2h2.onrender.com") is True


def test_is_allowed_browser_origin_rejects_unknown_host(monkeypatch):
    monkeypatch.setenv("ALLOWED_WS_ORIGIN_HOSTS", "deepcanvas-d2h2.onrender.com")

    assert ws_origin.is_allowed_browser_origin("https://example.com") is False
