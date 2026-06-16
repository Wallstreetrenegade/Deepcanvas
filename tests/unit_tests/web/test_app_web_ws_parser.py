import pytest

from jiuwenclaw.app_web import _SpaStaticHandler


def _oversized_frame(payload_len: int) -> bytes:
    return bytes([0x81, 0x7F]) + payload_len.to_bytes(8, "big")


def test_ws_parser_rejects_oversized_frames():
    parser = _SpaStaticHandler._WsTextFrameParser()

    with pytest.raises(ValueError, match="websocket frame exceeded"):
        parser.feed(_oversized_frame(parser._MAX_WS_FRAME_BYTES + 1))
