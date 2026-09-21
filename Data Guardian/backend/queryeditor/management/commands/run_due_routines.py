"""
Unified routine runner.

Runs everything in DGP that is scheduled but has no background worker of its own:

  * Query Editor schedules  — materialize a saved query into the `schedules`
    schema of its environment (queryeditor.services.materialize_query).
  * Data Island refreshes   — re-run CREATE OR REPLACE VIEW for scheduled
    islands (data_islands.services.refresh_island).

Both advance their own `next_run_at` after running, so this command is safe to
invoke on a fixed interval from an external scheduler, e.g. a crontab entry:

    */5 * * * * cd /app && python manage.py run_due_routines

or an equivalent platform cron job. Exits non-zero if any routine errored.
"""

import time as _time

from django.core.management.base import BaseCommand
from django.utils import timezone


class Command(BaseCommand):
    help = "Run all due Query Editor schedules and Data Island refreshes."

    def add_arguments(self, parser):
        parser.add_argument(
            "--only",
            choices=["queries", "islands"],
            default=None,
            help="Restrict to one routine type.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="List what would run without executing it.",
        )
        parser.add_argument(
            "--loop",
            type=int,
            default=0,
            metavar="SECONDS",
            help="Dev only: keep running, re-checking every SECONDS instead of exiting.",
        )

    def handle(self, *args, **opts):
        while True:
            errors = self._run_once(opts)
            if not opts["loop"]:
                if errors:
                    raise SystemExit(1)
                return
            _time.sleep(opts["loop"])

    def _run_once(self, opts) -> int:
        errors = 0
        if opts["only"] != "islands":
            errors += self._run_query_schedules(opts["dry_run"])
        if opts["only"] != "queries":
            errors += self._run_island_refreshes(opts["dry_run"])
        return errors

    def _run_query_schedules(self, dry_run: bool) -> int:
        from queryeditor.models import QuerySchedule
        from queryeditor.services import materialize_query

        now = timezone.now()
        due = (
            QuerySchedule.objects
            .filter(is_active=True, next_run_at__isnull=False, next_run_at__lte=now)
            .select_related("saved_query", "datasource")
        )
        if not due:
            self.stdout.write("No query schedules due.")
            return 0

        errors = 0
        for schedule in due:
            label = (
                f"query schedule '{schedule.saved_query.name}' "
                f"→ {schedule.target_schema}.{schedule.target_table} ({schedule.write_mode})"
            )
            if dry_run:
                self.stdout.write(f"[dry-run] {label}")
                continue
            run = materialize_query(schedule, trigger="schedule")
            if run.status == "error":
                errors += 1
                self.stderr.write(f"ERROR  {label}: {run.error_message}")
            else:
                self.stdout.write(f"OK     {label} — {run.row_count} rows, {run.elapsed_ms} ms")
        return errors

    def _run_island_refreshes(self, dry_run: bool) -> int:
        from data_islands.models import DataIsland
        from data_islands.services import refresh_island

        now = timezone.now()
        due = (
            DataIsland.objects
            .filter(refresh_type="scheduled", next_run_at__isnull=False, next_run_at__lte=now)
            .select_related("datasource")
        )
        if not due:
            self.stdout.write("No island routines due.")
            return 0

        errors = 0
        for island in due:
            if dry_run:
                self.stdout.write(f"[dry-run] island refresh '{island.name}'")
                continue
            try:
                refresh_island(str(island.id))
                self.stdout.write(f"OK     island refresh '{island.name}'")
            except Exception as exc:  # noqa: BLE001 — summarise, keep going
                errors += 1
                self.stderr.write(f"ERROR  island refresh '{island.name}': {exc}")
        return errors
