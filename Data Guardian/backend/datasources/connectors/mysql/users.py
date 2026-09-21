from __future__ import annotations
import re
import pymysql.err

_PRIV_COLS = [
    ("is_super",        "SUPER"),
    ("can_grant",       "GRANT OPTION"),
    ("can_create",      "CREATE"),
    ("can_drop",        "DROP"),
    ("can_select",      "SELECT"),
    ("can_insert",      "INSERT"),
    ("can_update",      "UPDATE"),
    ("can_delete",      "DELETE"),
    ("can_create_view", "CREATE VIEW"),
]

_PRIVILEGE_GRANTS = {
    "read_only":  "SELECT",
    "read_write": "SELECT, INSERT, UPDATE, DELETE",
    "full":       "ALL PRIVILEGES",
}


class MySQLUsersMixin:
    """Reads and creates MySQL user accounts."""

    def get_db_users(self) -> list[dict]:
        conn = self._get_connection()
        try:
            cur = conn.cursor()
            cur.execute("""
                SELECT
                    User             AS username,
                    Host             AS host,
                    Super_priv       AS is_super,
                    Grant_priv       AS can_grant,
                    Create_priv      AS can_create,
                    Drop_priv        AS can_drop,
                    Select_priv      AS can_select,
                    Insert_priv      AS can_insert,
                    Update_priv      AS can_update,
                    Delete_priv      AS can_delete,
                    Create_view_priv AS can_create_view
                FROM mysql.user
                WHERE User != ''
                ORDER BY User, Host
            """)
            rows = cur.fetchall()
        except pymysql.err.Error as exc:
            raise RuntimeError(f"Could not read mysql.user (need SELECT privilege): {exc}") from exc
        finally:
            conn.close()

        seen: set[str] = set()
        users: list[dict] = []
        for row in rows:
            username = row["username"]
            if username in seen:
                continue
            seen.add(username)
            privs = [label for col, label in _PRIV_COLS if row.get(col) == "Y"]
            users.append({
                "username": username,
                "host": row["host"],
                "is_superuser": row.get("is_super") == "Y",
                "privileges": ", ".join(privs) if privs else "none",
            })
        return users

    def create_db_user(self, username: str, password: str, privilege_level: str, database: str) -> None:
        if not re.match(r"^[a-zA-Z0-9_]+$", username):
            raise ValueError(
                f"Invalid username '{username}': only letters, digits, and underscores are allowed."
            )
        grants = _PRIVILEGE_GRANTS.get(privilege_level, "SELECT")
        conn = self._get_connection()
        try:
            cur = conn.cursor()
            # %%  →  PyMySQL converts to literal % inside parameterized calls
            cur.execute(f"CREATE USER '{username}'@'%%' IDENTIFIED BY %s", (password,))
            # plain f-string, no parameterization → use % directly
            cur.execute(f"GRANT {grants} ON `{database}`.* TO '{username}'@'%'")
            cur.execute("FLUSH PRIVILEGES")
            conn.commit()
        except pymysql.err.Error as exc:
            raise RuntimeError(f"MySQL user creation failed: {exc}") from exc
        finally:
            conn.close()
