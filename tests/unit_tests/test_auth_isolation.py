from jiuwenclaw import auth
from jiuwenclaw.pi_agent import state as pi_state


def test_two_users_have_isolated_feature_state(monkeypatch, tmp_path):
    monkeypatch.setattr(auth, "get_user_workspace_dir", lambda: tmp_path)
    pi_state._CACHE.clear()

    first = auth.signup("owner@example.com", "owner-password", "Owner")
    second = auth.signup("partner@example.com", "partner-password", "Partner")

    first_user = auth.authenticate_token(first["token"])
    second_user = auth.authenticate_token(second["token"])
    assert first_user is not None
    assert second_user is not None

    first_context = auth.set_current_user(first_user)
    try:
        pi_state.save_feature("crm", {"leads": [{"email": "first@example.com"}]})
        first_path = pi_state._feature_path("crm")
    finally:
        auth.reset_current_user(first_context)

    second_context = auth.set_current_user(second_user)
    try:
        assert pi_state.load_feature("crm", {"leads": []}) == {"leads": []}
        pi_state.save_feature("crm", {"leads": [{"email": "second@example.com"}]})
        second_path = pi_state._feature_path("crm")
    finally:
        auth.reset_current_user(second_context)

    assert first_path != second_path
    first_context = auth.set_current_user(first_user)
    try:
        assert pi_state.load_feature("crm")["leads"][0]["email"] == "first@example.com"
    finally:
        auth.reset_current_user(first_context)


def test_logout_invalidates_only_the_requested_session(monkeypatch, tmp_path):
    monkeypatch.setattr(auth, "get_user_workspace_dir", lambda: tmp_path)
    first = auth.signup("one@example.com", "password-one")
    second = auth.signup("two@example.com", "password-two")

    auth.logout(first["token"])

    assert auth.authenticate_token(first["token"]) is None
    assert auth.authenticate_token(second["token"])["email"] == "two@example.com"
