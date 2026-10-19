"""rtk — the token economy over Pollinations.

Every model call in elixpoo goes through the Router: role → model resolution,
budget enforcement, prefix caching, and append-only token accounting.
"""

from rtk.budget import Budget, BudgetExceeded
from rtk.ledger import TokenLedger
from rtk.router import Effort, RoleNotFound, Router, load_models_config

__all__ = [
    "Router",
    "Budget",
    "BudgetExceeded",
    "TokenLedger",
    "Effort",
    "RoleNotFound",
    "load_models_config",
]
