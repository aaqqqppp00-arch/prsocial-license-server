import os
import json
import time
import hmac
import hashlib
import urllib.request
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, render_template, session, redirect, url_for, send_from_directory
from werkzeug.security import generate_password_hash

from database import get_connection, is_postgres, init_db
from auth import init_admin, verify_admin_login, admin_required, change_admin_password, toggle_admin_account_status

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "PRSC_SUPER_SECRET_SESSION_KEY_2026_PRODUCTION")

HMAC_SECRET = os.environ.get("HMAC_SECRET", "PRSC_2026_MASTER_SHIELD_AUTH_KEY_98374")
CRYPTO_VALIDATOR_SALT = os.environ.get("CRYPTO_VALIDATOR_SALT", "PRSC_CRYPTO_CORE_VALIDATOR_SALT_2026_X99")

# GeoIP Cache: IP -> "City, Country"
geoip_cache = {}

def resolve_ip_location(ip):
    if not ip or ip in ("127.0.0.1", "localhost", "::1") or ip.startswith("192.168.") or ip.startswith("10."):
        return "محلي (Local / LAN)"
    if ip in geoip_cache:
        return geoip_cache[ip]
    try:
        url = f"http://ip-api.com/json/{ip}?fields=status,country,city"
        req = urllib.request.Request(url, headers={"User-Agent": "PRSocial-License-Server"})
        with urllib.request.urlopen(req, timeout=2) as resp:
            data = json.loads(resp.read().decode())
            if data.get("status") == "success":
                city = data.get("city", "")
                country = data.get("country", "")
                loc = f"{city}, {country}".strip(", ")
                geoip_cache[ip] = loc
                return loc
    except Exception:
        pass
    return "موقع غير محدد"

def is_cryptographically_valid_key(key):
    try:
        parts = key.strip().upper().split('-')
        if len(parts) != 6 or parts[0] != 'PRSC':
            return False
        b1, b2, b3, b4, b5 = parts[1], parts[2], parts[3], parts[4], parts[5]
        msg = f"{b1}{b2}{b3}".encode()
        digest = hmac.new(CRYPTO_VALIDATOR_SALT.encode(), msg, hashlib.sha256).hexdigest().upper()
        return b4 == digest[:4] and b5 == digest[4:8]
    except Exception:
        return False

def generate_cryptographic_license_key():
    import random
    import string
    chars = string.ascii_uppercase + string.digits
    b1 = ''.join(random.choices(chars, k=4))
    b2 = ''.join(random.choices(chars, k=4))
    b3 = ''.join(random.choices(chars, k=4))
    msg = f"{b1}{b2}{b3}".encode()
    digest = hmac.new(CRYPTO_VALIDATOR_SALT.encode(), msg, hashlib.sha256).hexdigest().upper()
    b4 = digest[:4]
    b5 = digest[4:8]
    return f"PRSC-{b1}-{b2}-{b3}-{b4}-{b5}"

def sign_response(license_key, device_id, status, is_success):
    ts = int(time.time())
    payload = f"{license_key}:{device_id}:{ts}:{status}:{1 if is_success else 0}"
    sig = hmac.new(HMAC_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return ts, sig

# --- App API Endpoints ---

@app.route("/api/license/verify", methods=["POST"])
def verify_license():
    data = request.get_json(force=True, silent=True) or {}
    license_key = (data.get("license_key") or "").strip().upper()
    device_id = (data.get("device_id") or "").strip()
    device_model = (data.get("device_model") or "Android Device").strip()
    connection_type = (data.get("connection_type") or "WiFi").strip()
    webview_version = (data.get("webview_version") or "Android WebView").strip()
    browser_fingerprint = (data.get("browser_fingerprint") or "").strip()
    mac_address = (data.get("mac_address") or "").strip()
    
    # Precise Client Type Detection (Script vs App)
    raw_client = (data.get("client_type") or "").strip().lower()
    ua = request.headers.get("User-Agent", "").lower()
    if raw_client in ("script", "bot", "worker", "python") or "script" in ua or "python" in ua or "worker" in ua:
        client_type = "script"
    else:
        client_type = "app"

    client_ip = request.headers.get("X-Forwarded-For", request.remote_addr).split(",")[0].strip()
    location = resolve_ip_location(client_ip)
    now_str = time.strftime("%Y-%m-%d %H:%M:%S")

    # Generic ambiguous error messages for security
    GENERIC_ERR_MSG = "الرمز المدخل غير صالح أو غير متاح حالياً"

    if not license_key:
        ts, sig = sign_response("", device_id, "missing_key", False)
        return jsonify({"success": False, "status": "missing_key", "message": "يرجى إدخال الرمز للمتابعة", "timestamp": ts, "signature": sig}), 400

    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT key, bound_device_id, bound_ip, device_model, expires_at, status, activation_count FROM licenses WHERE key = %s" if is_postgres() else "SELECT key, bound_device_id, bound_ip, device_model, expires_at, status, activation_count FROM licenses WHERE key = ?", (license_key,))
    row = cur.fetchone()

    if not row:
        if is_cryptographically_valid_key(license_key):
            # Auto-provision valid key
            cur.execute("""
                INSERT INTO licenses (key, duration_type, client_type, created_at, expires_at, status, bound_device_id, bound_ip, device_model, is_tested, is_online, last_heartbeat, activation_count, multi_device_detected, connection_type, webview_version, browser_fingerprint, mac_address, location)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """ if is_postgres() else """
                INSERT INTO licenses (key, duration_type, client_type, created_at, expires_at, status, bound_device_id, bound_ip, device_model, is_tested, is_online, last_heartbeat, activation_count, multi_device_detected, connection_type, webview_version, browser_fingerprint, mac_address, location)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (license_key, "lifetime", client_type, time.strftime("%Y-%m-%d"), "2099-12-31", "active", device_id, client_ip, device_model, True, True, now_str, 1, False, connection_type, webview_version, browser_fingerprint, mac_address, location))
            conn.commit()
            cur.close()
            conn.close()
            ts, sig = sign_response(license_key, device_id, "activated_and_bound", True)
            return jsonify({"success": True, "status": "activated_and_bound", "expires_at": "2099-12-31", "message": "تم تفعيل الترخيص بنجاح!", "timestamp": ts, "signature": sig})
        else:
            cur.close()
            conn.close()
            ts, sig = sign_response(license_key, device_id, "invalid_key", False)
            return jsonify({"success": False, "status": "invalid_key", "message": GENERIC_ERR_MSG, "timestamp": ts, "signature": sig}), 404

    bound_dev = row[1] if isinstance(row, (tuple, list)) else row['bound_device_id']
    expires_at = row[4] if isinstance(row, (tuple, list)) else row['expires_at']
    status = row[5] if isinstance(row, (tuple, list)) else row['status']
    act_count = (row[6] if isinstance(row, (tuple, list)) else row['activation_count']) or 0

    # Status check
    if status in ("revoked", "blocked"):
        cur.close()
        conn.close()
        ts, sig = sign_response(license_key, device_id, status, False)
        return jsonify({"success": False, "status": status, "message": GENERIC_ERR_MSG, "timestamp": ts, "signature": sig}), 403

    # Expiration check
    if expires_at and expires_at != "2099-12-31":
        try:
            exp_date = datetime.strptime(expires_at, "%Y-%m-%d")
            if datetime.now() > exp_date:
                cur.execute("UPDATE licenses SET status = %s WHERE key = %s" if is_postgres() else "UPDATE licenses SET status = ? WHERE key = ?", ("expired", license_key))
                conn.commit()
                cur.close()
                conn.close()
                ts, sig = sign_response(license_key, device_id, "expired", False)
                return jsonify({"success": False, "status": "expired", "message": GENERIC_ERR_MSG, "timestamp": ts, "signature": sig}), 403
        except Exception:
            pass

    # Multi-Device Fraud Check
    multi_device = False
    if bound_dev and bound_dev != device_id:
        multi_device = True
        cur.execute("UPDATE licenses SET multi_device_detected = %s WHERE key = %s" if is_postgres() else "UPDATE licenses SET multi_device_detected = ? WHERE key = ?", (True if is_postgres() else 1, license_key))

    # Update activation data including client_type
    cur.execute("""
        UPDATE licenses SET
            bound_device_id = %s,
            bound_ip = %s,
            device_model = %s,
            client_type = %s,
            is_tested = %s,
            is_online = %s,
            last_heartbeat = %s,
            activation_count = %s,
            connection_type = %s,
            webview_version = %s,
            browser_fingerprint = %s,
            mac_address = %s,
            location = %s
        WHERE key = %s
    """ if is_postgres() else """
        UPDATE licenses SET
            bound_device_id = ?,
            bound_ip = ?,
            device_model = ?,
            client_type = ?,
            is_tested = ?,
            is_online = ?,
            last_heartbeat = ?,
            activation_count = ?,
            connection_type = ?,
            webview_version = ?,
            browser_fingerprint = ?,
            mac_address = ?,
            location = ?
        WHERE key = ?
    """, (
        device_id, client_ip, device_model, client_type,
        True if is_postgres() else 1,
        True if is_postgres() else 1,
        now_str, act_count + 1, connection_type, webview_version, browser_fingerprint, mac_address, location, license_key
    ))

    # Log telemetry with client_type
    cur.execute("""
        INSERT INTO device_telemetry_logs (license_key, device_id, client_type, event_type, ip, connection_type, device_model, location, webview_version, browser_fingerprint, created_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """ if is_postgres() else """
        INSERT INTO device_telemetry_logs (license_key, device_id, client_type, event_type, ip, connection_type, device_model, location, webview_version, browser_fingerprint, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (license_key, device_id, client_type, "verify_activation", client_ip, connection_type, device_model, location, webview_version, browser_fingerprint, now_str))

    conn.commit()
    cur.close()
    conn.close()

    ts, sig = sign_response(license_key, device_id, "active", True)
    return jsonify({
        "success": True,
        "status": "active",
        "expires_at": expires_at or "2099-12-31",
        "message": "تم تفعيل الترخيص بنجاح!",
        "timestamp": ts,
        "signature": sig
    })

@app.route("/api/license/heartbeat", methods=["POST"])
def license_heartbeat():
    data = request.get_json(force=True, silent=True) or {}
    license_key = (data.get("license_key") or "").strip().upper()
    device_id = (data.get("device_id") or "").strip()
    client_ip = request.headers.get("X-Forwarded-For", request.remote_addr).split(",")[0].strip()
    now_str = time.strftime("%Y-%m-%d %H:%M:%S")

    if not license_key:
        return jsonify({"success": False, "status": "invalid"}), 400

    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT status, bound_device_id FROM licenses WHERE key = %s" if is_postgres() else "SELECT status, bound_device_id FROM licenses WHERE key = ?", (license_key,))
    row = cur.fetchone()

    if not row:
        cur.close()
        conn.close()
        return jsonify({"success": False, "status": "not_found"}), 404

    status = row[0] if isinstance(row, (tuple, list)) else row['status']
    bound_dev = row[1] if isinstance(row, (tuple, list)) else row['bound_device_id']

    if status in ("revoked", "blocked", "expired"):
        cur.close()
        conn.close()
        return jsonify({"success": False, "status": status, "message": "انتهت جلسة الاستخدام، يرجى إعادة التحقق"}), 403

    # Update heartbeat
    cur.execute("""
        UPDATE licenses SET last_heartbeat = %s, is_online = %s WHERE key = %s
    """ if is_postgres() else """
        UPDATE licenses SET last_heartbeat = ?, is_online = 1 WHERE key = ?
    """, (now_str, True, license_key) if is_postgres() else (now_str, license_key))
    conn.commit()
    cur.close()
    conn.close()

    return jsonify({"success": True, "status": "active", "timestamp": int(time.time())})

    cur.execute("UPDATE licenses SET is_online = %s, last_heartbeat = %s, bound_ip = %s WHERE key = %s" if is_postgres() else "UPDATE licenses SET is_online = ?, last_heartbeat = ?, bound_ip = ? WHERE key = ?", (True if is_postgres() else 1, now_str, client_ip, license_key))
    conn.commit()
    cur.close()
    conn.close()

    return jsonify({"success": True, "status": "active", "timestamp": int(time.time())})

@app.route("/api/app/version", methods=["GET"])
def app_version():
    return jsonify({
        "success": True,
        "version_code": 2,
        "version_name": "2.0.0",
        "apk_url": "/download/PRSocial_Master.apk",
        "release_notes": "تحديث رئيسي 2.0.0: ربط كامل بالسحابة وفحص ذكي للحظر وتتبع فوري للعتاد."
    })

@app.route("/download/<path:filename>", methods=["GET"])
def download_file(filename):
    apk_dir = os.path.dirname(__file__)
    return send_from_directory(apk_dir, filename, as_attachment=True)

# --- Admin Dashboard Web UI Endpoints ---

@app.route("/")
def index_redirect():
    if session.get("admin_logged_in"):
        return redirect(url_for("admin_dashboard"))
    return redirect(url_for("admin_login_page"))

@app.route("/admin/login", methods=["GET", "POST"])
def admin_login_page():
    if request.method == "POST":
        username = request.form.get("username", "")
        password = request.form.get("password", "")
        if verify_admin_login(username, password):
            session["admin_logged_in"] = True
            session["admin_username"] = username
            return redirect(url_for("admin_dashboard"))
        return render_template("login.html", error="اسم المستخدم أو كلمة المرور غير صحيحة")
    return render_template("login.html")

@app.route("/admin/logout")
def admin_logout():
    session.clear()
    return redirect(url_for("admin_login_page"))

@app.route("/admin")
@admin_required
def admin_dashboard():
    return render_template("dashboard.html", username=session.get("admin_username", "Admin"))

# --- Admin API Routes ---

@app.route("/api/admin/stats", methods=["GET"])
@admin_required
def admin_stats():
    conn = get_connection()
    cur = conn.cursor()
    
    cur.execute("SELECT COUNT(*) FROM licenses")
    total = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM licenses WHERE status = 'active'")
    active = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM licenses WHERE status IN ('revoked', 'blocked')")
    revoked = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM licenses WHERE multi_device_detected = %s" if is_postgres() else "SELECT COUNT(*) FROM licenses WHERE multi_device_detected = 1", (True,) if is_postgres() else ())
    multi_device = cur.fetchone()[0]

    cur.close()
    conn.close()

    return jsonify({
        "success": True,
        "total": total,
        "active": active,
        "revoked": revoked,
        "multi_device": multi_device
    })

@app.route("/api/admin/licenses", methods=["GET"])
@admin_required
def list_licenses():
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT key, duration_type, client_type, created_at, expires_at, status, bound_device_id, bound_ip,
               device_model, is_tested, is_online, last_heartbeat, activation_count,
               multi_device_detected, connection_type, webview_version, browser_fingerprint,
               mac_address, location
        FROM licenses
        ORDER BY created_at DESC
    """)
    rows = cur.fetchall()
    cur.close()
    conn.close()

    now = datetime.now()
    results = []
    for r in rows:
        last_hb = r[11] if isinstance(r, (tuple, list)) else r['last_heartbeat']
        # Compute online status based on heartbeat within 90 seconds
        online = False
        if last_hb:
            try:
                hb_dt = datetime.strptime(last_hb, "%Y-%m-%d %H:%M:%S")
                if (now - hb_dt).total_seconds() < 90:
                    online = True
            except Exception:
                pass

        results.append({
            "key": r[0] if isinstance(r, (tuple, list)) else r['key'],
            "duration_type": r[1] if isinstance(r, (tuple, list)) else r['duration_type'],
            "client_type": (r[2] if isinstance(r, (tuple, list)) else r['client_type']) or "app",
            "created_at": r[3] if isinstance(r, (tuple, list)) else r['created_at'],
            "expires_at": r[4] if isinstance(r, (tuple, list)) else r['expires_at'],
            "status": r[5] if isinstance(r, (tuple, list)) else r['status'],
            "bound_device_id": r[6] if isinstance(r, (tuple, list)) else r['bound_device_id'],
            "bound_ip": r[7] if isinstance(r, (tuple, list)) else r['bound_ip'],
            "device_model": r[8] if isinstance(r, (tuple, list)) else r['device_model'],
            "is_tested": bool(r[9] if isinstance(r, (tuple, list)) else r['is_tested']),
            "is_online": online,
            "last_heartbeat": last_hb or "لم يتصل بعد",
            "activation_count": r[12] if isinstance(r, (tuple, list)) else r['activation_count'],
            "multi_device_detected": bool(r[13] if isinstance(r, (tuple, list)) else r['multi_device_detected']),
            "connection_type": r[14] if isinstance(r, (tuple, list)) else r['connection_type'],
            "webview_version": r[15] if isinstance(r, (tuple, list)) else r['webview_version'],
            "browser_fingerprint": r[16] if isinstance(r, (tuple, list)) else r['browser_fingerprint'],
            "mac_address": r[17] if isinstance(r, (tuple, list)) else r['mac_address'],
            "location": r[18] if isinstance(r, (tuple, list)) else r['location']
        })

    return jsonify({"success": True, "licenses": results})

@app.route("/api/admin/licenses/generate", methods=["POST"])
@admin_required
def admin_generate_key():
    data = request.get_json(force=True, silent=True) or {}
    duration = data.get("duration", "month") # week, month, quarter, year, lifetime
    client_type = data.get("client_type", "app").strip().lower()
    if client_type not in ("app", "script"):
        client_type = "app"
    
    now = datetime.now()
    created_at = now.strftime("%Y-%m-%d")

    if duration == "week":
        expires_at = (now + timedelta(days=7)).strftime("%Y-%m-%d")
        duration_label = "أسبوع (7 أيام)"
    elif duration == "month":
        expires_at = (now + timedelta(days=30)).strftime("%Y-%m-%d")
        duration_label = "شهر (30 يوم)"
    elif duration == "quarter":
        expires_at = (now + timedelta(days=90)).strftime("%Y-%m-%d")
        duration_label = "3 شهور (90 يوم)"
    elif duration == "year":
        expires_at = (now + timedelta(days=365)).strftime("%Y-%m-%d")
        duration_label = "سنة (365 يوم)"
    else:
        expires_at = "2099-12-31"
        duration_label = "مدى الحياة (Lifetime VIP)"

    key = generate_cryptographic_license_key()

    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO licenses (key, duration_type, client_type, created_at, expires_at, status, is_tested, is_online, activation_count, multi_device_detected)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """ if is_postgres() else """
        INSERT INTO licenses (key, duration_type, client_type, created_at, expires_at, status, is_tested, is_online, activation_count, multi_device_detected)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (key, duration, client_type, created_at, expires_at, "active", False if is_postgres() else 0, False if is_postgres() else 0, 0, False if is_postgres() else 0))
    conn.commit()
    cur.close()
    conn.close()

    return jsonify({
        "success": True,
        "key": key,
        "duration_type": duration,
        "client_type": client_type,
        "duration_label": duration_label,
        "expires_at": expires_at,
        "message": f"تم توليد مفتاح ترخيص جديد بنجاح لمدة {duration_label}!"
    })

@app.route("/api/admin/licenses/revoke", methods=["POST"])
@admin_required
def admin_revoke_key():
    data = request.get_json(force=True, silent=True) or {}
    key = data.get("key", "").strip()
    if not key:
        return jsonify({"success": False, "message": "المفتاح مطلوب"}), 400

    conn = get_connection()
    cur = conn.cursor()
    cur.execute("UPDATE licenses SET status = 'revoked' WHERE key = %s" if is_postgres() else "UPDATE licenses SET status = 'revoked' WHERE key = ?", (key,))
    conn.commit()
    cur.close()
    conn.close()
    return jsonify({"success": True, "message": f"تم إلغاء الترخيص للمفتاح {key} فوراً!"})

@app.route("/api/admin/licenses/block", methods=["POST"])
@admin_required
def admin_block_key():
    data = request.get_json(force=True, silent=True) or {}
    key = data.get("key", "").strip()
    if not key:
        return jsonify({"success": False, "message": "المفتاح مطلوب"}), 400

    conn = get_connection()
    cur = conn.cursor()
    cur.execute("UPDATE licenses SET status = 'blocked' WHERE key = %s" if is_postgres() else "UPDATE licenses SET status = 'blocked' WHERE key = ?", (key,))
    conn.commit()
    cur.close()
    conn.close()
    return jsonify({"success": True, "message": f"تم حظر المفتاح والجهاز المربوط {key} بالكامل!"})

@app.route("/api/admin/licenses/activate", methods=["POST"])
@admin_required
def admin_activate_key():
    data = request.get_json(force=True, silent=True) or {}
    key = data.get("key", "").strip()
    reset_device = data.get("reset_device", False)
    if not key:
        return jsonify({"success": False, "message": "المفتاح مطلوب"}), 400

    conn = get_connection()
    cur = conn.cursor()
    if reset_device:
        cur.execute("UPDATE licenses SET status = 'active', bound_device_id = NULL, bound_ip = NULL, multi_device_detected = %s WHERE key = %s" if is_postgres() else "UPDATE licenses SET status = 'active', bound_device_id = NULL, bound_ip = NULL, multi_device_detected = ? WHERE key = ?", (False if is_postgres() else 0, key))
    else:
        cur.execute("UPDATE licenses SET status = 'active' WHERE key = %s" if is_postgres() else "UPDATE licenses SET status = 'active' WHERE key = ?", (key,))
    conn.commit()
    cur.close()
    conn.close()
    return jsonify({"success": True, "message": f"تم تنشيط المفتاح {key} بنجاح!"})

@app.route("/api/admin/licenses/delete", methods=["POST"])
@admin_required
def admin_delete_key():
    data = request.get_json(force=True, silent=True) or {}
    key = data.get("key", "").strip()
    if not key:
        return jsonify({"success": False, "message": "المفتاح مطلوب"}), 400

    conn = get_connection()
    cur = conn.cursor()
    cur.execute("DELETE FROM licenses WHERE key = %s" if is_postgres() else "DELETE FROM licenses WHERE key = ?", (key,))
    cur.execute("DELETE FROM device_telemetry_logs WHERE license_key = %s" if is_postgres() else "DELETE FROM device_telemetry_logs WHERE license_key = ?", (key,))
    conn.commit()
    cur.close()
    conn.close()
    return jsonify({"success": True, "message": f"تم حذف المفتاح {key} وبياناته نهائياً من قاعدة البيانات!"})

@app.route("/api/admin/telemetry", methods=["GET"])
@admin_required
def admin_telemetry():
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT id, license_key, device_id, client_type, event_type, ip, connection_type, device_model, location, webview_version, browser_fingerprint, created_at
        FROM device_telemetry_logs
        ORDER BY created_at DESC
        LIMIT 100
    """)
    rows = cur.fetchall()
    cur.close()
    conn.close()

    logs = []
    for r in rows:
        logs.append({
            "id": r[0] if isinstance(r, (tuple, list)) else r['id'],
            "license_key": r[1] if isinstance(r, (tuple, list)) else r['license_key'],
            "device_id": r[2] if isinstance(r, (tuple, list)) else r['device_id'],
            "client_type": (r[3] if isinstance(r, (tuple, list)) else r['client_type']) or "app",
            "event_type": r[4] if isinstance(r, (tuple, list)) else r['event_type'],
            "ip": r[5] if isinstance(r, (tuple, list)) else r['ip'],
            "connection_type": r[6] if isinstance(r, (tuple, list)) else r['connection_type'],
            "device_model": r[7] if isinstance(r, (tuple, list)) else r['device_model'],
            "location": r[8] if isinstance(r, (tuple, list)) else r['location'],
            "webview_version": r[9] if isinstance(r, (tuple, list)) else r['webview_version'],
            "browser_fingerprint": r[10] if isinstance(r, (tuple, list)) else r['browser_fingerprint'],
            "created_at": r[11] if isinstance(r, (tuple, list)) else r['created_at']
        })
    return jsonify({"success": True, "logs": logs})

@app.route("/api/admin/change-password", methods=["POST"])
@admin_required
def admin_change_password_api():
    data = request.get_json(force=True, silent=True) or {}
    current_pass = data.get("current_password", "").strip()
    new_pass = data.get("new_password", "").strip()
    username = session.get("admin_username", "admin")

    if not new_pass or len(new_pass) < 6:
        return jsonify({"success": False, "message": "كلمة المرور الجديدة يجب أن تحتوي على 6 أحرف على الأقل"}), 400

    ok, msg = change_admin_password(username, current_pass, new_pass)
    if ok:
        return jsonify({"success": True, "message": msg})
    return jsonify({"success": False, "message": msg}), 400

@app.route("/api/admin/toggle-status", methods=["POST"])
@admin_required
def admin_toggle_status_api():
    data = request.get_json(force=True, silent=True) or {}
    is_active = data.get("is_active", True)
    username = session.get("admin_username", "admin")
    ok, msg = toggle_admin_account_status(username, is_active)
    return jsonify({"success": ok, "message": msg})

# Initialize DB and Admin on startup
init_db()
init_admin()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    print(f"[LicenseServer] Running production-ready server on 0.0.0.0:{port}...")
    app.run(host="0.0.0.0", port=port, debug=False)
