from __future__ import annotations
import psycopg2


class PostgreSQLDDLMixin:
    """Executes DDL statements. Uses autocommit — DDL cannot run inside a transaction in PostgreSQL."""

    def execute_ddl(self, ddl: str) -> None:
        conn = psycopg2.connect(**self._build_dsn())
        try:
            conn.autocommit = True
            conn.cursor().execute(ddl)
        except psycopg2.Error as exc:
            raise RuntimeError(f"DDL execution failed: {exc}") from exc
        finally:
            conn.close()
