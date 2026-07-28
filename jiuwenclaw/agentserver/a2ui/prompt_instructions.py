# Copyright (c) Huawei Technologies Co., Ltd. 2026. All rights reserved.

"""Request-scoped A2UI prompt rail instructions."""

from __future__ import annotations


def build_a2ui_autonomy_instruction(language: str = "en") -> str:
    """Build local A2UI guidance.

    The upstream package includes localized prompt text, but this fork keeps the
    runtime prompt ASCII-only until translated strings are intentionally added.
    """
    template_binding_rule = (
        " For repeated list/card data, use A2UI template binding correctly: "
        "Duplicate dataModelUpdate keys are invalid. Encode arrays as one "
        'collection key with indexed valueMap entries such as "0", "1", where '
        "each item contains its own nested valueMap fields. Inside template "
        "components, use item-relative paths like 'name', 'price', or "
        "'/item/name' for Text, Image, and Button.action.context values; do not "
        "use collection-absolute paths such as '/phones/name' inside templates. "
        "Do not nest templates inside template-rendered components in A2UI 0.8; "
        "flatten repeated item details into fields on the outer item, or use "
        "explicit child components that bind to those fields."
    )
    image_url_rule = (
        " Do not invent image URLs. If external facts or images are needed, use "
        "the available tools briefly, then converge to the final A2UI response. "
        "Use a user-provided HTTPS URL or a verified stable source URL; do not "
        "use guessed upload.wikimedia.org thumbnail paths."
    )
    icon_font_rule = (
        " The host app may not have the Material Symbols icon font available. "
        "Avoid A2UI Icon for semantic content such as product or status icons; "
        "use Text literalString emoji or text labels instead so ligature fallback "
        "text does not appear."
    )
    autonomy_rule = (
        " A2UI is optional. Use A2UI only when a generated interface improves "
        "the user's experience over plain text. Do not force A2UI for greetings, "
        "short explanations, simple factual answers, or unstructured prose. Good "
        "A2UI candidates include information collection forms, actionable "
        "confirmations, multi-result comparison, object detail views, media-rich "
        "cards, dashboards/status/inventory/task summaries, and tool-result "
        "presentations. For real-world recommendation, comparison, shopping, "
        "ranking, price, travel, restaurant, or product requests, use tools first "
        "when available, then decide whether A2UI is the best final presentation. "
        "If the user already provided complete structured data or asks for a demo, "
        "you may render directly without tools. Never write tool_call, invoke, or "
        "function-call tags as plain text."
    )
    requested_component_rule = (
        " You must match the requested component type: for an input box or "
        "text field request, generate TextField/Form UI; generate a card list "
        "only when the user asks for cards or a card list. Card/list UI is "
        "not a universal fallback. For a single object detail request, build a "
        "single object detail layout, not a multi-card demo. Do not substitute a "
        "fixed demo for the requested component. For any user-editable "
        "TextField, bind TextField.text to a data model path, initialize that "
        "path with dataModelUpdate, and include the submitted value in "
        "Button.action.context using a path reference. Do not emit an empty "
        "Button.action.context for form submissions."
    )

    return (
        "A2UI is optional. Keep tools available. If a rich interactive interface "
        "is better than plain text for this answer, output a very short intro "
        "followed by one valid <a2ui-json>...</a2ui-json> block. If A2UI is not "
        "appropriate, answer in plain text. Do not promise to show the result with "
        "A2UI and then output only Markdown. If external facts or images are needed, "
        "use the available tools briefly, then decide whether A2UI is the best "
        "presentation. The block must contain an A2UI 0.8 server-to-client "
        "message list, with beginRendering before surfaceUpdate and "
        "dataModelUpdate only when needed."
        + autonomy_rule
        + requested_component_rule
        + template_binding_rule
        + image_url_rule
        + icon_font_rule
    )


__all__ = [
    "build_a2ui_autonomy_instruction",
]
