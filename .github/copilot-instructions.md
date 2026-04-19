# Repository Copilot Instructions

These instructions are the default engineering baseline for all AI coding work in this repository.

Use skills for domain-specific expertise such as React, Tailwind, Web 3D, or networking.
Use this file for rules that should apply across languages, frameworks, and tasks.

## Think Before Coding

- Do not assume missing details.
- State assumptions explicitly when they matter.
- If the request is ambiguous, present the plausible interpretations instead of silently picking one.
- If you are uncertain about a requirement that changes the implementation, ask rather than guess.
- Do not hide confusion. Name what is unclear.
- Surface tradeoffs when multiple approaches are reasonable.
- Push back when a simpler or safer approach is better than the requested implementation.
- Stop and clarify when confusion would otherwise lead to speculative code.

## Prefer Simplicity

- Prefer the simplest solution that fully satisfies the requirement.
- If 200 lines can reasonably become 50 without losing clarity, correctness, or maintainability, rewrite it.
- Do not produce ceremonial abstractions, placeholder layers, or speculative extensibility without a real need.
- Avoid redundant branches, repeated helpers, copy-paste variants, and low-value boilerplate.
- Keep changes focused on the problem being solved.

## Keep Writing Short

- All documentation should be as short as possible while staying meaningful and unambiguous.
- Do not write long-winded explanations, filler, or repetitive prose.
- Prefer dense, high-signal wording over narrative padding.
- If a shorter version communicates the same meaning clearly, use the shorter version.

## Comments And Documentation

- Add comments for important code when they materially improve understanding of non-obvious logic, constraints, or tradeoffs.
- Do not add comments that merely restate obvious code.
- If understanding the feature, architecture, workflow, or repository-wide behavior would benefit from documentation, create it proactively.
- Choose the documentation location based on scope. Prefer a root-level document for repository-wide concepts, and a local document for narrower subsystem details.
- Documentation is part of the implementation, not a one-time artifact. Update, add, trim, move, or delete docs as the code evolves.
- Do not leave stale documentation behind after changing behavior, structure, or workflows.

## Clean Up After Your Changes

- Remove imports, variables, functions, types, files, and branches that your changes made unused.
- Do not leave behind AI-generated scaffolding, dead code, commented-out experiments, or meaningless helpers.
- If a temporary workaround or debug artifact is no longer needed, delete it before finishing.
- The final diff should not contain obvious garbage introduced during problem solving.

## Goal-Driven Execution

- Define the success criteria before or during implementation.
- Work until the requested outcome is actually verified, not just coded.
- Close the loop by checking behavior with the best available validation method, such as tests, linting, type checking, build verification, or direct execution.
- If full verification is not possible, say exactly what was checked and what remains unverified.
- Do not stop at partial implementation when the task can be completed end to end.

## Change Quality Rules

- Fix the root cause when practical instead of stacking superficial patches.
- Prefer clear, locally understandable code over cleverness.
- Keep public APIs and surrounding code style stable unless the task requires change.
- Do not refactor unrelated areas unless doing so is necessary to complete the task correctly.
- When a simpler design removes complexity, prefer deletion over additional code.
- Split code into maintainable files with clear responsibilities.
- Keep code files under 800 lines whenever practical. If a file approaches that size, split it.
- Avoid hardcoded data when a constant, shared mapping, or configuration file would make the code clearer and easier to maintain.
- Use judgment when extracting values: keep true local invariants local, but extract reusable or change-prone values out of the implementation.

## Expected Default Behavior

- Be explicit about uncertainty.
- Be concise in implementation.
- Be concise in documentation.
- Comment important non-obvious code when it helps future readers.
- Create and maintain documentation proactively when shared understanding needs it.
- Remove waste created during the task.
- Verify results before declaring completion.
- Use skills as additional guidance, not as a replacement for these baseline rules.