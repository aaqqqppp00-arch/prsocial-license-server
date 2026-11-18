import os
import time
from functools import wraps
from flask import session, redirect, url_for, request, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
from database import get_connection, is_postgres

DEFAULT_ADMIN_USER = os.environ.get("ADMIN_USERNAME", "admin")
DEFAULT_ADMIN_PASS = os.environ.get("ADMIN_PASSWORD", "Admin@PRSocial2026!")

def init_admin():
    conn = get_connection()
    cur = conn.cursor()
    
    cur.execute("SELECT id FROM admin_users WHERE username = %s" if is_postgres() else "SELECT id FROM admin_users WHERE username = ?", (DEFAULT_ADMIN_USER,))
    row = cur.fetchone()
    
    if not row:
        hashed = generate_password_hash(DEFAULT_ADMIN_PASS)
        now = time.strftime("%Y-%m-%d %H:%M:%S")
        cur.execute(
            "INSERT INTO admin_users (username, password_hash, created_at) VALUES (%s, %s, %s)" if is_postgres()
            else "INSERT INTO admin_users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (DEFAULT_ADMIN_USER, hashed, now)
        )
        conn.commit()
        print(f"[Auth] Seeded initial admin account: '{DEFAULT_ADMIN_USER}' with secure hashed password.")
    
    cur.close()
    conn.close()

def verify_admin_login(username, password):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "SELECT id, username, password_hash FROM admin_users WHERE username = %s" if is_postgres()
        else "SELECT id, username, password_hash FROM admin_users WHERE username = ?",
        (username.strip(),)
    )
    row = cur.fetchone()
    cur.close()
    conn.close()

    if not row:
        return False
    
    stored_hash = row[2] if isinstance(row, (tuple, list)) else row['password_hash']
    return check_password_hash(stored_hash, password)

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get("admin_logged_in"):
            if request.is_json or request.path.startswith("/api/admin/"):
                return jsonify({"success": False, "message": "Unauthorized admin access"}), 401
            return redirect(url_for("admin_login_page", next=request.url))
        return f(*args, **kwargs)
    return decorated_function
