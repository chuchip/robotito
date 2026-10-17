"""Robotito MCP Server using FastMCP.

Exposes tools for LLM tool-calling:
- add_numbers: Basic math
- greet: Greeting tool
- search_past_conversations / get_last_conversation_for_review: Searching and reviewing
  previous conversations by topic (e.g. "comida", "viajes"), timeframe ("la semana pasada",
  "yesterday", "Oct 13"), or default to the most recent conversation.
"""
import os
import sys
import logging
from datetime import datetime, timedelta
from typing import Tuple, Optional
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


def resolve_timeframe(timeframe: str) -> Tuple[Optional[datetime], Optional[datetime]]:
    """Convert natural language or formatted timeframe string into (start_date, end_date)."""
    if not timeframe or not timeframe.strip():
        return None, None

    tf = timeframe.lower().strip()
    now = datetime.now()

    # Relative timeframes (English & Spanish)
    if any(k in tf for k in ("week", "semana")):
        return now - timedelta(days=7), now
    if any(k in tf for k in ("yesterday", "ayer")):
        yesterday = now - timedelta(days=1)
        return yesterday.replace(hour=0, minute=0, second=0, microsecond=0), yesterday.replace(hour=23, minute=59, second=59, microsecond=999999)
    if any(k in tf for k in ("today", "hoy")):
        return now.replace(hour=0, minute=0, second=0, microsecond=0), now
    if any(k in tf for k in ("month", "mes")):
        return now - timedelta(days=30), now

    # Try dateparser if available in the environment
    try:
        import dateparser
        parsed = dateparser.parse(timeframe, languages=["es", "en"])
        if parsed:
            return parsed.replace(hour=0, minute=0, second=0, microsecond=0), parsed.replace(hour=23, minute=59, second=59, microsecond=999999)
    except Exception:
        pass

    # Try common explicit date formats
    for fmt in (
        "%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y",
        "%b %d", "%B %d", "%d %b", "%d %B",
        "%b %d %Y", "%B %d %Y", "%d %b %Y", "%d %B %Y",
    ):
        try:
            parsed = datetime.strptime(timeframe, fmt)
            # If year wasn't parsed (defaulted to 1900), substitute current year
            if parsed.year == 1900:
                parsed = parsed.replace(year=now.year)
            return parsed.replace(hour=0, minute=0, second=0, microsecond=0), parsed.replace(hour=23, minute=59, second=59, microsecond=999999)
        except ValueError:
            pass

    return None, None


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
async def search_past_conversations(topic: str = "", timeframe: str = "", user_id: str = "") -> str:
    """Find an earlier conversation when the user wants to recall, revisit, continue, or discuss it.

    Use the user's intended subject or time period as filters when provided.
    Leave both filters empty for a general request about the most recent conversation.

    Args:
        topic: Optional subject or keyword to search for.
        timeframe: Optional date or time period to search.
        user_id: Authenticated user identifier, supplied by the application.
    """
    actual_user = user_id or os.getenv("CURRENT_USER_ID") or "default"
    logger.info(
        "Searching past conversations: user=%s, topic=%r, timeframe=%r",
        actual_user, topic, timeframe
    )

    try:
        conn = await get_db_connection()
    except Exception as e:
        logger.error("Failed to connect to database: %s", e)
        return f"Error connecting to Robotito database: {e}. Please ensure PostgreSQL is running."

    try:
        start_dt, end_dt = resolve_timeframe(timeframe)

        # Build dynamic SQL query
        query = """
            SELECT c.id, c.name, c.initial_time, c.final_date,
                   (SELECT count(*) FROM conversation_lines l WHERE l.conversation_id = c.id) as line_count
            FROM conversation c
            WHERE c.user_id = $1
        """
        params = [actual_user]
        idx = 2

        if start_dt and end_dt:
            query += f" AND COALESCE(c.final_date, c.initial_time) >= ${idx} AND COALESCE(c.final_date, c.initial_time) <= ${idx + 1}"
            params.extend([start_dt, end_dt])
            idx += 2

        clean_topic = (topic or "").strip()
        if clean_topic:
            search_pattern = f"%{clean_topic}%"
            query += f""" AND (
                c.name ILIKE ${idx}
                OR EXISTS (
                    SELECT 1 FROM conversation_lines l
                    WHERE l.conversation_id = c.id AND l.msg ILIKE ${idx}
                )
            )"""
            params.append(search_pattern)
            idx += 1

        query += " ORDER BY COALESCE(c.final_date, c.initial_time) DESC LIMIT 5"

        convs = await conn.fetch(query, *params)

        if not convs:
            msg_filter = []
            if clean_topic:
                msg_filter.append(f"topic '{clean_topic}'")
            if timeframe:
                msg_filter.append(f"timeframe '{timeframe}'")
            filter_desc = " with " + " and ".join(msg_filter) if msg_filter else ""
            return f"No previous conversations found in the database for user '{actual_user}'{filter_desc}."

        # If searching generally without topic or timeframe, and the top conversation
        # only has <= 2 lines (just started this session), pick the previous one.
        target_conv = convs[0]
        if not clean_topic and not timeframe and len(convs) > 1 and target_conv["line_count"] <= 2:
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

        transcript_lines = []
        matching_snippets = []
        for row in lines:
            role = "User" if row["type"] == "H" else "Robotito"
            msg = row["msg"]
            transcript_lines.append(f"{role}: {msg}")
            if clean_topic and clean_topic.lower() in msg.lower():
                matching_snippets.append(f"[{role}]: {msg}")

        transcript = "\n".join(transcript_lines)
        snippets_block = ""
        if matching_snippets:
            snippets_block = (
                f"\n=== KEY MENTIONS OF '{clean_topic}' ===\n"
                + "\n".join(matching_snippets)
                + "\n"
            )

        instructions = (
            f"=== INSTRUCTIONS FOR ROBOTITO ===\n"
            f"1. Answer the user's question about what was talked about, citing specific details from the transcript above.\n"
            f"2. If the user asked 'Recuerdas...' or asked if you remember, enthusiastically confirm you remember and mention what was said.\n"
            f"3. If appropriate or requested, ask 1 or 2 fun follow-up/quiz questions to test the user's memory about what they said."
        )

        return (
            f"=== PAST CONVERSATION FOUND ===\n"
            f"Topic: {conv_name}\n"
            f"Date: {date_str}\n"
            f"{snippets_block}\n"
            f"Transcript:\n{transcript}\n\n"
            f"{instructions}"
        )
    finally:
        await conn.close()


@mcp.tool()
async def get_last_conversation_for_review(topic: str = "", timeframe: str = "", user_id: str = "") -> str:
    """Review previous conversations or search past talks by topic or timeframe.
    Alias for search_past_conversations.
    """
    return await search_past_conversations(topic=topic, timeframe=timeframe, user_id=user_id)


@mcp.resource("echo://{message}")
def echo_resource(message: str) -> str:
    """Echo back the URI resource."""
    return f"Resource content: {message}"


if __name__ == "__main__":
    mcp.run(transport="stdio")
