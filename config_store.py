import os
import sqlite3
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

load_dotenv()

DB_PATH = Path(os.getenv("APP_DB_PATH", "app_data.db"))

CONFIG_DEFAULTS: dict[str, str] = {
    "DASHSCOPE_API_KEY": os.getenv("DASHSCOPE_API_KEY", ""),
    "BILIBILI_SESSDATA": os.getenv("BILIBILI_SESSDATA", ""),
    "IMGBB_API_KEY": os.getenv("IMGBB_API_KEY", ""),
    "GITHUB_TOKEN": os.getenv("GITHUB_TOKEN", ""),
    "GITHUB_REPO": os.getenv("GITHUB_REPO", ""),
    "GITHUB_PATH": os.getenv("GITHUB_PATH", "reports"),
    "GITHUB_BRANCH": os.getenv("GITHUB_BRANCH", "main"),
    "SUMMARY_CACHE_TTL_MINUTES": os.getenv("SUMMARY_CACHE_TTL_MINUTES", "120"),
    "API_BASE_URL": os.getenv("API_BASE_URL", "http://127.0.0.1:8000"),
}


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS app_config (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS api_keys (
                name TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS app_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category TEXT NOT NULL,
                payload TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        for key, value in CONFIG_DEFAULTS.items():
            conn.execute(
                "INSERT OR IGNORE INTO app_config(key, value) VALUES(?, ?)",
                (key, value),
            )
        conn.commit()


def get_config(key: str, default: str = "") -> str:
    with _connect() as conn:
        row = conn.execute("SELECT value FROM app_config WHERE key = ?", (key,)).fetchone()
    if row:
        return str(row["value"])
    return CONFIG_DEFAULTS.get(key, default)


def set_config(key: str, value: str) -> None:
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO app_config(key, value, updated_at)
            VALUES(?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                updated_at = CURRENT_TIMESTAMP
            """,
            (key, value),
        )
        conn.commit()


def get_all_config() -> dict[str, str]:
    with _connect() as conn:
        rows = conn.execute("SELECT key, value FROM app_config").fetchall()
    data = {str(row["key"]): str(row["value"]) for row in rows}
    for key, value in CONFIG_DEFAULTS.items():
        data.setdefault(key, value)
    return data


def set_many_config(values: dict[str, Any]) -> None:
    with _connect() as conn:
        for key, value in values.items():
            conn.execute(
                """
                INSERT INTO app_config(key, value, updated_at)
                VALUES(?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(key) DO UPDATE SET
                    value = excluded.value,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (key, str(value)),
            )
        conn.commit()


def save_api_key(name: str, value: str) -> None:
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO api_keys(name, value, updated_at)
            VALUES(?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(name) DO UPDATE SET
                value = excluded.value,
                updated_at = CURRENT_TIMESTAMP
            """,
            (name, value),
        )
        conn.commit()


def get_api_key(name: str, default: str = "") -> str:
    with _connect() as conn:
        row = conn.execute("SELECT value FROM api_keys WHERE name = ?", (name,)).fetchone()
    return str(row["value"]) if row else default
