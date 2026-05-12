"""Admin-only endpoints for managing users.

Every route in this blueprint checks that the caller has role == 'admin'
before performing the requested action; non-admin callers get HTTP 403.
"""
from quart import Blueprint, request, jsonify

import memory
import persistence

admin_bp = Blueprint('admin', __name__)

logger_ = memory.getLogger()

_VALID_ROLES = ('admin', 'user')


async def _current_admin():
    """Return the current user's data if they are an admin, else None.

    Authentication itself is already enforced by the global before_request
    hook; here we only need the role check.
    """
    uuid_header = request.headers.get("uuid")
    mem = memory.getMemory(uuid_header)
    if mem is None or not mem.getUser():
        return None
    data = await persistence.get_user_data(mem.getUser())
    if data is None or data.get('role') != 'admin':
        return None
    return data


@admin_bp.route('/users', methods=['GET'])
async def list_users():
    admin = await _current_admin()
    if admin is None:
        return jsonify({"status": "KO", "message": "Admin role required"}), 403
    users = await persistence.list_users()
    return jsonify({"status": "OK", "users": users})


@admin_bp.route('/users', methods=['POST'])
async def create_user():
    admin = await _current_admin()
    if admin is None:
        return jsonify({"status": "KO", "message": "Admin role required"}), 403
    data = await request.get_json() or {}
    user_id = (data.get('user_id') or '').strip()
    password = data.get('password') or ''
    role = (data.get('role') or 'user').strip()
    if not user_id or not password:
        return jsonify({"status": "KO", "message": "user_id and password are required"}), 400
    if role not in _VALID_ROLES:
        return jsonify({"status": "KO", "message": f"Invalid role: {role}"}), 400
    if await persistence.user_exists(user_id):
        return jsonify({"status": "KO", "message": f"User '{user_id}' already exists"}), 409
    await persistence.create_user(user_id, password, role)
    return jsonify({"status": "OK", "message": f"User '{user_id}' created"})


@admin_bp.route('/users/<string:user_id>', methods=['PUT'])
async def update_user(user_id: str):
    admin = await _current_admin()
    if admin is None:
        return jsonify({"status": "KO", "message": "Admin role required"}), 403
    if not await persistence.user_exists(user_id):
        return jsonify({"status": "KO", "message": f"User '{user_id}' not found"}), 404
    data = await request.get_json() or {}
    role = data.get('role')
    password = data.get('password')
    if role is None and not password:
        return jsonify({"status": "KO", "message": "Nothing to update"}), 400
    if role is not None and role not in _VALID_ROLES:
        return jsonify({"status": "KO", "message": f"Invalid role: {role}"}), 400
    # Prevent the admin from accidentally demoting themselves and losing access.
    if role is not None and role != 'admin' and user_id == admin['user']:
        return jsonify({"status": "KO", "message": "You cannot change your own role"}), 400
    await persistence.admin_update_user(user_id, role=role, password=password)
    return jsonify({"status": "OK", "message": f"User '{user_id}' updated"})
