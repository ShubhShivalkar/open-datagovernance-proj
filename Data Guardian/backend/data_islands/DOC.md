# Data Islands — Module Documentation

## 1. Concept & Terminology

| Term | Definition |
|---|---|
| **Data Island** | A governed, shareable SQL VIEW created inside the user's actual connected database (not a data copy). |
| **View Name** | The SQL identifier used in `CREATE OR REPLACE VIEW <view_name> AS ...`. Auto-derived from the island name by slugifying. |
| **SQL Query** | The SELECT statement forming the VIEW body. Stored as-is and executed verbatim. |
| **Refresh** | Re-running `CREATE OR REPLACE VIEW` to update the VIEW definition. `CREATE OR REPLACE` is idempotent. |
| **Host Database** | The user's external connected database (MySQL, PostgreSQL, etc.) where the VIEW is materialized. |
| **Metadata DB** | The local SQLite database where DataIsland records, status, and access grants are stored. |

### Status Lifecycle

```
draft ──(DDL succeeds)──► active
  │                          │
  └──(DDL fails)──► error ◄──┘ (refresh fails)
                       │
                       └──(refresh succeeds)──► active
```

A `stale` status can be set externally to signal that the underlying data has changed and the VIEW should be refreshed.

---

## 2. Models

### DataIsland (`data_islands/models.py`)

Stores metadata about a single governed VIEW.

| Field | Type | Description |
|---|---|---|
| `id` | `UUIDField` | Primary key, auto-generated |
| `name` | `CharField(255)` | Human-readable island name |
| `description` | `TextField` | Optional description |
| `datasource` | `FK → DataSource` | The host DB environment |
| `view_name` | `CharField(255)` | SQL-safe VIEW identifier (auto-slugified from `name`) |
| `sql_query` | `TextField` | SELECT statement forming the VIEW body |
| `source_tables` | `JSONField` | Informational list of table names selected by the user. Not used in DDL. |
| `status` | `CharField` | `draft` / `active` / `error` / `stale` |
| `last_error` | `TextField` | Error message from the last failed DDL attempt |
| `last_refreshed_at` | `DateTimeField` | Timestamp of last successful DDL execution |
| `refresh_mode` | `CharField` | `manual` (default) or `scheduled` |
| `refresh_schedule` | `CharField` | Cron expression (stored but not yet processed) |
| `created_at` | `DateTimeField` | Auto-set on creation |
| `updated_at` | `DateTimeField` | Auto-updated on save |

**Design note:** `view_name` is always server-derived and never user-editable. This prevents SQL injection in the DDL identifier position.

### DataIslandAccess (`data_islands/models.py`)

Grants a user read/edit access to a DataIsland. No FK to `auth.User` yet — email is the authoritative identifier until authentication is implemented.

| Field | Type | Description |
|---|---|---|
| `id` | `UUIDField` | Primary key, auto-generated |
| `island` | `FK → DataIsland` | The island being granted access to |
| `email` | `EmailField(255)` | Grantee's email address (unique per island) |
| `name` | `CharField(255)` | Optional display name |
| `role` | `CharField` | `viewer` (default) or `editor` |
| `granted_at` | `DateTimeField` | Auto-set on creation |
| `granted_by` | `CharField(255)` | Free-text name/email of the granter |

**Auth-forward design:** When authentication is added, a nullable `user_id` FK can be added alongside `email` without migrating existing records.

---

## 3. Services (`data_islands/services.py`)

All service functions are **synchronous**. `CREATE OR REPLACE VIEW` is fast DDL and does not require background threading (unlike AI catalogue generation).

### `_slugify_view_name(name: str) -> str`

Converts a human name into a SQL-safe VIEW identifier.

**Algorithm:**
1. Lowercase the string
2. Replace any character not in `[a-z0-9]` with `_`
3. Collapse consecutive underscores
4. Strip leading/trailing underscores
5. Truncate to 64 characters

**Examples:**

| Input | Output |
|---|---|
| `"My Sales Island!"` | `"my_sales_island"` |
| `"Q4 Revenue (2025)"` | `"q4_revenue_2025"` |
| `"  top   orders  "` | `"top_orders"` |
| `"!!!"` | `"island"` (fallback) |

### `build_ddl(view_name: str, sql_query: str) -> str`

Returns `"CREATE OR REPLACE VIEW {view_name} AS {sql_query}"`.

`CREATE OR REPLACE` makes refresh idempotent — re-running the same DDL simply replaces the VIEW definition without errors.

### `create_island(datasource_id, name, sql_query, description="", source_tables=None) -> DataIsland`

Full island creation pipeline:

1. Slugify `name` → `view_name`
2. Create `DataIsland` record in SQLite with `status="draft"`
3. Build DDL string via `build_ddl()`
4. Resolve connector via `get_connector(ds.db_type, ds.get_credentials())`
5. Execute DDL via `connector.execute_ddl(ddl)`
6. **Success:** set `status="active"`, `last_refreshed_at=now()`, clear `last_error`, save
7. **Failure:** set `status="error"`, `last_error=str(exc)`, save; re-raise as `RuntimeError`

**Returns:** Saved `DataIsland` instance.
**Raises:** `RuntimeError` if DDL execution fails.

### `refresh_island(island_id: str) -> DataIsland`

Re-materializes an existing island:

1. Fetch island + datasource
2. Rebuild DDL from `island.view_name` + `island.sql_query`
3. Execute via connector
4. **Success:** `status="active"`, `last_refreshed_at=now()`, `last_error=""`
5. **Failure:** `status="error"`, `last_error=str(exc)`; re-raise

**Returns:** Updated `DataIsland` instance.
**Raises:** `RuntimeError` if DDL execution fails.

### `delete_island_view(island_id: str) -> None`

Drops the VIEW and removes the metadata record:

1. Fetch island
2. Execute `DROP VIEW IF EXISTS {view_name}` via connector
3. If DROP fails: log warning, continue (do not raise)
4. Call `island.delete()` — metadata is **always** deleted

**Design decision:** Metadata is always removed even if DROP VIEW fails (e.g. DB unreachable, VIEW was already dropped manually). This prevents orphaned metadata records.

---

## 4. API Reference

Base path: `/api/data-islands/`

| Method | Path | Request Body | Response | Notes |
|---|---|---|---|---|
| `GET` | `/api/data-islands/` | — | List (paginated) | `DataIslandListSerializer` |
| `POST` | `/api/data-islands/` | `{datasource, name, description, sql_query, source_tables}` | Detail 201 or `{detail}` 400 | Triggers DDL |
| `GET` | `/api/data-islands/{id}/` | — | Detail | Includes `access_grants` nested |
| `PATCH` | `/api/data-islands/{id}/` | Any subset of create fields | Detail | Updates metadata only — does NOT re-run DDL |
| `DELETE` | `/api/data-islands/{id}/` | — | 204 | Drops VIEW + deletes metadata |
| `POST` | `/api/data-islands/{id}/refresh/` | — | `{success, status, last_refreshed_at, message}` | Re-runs DDL |
| `GET` | `/api/data-islands/{id}/access/` | — | List of access grants | |
| `POST` | `/api/data-islands/{id}/access/` | `{email, name, role, granted_by}` | Grant 201 | |
| `DELETE` | `/api/data-islands/{id}/access/{access_id}/` | — | 204 | |

### Example: Create Island

**Request:**
```json
POST /api/data-islands/
{
  "datasource": "3f5a9c12-...",
  "name": "Monthly Sales Summary",
  "description": "Aggregated sales by customer for reporting",
  "sql_query": "SELECT c.id, c.email, SUM(o.total_amount) AS lifetime_value\nFROM customers c\nJOIN orders o ON o.customer_id = c.id\nGROUP BY c.id, c.email",
  "source_tables": ["customers", "orders"]
}
```

**Success Response (201):**
```json
{
  "id": "abc123...",
  "name": "Monthly Sales Summary",
  "view_name": "monthly_sales_summary",
  "status": "active",
  "last_refreshed_at": "2026-04-12T10:00:00Z",
  "access_grants": [],
  ...
}
```

**Failure Response (400):**
```json
{
  "detail": "DDL execution failed: Table 'nonexistent_table' doesn't exist"
}
```

---

## 5. Connector Extension

### `execute_ddl(ddl: str) -> None` contract (`datasources/connectors/base.py`)

All connectors must implement this abstract method.

**Contract:**
- Executes the `ddl` string against the connected database
- Raises `RuntimeError` on any execution failure
- Raises `NotImplementedError` if the connector type does not support DDL

### MySQL Implementation (`datasources/connectors/mysql.py`)

```python
def execute_ddl(self, ddl: str) -> None:
    conn = self._get_connection()
    try:
        conn.cursor().execute(ddl)
        conn.commit()          # ← required: PyMySQL autocommit is off by default
    except Exception as exc:
        raise RuntimeError(f"DDL execution failed: {exc}") from exc
    finally:
        conn.close()
```

**Key note:** `conn.commit()` is required even for DDL statements when using PyMySQL with `autocommit=False` (the default).

### PostgreSQL Implementation (`datasources/connectors/postgresql.py`)

```python
def execute_ddl(self, ddl: str) -> None:
    conn = psycopg2.connect(**self._build_dsn())
    try:
        conn.autocommit = True     # ← required: DDL cannot run in a transaction block in PG
        conn.cursor().execute(ddl)
    except Exception as exc:
        raise RuntimeError(f"DDL execution failed: {exc}") from exc
    finally:
        conn.close()
```

**Key note:** `autocommit = True` must be set before any cursor operations. PostgreSQL raises `"cannot run inside a transaction block"` for DDL otherwise.

### Unsupported Connectors

SQLite, BigQuery, and Snowflake raise `NotImplementedError`:

```python
def execute_ddl(self, ddl: str) -> None:
    raise NotImplementedError("DDL execution is not supported for this connector type.")
```

---

## 6. Frontend Components

### `DataIslandsPage` (`src/pages/DataIslandsPage.jsx`)

List page — mirrors `DataSourcesPage.jsx` in structure.

| Item | Detail |
|---|---|
| Query key | `["islands"]` |
| Query fn | `islandsApi.list` |
| Mutations | `deleteMut`, `refreshMut` |
| State | `showForm: boolean` |
| Layout | Header + stats badge + 3-col card grid + dashed "Create" card |
| Card actions | View Details → navigate, Refresh icon → refreshMut, Trash → deleteMut |

### `DataIslandForm` (`src/components/DataIslandForm.jsx`)

3-step modal wizard — mirrors `DataSourceForm.jsx` in structure (same overlay, inputCls, Field pattern).

**Step 1 — Pick DataSource:**
- `useQuery(["datasources"], datasourceApi.list)`
- Click a datasource card → fetch schema via `datasourceApi.rawSchema()`, advance to step 2

**Step 2 — Build Query:**
- Inputs: `name` (required), `description`
- Mode toggle: **Write SQL** (textarea) / **Pick Tables** (checkbox list from schema)
- Table picker auto-generates `SELECT * FROM t` or multi-table UNION query
- Shows slugified `view_name` preview below the name input
- Next → step 3 only if `name` + `sql_query` are non-empty

**Step 3 — Review & Create:**
- Summary card: name, environment, view_name (monospace), source tables, SQL preview
- `createMut.mutate()` → `islandsApi.create({datasource, name, description, sql_query, source_tables})`
- Shows inline error from `createMut.error.response.data.detail` on failure

### `DataIslandDetailPage` (`src/pages/DataIslandDetailPage.jsx`)

Detail view at `/data-islands/:id`.

| Item | Detail |
|---|---|
| Query key | `["islands", id]` |
| Query fn | `islandsApi.get(id)` |
| Mutations | `refreshMut`, `addAccessMut`, `removeAccessMut` |
| State | `showAddAccess: boolean`, `accessForm: {email, name, role, granted_by}`, `refreshFeedback` |
| Layout | Two-column: left (2/3) = details + SQL + error; right (1/3) = access + refresh settings |

Refresh feedback is a transient banner that auto-clears after 5 seconds.

### `islandsApi` (`src/api/client.js`)

```js
islandsApi = {
  list()               → GET  /api/data-islands/
  get(id)              → GET  /api/data-islands/{id}/
  create(data)         → POST /api/data-islands/
  update(id, data)     → PATCH /api/data-islands/{id}/
  delete(id)           → DELETE /api/data-islands/{id}/
  refresh(id)          → POST /api/data-islands/{id}/refresh/
  listAccess(id)       → GET  /api/data-islands/{id}/access/
  addAccess(id, data)  → POST /api/data-islands/{id}/access/
  removeAccess(id,aId) → DELETE /api/data-islands/{id}/access/{aId}/
}
```

---

## 7. Seed Data

### Command

```bash
cd "Data Guardian/backend"
source dgp/bin/activate
python manage.py seed_mysql_demo
```

Targets: `host=127.0.0.1`, `port=8889`, `user=root`, `password=root`, `db=mydatabase`

### Tables Created

| Table | Rows | Description |
|---|---|---|
| `customers` | 75 | id, first_name, last_name, email, phone, city, country, created_at |
| `products` | 60 | id, name, category, price, stock_qty, sku, is_active, created_at |
| `orders` | 80 | id, customer_id, status (ENUM), shipping_address, total_amount, created_at, shipped_at |
| `order_items` | ~206 | id, order_id, product_id, quantity, unit_price, line_total |

Product categories: `Electronics`, `Apparel`, `Home`, `Sports`, `Books`
Order statuses: `pending` (15%), `processing` (20%), `shipped` (25%), `delivered` (30%), `cancelled` (10%)

### Demo Queries to Try as Data Islands

```sql
-- 1. All active customers
SELECT * FROM customers

-- 2. Electronics products only
SELECT * FROM products WHERE category = 'Electronics'

-- 3. Order summary with customer info
SELECT o.id, c.first_name, c.last_name, c.email, o.status, o.total_amount, o.created_at
FROM orders o
JOIN customers c ON c.id = o.customer_id
ORDER BY o.created_at DESC

-- 4. Revenue by product category
SELECT p.category,
       COUNT(oi.id)         AS items_sold,
       SUM(oi.line_total)   AS total_revenue,
       AVG(oi.unit_price)   AS avg_price
FROM order_items oi
JOIN products p ON p.id = oi.product_id
GROUP BY p.category
ORDER BY total_revenue DESC

-- 5. Top 10 customers by lifetime value
SELECT c.id, c.email, c.city, SUM(o.total_amount) AS lifetime_value
FROM customers c
JOIN orders o ON o.customer_id = c.id
WHERE o.status = 'delivered'
GROUP BY c.id, c.email, c.city
ORDER BY lifetime_value DESC
LIMIT 10
```

---

## 8. Known Limitations & Future Work

| Limitation | Notes |
|---|---|
| **Scheduled refresh** | `refresh_schedule` (cron) is stored but not processed. A Celery beat task or management command would read this field and trigger `refresh_island()`. |
| **No auth enforcement on access grants** | `DataIslandAccess.email` is informational only — the VIEW in MySQL is not actually permission-scoped per user. Auth integration is a future milestone. |
| **No cross-datasource joins** | A Data Island must be created from a single DataSource. Cross-source joins would require a federated query engine. |
| **SQLite/BigQuery/Snowflake DDL not supported** | These connectors raise `NotImplementedError`. MySQL and PostgreSQL are fully supported. |
| **PATCH does not re-run DDL** | If `sql_query` is updated via PATCH, the VIEW in the host DB is not touched. User must call `/refresh/` explicitly. |
