from __future__ import annotations
from datasources.connectors.base import BaseConnector
from .connection import PostgreSQLConnectionMixin
from .schema import PostgreSQLSchemaMixin
from .users import PostgreSQLUsersMixin
from .ddl import PostgreSQLDDLMixin
from .query import PostgreSQLQueryMixin


class PostgreSQLConnector(
    PostgreSQLConnectionMixin,
    PostgreSQLSchemaMixin,
    PostgreSQLUsersMixin,
    PostgreSQLDDLMixin,
    PostgreSQLQueryMixin,
    BaseConnector,
):
    DB_TYPE = "postgresql"
