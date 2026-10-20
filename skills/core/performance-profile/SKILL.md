---
name: performance-profile
description: Investigate latency, throughput, memory, binary size, or token use with measurements.
---

1. Define the metric, workload, environment, and acceptable target.
2. Capture a repeatable baseline before changing code.
3. Profile or instrument the suspected path; do not optimize from intuition alone.
4. Change one bottleneck at a time and preserve correctness checks.
5. Report before/after measurements and any readability or resource tradeoff.
