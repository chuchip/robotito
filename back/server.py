"""Robotito MCP Server using FastMCP.

Exposes tools for LLM tool-calling (math, greeting, database conversation review).
"""
import os
import sys
import logging
from datetime import datetime
from mcp.server.fastmcp import FastMCP

# Set up logging to stderr so it doesn't interfere with stdio JSON-RPC protocol
logging.basicConfig(
    stream=sys.stderr,
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("robotito-mcp-server")

# Initialize FastMCP server
mcp = FastMCP("robotito-mcp-server")


async def get_db_connection():
    """Create an asyncpg connection to Robotito's PostgreSQL database."""
    import asyncpg

    db_host_env = os.getenv("DB_HOST", "localhost:5432")
    if ":" in db_host_env:
        host, port_str = db_host_env.split(":", 1)
        port = int(port_str)
    else:
        host = db_host_env
        port = int(os.getenv("DB_PORT", "5432"))

    user = os.getenv("DB_USER", "robotito")
    password = os.getenv("DB_PASSWORD", "secret")
    database = os.getenv("DB_NAME", "robotito")

    return await asyncpg.connect(
        host=host,
        port=port,
        user=user,
        password=password,
        database=database,
    )


@mcp.tool()
def add_numbers(a: float, b: float) -> float:
    """Add two numbers together."""
    logger.info("Executing add_numbers with a=%s, b=%s", a, b)
    return a + b


@mcp.tool()
def greet(name: str) -> str:
    """Return a greeting message."""
    logger.info("Executing greet for name=%s", name)
    return f"Hello, {name}! Greetings from your Python MCP server on WSL."


@mcp.tool()
async def get_last_conversation_for_review(user_id: str = "default") -> str:
    """Read the previous conversation from the database to review topics discussed and quiz the user.
    Use this tool whenever the user says:
    - 'I want to review what we talked about last day / yesterday / last conversation'
    - 'Ask me questions about our previous conversation'
    - 'Test my memory about our last talk'
    """
    logger.info("Fetching last conversation for review (user_id=%s)", user_id)
    try:
        conn = await get_db_connection()
    except Exception as e:
        logger.error("Failed to connect to database: %s", e)
        return f"Error connecting to Robotito database: {e}. Please ensure PostgreSQL is running."

    try:
        # Fetch the most recent conversations
        convs = await conn.fetch(
            """
            SELECT c.id, c.name, c.initial_time, c.final_date,
                   (SELECT count(*) FROM conversation_lines l WHERE l.conversation_id = c.id) as line_count
            FROM conversation c
            WHERE c.user_id = $1 OR $1 = 'default'
            ORDER BY COALESCE(c.final_date, c.initial_time) DESC
            LIMIT 5
            """,
            user_id
        )

        if not convs:
            return "No previous conversations found in the database."

        # If the newest conversation has <= 2 lines (e.g. current turn just started),
        # pick the previous one so we review the actual past conversation.
        target_conv = convs[0]
        if len(convs) > 1 and target_conv["line_count"] <= 2:
            target_conv = convs[1]

        conv_id = target_conv["id"]
        conv_name = target_conv["name"] or "Untitled Conversation"
        conv_time = target_conv["final_date"] or target_conv["initial_time"]
        date_str = conv_time.strftime("%Y-%m-%d %H:%M") if conv_time else "Unknown date"

        # Fetch lines for this conversation
        lines = await conn.fetch(
            """
            SELECT type, msg, time_msg
            FROM conversation_lines
            WHERE conversation_id = $1
            ORDER BY time_msg ASC, ctid ASC
            """,
            conv_id
        )

        if not lines:
            return f"Conversation '{conv_name}' ({date_str}) found, but it has no recorded messages."

        transcript_lines = []
        for row in lines:
            role = "User" if row["type"] == "H" else "Robotito"
            transcript_lines.append(f"{role}: {row['msg']}")

        transcript = "\n".join(transcript_lines)
        return (
            f"=== PREVIOUS CONVERSATION FOUND ===\n"
            f"Topic: {conv_name}\n"
            f"Date: {date_str}\n\n"
            f"Transcript:\n{transcript}\n\n"
            f"=== INSTRUCTIONS FOR ROBOTITO ===\n"
            f"1. Tell the user what the previous conversation was about.\n"
            f"2. Ask 2 or 3 engaging questions about the details discussed to test their memory."
        )
    finally:
        await conn.close()


@mcp.resource("echo://{message}")
def echo_resource(message: str) -> str:
    """Echo back the URI resource."""
    return f"Resource content: {message}"


if __name__ == "__main__":
    mcp.run(transport="stdio")
