from __future__ import annotations
import pymysql.err


class MySQLDDLMixin:
    """Executes DDL statements (CREATE/DROP VIEW, CREATE SCHEMA, etc.)."""

    def execute_ddl(self, ddl: str) -> None:
        conn = self._get_connection()
        try:
            conn.cursor().execute(ddl)
            conn.commit()
        except pymysql.err.Error as exc:
            raise RuntimeError(f"DDL execution failed: {exc}") from exc
        finally:
            conn.close()
