# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import os
import sqlite3
from pathlib import Path
from urllib.parse import urlparse, unquote


TABLE_NAME = "app_json_documents"


def database_url() -> str:
    return os.environ.get("DATABASE_URL", "").strip()


def is_enabled() -> bool:
    return bool(database_url())


def document_key(path, data_dir=None) -> str:
    source = Path(path).resolve()
    if data_dir is not None:
        try:
            return source.relative_to(Path(data_dir).resolve()).as_posix()
        except ValueError:
            pass
    return source.name


def load_document(path, data_dir=None):
    url = database_url()
    if not url:
        return None

    key = document_key(path, data_dir)
    if url.startswith("sqlite:"):
        return _load_sqlite(url, key)
    return _load_postgres(url, key)


def save_document(path, data, data_dir=None) -> bool:
    url = database_url()
    if not url:
        return False

    key = document_key(path, data_dir)
    if url.startswith("sqlite:"):
        _save_sqlite(url, key, data)
    else:
        _save_postgres(url, key, data)
    return True


def ensure_document(path, default, data_dir=None, file_loader=None):
    if load_document(path, data_dir) is not None:
        return

    seed = default
    if file_loader is not None:
        seed = file_loader(path, default)
    save_document(path, seed, data_dir)


def _sqlite_path(url: str) -> str:
    parsed = urlparse(url)
    if parsed.path in ("", "/:memory:"):
        return ":memory:"
    if parsed.netloc:
        return unquote(f"//{parsed.netloc}{parsed.path}")
    return unquote(parsed.path)


def _sqlite_connect(url: str):
    conn = sqlite3.connect(_sqlite_path(url))
    conn.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    return conn


def _load_sqlite(url: str, key: str):
    conn = _sqlite_connect(url)
    try:
        row = conn.execute(f"SELECT value FROM {TABLE_NAME} WHERE key = ?", (key,)).fetchone()
    finally:
        conn.close()
    if row is None:
        return None
    return json.loads(row[0])


def _save_sqlite(url: str, key: str, data):
    payload = json.dumps(data, ensure_ascii=False)
    conn = _sqlite_connect(url)
    try:
        conn.execute(
            f"""
            INSERT INTO {TABLE_NAME} (key, value, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                updated_at = CURRENT_TIMESTAMP
            """,
            (key, payload),
        )
        conn.commit()
    finally:
        conn.close()


def _postgres_connect(url: str):
    try:
        import psycopg
    except ImportError as exc:
        raise RuntimeError("DATABASE_URL is set, but psycopg is not installed") from exc

    conn = psycopg.connect(url)
    with conn.cursor() as cur:
        cur.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
                key TEXT PRIMARY KEY,
                value JSONB NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )
    conn.commit()
    return conn


def _load_postgres(url: str, key: str):
    with _postgres_connect(url) as conn:
        with conn.cursor() as cur:
            cur.execute(f"SELECT value FROM {TABLE_NAME} WHERE key = %s", (key,))
            row = cur.fetchone()
    if row is None:
        return None
    return row[0]


def _save_postgres(url: str, key: str, data):
    from psycopg.types.json import Jsonb

    with _postgres_connect(url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                INSERT INTO {TABLE_NAME} (key, value, updated_at)
                VALUES (%s, %s, NOW())
                ON CONFLICT(key) DO UPDATE SET
                    value = excluded.value,
                    updated_at = NOW()
                """,
                (key, Jsonb(data)),
            )
        conn.commit()
