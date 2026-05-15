"""Vocabulary review endpoints (`/api/review/*`).

State lives in `memoryDTO.review_session` (in-memory only); see
`review_service` for the actual logic and `memory.ReviewSession` for the
state structure exposed via `/state`.
"""
from quart import Blueprint, request, jsonify, Response
import logging

import memory


review_bp = Blueprint('review', __name__)

logger_ = memory.getLogger()


@review_bp.route('/start', methods=['POST'])
async def review_start():
    """Begin a new review session for the current user.

    Returns `{state, intro}` on success; `400` if the user has no words
    saved in their dictionary yet.
    """
    import robotito_ai as ai
    uuid = request.headers.get("uuid")
    state, intro = await ai.review_start(uuid)
    if state is None:
        return jsonify({
            'message': 'No words available to review. Add some words to your dictionary first.',
            'status': 'KO',
        }), 400
    return jsonify({'status': 'OK', 'state': state, 'intro': intro})


@review_bp.route('/turn', methods=['POST'])
async def review_turn():
    """Stream the teacher reply for one user turn during a review session.

    The response is `text/plain` with the chat reply followed by a trailing
    `\\n[[VERDICT:<value>]]` marker the frontend strips before displaying
    and uses to update the review toolbar state.
    """
    import robotito_ai as ai
    uuid = request.headers.get("uuid")
    data = await request.get_json() or {}
    msg = (data.get('text') or '').strip()
    if not msg:
        return jsonify({'message': 'Empty message'}), 400

    async def gen():
        async for chunk in ai.review_turn(uuid, msg):
            yield chunk

    return Response(gen(), mimetype='text/plain')


@review_bp.route('/advance', methods=['POST'])
async def review_advance():
    """Move on to the next word. Body: `{known: bool}`.

    `known=true` counts the current word as learned; `known=false` keeps it
    in the "unknown" bucket. Use `/skip` for the explicit user-asked-to-skip
    case so the summary can distinguish the two outcomes.
    """
    import robotito_ai as ai
    uuid = request.headers.get("uuid")
    data = await request.get_json() or {}
    mark_known = bool(data.get('known', True))
    state, intro = ai.review_advance(uuid, mark_known)
    if state is None:
        return jsonify({'message': 'No active review session'}), 400
    return jsonify({'status': 'OK', 'state': state, 'intro': intro})


@review_bp.route('/skip', methods=['POST'])
async def review_skip():
    """Skip the current word and advance to the next one."""
    import robotito_ai as ai
    uuid = request.headers.get("uuid")
    state, intro = ai.review_skip(uuid)
    if state is None:
        return jsonify({'message': 'No active review session'}), 400
    return jsonify({'status': 'OK', 'state': state, 'intro': intro})


@review_bp.route('/end', methods=['POST'])
async def review_end():
    """End the session and return a summary."""
    import robotito_ai as ai
    uuid = request.headers.get("uuid")
    summary = ai.review_end(uuid)
    if summary is None:
        return jsonify({'message': 'No active review session'}), 400
    return jsonify({'status': 'OK', 'summary': summary})


@review_bp.route('/state', methods=['GET'])
async def review_state():
    """Return the current public state (or `state: null` if no active session)."""
    import robotito_ai as ai
    uuid = request.headers.get("uuid")
    state = ai.review_get_state(uuid)
    return jsonify({'state': state})
