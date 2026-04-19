---
name: network
description: For network troubleshooting, connectivity diagnosis, proxy detection, proxy validation, and root-cause analysis of client-side or environment-level network failures. Use this skill when the task involves failed requests, unreachable hosts, DNS issues, TLS errors, blocked connections, proxy configuration, or determining whether a working proxy is available.
argument-hint: "[network problem] [target host or service] [constraints]"
---

# network

Use this skill when the AI encounters a network problem and needs to determine what is broken and whether a usable proxy is available.

## What This Skill Helps With

- Diagnose where a network failure occurs.
- Distinguish between DNS, TCP, TLS, HTTP, proxy, authentication, and application-layer failures.
- Check whether the current environment has a configured proxy.
- Check whether the operating system has a configured system proxy.
- Verify whether a configured proxy is actually reachable and usable.
- Identify whether the issue is local-only, proxy-related, target-related, or environment-related.
- Suggest the next most likely checks in a disciplined order.

## When To Use This Skill

- The AI cannot access a website, API, package registry, git remote, or other network resource.
- A request times out, fails to resolve, fails TLS negotiation, or returns an unexpected proxy-related error.
- The user mentions VPN, proxy, SOCKS, HTTP proxy, HTTPS proxy, environment variables, or routing issues.
- The task requires determining whether a usable proxy exists before taking other network actions.

## When Not To Use This Skill

- The problem is clearly unrelated to networking.
- The failure is already proven to be purely application logic with healthy underlying connectivity.

## Default Troubleshooting Goal

- Find the failure layer before proposing fixes.
- Determine whether the issue is caused by local configuration, DNS, raw connectivity, TLS, proxy settings, authentication, the remote service, or policy restrictions.
- Check whether a usable proxy is available and whether traffic is actually going through it.

## Core Diagnostic Rules

- Do not guess. Identify the failing layer first.
- Start with the simplest external symptom and narrow inward.
- Separate name resolution, routing, port reachability, TLS handshake, HTTP response, and proxy behavior.
- Treat proxy presence and proxy usability as different questions.
- Do not assume that configured proxy environment variables are correct or active.
- Prefer evidence from actual connectivity checks over static configuration alone.

## Proxy Rules

- Always check whether proxy-related environment variables or tool-specific proxy settings are present.
- Always check whether a system-level proxy is configured, not just shell variables.
- Check common proxy configuration sources such as `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, `NO_PROXY`, lowercase variants, git proxy settings, npm proxy settings, and OS-level proxy configuration.
- On Windows, explicitly inspect both Internet Settings style system proxy settings and WinHTTP proxy settings when relevant.
- If a proxy is configured, verify that it is reachable and that it can actually forward traffic to the intended target.
- If multiple proxies are present, determine which one is actually in effect for the failing tool.
- If no proxy is configured, say that clearly instead of implying one exists.

## Diagnostic Workflow

When using this skill, follow this sequence:

1. Identify the failing operation, target host, port, protocol, and exact error symptom.
2. Check whether the target name resolves correctly.
3. Check whether raw connectivity to the target host and port is possible.
4. If TLS is involved, determine whether the failure is before or during handshake.
5. Check whether any proxy is configured in the current environment, toolchain, or operating system.
6. If a proxy is configured, test whether it is reachable and whether requests succeed through it.
7. Determine whether the failure is direct-path only, proxy-path only, or common to both.
8. Report the most likely failure layer and the next corrective action.

## Output Requirements

When you generate an answer, review, or troubleshooting result, include the following whenever relevant:

- The failing layer or the most likely failing layer.
- Whether a proxy is configured.
- Whether a system proxy is configured.
- Whether the configured proxy is actually usable.
- What evidence supports the conclusion.
- Whether the issue appears local, proxy-related, remote-side, or policy-related.
- The next diagnostic or corrective step, ordered from highest signal to lowest.

## Review Checklist

- Did the analysis identify the exact network symptom?
- Did it distinguish DNS failure from connection failure?
- Did it distinguish TCP reachability from TLS or HTTP failure?
- Did it check whether any proxy is configured?
- Did it check whether an OS-level or system proxy is configured?
- Did it verify whether the proxy actually works, not just whether it exists in configuration?
- Did it avoid assuming the proxy applies to every tool automatically?
- Did it state clearly whether the problem is direct-path, proxy-path, or both?
- Did it recommend the next checks in a logical order?

## Example Inputs

- `Git push fails. Determine whether the problem is DNS, connectivity, authentication, or proxy related.`
- `This machine cannot access npm. Check whether a working proxy is configured.`
- `API requests time out. Figure out whether the proxy is broken or the target host is unreachable.`
- `Diagnose why HTTPS requests fail in this environment and confirm whether traffic is going through a proxy.`

## Expected Behavior

- Diagnose the network issue layer by layer instead of guessing.
- Always consider proxy configuration when the environment may depend on one.
- Check system proxy configuration explicitly instead of only checking environment variables.
- Verify whether a proxy is both configured and functional.
- Report a clear conclusion about where the failure most likely occurs.
- Recommend the next highest-value check rather than a vague list of possibilities.