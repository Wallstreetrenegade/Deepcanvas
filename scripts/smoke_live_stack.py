"""Smoke-test a running Deep Canvas web stack through its public WebSocket."""

from __future__ import annotations

import argparse
import json
import uuid
from typing import Any

from websockets.sync.client import connect


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="ws://127.0.0.1:10000/ws")
    parser.add_argument("--origin", default="http://127.0.0.1:10000")
    args = parser.parse_args()

    suffix = uuid.uuid4().hex[:10]
    password = f"Smoke-{uuid.uuid4().hex}-A1!"
    sequence = 0

    with connect(args.url, origin=args.origin) as websocket:
        acknowledgement = json.loads(websocket.recv())

        def request(method: str, params: dict[str, Any], token: str = "") -> dict[str, Any]:
            nonlocal sequence
            sequence += 1
            request_id = f"smoke-{sequence}"
            message: dict[str, Any] = {
                "type": "req",
                "id": request_id,
                "method": method,
                "params": params,
            }
            if token:
                message["auth_token"] = token
            websocket.send(json.dumps(message))
            while True:
                response = json.loads(websocket.recv())
                if response.get("id") == request_id:
                    return response

        unauthenticated = request("pi.state.get", {"feature": "crm"})
        account_a = request(
            "auth.signup",
            {
                "email": f"smoke-a-{suffix}@deepcanvas.invalid",
                "password": password,
                "displayName": "Smoke A",
            },
        )
        account_b = request(
            "auth.signup",
            {
                "email": f"smoke-b-{suffix}@deepcanvas.invalid",
                "password": password,
                "displayName": "Smoke B",
            },
        )
        token_a = account_a["payload"]["token"]
        token_b = account_b["payload"]["token"]

        request(
            "pi.state.sync",
            {"feature": "crm", "data": {"leads": [{"id": "lead-a"}]}},
            token_a,
        )
        request(
            "pi.state.sync",
            {"feature": "crm", "data": {"leads": [{"id": "lead-b"}]}},
            token_b,
        )
        crm_a = request("pi.state.get", {"feature": "crm"}, token_a)
        crm_b = request("pi.state.get", {"feature": "crm"}, token_b)
        lead_gen = request("lead_gen.catalog", {}, token_a)
        email = request("email.get_state", {}, token_a)

    assert acknowledgement.get("event") == "connection.ack"
    assert unauthenticated.get("ok") is False
    assert unauthenticated.get("code") == "UNAUTHENTICATED", unauthenticated
    assert crm_a["payload"]["data"]["leads"][0]["id"] == "lead-a"
    assert crm_b["payload"]["data"]["leads"][0]["id"] == "lead-b"
    assert lead_gen.get("ok") is True
    assert email.get("ok") is True
    print(
        json.dumps(
            {
                "authentication": "required",
                "account_isolation": "passed",
                "lead_gen": "reachable",
                "email": "reachable",
            }
        )
    )


if __name__ == "__main__":
    main()
