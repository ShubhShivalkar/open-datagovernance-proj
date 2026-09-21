"""
Shared cadence math for scheduled routines.

Both Data Island refreshes and Query Editor schedules describe their cadence the
same way:

    cadence_type == "cron"       → value is a 5-field cron expression
    cadence_type == "frequency"  → value is JSON '{"every": N, "unit": "hours"}'
                                   (unit ∈ minutes | hours | days | weeks)

`compute_next_run` turns that into the next fire time. It never raises — an
unparseable expression yields None so callers can leave `next_run_at` unset
rather than crash a scheduler loop.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta

from django.utils import timezone

logger = logging.getLogger(__name__)

FREQUENCY_UNITS = ("minutes", "hours", "days", "weeks")


def compute_next_run(
    cadence_type: str,
    cadence_value: str,
    from_dt: datetime | None = None,
) -> datetime | None:
    """Return the next run time for a cadence, or None if it can't be computed."""
    base = from_dt or timezone.now()
    try:
        if cadence_type == "cron":
            from croniter import croniter

            return croniter(cadence_value, base).get_next(datetime)

        if cadence_type == "frequency":
            cfg = json.loads(cadence_value) if isinstance(cadence_value, str) else dict(cadence_value or {})
            unit = cfg.get("unit", "hours")
            if unit not in FREQUENCY_UNITS:
                unit = "hours"
            every = max(1, int(cfg.get("every", 1)))
            return base + timedelta(**{unit: every})
    except Exception as exc:
        logger.warning("compute_next_run(%r, %r) failed: %s", cadence_type, cadence_value, exc)
        return None

    return None
