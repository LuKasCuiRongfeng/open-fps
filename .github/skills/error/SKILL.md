---
name: error
description: For error handling, recovery strategy, logging and reporting, fallback design, and review of swallowed failures. Use this skill when a task involves try/catch logic, retries, graceful degradation, background jobs, API boundaries, UI error states, or deciding how failures should be surfaced.
argument-hint: "[error scenario] [runtime or layer] [visibility or recovery goal]"
---

# error

Use this skill for designing, implementing, or reviewing error handling.

## What This Skill Helps With

- Deciding whether a failure should be thrown, returned, retried, skipped, or downgraded.
- Making fatal and recoverable failures visible to developers.
- Designing fallback behavior without hiding the original problem.
- Reviewing code for swallowed errors, empty catches, and misleading success paths.
- Choosing reporting mechanisms such as logs, UI error states, metrics, or aggregated summaries.

## When To Use This Skill

- The task adds or changes try/catch behavior.
- The task involves retries, fallback data, partial success, background work, or batch processing.
- The task needs a decision about recoverable versus fatal failures.
- The task includes error logging, telemetry, user-visible error states, or operational reporting.
- The code currently ignores failures or hides them behind silent defaults.

## Core Rules

- Do not silently ignore errors.
- Report the system or original error first, then add custom error reporting only when it materially improves diagnosis or handling.
- Make failures visible through an appropriate mechanism for the runtime and audience.
- Preserve useful context such as operation, input identity, dependency, and failure reason.
- Prefer explicit failure paths over fake success paths.
- If a failure is intentionally downgraded, report that downgrade instead of pretending nothing happened.

## Choosing A Handling Strategy

- Throw when the current layer cannot recover correctly.
- Return an explicit error result when the caller is expected to decide how to recover.
- Retry only for failures that are plausibly transient, bounded, and safe to repeat.
- Skip individual items only when partial success is acceptable and the skipped failures are still reported.
- Use fallback values only when degraded behavior is genuinely acceptable and the failure remains visible.

## Visibility By Runtime

- Backend or services: log with enough context to diagnose the failing operation.
- Frontend: expose the failure through a visible error state, developer-visible logging, or both, depending on the audience.
- Scripts and CLIs: print actionable error output and use a failing exit code when the overall operation failed.
- Batch jobs: aggregate per-item failures and surface both the summary and the affected items.
- Libraries: avoid unilaterally logging noisy duplicates when the caller owns reporting, but still return or throw explicit failure information.

## Prohibited Patterns

- Empty catch blocks.
- Catching and returning a normal-looking success value without reporting the failure.
- Replacing the original error with only a custom error message that hides the underlying failure.
- Retrying indefinitely without surfacing repeated failure.
- Using fallback behavior that erases the original cause.
- Dropping rejected promises, callback errors, or stream errors without handling them.

## Review Checklist

- Is the failure visible to the right developer or operator?
- Does the handling preserve enough context to debug the issue?
- Is the code honest about partial success versus full success?
- Is retry bounded, justified, and safe?
- Is any fallback behavior explicitly reported?
- Are any catches, defaults, or skips hiding real failures?

## Example Inputs

- `Design error handling for this batch import so bad rows are skipped but still reported.`
- `Review this code for swallowed async errors and misleading fallback behavior.`
- `Decide whether this API client should throw, retry, or return a result object.`
- `Add frontend error states without hiding the original network failure.`

## Expected Behavior

- Surface failures instead of hiding them.
- Keep recovery behavior explicit and defensible.
- Match reporting style to the runtime and ownership boundary.
- Treat silent degradation as a bug unless it is explicitly reported.
