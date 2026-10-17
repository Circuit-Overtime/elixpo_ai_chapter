# Stage 6 findings

Stage 6 is complete. QFabric now derives static domain recommendations from audited hardware
evidence, applies explicit safety and feasibility gates, explains every rejected alternative, and
replays identical inputs deterministically. It remains strictly advisory and made no live placement
changes.

## Accepted recommendation policy

The `gated-static-end-to-end-v1` policy first requires sufficient evidence in both domains. It then
applies independent gates for effect safety, destination admission, Stage 5 contract state,
observed miss rate, predicted deadline feasibility, cooldown, and reserved MCU headroom.

Only candidates passing every hard gate are ranked. Ranking uses measured p95 end-to-end latency
plus supported adjacent-task or data-location boundary costs. Local execution time is reported and
used for MCU utilization accounting, but never replaces the complete serialization, Bridge,
queueing, and execution path.

Each record is identified by the SHA-256 of canonical task, policy, and MCU-capacity input. Reports
contain no decision timestamp, so identical inputs are byte-equivalent.

## Measured recommendation

The recommendation input was derived from the untouched Stage 5 full-instrumentation profiles,
contract reports, and canonical ABI declaration for the pure `add` task.

| Candidate | Local execution p95 | End-to-end p95 | Predicted chain cost | Decision |
| --- | ---: | ---: | ---: | --- |
| Linux | 468 ns | 8.047 ms | 0 | selected |
| RT | 331 ns | 11.265 ms | 0 | rejected |

RT local execution was 137 ns faster, but its complete end-to-end path was 3.218 ms slower. Linux
was therefore retained, and RT received the stable `higher_predicted_end_to_end` reason. This is
the required counterexample to choosing a domain from compute time alone.

At the declared 100 Hz managed-task rate, RT placement would add 0.00331% modeled MCU utilization.
The policy reserved 25% headroom, leaving 75% usable capacity, so admission capacity was not the
reason for rejection.

The base utilization of 0% means no other **QFabric-managed tasks** were declared in this static
single-task scenario. It is not a measurement or claim of zero total MCU, Zephyr, firmware, or
interrupt utilization. Stage 1 established that stock UNO Q firmware does not expose the runtime
thread statistics needed for a complete whole-MCU utilization measurement.

## Positive and negative evidence

All eleven deterministic scenarios passed:

| Scenario | Expected result |
| --- | --- |
| measured end-to-end | retain Linux; RT loses on total cost |
| RT positive | recommend RT when its complete path wins and every gate passes |
| insufficient evidence | withhold the recommendation |
| RT inadmissible | reject RT despite lower predicted latency |
| effect ineligible | reject an unsafe stateful transition |
| chain ping-pong | retain Linux after two Linux/RT boundary costs |
| cooldown | reject the otherwise preferred move |
| MCU headroom | reject projected overload |
| contract at risk | reject a non-satisfied destination contract |
| observed miss rate | reject a candidate above the allowed miss rate |
| predicted deadline miss | reject a candidate whose complete predicted path misses the deadline |

Together the scenarios exercised all nine rejection reason codes. Every scenario was evaluated
twice with identical output, and every result reported `advisory_only: true`, zero placement
changes, and `placement_changed: false`.

## Completion evidence

The final audit was captured at `2026-10-09T06:00:34.947544+00:00`. It recorded:

- Stage 6 status `pass` with no failures;
- exact reconstruction of input metrics from Stage 5 and the ABI;
- identical complete and `qf recommend add` results;
- deterministic replay of the base recommendation and all eleven scenarios;
- the measured faster-MCU/slower-end-to-end decision;
- positive RT selection and insufficient-evidence withholding;
- coverage of every required rejection reason;
- explicit managed MCU utilization and reserved-headroom accounting; and
- advisory-only behavior with zero live placement changes.

The measured recommendation record ID was
`436afda8c6f713aeded6dad5e68fc6908b5f287a5592aca61edf930c47cc023a`.
The hardware-independent suite contained 101 passing tests at completion.

## Deferred to Stage 7

Stage 6 chooses and explains an eligible destination but never acts on the recommendation. Stage 7
is the core novelty stage: after a credible repeated violation, it will require a safe transition
boundary, destination admission, an epoch change, probation, target and protected-contract
verification, deterministic commit or rollback, cooldown, and temporary blacklisting. Noisy or
insufficient evidence must never trigger a switch, and exhaustion of safe candidates must produce
`INFEASIBLE` rather than oscillation.
