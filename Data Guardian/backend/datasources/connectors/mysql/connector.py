from __future__ import annotations
from datasources.connectors.base import BaseConnector
from .connection import MySQLConnectionMixin
from .schema import MySQLSchemaMixin
from .users import MySQLUsersMixin
from .ddl import MySQLDDLMixin
from .query import MySQLQueryMixin


class MySQLConnector(
    MySQLConnectionMixin,
    MySQLSchemaMixin,
    MySQLUsersMixin,
    MySQLDDLMixin,
    MySQLQueryMixin,
    BaseConnector,
):
    DB_TYPE = "mysql"
