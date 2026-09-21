// Vendor icon/label lookup for datasource badges. Prefers `display_db_type`
// (a cosmetic-only override some demo datasources carry) over the real
// `db_type`, which still drives actual connector behavior — see
// backend DataSource.display_db_type.
const DB_VENDOR_META = {
  postgresql: { icon: "🐘", label: "PostgreSQL" },
  mysql: { icon: "🐬", label: "MySQL" },
  sqlite: { icon: "📁", label: "SQLite" },
  bigquery: { icon: "☁️", label: "BigQuery" },
  snowflake: { icon: "❄️", label: "Snowflake" },
  aws_rds: { icon: "🟧", label: "AWS RDS" },
};

function vendorKey(ds) {
  return (ds?.display_db_type || ds?.db_type || "").toLowerCase();
}

export function vendorIcon(ds, fallback = "🗄️") {
  return DB_VENDOR_META[vendorKey(ds)]?.icon ?? fallback;
}

export function vendorLabel(ds) {
  const key = vendorKey(ds);
  return DB_VENDOR_META[key]?.label ?? ds?.display_db_type ?? ds?.db_type ?? "—";
}
