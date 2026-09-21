from __future__ import annotations
import psycopg2


class PostgreSQLConnectionMixin:
    """Handles opening and testing PostgreSQL connections."""

    def _build_dsn(self) -> dict:
        c = self.credentials
        return {
            "host": c.get("host", "localhost"),
            "port": int(c.get("port", 5432)),
            "dbname": c["database"],
            "user": c["username"],
            "password": c.get("password", ""),
            "connect_timeout": 10,
            **({"sslmode": c["ssl_mode"]} if c.get("ssl_mode") else {}),
        }

    def test_connection(self) -> tuple[bool, str]:
        try:
            conn = psycopg2.connect(**self._build_dsn())
            conn.close()
            return True, "Connection successful"
        except Exception as exc:  # noqa: BLE001
            return False, str(exc)
