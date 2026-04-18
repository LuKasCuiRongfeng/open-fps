name: update-dep
description: Review Rust and/or JavaScript dependency upgrades, classify risk, and either apply a selected mode directly or ask for a choice in the current conversation.
argument-hint: "[--rust] [--js] [--conservative] [--aggressive] [extra constraints]"
agent: agent
---

# Dependency Upgrade Review

You are preparing a dependency upgrade plan for this workspace.

## Scope Selection

- Parse the user arguments that follow `/update-dep`.
- `--rust`: inspect only Rust dependencies under `src-tauri/`.
- `--js`: inspect only JavaScript and TypeScript dependencies in `package.json`.
- `--conservative`: after analysis, do not ask the user for confirmation; directly upgrade only clearly safe dependencies.
- `--aggressive`: after analysis, do not ask the user for confirmation; directly upgrade the selected scope to the latest stable versions, including risky upgrades when needed.
- If neither flag is present, inspect both Rust and JavaScript dependencies.
- If both `--conservative` and `--aggressive` are present, stop and ask the user to choose only one mode.
- Preserve any additional user notes as upgrade constraints.

## Required Behavior

- First inspect the relevant manifests and lockfiles.
- Check which dependencies can be upgraded safely to the latest stable or to the most practical recommended version.
- Identify dependencies that are likely to cause breakage, require coordinated upgrades, or deserve a conservative hold.
- Prefer official package metadata, release notes, and package-manager-native inspection commands when available.
- If a native inspection command is unavailable, use official package pages or changelogs instead of guessing.
- If `--conservative` is present, do not pause for approval after the report; immediately apply only safe upgrades.
- If `--aggressive` is present, do not pause for approval after the report; immediately apply the latest stable versions in scope.
- If neither mode flag is present, do not edit yet. Ask the user to choose a strategy in the same chat conversation after presenting the report.

## Analysis Rules

- For JavaScript, inspect `package.json` and the lockfile state, and prefer package-manager-native checks such as `pnpm outdated`.
- For Rust, inspect `src-tauri/Cargo.toml` and lockfile state. Prefer ecosystem-native checks when available. If `cargo-outdated` or similar tooling is unavailable, use official crate metadata or release information.
- Distinguish between:
  - Safe: patch or low-risk minor upgrades with no obvious compatibility concern.
  - Caution: upgrades with ecosystem coupling, peer constraints, or non-trivial migration notes.
  - Risky: major upgrades, compatibility uncertainty, or upgrades likely to require code changes.
- Pay special attention to framework-coupled dependencies such as React, Vite, TypeScript, Three.js, Tauri, and related plugins.
- For Rust, pay special attention to Tauri core crates and Tauri plugins that should stay on compatible major lines.

## Response Format Before Any Edit

Produce a concise report with these sections:

1. Scope
2. Safe upgrade candidates
3. Caution or risky upgrades
4. Recommended strategy

In the report:

- For each dependency, include current version, candidate version, and a short reason.
- If the latest version is not the best choice, explicitly recommend the safer target version.
- Call out blockers, migration requirements, peer dependency concerns, or repo-specific risks.

## Required User Choice When No Mode Flag Is Provided

After the report, ask the user in the current conversation to choose exactly one option before you edit anything:

1. Conservative: upgrade only clearly safe dependencies.
2. Balanced: upgrade safe dependencies and selected caution items that have a strong payoff.
3. Aggressive: target the latest stable versions, including risky upgrades if needed.
4. Custom: let the user specify exact packages to upgrade or defer.
5. Cancel: make no changes.

Do not ask this question when `--conservative` or `--aggressive` is already present.

If the user chooses an upgrade option, or if a mode flag already selected the strategy, then:

- Apply only the approved scope.
- Update the relevant manifests and lockfiles.
- Run focused validation for the changed ecosystem.
- Summarize what changed, what was intentionally deferred, and any follow-up fixes still needed.

## Validation After Approved Changes

- For JavaScript changes, prefer `pnpm lint` or `pnpm tsc --noEmit` depending on which gives the most direct signal for the affected packages.
- For Rust changes, run an appropriate Rust validation command in `src-tauri/` if available and practical.
- If validation fails, stop, explain the root cause, and ask whether to continue with fixes or roll back the risky part.
