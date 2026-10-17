"""MCP Client integration for Robotito.

Connects to server.py via stdio and exposes tools to Robotito's LLM.
"""
import asyncio
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
    """Manages MCP server communication and tool dispatch."""

    def __init__(self, server_path: Optional[str] = None):
        self._custom_path = server_path
        self._cached_tools: Optional[List[Dict[str, Any]]] = None
        self._last_mtime: float = 0.0

    @property
    def server_path(self) -> str:
        return self._custom_path or get_default_server_path()

    def is_available(self) -> bool:
        """Check if MCP server script exists and is enabled."""
        if os.getenv("ENABLE_MCP", "true").lower() in ("0", "false", "no"):
            return False
        return os.path.exists(self.server_path)

    async def get_tools_for_llm(self, refresh: bool = False) -> List[Dict[str, Any]]:
        """Fetch tool schemas from the MCP server in OpenAI/LangChain format."""
        if not self.is_available():
            return []

        current_mtime = os.path.getmtime(self.server_path) if os.path.exists(self.server_path) else 0.0
        if self._cached_tools is not None and not refresh and current_mtime == self._last_mtime:
            return self._cached_tools

        try:
            from mcp import ClientSession, StdioServerParameters
            from mcp.client.stdio import stdio_client

            params = StdioServerParameters(
                command=sys.executable,
                args=["-u", self.server_path],
                env=os.environ.copy(),
            )
            async with stdio_client(params) as (read, write):
                async with ClientSession(read, write) as session:
                    await session.initialize()
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
                    self._last_mtime = current_mtime
                    logger.info("Loaded %d MCP tools from %s: %s", len(tools_for_llm), self.server_path, [t["function"]["name"] for t in tools_for_llm])
                    return tools_for_llm
        except Exception as e:
            logger.warning("Could not load MCP tools from %s: %s", self.server_path, e)
            return []

    async def call_tool(self, name: str, arguments: dict, user_id: str = "default") -> str:
        """Execute a tool on the MCP server with strict user session isolation."""
        try:
            from mcp import ClientSession, StdioServerParameters
            from mcp.client.stdio import stdio_client

            # Per-invocation environment isolation
            call_env = os.environ.copy()
            call_env["CURRENT_USER_ID"] = user_id

            # Ensure user_id is injected into arguments if appropriate
            if "user_id" in arguments or name == "get_last_conversation_for_review":
                arguments["user_id"] = user_id

            params = StdioServerParameters(
                command=sys.executable,
                args=["-u", self.server_path],
                env=call_env,
            )
            async with stdio_client(params) as (read, write):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    result = await session.call_tool(name, arguments)
                    text_parts = [c.text for c in result.content if hasattr(c, "text")]
                    return "\n".join(text_parts) if text_parts else str(result.content)
        except Exception as e:
            logger.error("Error executing MCP tool %s with %s: %s", name, arguments, e)
            return f"Error executing tool {name}: {e}"


mcp_manager = MCPClientManager()

