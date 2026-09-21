"""
Object/queryset scoping helpers shared across DGP apps.

DEV has no demo-mode concept (no `demo` app, no `demo_session` relation on
User), so these are pass-through implementations: every authenticated caller
sees every object. Kept as the same interface the query-editor views import
(`core.permissions.ScopedToOwnerQuerysetMixin`, `demo_object_visible`) so the
app doesn't need to special-case DEV vs. branches that do carry demo mode.
"""

from django.db.models import QuerySet


def demo_scope_filter(request, qs: QuerySet, owner_lookup: str) -> QuerySet:
    return qs


def demo_object_visible(request, owner_user) -> bool:
    return True


class ScopedToOwnerQuerysetMixin:
    """No-op scoping mixin — DEV has no demo-mode visitor/owner split."""

    owner_lookup = "created_by"

    def get_queryset(self):
        qs = super().get_queryset()
        return demo_scope_filter(self.request, qs, self.owner_lookup)
