from __future__ import annotations


class MySQLSchemaMixin:
    """Introspects the MySQL database schema via information_schema."""

    def get_schema(self) -> dict:
        conn = self._get_connection()
        try:
            return self._introspect(conn)
        finally:
            conn.close()

    def _introspect(self, conn) -> dict:
        db_name = self.credentials["database"]
        cur = conn.cursor()

        cur.execute("""
            SELECT
                c.TABLE_NAME,
                c.COLUMN_NAME,
                c.DATA_TYPE,
                c.CHARACTER_MAXIMUM_LENGTH,
                c.IS_NULLABLE,
                c.COLUMN_DEFAULT,
                c.COLUMN_COMMENT,
                c.COLUMN_KEY
            FROM information_schema.COLUMNS c
            WHERE c.TABLE_SCHEMA = %s
            ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION
        """, (db_name,))
        col_rows = cur.fetchall()

        cur.execute("""
            SELECT
                kcu.TABLE_NAME,
                kcu.COLUMN_NAME,
                kcu.REFERENCED_TABLE_NAME,
                kcu.REFERENCED_COLUMN_NAME
            FROM information_schema.KEY_COLUMN_USAGE kcu
            WHERE kcu.TABLE_SCHEMA           = %s
              AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
        """, (db_name,))
        fk_map: dict[tuple, dict] = {}
        for r in cur.fetchall():
            fk_map[(r["TABLE_NAME"], r["COLUMN_NAME"])] = {
                "table": r["REFERENCED_TABLE_NAME"],
                "column": r["REFERENCED_COLUMN_NAME"],
            }

        cur.execute("""
            SELECT TABLE_NAME, TABLE_ROWS
            FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = %s AND TABLE_TYPE = 'BASE TABLE'
        """, (db_name,))
        row_counts = {r["TABLE_NAME"]: r["TABLE_ROWS"] for r in cur.fetchall()}

        schema: dict = {}
        for row in col_rows:
            tn = row["TABLE_NAME"]
            if tn not in schema:
                schema[tn] = {
                    "schema": db_name,
                    "columns": [],
                    "row_count_estimate": row_counts.get(tn),
                }
            col_key = (tn, row["COLUMN_NAME"])
            schema[tn]["columns"].append(
                self._make_column(
                    name=row["COLUMN_NAME"],
                    data_type=row["DATA_TYPE"],
                    nullable=row["IS_NULLABLE"] == "YES",
                    is_primary_key=row["COLUMN_KEY"] == "PRI",
                    is_foreign_key=col_key in fk_map,
                    foreign_key_references=fk_map.get(col_key),
                    default_value=row["COLUMN_DEFAULT"],
                    max_length=row["CHARACTER_MAXIMUM_LENGTH"],
                    comment=row["COLUMN_COMMENT"] or None,
                )
            )
        return schema

    def get_sample_data(self, table_name: str, limit: int = 5) -> list[dict]:
        try:
            conn = self._get_connection()
            try:
                cur = conn.cursor()
                safe_table = table_name.replace("`", "``")
                cur.execute(f"SELECT * FROM `{safe_table}` LIMIT %s", (limit,))
                return [dict(r) for r in cur.fetchall()]
            finally:
                conn.close()
        except Exception:
            return []
