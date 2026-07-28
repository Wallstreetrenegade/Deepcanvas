# Copyright (c) Huawei Technologies Co., Ltd. 2025. All rights reserved.

"""Team Agent æµå¼å¤„ç†è¾…åŠ©æ–¹æ³•.

ä»Ž interface_deep.py ä¸­æå–çš„ Team æ¨¡å¼æ ¸å¿ƒå¤„ç†é€»è¾‘ã€‚
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, AsyncIterator

from openjiuwen.core.runner import Runner
from openjiuwen.harness import DeepAgent
from openjiuwen.agent_teams.agent.team_agent import TeamAgent

from jiuwenclaw.agentserver.team import get_team_manager
from jiuwenclaw.agentserver.team.monitor_handler import TeamMonitorHandler
from jiuwenclaw.agentserver.stream_utils import parse_stream_chunk
from jiuwenclaw.schema.agent import AgentResponseChunk

logger = logging.getLogger(__name__)

_pending_waiters: dict[str, list[tuple[str, asyncio.Queue]]] = {}


def _broadcast_event(session_id: str, event: dict) -> None:
    """å¹¿æ’­äº‹ä»¶åˆ°æ‰€æœ‰ç­‰å¾…çš„è¯·æ±‚é˜Ÿåˆ—."""
    waiters = _pending_waiters.get(session_id, [])
    for request_id, queue in waiters:
        try:
            queue.put_nowait(dict(event))
        except Exception:
            logger.debug("[TeamHelpers] å¹¿æ’­äº‹ä»¶å¤±è´¥: session_id=%s request_id=%s", session_id, request_id)


async def process_team_message_stream(
    request: Any,
    inputs: dict[str, Any],
    deep_agent: DeepAgent,
) -> AsyncIterator[AgentResponseChunk]:
    """å¤„ç† Team æ¨¡å¼çš„æµå¼æ¶ˆæ¯.

    Args:
        request: AgentRequest å¯¹è±¡
        inputs: å·²æž„å»ºå¥½çš„è¾“å…¥å­—å…¸
        deep_agent: DeepAgent å®žä¾‹

    Yields:
        AgentResponseChunk æµå¼å“åº”å—
    """
    session_id = request.session_id or "default"
    rid = request.request_id
    cid = request.channel_id

    team_manager = get_team_manager()

    try:
        if deep_agent is None:
            raise RuntimeError("DeepAgent æœªåˆå§‹åŒ–")

        team_agent = await team_manager.get_or_create_team(
            session_id=session_id,
            deep_agent=deep_agent,
            request_id=rid,
            channel_id=cid,
            request_metadata=request.metadata,
        )

    except Exception as exc:
        logger.exception("[TeamHelpers] TeamAgent create failed: %s", exc)
        yield AgentResponseChunk(
            request_id=rid,
            channel_id=cid,
            payload={"event_type": "chat.error", "error": str(exc)},
            is_complete=False,
        )
        yield AgentResponseChunk(
            request_id=rid,
            channel_id=cid,
            payload=None,
            is_complete=True,
        )
        return

    query = inputs.get("query", "")

    is_first_request = not team_manager.has_stream_task(session_id)

    request_queue: asyncio.Queue | None = None

    try:
        if is_first_request:
            request_queue = asyncio.Queue()
            if session_id not in _pending_waiters:
                _pending_waiters[session_id] = []
            _pending_waiters[session_id].append((rid, request_queue))
            logger.info(
                "[TeamHelpers] é¦–æ¬¡è¯·æ±‚,å¯åŠ¨stream: session_id=%s, query=%s",
                session_id,
                query[:50] if query else "",
            )

            monitor_handler = None
            if isinstance(team_agent, TeamAgent):
                monitor_handler = TeamMonitorHandler(team_agent, session_id)
                try:
                    await monitor_handler.start()
                    team_manager.register_monitor(session_id, monitor_handler)
                    logger.info("[TeamHelpers] Monitor å¯åŠ¨æˆåŠŸ: session_id=%s", session_id)
                except Exception as e:
                    logger.warning("[TeamHelpers] Monitor å¯åŠ¨å¤±è´¥ï¼Œå°†ç»§ç»­è¿è¡Œ: %s", e)

            stream_task = asyncio.create_task(
                _consume_stream_with_query(
                    session_id,
                    team_agent,
                    query,
                )
            )
            team_manager.register_stream_task(session_id, stream_task)

            if monitor_handler is not None and monitor_handler.is_running:
                asyncio.create_task(
                    _consume_monitor_events(
                        session_id,
                        monitor_handler,
                    )
                )
        else:
            logger.info(
                "[TeamHelpers] åŽç»­è¯·æ±‚,è°ƒç”¨interact: session_id=%s, query=%s",
                session_id,
                query[:100] if query else "",
            )

            if query:
                success = await team_manager.interact(session_id, query)
                if not success:
                    yield AgentResponseChunk(
                        request_id=rid,
                        channel_id=cid,
                        payload={"event_type": "chat.error", "error": "interactå¤±è´¥"},
                        is_complete=False,
                    )
                    yield AgentResponseChunk(
                        request_id=rid,
                        channel_id=cid,
                        payload=None,
                        is_complete=True,
                    )
                    return
            logger.info(
                "[TeamHelpers] follow-up request submitted without waiter: session_id=%s request_id=%s",
                session_id,
                rid,
            )
            yield AgentResponseChunk(
                request_id=rid,
                channel_id=cid,
                payload=None,
                is_complete=True,
            )
            return

        try:
            while team_manager.has_stream_task(session_id):
                if request_queue is None:
                    break
                try:
                    event = await asyncio.wait_for(request_queue.get(), timeout=0.1)

                    yield AgentResponseChunk(
                        request_id=rid,
                        channel_id=cid,
                        payload=event,
                        is_complete=False,
                    )

                    if isinstance(event, dict) and event.get("event_type") == "team.error":
                        break

                except asyncio.TimeoutError:
                    if not team_manager.has_stream_task(session_id):
                        break
                    continue

        except asyncio.CancelledError:
            logger.info(
                "[TeamHelpers] äº‹ä»¶æµè¢«å–æ¶ˆ: session_id=%s request_id=%s",
                session_id, rid,
            )
            raise
        except Exception as exc:
            logger.exception(
                "[TeamHelpers] äº‹ä»¶æµå¼‚å¸¸: session_id=%s error=%s",
                session_id,
                exc,
            )
            yield AgentResponseChunk(
                request_id=rid,
                channel_id=cid,
                payload={"event_type": "chat.error", "error": str(exc)},
                is_complete=False,
            )

        yield AgentResponseChunk(
            request_id=rid,
            channel_id=cid,
            payload=None,
            is_complete=True,
        )

    finally:
        if request_queue is not None:
            waiters = _pending_waiters.get(session_id, [])
            _pending_waiters[session_id] = [
                (req_id, q) for req_id, q in waiters if req_id != rid
            ]

            if not _pending_waiters.get(session_id, []):
                _pending_waiters.pop(session_id, None)
                logger.info("[TeamHelpers] Session æ— ç­‰å¾…è€…ï¼Œæ¸…ç†: session_id=%s", session_id)


async def _consume_stream_with_query(
    session_id: str,
    team_agent: Any,
    initial_query: str,
) -> None:
    """åŽå°æŒç»­æ¶ˆè´¹Teamçš„streamï¼Œå¹¶å¹¿æ’­äº‹ä»¶åˆ°æ‰€æœ‰ç­‰å¾…è€…."""
    try:
        logger.info(
            "[TeamHelpers] Streamåç¨‹å¼€å§‹: session_id=%s, initial_query=%s",
            session_id,
            initial_query[:50] if initial_query else "",
        )

        async for chunk in Runner.run_agent_team_streaming(
            agent_team=team_agent,
            inputs={"query": initial_query},
            session=session_id,
        ):
            parsed = parse_stream_chunk(chunk)
            if parsed is not None:
                _broadcast_event(session_id, parsed)

        logger.warning(
            "[TeamHelpers] Streamæ„å¤–ç»“æŸ: session_id=%s",
            session_id,
        )

    except asyncio.CancelledError:
        logger.info(
            "[TeamHelpers] Streamåç¨‹è¢«å–æ¶ˆ: session_id=%s",
            session_id,
        )
        raise
    except Exception as e:
        logger.exception(
            "[TeamHelpers] Streamåç¨‹å¼‚å¸¸: session_id=%s, error=%s",
            session_id,
            e,
        )
        error_event = {
            "event_type": "team.error",
            "error": str(e),
            "session_id": session_id,
        }
        _broadcast_event(session_id, error_event)
    finally:
        team_manager = get_team_manager()
        team_manager.pop_stream_task(session_id)


async def _consume_monitor_events(
    session_id: str,
    monitor_handler: TeamMonitorHandler,
) -> None:
    """åŽå°æŒç»­æ¶ˆè´¹Monitorçš„äº‹ä»¶ï¼Œå¹¶å¹¿æ’­åˆ°æ‰€æœ‰ç­‰å¾…è€…."""
    try:
        logger.info(
            "[TeamHelpers] Monitoräº‹ä»¶åç¨‹å¼€å§‹: session_id=%s",
            session_id,
        )

        async for event in monitor_handler.events():
            _broadcast_event(session_id, event)

        logger.info(
            "[TeamHelpers] Monitoräº‹ä»¶åç¨‹ç»“æŸ: session_id=%s",
            session_id,
        )

    except asyncio.CancelledError:
        logger.info(
            "[TeamHelpers] Monitoräº‹ä»¶åç¨‹è¢«å–æ¶ˆ: session_id=%s",
            session_id,
        )
        raise
    except Exception as e:
        logger.error(
            "[TeamHelpers] Monitoräº‹ä»¶åç¨‹å¼‚å¸¸: session_id=%s, error=%s",
            session_id,
            e,
        )


async def teardown_team_runtime(
    team_monitors: dict[str, Any],
    team_agents: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    """æ¸…ç†æ‰€æœ‰ Team è¿è¡Œæ—¶."""
    for session_id, monitor in list(team_monitors.items()):
        try:
            await monitor.stop()
        except Exception as exc:
            logger.warning(
                "[TeamHelpers] TeamMonitor stop failed: session_id=%s err=%s",
                session_id,
                exc,
            )

    return {}, {}
