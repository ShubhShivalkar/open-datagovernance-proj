from __future__ import annotations
import psycopg2
import psycopg2.extras


class PostgreSQLSchemaMixin:
    """Introspects the PostgreSQL database schema via information_schema and pg_catalog."""

    def get_schema(self) -> dict:
        conn = psycopg2.connect(**self._build_dsn())
        try:
            return self._introspect(conn)
        finally:
            conn.close()

    def _introspect(self, conn) -> dict:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        cur.execute("""
            SELECT
                c.table_schema,
                c.table_name,
                c.column_name,
                c.data_type,
                c.character_maximum_length,
                c.is_nullable,
                c.column_default,
                pgd.description AS comment
            FROM information_schema.columns c
            JOIN information_schema.tables t
                ON t.table_schema = c.table_schema
               AND t.table_name   = c.table_name
            LEFT JOIN pg_catalog.pg_statio_all_tables st
                ON st.schemaname = c.table_schema
               AND st.relname    = c.table_name
            LEFT JOIN pg_catalog.pg_description pgd
                ON pgd.objoid   = st.relid
               AND pgd.objsubid = c.ordinal_position
            WHERE t.table_type   = 'BASE TABLE'
              AND c.table_schema NOT IN ('pg_catalog', 'information_schema')
            ORDER BY c.table_schema, c.table_name, c.ordinal_position
        """)
        col_rows = cur.fetchall()

        cur.execute("""
            SELECT
                kcu.table_schema,
                kcu.table_name,
                kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
                ON kcu.constraint_name = tc.constraint_name
               AND kcu.table_schema    = tc.table_schema
            WHERE tc.constraint_type = 'PRIMARY KEY'
        """)
        pk_set = {
            (r["table_schema"], r["table_name"], r["column_name"])
            for r in cur.fetchall()
        }

        cur.execute("""
            SELECT
                kcu.table_schema,
                kcu.table_name,
                kcu.column_name,
                ccu.table_name  AS ref_table,
                ccu.column_name AS ref_column
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
                ON kcu.constraint_name = tc.constraint_name
               AND kcu.table_schema    = tc.table_schema
            JOIN information_schema.constraint_column_usage ccu
                ON ccu.constraint_name = tc.constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY'
        """)
        fk_map: dict[tuple, dict] = {}
        for r in cur.fetchall():
            key = (r["table_schema"], r["table_name"], r["column_name"])
            fk_map[key] = {"table": r["ref_table"], "column": r["ref_column"]}

        cur.execute("""
            SELECT
                schemaname AS table_schema,
                relname    AS table_name,
                n_live_tup AS row_count_estimate
            FROM pg_stat_user_tables
        """)
        row_counts = {
            (r["table_schema"], r["table_name"]): r["row_count_estimate"]
            for r in cur.fetchall()
        }

        schema: dict = {}
        for row in col_rows:
            ts = row["table_schema"]
            tn = row["table_name"]
            key = f"{ts}.{tn}" if ts != "public" else tn
            if key not in schema:
                schema[key] = {
                    "schema": ts,
                    "columns": [],
                    "row_count_estimate": row_counts.get((ts, tn)),
                }
            col_key = (ts, tn, row["column_name"])
            schema[key]["columns"].append(
                self._make_column(
                    name=row["column_name"],
                    data_type=row["data_type"],
                    nullable=row["is_nullable"] == "YES",
                    is_primary_key=col_key in pk_set,
                    is_foreign_key=col_key in fk_map,
                    foreign_key_references=fk_map.get(col_key),
                    default_value=row["column_default"],
                    max_length=row["character_maximum_length"],
                    comment=row["comment"],
                )
            )
        return schema

    def get_sample_data(self, table_name: str, limit: int = 5) -> list[dict]:
        try:
            conn = psycopg2.connect(**self._build_dsn())
            try:
                cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
                if "." in table_name:
                    schema_part, tbl_part = table_name.split(".", 1)
                else:
                    schema_part, tbl_part = "public", table_name
                cur.execute(
                    f"SELECT * FROM {psycopg2.extensions.quote_ident(schema_part, cur)}"
                    f".{psycopg2.extensions.quote_ident(tbl_part, cur)} LIMIT %s",
                    (limit,),
                )
                return [dict(r) for r in cur.fetchall()]
            finally:
                conn.close()
        except Exception:
            return []
