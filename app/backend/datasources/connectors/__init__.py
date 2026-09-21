from datasources.connectors.base import BaseConnector
from datasources.connectors.mysql import MySQLConnector
from datasources.connectors.postgresql import PostgreSQLConnector

SUPPORTED_DB_TYPES: list[str] = ["mysql", "postgresql"]

_REGISTRY: dict[str, type[BaseConnector]] = {
    "mysql":      MySQLConnector,
    "postgresql": PostgreSQLConnector,
}


def get_connector(db_type: str, credentials: dict) -> BaseConnector:
    cls = _REGISTRY.get(db_type.lower())
    if cls is None:
        raise ValueError(
            f"Unsupported db_type '{db_type}'. Supported: {', '.join(_REGISTRY)}"
        )
    return cls(credentials)


__all__ = ["get_connector", "SUPPORTED_DB_TYPES", "BaseConnector"]
