---
name: test-repair
description: Repair failing tests without weakening assertions or hiding product defects.
---

1. Reproduce the narrowest failing test first.
2. Determine whether product behavior or the expectation is wrong.
3. Never delete, ignore, or loosen a test merely to make it pass.
4. Make the smallest behaviorally correct change and add a regression case when coverage is missing.
5. Run the narrow test, its package suite, then the repository-required checks.
