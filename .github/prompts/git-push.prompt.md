---
name: git-push
description: Stage changes, create a git commit, and push to the current remote branch. Use --message to provide the commit message, or generate an English message automatically when omitted.
agent: agent
argument-hint: "[--message \"your commit message\"]"
---

Stage the current repository changes, create a commit, and push it to the current remote branch.

Follow this workflow:

1. Inspect the repository status and changed files before making any git changes.
2. Parse the prompt input.
3. If the user provided a `--message` argument, use its value exactly as the commit message after trimming surrounding whitespace.
4. If the user did not provide `--message`, inspect the actual staged and unstaged changes and generate a concise English commit message that accurately describes the change.
5. Stage the necessary tracked and untracked files for the current task.
6. Create a normal git commit.
7. Push to the current branch's configured upstream remote.

Requirements:

- Do not invent a commit message without first checking the actual changes.
- If generating the commit message automatically, it must be in English.
- Keep the generated message concise and specific.
- Do not amend existing commits unless the user explicitly asks for it.
- Do not use destructive git commands.
- If there are no changes to commit, report that clearly and stop.
- If push fails because no upstream is configured, set the upstream for the current branch and then push.
- If push fails for another reason, report the actual failure reason.

Output expectations:

- State which commit message was used.
- State which branch and remote were pushed.
- If nothing was committed or pushed, explain why.

Examples:

- `/git-push --message "Add react skill guidance for dependency-driven rerenders"`
- `/git-push`