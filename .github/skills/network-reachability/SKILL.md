---
name: network-reachability
description: 'Use for git push or fetch failures, package registry access failures, blocked web fetches, proxy checks, and general network reachability triage during development tasks.'
argument-hint: 'Describe the failing network operation, the exact error text, and whether a proxy or VPN may already exist in the environment.'
---

# Network Reachability

## Use For

- `git push`, `git fetch`, or clone failures
- `pnpm install`, registry fetch, or package download failures
- `cargo` crate index or dependency download failures
- Web fetch failures during docs or release-note lookup
- Suspected proxy, VPN, DNS, TLS, timeout, or connection reset issues

## Check

1. Start by classifying the failure: DNS resolution, TCP connect failure, timeout, connection reset, TLS or certificate issue, authentication issue, or proxy misconfiguration.
2. Check whether proxy settings already exist before assuming direct internet access. Inspect environment variables such as `HTTP_PROXY`, `HTTPS_PROXY`, and `ALL_PROXY`, plus tool-specific settings such as git proxy config.
3. Prefer a small reachability check before retrying large operations. Confirm whether the target host and port are reachable.
4. Retry once when the error looks transient, such as a connection reset or short-lived timeout. Do not loop repeated retries without new evidence.
5. Do not assume the repository or dependency configuration is broken when the failure is clearly network-related.
6. Do not print secrets, tokens, or full proxy credentials in summaries.
7. If a working proxy or VPN already exists in the environment, prefer using it over inventing unrelated workarounds.
8. If the blocker remains external, explain the exact network constraint and stop at the clean boundary instead of fabricating success.

## Output

- Separate local code problems from network reachability problems.
- When possible, report which layer failed first and what setting or connectivity check supports that conclusion.
- Prefer one concrete next step, such as using an existing proxy, fixing a proxy variable, retrying after connectivity recovers, or asking the user for the intended proxy endpoint.