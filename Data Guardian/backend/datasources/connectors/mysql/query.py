from __future__ import annotations
import pymysql
import pymysql.cursors


class MySQLQueryMixin:
    """Adds quote_identifier, execute_query and execute_writes_transactionally to the MySQL connector."""

    def quote_identifier(self, name: str) -> str:
        clean = name.replace("`", "")
        return f"`{clean}`"

    def execute_query(self, sql: str, params: list | None = None) -> list[dict]:
        conn = self._get_connection()
        try:
            cur = conn.cursor(pymysql.cursors.DictCursor)
            cur.execute(sql, params or [])
            return list(cur.fetchall())
        except pymysql.err.Error as exc:
            raise RuntimeError(f"Query failed: {exc}") from exc
        finally:
            conn.close()

    def execute_writes_transactionally(self, statements: list[tuple[str, list]]) -> None:
        conn = self._get_connection()
        try:
            conn.begin()
            cur = conn.cursor()
            for sql, params in statements:
                cur.execute(sql, params or [])
            conn.commit()
        except Exception as exc:
            conn.rollback()
            raise RuntimeError(f"Transactional write failed (rolled back): {exc}") from exc
        finally:
            conn.close()
