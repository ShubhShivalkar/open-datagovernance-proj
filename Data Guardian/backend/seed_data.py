"""
Seed script — inserts realistic dummy data for UI testing.

Usage:
    python manage.py shell < seed_data.py
    # or via runscript if django-extensions is installed:
    # python manage.py runscript seed_data
"""

import uuid
from datetime import datetime, timedelta, timezone

from datasources.models import DataSource
from catalogue.models import CatalogueRun, TableCatalogue, ColumnCatalogue

# ── Helpers ──────────────────────────────────────────────────────────────────

def now():
    return datetime.now(timezone.utc)

def dt(days_ago=0, hours_ago=0):
    return now() - timedelta(days=days_ago, hours=hours_ago)


# ── Wipe existing seed data ──────────────────────────────────────────────────

print("Clearing existing data…")
ColumnCatalogue.objects.all().delete()
TableCatalogue.objects.all().delete()
CatalogueRun.objects.all().delete()
DataSource.objects.all().delete()


# ── 1. DataSources ───────────────────────────────────────────────────────────

print("Creating DataSources…")

pg_prod = DataSource(
    name="PostgreSQL-Prod",
    description="Core production database for all customer-facing services.",
    db_type="postgresql",
    status="connected",
    last_tested_at=dt(hours_ago=2),
    business_context="This is our primary OLTP database. It stores all customer, order, and product data for the production environment.",
)
pg_prod.set_credentials({"host": "prod-db.internal", "port": 5432, "database": "guardian_prod", "username": "readonly_user", "password": "***"})
pg_prod.save()

redshift = DataSource(
    name="AWS-Redshift",
    description="Data warehouse for analytics and reporting.",
    db_type="postgresql",
    status="connected",
    last_tested_at=dt(hours_ago=6),
    business_context="Redshift cluster used by the analytics and BI team. Contains denormalized facts and dimension tables.",
)
redshift.set_credentials({"host": "redshift.us-east-1.redshift.amazonaws.com", "port": 5439, "database": "analytics", "username": "dw_user", "password": "***"})
redshift.save()

mysql_staging = DataSource(
    name="MySQL-Staging",
    description="Staging database mirroring production for QA testing.",
    db_type="mysql",
    status="connected",
    last_tested_at=dt(days_ago=1),
    business_context="Used by the QA team to test releases before they go live.",
)
mysql_staging.set_credentials({"host": "staging-db.internal", "port": 3306, "database": "staging_app", "username": "staging_user", "password": "***"})
mysql_staging.save()

sqlite_local = DataSource(
    name="SQLite-Dev",
    description="Local developer database for feature development.",
    db_type="sqlite",
    status="pending",
    last_tested_at=None,
    last_error="Connection not yet tested.",
    business_context="",
)
sqlite_local.set_credentials({"database": "/var/data/dev.sqlite3"})
sqlite_local.save()

print(f"  Created {DataSource.objects.count()} DataSources")


# ── 2. CatalogueRuns ─────────────────────────────────────────────────────────

print("Creating CatalogueRuns…")

run_pg_completed = CatalogueRun.objects.create(
    datasource=pg_prod,
    status="completed",
    ai_provider="anthropic",
    ai_model="claude-sonnet-4-6",
    tables_total=5,
    tables_processed=5,
    started_at=dt(hours_ago=4),
    completed_at=dt(hours_ago=3, days_ago=0),
)

run_redshift_completed = CatalogueRun.objects.create(
    datasource=redshift,
    status="completed",
    ai_provider="anthropic",
    ai_model="claude-sonnet-4-6",
    tables_total=3,
    tables_processed=3,
    started_at=dt(hours_ago=8),
    completed_at=dt(hours_ago=7),
)

run_mysql_running = CatalogueRun.objects.create(
    datasource=mysql_staging,
    status="running",
    ai_provider="anthropic",
    ai_model="claude-sonnet-4-6",
    tables_total=4,
    tables_processed=2,
    started_at=dt(hours_ago=0),
)

print(f"  Created {CatalogueRun.objects.count()} CatalogueRuns")


# ── 3. TableCatalogues — PostgreSQL Prod ────────────────────────────────────

print("Creating TableCatalogues and ColumnCatalogues…")

# ── customers ────────────────────────────────────────────────────────────────
customers = TableCatalogue.objects.create(
    run=run_pg_completed,
    datasource=pg_prod,
    schema_name="public",
    table_name="customers",
    full_name="public.customers",
    ai_description="Central customer registry. Stores identity and contact information for every registered user of the platform. This table is the authoritative source of PII and must be treated with strict access controls.",
    ai_business_purpose="Drives CRM workflows, support ticketing, and compliance reporting. Referenced by nearly every downstream table via customer_id.",
    ai_domain="operations",
    row_count_estimate=48293,
    raw_schema={},
)

for pos, (col_name, data_type, is_pk, is_fk, cat, pii, desc, bname) in enumerate([
    ("id",           "bigint",                  True,  False, "identifier", "none",   "Auto-incrementing surrogate key for each customer record.",                              "Customer ID"),
    ("email",        "varchar(255)",             False, False, "identifier", "high",   "Primary email address. Used for login and communication. Must be masked in non-prod.",  "Email Address"),
    ("full_name",    "varchar(255)",             False, False, "text",       "medium", "Customer's full name as provided during registration.",                                 "Full Name"),
    ("phone",        "varchar(50)",              False, False, "identifier", "high",   "Mobile or landline phone number. Optional — not required at signup.",                   "Phone Number"),
    ("created_at",   "timestamp with time zone", False, False, "timestamp",  "none",   "UTC timestamp when the customer record was first created.",                             "Registration Date"),
    ("updated_at",   "timestamp with time zone", False, False, "timestamp",  "none",   "UTC timestamp of the last update to this row.",                                         "Last Updated"),
    ("segment",      "varchar(50)",              False, False, "dimension",  "none",   "Marketing segment label (e.g., enterprise, smb, consumer).",                           "Customer Segment"),
    ("is_active",    "boolean",                  False, False, "flag",       "none",   "Whether the customer account is currently active and can log in.",                      "Active Flag"),
]):
    ColumnCatalogue.objects.create(
        table=customers,
        column_name=col_name,
        data_type=data_type,
        nullable=(not is_pk),
        is_primary_key=is_pk,
        is_foreign_key=is_fk,
        ordinal_position=pos,
        ai_description=desc,
        ai_business_name=bname,
        ai_data_category=cat,
        ai_pii_likelihood=pii,
    )


# ── orders ───────────────────────────────────────────────────────────────────
orders = TableCatalogue.objects.create(
    run=run_pg_completed,
    datasource=pg_prod,
    schema_name="public",
    table_name="orders",
    full_name="public.orders",
    ai_description="Records every purchase transaction. Each row represents a single order placed by a customer. Links to customers, products, and the payments table for a complete transaction picture.",
    ai_business_purpose="Primary table for revenue reporting, order fulfilment, and logistics. Used by finance for invoicing and by ops for SLA tracking.",
    ai_domain="finance",
    row_count_estimate=312847,
    raw_schema={},
)

for pos, (col_name, data_type, is_pk, is_fk, fk_ref, cat, pii, desc) in enumerate([
    ("id",           "bigint",                  True,  False, None,                            "identifier", "none",   "Unique order identifier."),
    ("customer_id",  "bigint",                  False, True,  {"table": "customers", "column": "id"}, "identifier", "none", "FK to the customer who placed the order."),
    ("status",       "varchar(30)",              False, False, None,                            "dimension",  "none",   "Current fulfilment status: pending, confirmed, shipped, delivered, cancelled."),
    ("total_amount", "numeric(12,2)",            False, False, None,                            "metric",     "none",   "Total order value in the account's billing currency."),
    ("currency",     "char(3)",                  False, False, None,                            "dimension",  "none",   "ISO 4217 currency code (e.g., USD, EUR, GBP)."),
    ("placed_at",    "timestamp with time zone", False, False, None,                            "timestamp",  "none",   "UTC timestamp when the order was placed."),
    ("shipped_at",   "timestamp with time zone", False, False, None,                            "timestamp",  "none",   "UTC timestamp when the order was shipped. Null if not yet shipped."),
    ("metadata",     "jsonb",                    False, False, None,                            "json",       "none",   "Arbitrary key-value pairs from the checkout flow (promo codes, device info, etc.)."),
]):
    ColumnCatalogue.objects.create(
        table=orders,
        column_name=col_name,
        data_type=data_type,
        nullable=(not is_pk),
        is_primary_key=is_pk,
        is_foreign_key=is_fk,
        foreign_key_references=fk_ref,
        ordinal_position=pos,
        ai_description=desc,
        ai_data_category=cat,
        ai_pii_likelihood=pii,
    )


# ── audit_log ────────────────────────────────────────────────────────────────
audit_log = TableCatalogue.objects.create(
    run=run_pg_completed,
    datasource=pg_prod,
    schema_name="public",
    table_name="audit_log",
    full_name="public.audit_log",
    ai_description="Immutable append-only log of all privileged actions taken on the platform. Required for SOC-2 and GDPR compliance. Records who did what, on which resource, and when.",
    ai_business_purpose="Compliance and security auditing. Used by the security team to investigate incidents and by compliance to satisfy external auditor requests.",
    ai_domain="operations",
    tags=["compliance", "immutable", "gdpr"],
    row_count_estimate=1024810,
    raw_schema={},
)

for pos, (col_name, data_type, is_pk, cat, pii, desc) in enumerate([
    ("id",          "bigint",                  True,  "identifier", "none",   "Monotonically increasing log entry ID."),
    ("actor_id",    "bigint",                  False, "identifier", "none",   "ID of the user or service account that performed the action."),
    ("actor_type",  "varchar(20)",             False, "dimension",  "none",   "Whether the actor is a human user or an automated service."),
    ("action",      "varchar(100)",            False, "dimension",  "none",   "The action verb, e.g., CREATE_ISLAND, DELETE_RECORD, EXPORT_DATA."),
    ("target",      "varchar(255)",            False, "text",       "none",   "The resource or entity the action was applied to."),
    ("ip_address",  "inet",                    False, "identifier", "medium", "IP address of the actor at time of the action."),
    ("occurred_at", "timestamp with time zone",False, "timestamp",  "none",   "UTC timestamp of the action."),
    ("details",     "jsonb",                   False, "json",       "none",   "Structured payload with before/after snapshots or additional context."),
]):
    ColumnCatalogue.objects.create(
        table=audit_log,
        column_name=col_name,
        data_type=data_type,
        nullable=(not is_pk),
        is_primary_key=is_pk,
        ordinal_position=pos,
        ai_description=desc,
        ai_data_category=cat,
        ai_pii_likelihood=pii,
    )


# ── products ─────────────────────────────────────────────────────────────────
products = TableCatalogue.objects.create(
    run=run_pg_completed,
    datasource=pg_prod,
    schema_name="public",
    table_name="products",
    full_name="public.products",
    ai_description="Product catalogue. Each row defines a SKU available for purchase. Includes pricing, categorisation, and inventory metadata.",
    ai_business_purpose="Drives product discovery, pricing logic, and inventory management. Joined with orders to calculate revenue by product line.",
    ai_domain="operations",
    row_count_estimate=8421,
    raw_schema={},
)

for pos, (col_name, data_type, is_pk, cat, pii, desc) in enumerate([
    ("id",          "bigint",         True,  "identifier", "none", "Unique product SKU identifier."),
    ("name",        "varchar(255)",   False, "text",       "none", "Human-readable product name shown to customers."),
    ("category",    "varchar(100)",   False, "dimension",  "none", "Product category hierarchy (e.g., Electronics > Laptops)."),
    ("price_usd",   "numeric(10,2)",  False, "metric",     "none", "List price in USD. Actual charged price may differ due to discounts."),
    ("stock_qty",   "integer",        False, "metric",     "none", "Current on-hand inventory count across all warehouses."),
    ("is_active",   "boolean",        False, "flag",       "none", "Whether this product is visible and purchasable on the storefront."),
    ("created_at",  "timestamp with time zone", False, "timestamp", "none", "When this SKU was first added to the catalogue."),
]):
    ColumnCatalogue.objects.create(
        table=products,
        column_name=col_name,
        data_type=data_type,
        nullable=(not is_pk),
        is_primary_key=is_pk,
        ordinal_position=pos,
        ai_description=desc,
        ai_data_category=cat,
        ai_pii_likelihood=pii,
    )


# ── user_sessions ────────────────────────────────────────────────────────────
user_sessions = TableCatalogue.objects.create(
    run=run_pg_completed,
    datasource=pg_prod,
    schema_name="public",
    table_name="user_sessions",
    full_name="public.user_sessions",
    ai_description="Tracks active and historical web/app sessions for authenticated customers. Used for security analysis and personalisation.",
    ai_business_purpose="Security monitoring (concurrent session detection, hijacking alerts) and product analytics (session duration, bounce rate).",
    ai_domain="operations",
    row_count_estimate=2183440,
    raw_schema={},
)

for pos, (col_name, data_type, is_pk, cat, pii, desc) in enumerate([
    ("id",           "uuid",                    True,  "identifier", "none",   "UUID session token."),
    ("customer_id",  "bigint",                  False, "identifier", "none",   "FK to the authenticated customer."),
    ("ip_address",   "inet",                    False, "identifier", "medium", "Client IP at session start. Used for geo and security checks."),
    ("user_agent",   "text",                    False, "text",       "low",    "Raw browser User-Agent string."),
    ("started_at",   "timestamp with time zone",False, "timestamp",  "none",   "Session start timestamp."),
    ("last_seen_at", "timestamp with time zone",False, "timestamp",  "none",   "Last heartbeat timestamp."),
    ("ended_at",     "timestamp with time zone",False, "timestamp",  "none",   "Session end timestamp. Null if session is still active."),
]):
    ColumnCatalogue.objects.create(
        table=user_sessions,
        column_name=col_name,
        data_type=data_type,
        nullable=(not is_pk),
        is_primary_key=is_pk,
        ordinal_position=pos,
        ai_description=desc,
        ai_data_category=cat,
        ai_pii_likelihood=pii,
    )


# ── 4. Redshift tables ───────────────────────────────────────────────────────

fct_revenue = TableCatalogue.objects.create(
    run=run_redshift_completed,
    datasource=redshift,
    schema_name="analytics",
    table_name="fct_revenue",
    full_name="analytics.fct_revenue",
    ai_description="Daily revenue fact table. Aggregates order totals by customer, product, region, and date for BI consumption.",
    ai_business_purpose="Powers all revenue dashboards and executive reporting. Source of truth for MRR/ARR calculations.",
    ai_domain="finance",
    row_count_estimate=3200000,
    raw_schema={},
)

for pos, (col_name, data_type, is_pk, cat, pii, desc) in enumerate([
    ("date_key",     "date",           True,  "timestamp",  "none", "Report date (grain = day)."),
    ("customer_id",  "bigint",         True,  "identifier", "none", "FK to dim_customers."),
    ("product_id",   "bigint",         True,  "identifier", "none", "FK to dim_products."),
    ("region",       "varchar(50)",    False, "dimension",  "none", "Geographic region of the sale."),
    ("revenue_usd",  "numeric(14,2)",  False, "metric",     "none", "Total revenue for the grain in USD."),
    ("order_count",  "integer",        False, "metric",     "none", "Number of orders contributing to this row's revenue."),
]):
    ColumnCatalogue.objects.create(
        table=fct_revenue,
        column_name=col_name,
        data_type=data_type,
        nullable=(not is_pk),
        is_primary_key=is_pk,
        ordinal_position=pos,
        ai_description=desc,
        ai_data_category=cat,
        ai_pii_likelihood=pii,
    )

dim_customers = TableCatalogue.objects.create(
    run=run_redshift_completed,
    datasource=redshift,
    schema_name="analytics",
    table_name="dim_customers",
    full_name="analytics.dim_customers",
    ai_description="Customer dimension for the analytics warehouse. Contains masked/anonymised attributes safe for BI tooling.",
    ai_business_purpose="Provides customer attributes for segmentation analysis without exposing raw PII.",
    ai_domain="marketing",
    row_count_estimate=48293,
    raw_schema={},
)

for pos, (col_name, data_type, is_pk, cat, pii, desc) in enumerate([
    ("customer_id",  "bigint",       True,  "identifier", "none", "Surrogate key matching production customers.id."),
    ("segment",      "varchar(50)",  False, "dimension",  "none", "Customer segment label."),
    ("country_code", "char(2)",      False, "dimension",  "none", "ISO 3166-1 alpha-2 country code."),
    ("tenure_days",  "integer",      False, "metric",     "none", "Number of days since the customer first registered."),
    ("ltv_usd",      "numeric(12,2)",False, "metric",     "none", "Estimated lifetime value in USD based on historical spend."),
]):
    ColumnCatalogue.objects.create(
        table=dim_customers,
        column_name=col_name,
        data_type=data_type,
        nullable=(not is_pk),
        is_primary_key=is_pk,
        ordinal_position=pos,
        ai_description=desc,
        ai_data_category=cat,
        ai_pii_likelihood=pii,
    )


# ── 5. MySQL Staging (in-progress run — 2 of 4 done) ────────────────────────

TableCatalogue.objects.create(
    run=run_mysql_running,
    datasource=mysql_staging,
    schema_name="staging",
    table_name="customers",
    full_name="staging.customers",
    ai_description="Staging copy of the production customers table. Refreshed nightly.",
    ai_domain="operations",
    row_count_estimate=48293,
    raw_schema={},
)

TableCatalogue.objects.create(
    run=run_mysql_running,
    datasource=mysql_staging,
    schema_name="staging",
    table_name="orders",
    full_name="staging.orders",
    ai_description="Staging copy of the production orders table.",
    ai_domain="finance",
    row_count_estimate=312847,
    raw_schema={},
)
# orders_items and payments are pending (not yet processed)


# ── Summary ──────────────────────────────────────────────────────────────────
print(f"\n✅ Seed complete!")
print(f"   DataSources:       {DataSource.objects.count()}")
print(f"   CatalogueRuns:     {CatalogueRun.objects.count()}")
print(f"   TableCatalogues:   {TableCatalogue.objects.count()}")
print(f"   ColumnCatalogues:  {ColumnCatalogue.objects.count()}")
