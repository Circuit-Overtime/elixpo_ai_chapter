---
name: failure-autopsy
description: Diagnose command, build, test, and runtime failures from evidence before proposing a fix.
---

1. Preserve the exact failing command, exit status, and critical diagnostic.
2. Separate the first causal error from follow-on noise.
3. Inspect the smallest relevant configuration and source region.
4. State the hypothesis and the evidence that would disprove it.
5. Apply a fix only when requested, then rerun the narrow failing check before broader validation.
