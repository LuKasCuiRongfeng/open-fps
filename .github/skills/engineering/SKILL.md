---
name: engineering
description: For general software engineering review, refactoring, maintainability improvement, code cleanup, implementation planning, and verification strategy. Use this skill when the task is not tied to a single framework but requires stronger engineering judgment about code quality, structure, scope control, and validation.
argument-hint: "[goal or problem] [maintainability or quality target] [constraints]"
---

# engineering

Use this skill for general-purpose engineering work that is broader than any single framework or language feature.

## What This Skill Helps With

- Code review focused on correctness, maintainability, and risk.
- Refactoring for simpler structure, smaller units, and lower complexity.
- Cleanup of AI-generated waste, dead code, and overbuilt implementations.
- Implementation planning with explicit success criteria and verification strategy.
- Deciding when to extract constants, shared mappings, configuration, or helper modules.
- Keeping files, modules, and responsibilities maintainable over time.
- Deciding when important code needs comments or when the project needs documentation to stay understandable.

## When To Use This Skill

- The task is a general engineering review rather than a framework-specific question.
- The user asks for refactoring, cleanup, maintainability improvement, or complexity reduction.
- The code works but is too large, too repetitive, too fragile, or too hard to verify.
- The task needs stronger structure, verification planning, or quality control across modules.
- The problem spans several files or layers and needs engineering judgment more than library-specific syntax knowledge.

## When Not To Use This Skill

- The task is primarily domain-specific and should be led by a specialized skill such as React, Tailwind, Web 3D, or network troubleshooting.
- The request is only about framework syntax or a narrow API usage question.

## Default Engineering Baseline

- Prefer the smallest coherent solution that fully satisfies the requirement.
- Fix root causes instead of layering patches when practical.
- Reduce complexity instead of redistributing it into more files without benefit.
- Keep responsibilities clear at the file, module, function, and component levels.
- Validate behavior with the strongest practical signal before declaring the task complete.

## Required Engineering Rules

- Do not preserve accidental complexity just because it already exists.
- If a shorter, clearer implementation can preserve behavior, prefer it.
- Remove dead paths, unused helpers, redundant indirection, and temporary scaffolding introduced during the task.
- Keep public behavior stable unless the task explicitly requires a behavior change.
- Do not spread the same logic across multiple files when one clear location is enough.
- Do not overcentralize unrelated logic into giant utility files or oversized modules.

## Maintainability Rules

- Split files by responsibility, not by ceremony.
- Treat files approaching 800 lines as refactoring candidates.
- Extract repeated or change-prone data into constants, mappings, or configuration when that improves clarity and maintenance.
- Keep true local invariants local instead of promoting every literal into a distant constants file.
- Prefer names and structure that are understandable without tracing excessive indirection.
- Keep modules easy to review: narrow scope, predictable inputs, predictable outputs.
- Add comments where intent, constraints, edge cases, or tradeoffs are not obvious from the code itself.
- Do not add comments that only paraphrase the code line by line.
- Create documentation when code changes introduce repository-wide concepts, workflows, or architectural decisions that are harder to understand from local code alone.
- Keep documentation aligned with the current codebase by updating or deleting stale docs as part of the change.

## Refactoring Strategy

- Refactor toward fewer concepts, clearer ownership, and smaller change surfaces.
- Prefer deletion over abstraction when removal solves the problem.
- Extract helpers only when they remove real duplication or clarify the main path.
- Avoid speculative architecture for requirements that do not exist yet.
- When splitting a file, separate responsibilities along real boundaries such as data shaping, business logic, side effects, rendering, or integration.
- When behavior becomes easier to understand through a short architectural note than through more code structure alone, add or update documentation.

## Verification Strategy

- Define what success means before or during implementation.
- Match verification depth to risk.
- Prefer direct evidence such as tests, type checks, linting, builds, or targeted execution over verbal confidence.
- If you cannot fully verify the change, state what was checked and what remains uncertain.
- Treat unverified behavior changes as risk, not as done work.

## Execution Workflow

When using this skill, follow this sequence:

1. Define the real goal, constraints, and success criteria.
2. Identify whether the current problem is complexity, duplication, structure, correctness, or verification.
3. Choose the smallest change set that fixes the real problem.
4. Simplify structure and remove waste before adding new abstractions.
5. Extract constants, helpers, or configuration only where they improve clarity or change management.
6. Verify the result with the strongest practical checks.
7. Report remaining risks or unverified areas explicitly.

## Output Requirements

When you generate an answer, code change, design proposal, or review, include the following whenever relevant:

- What the real problem is, not just the visible symptom.
- Whether the current structure is too large, too repetitive, or too hard to maintain.
- Whether code should be deleted, simplified, split, or extracted.
- Whether any data is hardcoded in a way that should become constants, mappings, or configuration.
- Whether important non-obvious logic should be commented.
- Whether documentation should be added, updated, moved, shortened, or removed.
- What verification was run or should be run.
- What risks remain after the change.

## Review Checklist

- Does the solution solve the root problem rather than only the symptom?
- Is the implementation simpler than before, not just different?
- Are dead code, unused artifacts, and AI-generated waste removed?
- Are responsibilities split clearly across files and modules?
- Is any file too large or trending toward an unmaintainable size?
- Are constants, mappings, or configuration extracted where that improves maintenance?
- Are local invariants kept local when extraction would only add indirection?
- Are important non-obvious parts of the code commented where needed?
- Is any supporting documentation missing, stale, too long, or no longer justified?
- Was the result verified with appropriate checks?
- Are remaining risks or unknowns stated clearly?

## Example Inputs

- `Review this change for maintainability, complexity, and verification gaps.`
- `Refactor this module so it is smaller, clearer, and easier to test without changing behavior.`
- `Clean up AI-generated code and remove redundant abstractions from this feature.`
- `Help decide whether these values should stay inline or move to constants or configuration.`

## Expected Behavior

- Push toward simpler, clearer, and more maintainable code.
- Remove waste and accidental complexity introduced during the task.
- Keep file and module boundaries aligned with real responsibilities.
- Use extraction and abstraction only when they improve the code materially.
- Add concise comments for important non-obvious code when they improve maintainability.
- Create and maintain documentation when shared understanding needs more than local code context.
- Treat verification as part of completion, not as an optional extra.