"""HTTP endpoints for the long-term memory feature.

The "memory" stored here is what the assistant remembers about the user across
conversations: a free-form profile paragraph plus a structured facts table.
The user can view and edit/delete it from the UI.
"""
from quart import Blueprint, request, jsonify

import persistence as db
import memory as mem_module


memory_bp = Blueprint('memory', __name__)
logger_ = mem_module.getLogger()


def _current_user():
    mem = mem_module.getMemory(request.headers.get("uuid"))
    if mem is None:
        return None
    return mem.getUser()


@memory_bp.route('', methods=['GET'])
async def get_memory():
    user_id = _current_user()
    if not user_id:
        return jsonify({'message': 'User not authenticated'}), 401
    profile = await db.get_user_profile(user_id)
    facts = await db.get_user_facts(user_id, limit=200)
    return jsonify({
        'profile': profile.get('profile', ''),
        'memoryEnabled': profile.get('memory_enabled', True),
        'facts': facts,
    })


@memory_bp.route('/profile', methods=['PUT'])
async def put_profile():
    user_id = _current_user()
    if not user_id:
        return jsonify({'message': 'User not authenticated'}), 401
    data = await request.get_json() or {}
    profile = data.get('profile', '')
    await db.set_user_profile(user_id, profile)
    # Refresh in-memory cached LTM so the change is visible on the next turn.
    mem = mem_module.getMemory(request.headers.get("uuid"))
    if mem is not None:
        mem.clearLongTermMemory()
    return jsonify({'message': 'Profile saved', 'profile': profile})


@memory_bp.route('/enabled', methods=['PUT'])
async def put_enabled():
    user_id = _current_user()
    if not user_id:
        return jsonify({'message': 'User not authenticated'}), 401
    data = await request.get_json() or {}
    enabled = bool(data.get('enabled', True))
    await db.set_memory_enabled(user_id, enabled)
    mem = mem_module.getMemory(request.headers.get("uuid"))
    if mem is not None:
        mem.clearLongTermMemory()
    return jsonify({'message': 'Updated', 'enabled': enabled})


@memory_bp.route('/fact/<int:fact_id>', methods=['DELETE'])
async def delete_fact(fact_id):
    user_id = _current_user()
    if not user_id:
        return jsonify({'message': 'User not authenticated'}), 401
    await db.delete_user_fact(user_id, fact_id)
    mem = mem_module.getMemory(request.headers.get("uuid"))
    if mem is not None:
        mem.clearLongTermMemory()
    return jsonify({'message': 'Fact deleted', 'id': fact_id})


@memory_bp.route('', methods=['DELETE'])
async def forget_all():
    """Wipe all long-term memory for the current user (profile + facts)."""
    user_id = _current_user()
    if not user_id:
        return jsonify({'message': 'User not authenticated'}), 401
    await db.delete_all_user_facts(user_id)
    await db.set_user_profile(user_id, '')
    mem = mem_module.getMemory(request.headers.get("uuid"))
    if mem is not None:
        mem.clearLongTermMemory()
    logger_.info(f"Wiped long-term memory for user {user_id}")
    return jsonify({'message': 'Memory wiped'})


@memory_bp.route('/consolidate', methods=['POST'])
async def consolidate_now():
    """Force a consolidation of the current conversation into long-term memory.
    Useful for the front-end to call before navigating away or for debugging.
    """
    import robotito_ai as ai
    uuid_header = request.headers.get("uuid")
    ran = await ai.consolidate_memory(uuid_header)
    return jsonify({'message': 'OK', 'updated': bool(ran)})
