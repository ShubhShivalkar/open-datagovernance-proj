from __future__ import annotations
import psycopg2
import psycopg2.extras


class PostgreSQLQueryMixin:
    """Adds execute_query and execute_writes_transactionally to the PostgreSQL connector."""

    def execute_query(self, sql: str, params: list | None = None) -> list[dict]:
        conn = psycopg2.connect(**self._build_dsn())
        try:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute(sql, params or [])
            return [dict(row) for row in cur.fetchall()]
        except psycopg2.Error as exc:
            raise RuntimeError(f"Query failed: {exc}") from exc
        finally:
            conn.close()

    def execute_writes_transactionally(self, statements: list[tuple[str, list]]) -> None:
        conn = psycopg2.connect(**self._build_dsn())
        try:
            conn.autocommit = False
            cur = conn.cursor()
            for sql, params in statements:
                cur.execute(sql, params or [])
            conn.commit()
        except Exception as exc:
            conn.rollback()
            raise RuntimeError(f"Transactional write failed (rolled back): {exc}") from exc
        finally:
            conn.close()
