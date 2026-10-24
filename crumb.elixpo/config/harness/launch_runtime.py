"""Exec the platform runtime bundled by deepseek-harness-runtime-bin."""

import os

from deepseek_harness_runtime import resolve_bundled_launch_args


launch = resolve_bundled_launch_args()
os.execv(launch[0], list(launch))
