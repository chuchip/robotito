"""MCP Client integration for Robotito.

Keeps a single long-lived MCP server process running for the lifetime of the
Robotito backend.  All tool calls reuse the same stdio session, eliminating the
per-request fork overhead.  If the session dies (server crash / mcp_server.py
hot-reload) it is transparently restarted on the next call.
"""
import asyncio
import contextlib
import os
import sys
import logging
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)


def get_default_server_path() -> str:
    env_path = os.getenv("MCP_SERVER_SCRIPT")
    if env_path and os.path.exists(env_path):
        return env_path
    candidates = [
        os.path.abspath(os.path.join(os.path.dirname(__file__), "mcp_server.py")),
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "server.py")),
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "src", "mcp_server.py")),
    ]
    for p in candidates:
        if os.path.exists(p):
            return p
    return candidates[0]


class MCPClientManager:
    """Singleton manager for a persistent MCP server subprocess.

    One Python child process is kept alive for the entire Robotito lifetime.
    An asyncio.Lock serialises concurrent tool calls so the shared stdio
    stream is not corrupted.  When the server script changes on disk the
    session is restarted automatically on the next request.
    """

    def __init__(self, server_path: Optional[str] = None):
        self._custom_path = server_path
        # Persistent session state
        self._session = None
        self._exit_stack: Optional[contextlib.AsyncExitStack] = None
        self._lock = asyncio.Lock()
        self._server_mtime: float = 0.0
        # Cached tool schema (invalidated when server script changes on disk)
        self._cached_tools: Optional[List[Dict[str, Any]]] = None

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------

    @property
    def server_path(self) -> str:
        return self._custom_path or get_default_server_path()

    def is_available(self) -> bool:
        if os.getenv("ENABLE_MCP", "true").lower() in ("0", "false", "no"):
            return False
        return os.path.exists(self.server_path)

    # ------------------------------------------------------------------
    # Internal: start / stop the persistent process
    # ------------------------------------------------------------------

    async def _start_session(self) -> None:
        """Spawn a new MCP server process and store the live session."""
        from mcp import ClientSession, StdioServerParameters
        from mcp.client.stdio import stdio_client

        params = StdioServerParameters(
            command=sys.executable,
            args=["-u", self.server_path],
            env=os.environ.copy(),
        )
        stack = contextlib.AsyncExitStack()
        try:
            read, write = await stack.enter_async_context(stdio_client(params))
            session = await stack.enter_async_context(ClientSession(read, write))
            await session.initialize()
        except Exception:
            await stack.aclose()
            raise

        # Close any previous session first
        await self._close_session()

        self._exit_stack = stack
        self._session = session
        self._server_mtime = (
            os.path.getmtime(self.server_path)
            if os.path.exists(self.server_path)
            else 0.0
        )
        logger.info("MCP server started: %s", self.server_path)

    async def _close_session(self) -> None:
        """Tear down the current session (if any) silently."""
        stack, self._exit_stack = self._exit_stack, None
        self._session = None
        if stack is not None:
            with contextlib.suppress(Exception):
                await stack.aclose()

    def _server_changed(self) -> bool:
        """Return True if the server script has been modified since last start."""
        if not os.path.exists(self.server_path):
            return False
        return os.path.getmtime(self.server_path) != self._server_mtime

    # ------------------------------------------------------------------
    # Internal: get (or lazily create) the live session
    # ------------------------------------------------------------------

    async def _get_session(self):
        """Return the live ClientSession, (re)starting if necessary.
        Must be called while NOT holding self._lock.
        """
        async with self._lock:
            if self._session is None or self._server_changed():
                if self._server_changed():
                    logger.info("MCP server script changed – restarting session.")
                    self._cached_tools = None
                await self._start_session()
            return self._session

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def get_tools_for_llm(self, refresh: bool = False) -> List[Dict[str, Any]]:
        """Fetch tool schemas from the MCP server in OpenAI/LangChain format.

        Results are cached in memory and only refreshed when the server
        script file changes on disk.
        """
        if not self.is_available():
            return []

        if self._cached_tools is not None and not refresh and not self._server_changed():
            return self._cached_tools

        try:
            session = await self._get_session()
            async with self._lock:
                tool_list = await session.list_tools()

            tools_for_llm = []
            for t in tool_list.tools:
                tools_for_llm.append({
                    "type": "function",
                    "function": {
                        "name": t.name,
                        "description": t.description or "",
                        "parameters": t.inputSchema,
                    },
                })
            self._cached_tools = tools_for_llm
            logger.info(
                "Loaded %d MCP tools: %s",
                len(tools_for_llm),
                [t["function"]["name"] for t in tools_for_llm],
            )
            return tools_for_llm
        except Exception as e:
            logger.warning("Could not load MCP tools: %s – will reconnect on next call", e)
            await self._close_session()
            return []

    async def call_tool(self, name: str, arguments: dict, user_id: str = "default") -> str:
        """Execute a tool on the persistent MCP session.

        user_id is injected into the arguments so the server-side tool can
        scope database queries to the correct user without relying on a
        shared global environment variable.
        """
        if not self.is_available():
            return f"MCP server not available (tool: {name})"

        # Don't mutate the caller's dict
        arguments = dict(arguments)
        if "user_id" in arguments or "conversation" in name or "review" in name:
            arguments["user_id"] = user_id

        try:
            session = await self._get_session()
            async with self._lock:
                result = await asyncio.wait_for(
                    session.call_tool(name, arguments),
                    timeout=30.0,
                )
            text_parts = [c.text for c in result.content if hasattr(c, "text")]
            return "\n".join(text_parts) if text_parts else str(result.content)

        except asyncio.TimeoutError:
            logger.error("MCP tool '%s' timed out after 30s – resetting session", name)
            await self._close_session()
            return f"Tool '{name}' timed out. The MCP server will restart on next call."

        except Exception as e:
            logger.error("MCP tool '%s' failed: %s – resetting session", name, e)
            await self._close_session()
            return f"Error executing tool {name}: {e}"

    async def shutdown(self) -> None:
        """Gracefully stop the MCP server process. Call on app shutdown."""
        logger.info("Shutting down persistent MCP session.")
        await self._close_session()


mcp_manager = MCPClientManager()
