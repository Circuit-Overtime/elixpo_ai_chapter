# Stage 7 findings

Stage 7 is complete. QFabric now closes the loop from an empirically credible timing-contract
violation to a gated alternate-domain recommendation, boundary-safe trial, measured probation,
and either commit or epoch-controlled rollback. The final independent audit passed both real
UNO Q hardware campaigns and all deterministic fault scenarios.

## Accepted recovery mechanism

Automatic recovery is deliberately narrower than recommendation. A source must reach the Stage 5
`VIOLATED` state with valid evidence, and the Stage 6 destination must pass semantic, admission,
predicted-feasibility, cooldown, and blacklist gates. A switch can occur only after the executor
measures zero in-flight invocations.

The version 1 controller implements six explicit states: `MONITORING`, `WAITING_BOUNDARY`,
`PROBATION`, `ROLLBACK_WAIT`, `COOLDOWN`, and `INFEASIBLE`. Every domain change advances the epoch
exactly once. Three consecutive healthy probation windows commit a trial. A violated target,
protected-contract regression, or probation timeout instead restores the origin, cools down for
three windows, and temporarily blacklists the failed destination for five windows.

The controller does not switch on `UNKNOWN`, isolated noise, invalid evidence, or `AT_RISK`. If no
safe alternative remains, it holds `INFEASIBLE` rather than oscillating.

## Deterministic protocol evidence

Ten controlled scenarios exercised all six recovery states and both immediate and deferred
boundaries. They covered insufficient evidence, successful recovery, semantic and admission
rejection, failed target probation, protected-contract regression, probation timeout, cooldown and
blacklist suppression, cancellation before a boundary, and exhausted alternatives.

The suite reproduced byte-equivalent controller reports, recorded every switch and rollback at a
safe boundary, matched every epoch increment to one domain change, and produced zero false
switches. Its fault injection is explicitly labelled as protocol validation rather than hardware
performance evidence.

## UNO Q closed-loop campaigns

Both hardware campaigns used the real AArch64 Stage 4 artifact and STM32 Bridge method. Each ran
nine non-overlapping windows of 20 sequential invocations, for 180 samples per campaign. The
20 ms controlled delay was included inside the measured end-to-end interval and attached to every
affected sample.

| Campaign | Injected windows | Transition sequence | Commit | Rollback | Final state |
| --- | --- | --- | ---: | ---: | --- |
| success | 1--3 | Linux → RT at window 3 | 1 | 0 | RT / `MONITORING` |
| rollback | 1--6 | Linux → RT at window 3; RT → Linux at window 6 | 0 | 1 | Linux / `MONITORING` |

The success campaign recorded 60 controlled deadline misses. Its injected samples measured
26.837--29.015 ms, while unaffected samples measured 8.569--11.897 ms. The controller switched at
epoch `1791530417`, observed three satisfied RT probation windows, committed at window 6, and
finished its three-window cooldown at window 9.

The rollback campaign recorded 120 controlled deadline misses. Its injected samples measured
26.568--36.308 ms, while unaffected samples measured 7.097--8.997 ms. It entered RT at epoch
`1791530437`, observed three violating RT probation windows, restored Linux at epoch `1791530438`,
and completed cooldown at window 9. Thus the failed trial caused exactly two domain changes and two
epoch increments.

In both campaigns, `detection_delay_windows` was one: once Stage 5 had accumulated three violating
windows and declared the violation credible, the measured zero-inflight boundary allowed immediate
actuation. This metric does not include the three windows required to establish the violation.
The successful campaign's verified-recovery interval was four windows from detection through
commit, inclusive.

## Independent audit

The final audit was captured at `2026-10-09T07:25:10.347464+00:00`. It did not trust the persisted
campaign status. Starting from the recorded samples and Stage 6 recommendation input, it rebuilt
each per-domain contract, dynamic recommendation, recovery observation, controller step, domain
transition, and epoch. It also regenerated all ten deterministic scenarios and verified injection
provenance, affected windows, per-window sample counts, and measured safe boundaries.

The audit reported:

- Stage 7 status `pass` with no failures;
- complete coverage of all six controller states;
- 360 independently replayed hardware invocations across the two campaigns;
- one safe transition and one epoch increment on successful recovery;
- two safe transitions and two epoch increments on rollback;
- one commit in the success campaign and one rollback in the rollback campaign; and
- final `MONITORING` state for both paths.

The hardware-independent suite contained 128 passing tests at completion. A negative audit test
also confirms that altering an invocation's injection label makes the evidence fail validation.

## Claim boundary and limitations

The supported claim is **boundary-safe empirical closed-loop recovery under controlled delay
injection**. It is not formal schedulability, WCET, hard real-time certification, or evidence that
the system predicts arbitrary natural faults.

The hardware campaigns cover one pure `add` task, two deliberately bounded paths, sequential
zero-inflight boundaries, and 360 total invocations. No protected workload was declared, so zero
protected-contract regressions describes an empty protected set rather than unrelated firmware,
interrupts, or applications. Stateful migration hooks, overlapping work, concurrent task graphs,
reboots, power faults, packet loss, long-duration stability, and naturally occurring overloads
remain outside this stage's evidence.

## Next stage

Stage 8 will add faithful explanations, decision history, and operator-facing inspection without
changing the accepted recovery policy. The persisted history must distinguish measured facts,
model predictions, safety gates, injected conditions, controller actions, and limitations so an
operator can reconstruct why a transition occurred.
