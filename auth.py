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
        "SELECT id, username, password_hash, is_active FROM admin_users WHERE username = %s" if is_postgres()
        else "SELECT id, username, password_hash, is_active FROM admin_users WHERE username = ?",
        (username.strip(),)
    )
    row = cur.fetchone()
    
    if not row:
        cur.close()
        conn.close()
        return False
    
    stored_hash = row[2] if isinstance(row, (tuple, list)) else row['password_hash']
    is_active = (row[3] if isinstance(row, (tuple, list)) else row['is_active'])
    
    # Check if disabled
    if is_active is not None and not is_active:
        cur.close()
        conn.close()
        return False
        
    is_valid = check_password_hash(stored_hash, password)
    if is_valid:
        now = time.strftime("%Y-%m-%d %H:%M:%S")
        cur.execute(
            "UPDATE admin_users SET last_login = %s WHERE username = %s" if is_postgres()
            else "UPDATE admin_users SET last_login = ? WHERE username = ?",
            (now, username.strip())
        )
        conn.commit()
        
    cur.close()
    conn.close()
    return is_valid

def change_admin_password(username, old_password, new_password, verify_old=True):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "SELECT id, password_hash FROM admin_users WHERE username = %s" if is_postgres()
        else "SELECT id, password_hash FROM admin_users WHERE username = ?",
        (username.strip(),)
    )
    row = cur.fetchone()
    if not row:
        cur.close()
        conn.close()
        return False, "المستخدم غير موجود"
        
    stored_hash = row[1] if isinstance(row, (tuple, list)) else row['password_hash']
    if verify_old and not check_password_hash(stored_hash, old_password):
        cur.close()
        conn.close()
        return False, "كلمة المرور الحالية غير صحيحة"
        
    new_hash = generate_password_hash(new_password)
    cur.execute(
        "UPDATE admin_users SET password_hash = %s WHERE username = %s" if is_postgres()
        else "UPDATE admin_users SET password_hash = ? WHERE username = ?",
        (new_hash, username.strip())
    )
    conn.commit()
    cur.close()
    conn.close()
    return True, "تم تغيير كلمة مرور الأدمن وتشفيرها بنجاح"

def toggle_admin_account_status(username, is_active):
    conn = get_connection()
    cur = conn.cursor()
    val = is_active if is_postgres() else (1 if is_active else 0)
    cur.execute(
        "UPDATE admin_users SET is_active = %s WHERE username = %s" if is_postgres()
        else "UPDATE admin_users SET is_active = ? WHERE username = ?",
        (val, username.strip())
    )
    conn.commit()
    cur.close()
    conn.close()
    return True, f"تم تحديث حالة حساب الأدمن إلى {'مفعل' if is_active else 'معطل'}"

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get("admin_logged_in"):
            if request.is_json or request.path.startswith("/api/admin/"):
                return jsonify({"success": False, "message": "Unauthorized admin access"}), 401
            return redirect(url_for("admin_login_page", next=request.url))
        return f(*args, **kwargs)
    return decorated_function
