---
name: documentation
description: For code comments, developer documentation, architecture notes, and deciding what should be documented, where it should live, and how to keep it concise and current. Use this skill when a task involves comments, READMEs, migration notes, workflow docs, or deciding whether documentation is needed at all.
argument-hint: "[feature or area] [documentation need] [audience or scope]"
---

# documentation

Use this skill for deciding whether to add comments or documentation and for writing or reviewing them well.

## What This Skill Helps With

- Deciding whether a code path needs a comment at all.
- Choosing between inline comments, local docs, and repository-wide docs.
- Keeping documentation short, current, and scoped to real reader needs.
- Reviewing comments and docs for redundancy, staleness, and missing context.
- Capturing workflows, architecture notes, and operational guidance when code alone is not enough.

## When To Use This Skill

- The task adds or changes comments.
- The task needs README, architecture, workflow, migration, or setup documentation.
- The code contains non-obvious constraints, edge cases, or tradeoffs that future readers need explained.
- The current docs are stale, too long, too vague, or missing.
- The question is whether something should be documented and where.

## Core Rules

- Document only what materially improves understanding or operation.
- Prefer no comment over an obvious comment.
- Keep docs as short as possible while still unambiguous.
- Put documentation near the responsibility it explains unless the audience is repository-wide.
- Update or delete stale documentation as part of the change.

## Choosing The Right Form

- Use inline comments for non-obvious intent, constraints, invariants, edge cases, or tradeoffs.
- Use local documentation for subsystem behavior, workflows, or contracts that are too large for code comments.
- Use repository-wide documentation for concepts, setup, or architecture that many parts of the codebase depend on.
- Use naming and structure instead of comments when code can be made self-explanatory.

## Comment Guidance

- Explain why, not what, when the code is already readable.
- Comment important assumptions and failure modes when they are not obvious from the implementation.
- Keep comments close to the logic they explain.
- Remove comments that only paraphrase code or describe outdated behavior.

## Documentation Guidance

- Prefer task-oriented documents over vague reference dumps.
- State scope, audience, and assumptions early.
- Include only the detail needed for the intended reader to act correctly.
- Shorten or split documents that mix unrelated concerns.
- Keep examples aligned with the current codebase.

## Review Checklist

- Does this comment or doc teach something the code alone does not?
- Is the chosen location appropriate for the intended audience?
- Is the wording concise and specific?
- Is any part stale, redundant, or too broad in scope?
- Would clearer code remove the need for some of this documentation?

## Example Inputs

- `Review these comments and remove the ones that only restate the code.`
- `Decide whether this feature needs README documentation or only local comments.`
- `Write a short architecture note for this workflow without turning it into a long design doc.`
- `Clean up stale setup docs after this refactor.`

## Expected Behavior

- Add documentation only when it improves shared understanding.
- Keep comments and docs short, specific, and current.
- Choose the narrowest location that reaches the right audience.
- Prefer clearer code over explanatory prose when possible.
