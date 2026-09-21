from __future__ import annotations
import re
import psycopg2

_PRIV_COLS = [
    ("is_superuser",    "SUPERUSER"),
    ("can_create_db",   "CREATEDB"),
    ("can_create_role", "CREATEROLE"),
    ("can_inherit",     "INHERIT"),
]

_PRIVILEGE_GRANTS = {
    "read_only": (
        "GRANT CONNECT ON DATABASE {db} TO {user};\n"
        "GRANT USAGE ON SCHEMA public TO {user};\n"
        "GRANT SELECT ON ALL TABLES IN SCHEMA public TO {user};"
    ),
    "read_write": (
        "GRANT CONNECT ON DATABASE {db} TO {user};\n"
        "GRANT USAGE ON SCHEMA public TO {user};\n"
        "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {user};"
    ),
    "full": (
        "GRANT ALL PRIVILEGES ON DATABASE {db} TO {user};\n"
        "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO {user};"
    ),
}


class PostgreSQLUsersMixin:
    """Reads and creates PostgreSQL user accounts (roles with LOGIN)."""

    def get_db_users(self) -> list[dict]:
        conn = psycopg2.connect(**self._build_dsn())
        try:
            cur = conn.cursor(cursor_factory=__import__("psycopg2.extras", fromlist=["RealDictCursor"]).RealDictCursor)
            cur.execute("""
                SELECT
                    rolname        AS username,
                    rolsuper       AS is_superuser,
                    rolcreatedb    AS can_create_db,
                    rolcreaterole  AS can_create_role,
                    rolcanlogin    AS can_login,
                    rolinherit     AS can_inherit
                FROM pg_catalog.pg_roles
                WHERE rolcanlogin = true
                ORDER BY rolname
            """)
            rows = cur.fetchall()
        except psycopg2.Error as exc:
            raise RuntimeError(f"Could not read pg_roles (need login): {exc}") from exc
        finally:
            conn.close()

        users = []
        for row in rows:
            privs = [label for col, label in _PRIV_COLS if row.get(col)]
            users.append({
                "username": row["username"],
                "host": None,
                "is_superuser": row["is_superuser"],
                "privileges": ", ".join(privs) if privs else "LOGIN",
            })
        return users

    def create_db_user(self, username: str, password: str, privilege_level: str, database: str) -> None:
        if not re.match(r"^[a-zA-Z0-9_]+$", username):
            raise ValueError(
                f"Invalid username '{username}': only letters, digits, and underscores are allowed."
            )
        grant_template = _PRIVILEGE_GRANTS.get(privilege_level, _PRIVILEGE_GRANTS["read_only"])
        grant_sql = grant_template.format(db=database, user=username)

        conn = psycopg2.connect(**self._build_dsn())
        try:
            conn.autocommit = True
            cur = conn.cursor()
            cur.execute(f"CREATE USER {username} WITH PASSWORD %s", (password,))
            for stmt in grant_sql.strip().split("\n"):
                stmt = stmt.strip()
                if stmt:
                    cur.execute(stmt)
        except psycopg2.Error as exc:
            raise RuntimeError(f"PostgreSQL user creation failed: {exc}") from exc
        finally:
            conn.close()
