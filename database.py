import os
import sqlite3
import time
from urllib.parse import urlparse

DATABASE_URL = os.environ.get("DATABASE_URL")

def is_postgres():
    return bool(DATABASE_URL and (DATABASE_URL.startswith("postgres://") or DATABASE_URL.startswith("postgresql://")))

def get_connection():
    if is_postgres():
        import psycopg2
        # Fix Render postgres:// to postgresql:// if needed
        url = DATABASE_URL
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql://", 1)
        return psycopg2.connect(url)
    else:
        db_path = os.path.join(os.path.dirname(__file__), "prsocial_licenses.db")
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        return conn

def init_db():
    conn = get_connection()
    cur = conn.cursor()

    if is_postgres():
        # PostgreSQL / Supabase Schema
        cur.execute("""
            CREATE TABLE IF NOT EXISTS admin_users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(100) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS licenses (
                key VARCHAR(64) PRIMARY KEY,
                duration_type VARCHAR(20) DEFAULT 'lifetime',
                created_at VARCHAR(30),
                expires_at VARCHAR(30),
                status VARCHAR(20) DEFAULT 'active',
                bound_device_id VARCHAR(100),
                bound_ip VARCHAR(50),
                device_model VARCHAR(100),
                is_tested BOOLEAN DEFAULT FALSE,
                is_online BOOLEAN DEFAULT FALSE,
                last_heartbeat VARCHAR(30),
                activation_count INTEGER DEFAULT 0,
                multi_device_detected BOOLEAN DEFAULT FALSE,
                connection_type VARCHAR(50) DEFAULT 'Unknown',
                webview_version VARCHAR(100) DEFAULT 'Unknown',
                browser_user_agent TEXT,
                browser_fingerprint VARCHAR(100),
                mac_address VARCHAR(100),
                location VARCHAR(150) DEFAULT 'Unknown'
            );
        """)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS device_telemetry_logs (
                id SERIAL PRIMARY KEY,
                license_key VARCHAR(64),
                device_id VARCHAR(100),
                event_type VARCHAR(50),
                ip VARCHAR(50),
                connection_type VARCHAR(50),
                device_model VARCHAR(100),
                location VARCHAR(150),
                webview_version VARCHAR(100),
                browser_fingerprint VARCHAR(100),
                created_at VARCHAR(30)
            );
        """)
    else:
        # SQLite Schema
        cur.execute("""
            CREATE TABLE IF NOT EXISTS admin_users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TEXT
            );
        """)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS licenses (
                key TEXT PRIMARY KEY,
                duration_type TEXT DEFAULT 'lifetime',
                created_at TEXT,
                expires_at TEXT,
                status TEXT DEFAULT 'active',
                bound_device_id TEXT,
                bound_ip TEXT,
                device_model TEXT,
                is_tested INTEGER DEFAULT 0,
                is_online INTEGER DEFAULT 0,
                last_heartbeat TEXT,
                activation_count INTEGER DEFAULT 0,
                multi_device_detected INTEGER DEFAULT 0,
                connection_type TEXT DEFAULT 'Unknown',
                webview_version TEXT DEFAULT 'Unknown',
                browser_user_agent TEXT,
                browser_fingerprint TEXT,
                mac_address TEXT,
                location TEXT DEFAULT 'Unknown'
            );
        """)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS device_telemetry_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                license_key TEXT,
                device_id TEXT,
                event_type TEXT,
                ip TEXT,
                connection_type TEXT,
                device_model TEXT,
                location TEXT,
                webview_version TEXT,
                browser_fingerprint TEXT,
                created_at TEXT
            );
        """)

        # Auto-migrate any missing columns in existing SQLite table
        cur.execute("PRAGMA table_info(licenses)")
        existing_cols = [r[1] for r in cur.fetchall()]
        required_cols = [
            ("duration_type", "TEXT DEFAULT 'lifetime'"),
            ("is_tested", "INTEGER DEFAULT 0"),
            ("is_online", "INTEGER DEFAULT 0"),
            ("last_heartbeat", "TEXT"),
            ("activation_count", "INTEGER DEFAULT 0"),
            ("multi_device_detected", "INTEGER DEFAULT 0"),
            ("connection_type", "TEXT DEFAULT 'Unknown'"),
            ("webview_version", "TEXT DEFAULT 'Unknown'"),
            ("browser_user_agent", "TEXT"),
            ("browser_fingerprint", "TEXT"),
            ("mac_address", "TEXT"),
            ("location", "TEXT DEFAULT 'Unknown'")
        ]
        for col_name, col_def in required_cols:
            if col_name not in existing_cols:
                try:
                    cur.execute(f"ALTER TABLE licenses ADD COLUMN {col_name} {col_def}")
                    print(f"[Database Migration] Added column: {col_name}")
                except Exception as e:
                    print(f"[Database Migration] Column {col_name} notice: {e}")

    conn.commit()
    cur.close()
    conn.close()
    print("[Database] Initialized successfully. Provider:", "PostgreSQL/Supabase" if is_postgres() else "SQLite")
