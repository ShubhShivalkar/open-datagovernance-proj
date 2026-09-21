import logging
from django.contrib.auth import get_user_model
from datasources.models import DataSource
from datasources.connectors import get_connector
from .models import DatabaseUser, UserProfile

User = get_user_model()
logger = logging.getLogger(__name__)

def create_user_in_db(
    datasource_id: str,
    username: str,
    password: str,
    privilege_level: str,
    name: str,
    email: str,
    platform_user=None,
    is_platform_user: bool = False,
    platform_role: str = "",
    notes: str = "",
) -> "DatabaseUser":
    """
    Create a real login user in the target database, then register them in DGP.

    Steps:
      1. Validate username safety (connector does this too, belt-and-suspenders).
      2. Call connector.create_db_user() — executes CREATE USER + GRANT on the live DB.
      3. Upsert a DatabaseUser metadata record and link to platform_user if provided.

    Raises:
        RuntimeError: if the DB operation fails.
        NotImplementedError: if the connector type doesn't support user creation.
    """
    import re as _re
    if not _re.match(r'^[a-zA-Z0-9_]+$', username):
        raise ValueError("Username may only contain letters, digits, and underscores.")

    ds = DataSource.objects.get(pk=datasource_id)
    creds = ds.get_credentials()
    database = creds.get("database", "")

    connector = get_connector(ds.db_type, creds)
    connector.create_db_user(username, password, privilege_level, database)

    ds_fragment = str(ds.id).replace("-", "")[:12]
    placeholder_email = email or f"{username}@{ds_fragment}.db"

    db_user, _ = DatabaseUser.objects.get_or_create(
        username=username,
        datasource=ds,
        defaults={
            "name": name or username,
            "email": placeholder_email,
            "status": "active",
            "is_platform_user": is_platform_user,
            "platform_role": platform_role if is_platform_user else "",
            "notes": notes or f"Created via DGP in {ds.name}. Privilege: {privilege_level}.",
        },
    )
    if platform_user:
        db_user.platform_user = platform_user
        db_user.save(update_fields=["platform_user", "updated_at"])

    logger.info("[IAM] Created DB user '%s' in datasource '%s' (level: %s)", username, ds.name, privilege_level)
    return db_user


def link_platform_user_to_datasource(datasource, platform_user) -> "DatabaseUser | None":
    """
    Called when a new environment is added.

    Reads the DB credential username from the datasource, then finds-or-creates
    a DatabaseUser for that (username, datasource) pair and assigns platform_user.

    Returns the DatabaseUser, or None if credentials cannot be read.
    """
    try:
        creds = datasource.get_credentials()
        username = creds.get("username", "").strip()
        if not username:
            return None
    except Exception as exc:
        logger.warning("[IAM] Could not read credentials for datasource %s: %s", datasource.id, exc)
        return None

    ds_fragment = str(datasource.id).replace("-", "")[:12]
    placeholder_email = f"{username}@{ds_fragment}.db"

    db_user, _ = DatabaseUser.objects.get_or_create(
        username=username,
        datasource=datasource,
        defaults={
            "name": username,
            "email": placeholder_email,
            "status": "active",
            "notes": f"Auto-created when environment '{datasource.name}' was added.",
        },
    )
    db_user.platform_user = platform_user
    db_user.save(update_fields=["platform_user", "updated_at"])
    logger.info(
        "[IAM] Linked platform user '%s' → db user '%s' on datasource '%s'",
        platform_user.username, username, datasource.name,
    )
    return db_user


def sync_db_users(datasource_id: str) -> dict:
    """
    Connect to the datasource, fetch all DB-level users, and upsert them into IAM.

    Matching key: (username, datasource) — existing records are updated in place;
    new records get a deterministic placeholder email that the admin can override.

    Returns:
        {created, updated, unchanged, total, datasource_name, users: [...]}
    """
    ds = DataSource.objects.get(pk=datasource_id)
    connector = get_connector(ds.db_type, ds.get_credentials())

    db_users = connector.get_db_users()  # raises RuntimeError/NotImplementedError on failure

    created = updated = unchanged = 0
    result_users = []

    for entry in db_users:
        username = entry["username"]
        is_superuser = entry.get("is_superuser", False)
        privileges = entry.get("privileges", "")
        notes = f"Synced from {ds.db_type} · Privileges: {privileges}"

        existing = DatabaseUser.objects.filter(username=username, datasource=ds).first()

        if existing:
            changed = False
            if existing.notes != notes:
                existing.notes = notes
                changed = True
            if existing.status == "inactive":
                existing.status = "active"
                changed = True
            if changed:
                existing.save(update_fields=["notes", "status", "updated_at"])
                updated += 1
            else:
                unchanged += 1
            result_users.append({"username": username, "action": "updated" if changed else "unchanged"})
        else:
            # Deterministic placeholder email — unique per (username, datasource)
            ds_fragment = str(ds.id).replace("-", "")[:12]
            placeholder_email = f"{username}@{ds_fragment}.db"
            DatabaseUser.objects.create(
                name=username,
                email=placeholder_email,
                username=username,
                datasource=ds,
                is_platform_user=is_superuser,
                platform_role="administrator" if is_superuser else "",
                status="active",
                notes=notes,
            )
            created += 1
            result_users.append({"username": username, "action": "created"})

    logger.info(
        "[IAM] Sync for datasource '%s': created=%d updated=%d unchanged=%d",
        ds.name, created, updated, unchanged,
    )
    return {
        "datasource_name": ds.name,
        "total": len(db_users),
        "created": created,
        "updated": updated,
        "unchanged": unchanged,
        "users": result_users,
    }
