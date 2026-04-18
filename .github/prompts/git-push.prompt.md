---
name: git-push
description: Review local git changes, prepare a commit message in Chinese or English, and commit and push with either confirmation or direct execution.
argument-hint: "[--lang=zh|en] [--message=custom message] [--force]"
agent: agent
---

# Git Commit And Push

You are preparing to commit the current workspace changes and push them to the remote repository.

## Argument Parsing

- Parse the user arguments that follow `/git-push`.
- `--lang=zh|en`: choose the commit message language. Default to `en`.
- `--message=...`: use the provided commit message exactly as the commit title or full message.
- `--force`: skip the confirmation step and commit and push immediately.
- Treat `--force` here as a workflow flag only. Do not run `git push --force` unless the user explicitly asks for a forced remote push.
- If `--lang` is missing, default to `en`.
- If `--lang` has any value other than `zh` or `en`, stop and ask the user to provide one of those two values.

## Required Inspection

- Inspect the git working tree before making any commit.
- Check staged and unstaged changes, the current branch, and whether a push remote is configured.
- Review enough diff context to generate a defensible commit message instead of guessing.
- If there is nothing to commit, stop and say so.
- If the branch has no usable upstream or no remote push target, stop and explain the blocker.

## Commit Message Rules

- If `--message` is present, use it exactly and do not rewrite it.
- If `--message` is not present, generate a concise commit message from the actual changes.
- Generate the message in the language selected by `--lang`.
- Keep the message concrete and repository-relevant.
- Prefer one clear subject line. Add a short body only when the change spans distinct areas or needs clarification.

## Interaction Rules

- If `--message` is present and `--force` is not present, use the provided message and proceed directly to commit and push without asking for another suggestion.
- If `--message` is present and `--force` is present, still use the provided message exactly and proceed directly.
- If `--message` is not present and `--force` is not present, generate a proposed commit message, show it to the user in the current conversation, and ask whether to use it or replace it.
- If `--message` is not present and `--force` is present, generate the commit message and proceed directly without asking.

## Execution Rules

- Stage the relevant current workspace changes before committing.
- Commit only after you have either a user-provided message or an approved/generated message according to the rules above.
- Push to the configured remote branch after a successful commit.
- Use non-interactive git commands only.
- Do not amend existing commits unless the user explicitly asks for it.

## Response Format Before Waiting For User Feedback

If you need user input because `--message` is missing and `--force` is not present, respond with:

1. Branch and push target
2. Short change summary
3. Proposed commit message
4. A direct question asking whether to use it or replace it

Keep this report concise.

## Response Format After Execution

After committing and pushing, summarize:

1. The branch and remote target used
2. The commit message used
3. Whether push succeeded
4. Any blocker or follow-up risk that still matters