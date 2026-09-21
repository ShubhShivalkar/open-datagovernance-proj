from __future__ import annotations
import pymysql
import pymysql.cursors


class MySQLConnectionMixin:
    """Handles opening and testing MySQL connections."""

    def _get_connection(self):
        c = self.credentials
        return pymysql.connect(
            host=c.get("host", "localhost"),
            port=int(c.get("port", 3306)),
            db=c["database"],
            user=c["username"],
            password=c.get("password", ""),
            connect_timeout=10,
            cursorclass=pymysql.cursors.DictCursor,
            **({"ssl": {"ca": c["ssl_ca"]}} if c.get("ssl_ca") else {}),
        )

    def test_connection(self) -> tuple[bool, str]:
        try:
            conn = self._get_connection()
            conn.close()
            return True, "Connection successful"
        except Exception as exc:  # noqa: BLE001
            return False, str(exc)
