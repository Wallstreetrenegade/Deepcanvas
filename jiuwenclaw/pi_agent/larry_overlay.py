# Copyright (c) Huawei Technologies Co., Ltd. 2025. All rights reserved.
"""Pillow-based text overlay matching ``add-text-overlay.js`` from the Larry skill.

Specs (battle-tested from 100+ viral posts):
- Font: bold sans-serif (we use the system's default bold; falls back to PIL default).
- Font size: dynamic by word count (7.5% / 6.5% / 5.0% of image width).
- Outline: 15% of font size, black, ``round`` joins, white fill on top.
- Max width: 75% of image (TikTok-safe).
- Line height: 130%.
- Vertical position: text block centered at 28% from top, clamped between 10%-80%.
- Manual ``\\n`` line breaks honored; over-long lines auto-wrap.
- Strips emoji glyphs (PIL default font can't render them).
"""

from __future__ import annotations

import io
import logging
import re
from typing import Optional

from PIL import Image, ImageDraw, ImageFont

logger = logging.getLogger(__name__)

# Strip emoji + dingbat ranges (the JS does the same with a regex).
_EMOJI_RE = re.compile(
    r"["
    "\U0001F300-\U0001FAFF"
    "\U00002600-\U000027BF"
    "]+",
    flags=re.UNICODE,
)


def _resolve_font(size: int) -> ImageFont.FreeTypeFont:
    candidates = [
        # Windows
        "C:/Windows/Fonts/arialbd.ttf",
        "C:/Windows/Fonts/segoeuib.ttf",
        # macOS
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/Library/Fonts/Arial Bold.ttf",
        # Linux
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except (OSError, IOError):
            continue
    logger.warning("[larry.overlay] no bold TTF found, falling back to default")
    return ImageFont.load_default()


def _wrap_lines(
    draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, max_width: int
) -> list[str]:
    cleaned = _EMOJI_RE.sub("", text or "").strip()
    if not cleaned:
        return []
    out: list[str] = []
    for raw_line in cleaned.split("\n"):
        line = raw_line.strip()
        if not line:
            continue
        # If the manual line fits, keep it as-is (Larry prefers manual breaks).
        bbox = draw.textbbox((0, 0), line, font=font)
        if (bbox[2] - bbox[0]) <= max_width:
            out.append(line)
            continue
        # Otherwise word-wrap.
        words = line.split()
        cur = ""
        for word in words:
            candidate = f"{cur} {word}".strip() if cur else word
            bbox = draw.textbbox((0, 0), candidate, font=font)
            if (bbox[2] - bbox[0]) <= max_width:
                cur = candidate
            else:
                if cur:
                    out.append(cur)
                cur = word
        if cur:
            out.append(cur)
    return out


def add_overlay(image_bytes: bytes, text: str) -> bytes:
    """Return a new PNG with the text overlay rendered onto ``image_bytes``."""
    src = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
    canvas = src.copy()
    draw = ImageDraw.Draw(canvas)

    width, height = canvas.size
    word_count = len([w for w in re.split(r"\s+", _EMOJI_RE.sub("", text or "").strip()) if w])
    if word_count <= 5:
        font_percent = 0.075
    elif word_count <= 12:
        font_percent = 0.065
    else:
        font_percent = 0.050
    font_size = max(20, int(round(width * font_percent)))
    outline_w = max(2, int(round(font_size * 0.15)))
    max_width = int(width * 0.75)
    line_height = font_size * 1.30

    font = _resolve_font(font_size)
    lines = _wrap_lines(draw, text, font, max_width)
    if not lines:
        # Nothing to draw — return original.
        out = io.BytesIO()
        src.convert("RGB").save(out, format="PNG")
        return out.getvalue()

    total_h = len(lines) * line_height
    # Center the block at 28% from top (y baseline of first line).
    start_y = (height * 0.28) - (total_h / 2.0)
    min_y = height * 0.10
    max_y = height * 0.80 - total_h
    safe_y = max(min_y, min(start_y, max_y))
    cx = width / 2.0

    for i, line in enumerate(lines):
        y = int(safe_y + i * line_height)
        # Centered text — PIL anchor "ma" = middle/ascender.
        # Outline first
        draw.text(
            (cx, y),
            line,
            font=font,
            fill="white",
            anchor="ma",
            stroke_width=outline_w,
            stroke_fill="black",
        )

    out = io.BytesIO()
    canvas.convert("RGB").save(out, format="PNG", optimize=True)
    return out.getvalue()
