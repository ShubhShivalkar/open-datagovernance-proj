"""
Base interface all database connectors must implement.

Each connector's `get_schema()` returns a structured dict:
{
    "table_name": {
        "schema": "public",           # namespace/schema/dataset
        "columns": [
            {
                "name": "user_id",
                "data_type": "integer",
                "nullable": False,
                "is_primary_key": True,
                "is_foreign_key": False,
                "foreign_key_references": None,   # or {"table": "...", "column": "..."}
                "default_value": None,
                "max_length": None,
                "comment": None,      # native DB-level comment if available
            },
            ...
        ],
        "row_count_estimate": 12345,   # best-effort estimate, may be None
    },
    ...
}
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class BaseConnector(ABC):
    """Abstract base class for all database connectors."""

    DB_TYPE: str = ""  # e.g. "postgresql", "mysql" — set by subclasses

    def __init__(self, credentials: dict):
        """
        Args:
            credentials: dict of connection parameters.
                         Contents are connector-specific — validated by each subclass.
        """
        self.credentials = credentials
        self._connection = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    @abstractmethod
    def test_connection(self) -> tuple[bool, str]:
        """
        Attempt to open a connection and return (success: bool, message: str).
        Should not raise — exceptions must be caught and returned as (False, str(exc)).
        """

    @abstractmethod
    def get_schema(self) -> dict[str, Any]:
        """
        Introspect the database and return a full schema dict as described above.
        Raises RuntimeError on unrecoverable errors.
        """

    @abstractmethod
    def execute_ddl(self, ddl: str) -> None:
        """
        Execute a DDL statement (e.g. CREATE OR REPLACE VIEW ...) against the
        connected database.

        Args:
            ddl: The raw DDL string to execute.

        Raises:
            RuntimeError: If the statement fails for any reason.
            NotImplementedError: If this connector type does not support DDL execution.
        """

    def create_db_user(self, username: str, password: str, privilege_level: str, database: str) -> None:
        """
        Create a new login user in the connected database and grant privileges.

        Args:
            username:        The new DB login name. Must contain only [a-zA-Z0-9_].
            password:        The new user's password.
            privilege_level: "read_only" | "read_write" | "full"
            database:        The database/schema to grant access to.

        Raises:
            ValueError: If username contains unsafe characters.
            RuntimeError: If the DDL fails (e.g. user already exists, insufficient privilege).
            NotImplementedError: If this connector type does not support user creation.
        """
        raise NotImplementedError(f"create_db_user() is not supported for {self.DB_TYPE}")

    def get_db_users(self) -> list[dict]:
        """
        Fetch all database-level users/roles and their privilege summary.

        Returns a list of dicts with at minimum:
            username (str), is_superuser (bool), privileges (str)

        Raises:
            NotImplementedError: If this connector type does not support user listing.
            RuntimeError: If the query fails (e.g. insufficient privileges).
        """
        raise NotImplementedError(f"get_db_users() is not supported for {self.DB_TYPE}")

    def quote_identifier(self, name: str) -> str:
        """Wrap a table or column name in the correct quote character for this DB dialect.

        Default: ANSI double-quotes (PostgreSQL, SQLite in ANSI mode).
        MySQL overrides this with backticks.
        """
        clean = name.replace('"', "")
        return f'"{clean}"'

    def execute_query(self, sql: str, params: list | None = None) -> list[dict]:
        """Execute a SELECT query and return rows as list of dicts.

        Raises:
            NotImplementedError: If this connector does not support query execution.
            RuntimeError: If the query fails.
        """
        raise NotImplementedError(f"execute_query() is not supported for {self.DB_TYPE}")

    def execute_writes_transactionally(self, statements: list[tuple[str, list]]) -> None:
        """Execute a list of (sql, params) DML statements in a single transaction.

        Rolls back all statements atomically if any statement fails.

        Args:
            statements: list of (sql_string, params_list) tuples, executed in order.

        Raises:
            NotImplementedError: If this connector does not support transactional writes.
            RuntimeError: If any statement fails (all changes are rolled back).
        """
        raise NotImplementedError(f"execute_writes_transactionally() is not supported for {self.DB_TYPE}")

    def get_sample_data(self, table_name: str, limit: int = 5) -> list[dict]:
        """
        Return up to `limit` rows from `table_name` as a list of dicts.

        Used to enrich AI prompts with real values when running a local LLM
        (data never leaves the machine). Must never raise — returns [] on any
        error (empty table, missing SELECT privilege, unsupported connector, etc.).
        """
        return []

    # ------------------------------------------------------------------
    # Helpers subclasses may override
    # ------------------------------------------------------------------

    def close(self):
        """Close the underlying connection if open."""
        if self._connection is not None:
            try:
                self._connection.close()
            except Exception:
                pass
            self._connection = None

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()

    # ------------------------------------------------------------------
    # Shared schema normalisation helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _make_column(
        name: str,
        data_type: str,
        nullable: bool = True,
        is_primary_key: bool = False,
        is_foreign_key: bool = False,
        foreign_key_references: dict | None = None,
        default_value: Any = None,
        max_length: int | None = None,
        comment: str | None = None,
    ) -> dict:
        return {
            "name": name,
            "data_type": data_type,
            "nullable": nullable,
            "is_primary_key": is_primary_key,
            "is_foreign_key": is_foreign_key,
            "foreign_key_references": foreign_key_references,
            "default_value": default_value,
            "max_length": max_length,
            "comment": comment,
        }
