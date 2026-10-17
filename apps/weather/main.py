"""weather — entry shim. Implementation lives under src/.

The launcher loads this module and reads `App` off it. Real code is
in src/app.py; see /docs/apps on the website for the convention.
"""

from .src.app import App

__all__ = ["App"]
