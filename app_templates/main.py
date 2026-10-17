"""Entry shim. Do not put logic here.

The launcher loads `apps.<name>.main` and reads `App` off it, so this
file must always exist and must expose an `App` class. The actual
implementation lives in src/ — see src/app.py.
"""

from .src.app import App

__all__ = ["App"]
