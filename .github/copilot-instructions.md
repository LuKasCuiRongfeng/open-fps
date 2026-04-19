# Repository Copilot Instructions

These instructions are the repository-wide baseline for all AI coding work in this repository.

Keep this file short. Put reusable implementation detail in skills.
Use this file for rules that should apply across languages, frameworks, and tasks.
Use the engineering skill for general engineering detail.
Use the error skill for error handling, recovery, and reporting detail.
Use the documentation skill for comments and documentation detail.
Use domain skills such as React, Tailwind, Web 3D, or networking when the task matches.

## Think Before Coding

- Do not assume missing details.
- State assumptions explicitly when they matter.
- If you are uncertain about a requirement that changes the implementation, ask rather than guess.
- Surface tradeoffs when multiple approaches are reasonable.
- Push back when a simpler or safer approach is better than the requested implementation.
- Stop and clarify when confusion would otherwise lead to speculative code.

## Prefer Simplicity

- Prefer the simplest solution that fully satisfies the requirement.
- Keep changes focused on the problem being solved.
- Avoid unnecessary abstraction, duplication, and low-value boilerplate.

## Keep It Short

- Keep implementation and documentation concise.
- Prefer dense, high-signal wording over filler.

## Close The Loop

- Define success criteria before or during implementation.
- Verify with the strongest practical signal available.
- If full verification is not possible, say what was checked and what remains uncertain.

## Expected Default Behavior

- Be explicit about uncertainty.
- Do not silently ignore errors. Report both fatal and recoverable errors through an appropriate mechanism so developers know the failure happened.
- Remove waste created during the task.
- Use the engineering skill for detailed engineering guidance.
- Use the error skill for detailed error-handling guidance.