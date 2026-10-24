---
name: safe-refactor
description: Improve code structure while preserving observable behavior and public contracts.
---

1. Record the behavior and tests that form the refactor boundary.
2. Keep semantic changes out of the same patch unless explicitly requested.
3. Move in small compilable steps and preserve public APIs where practical.
4. Avoid speculative abstractions; extract only repeated or independently meaningful concepts.
5. Compare tests and diagnostics before and after the refactor.
