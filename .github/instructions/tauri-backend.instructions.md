---
description: "Use when editing Tauri backend commands, Rust storage code, map save or load flows, or frontend-backend integration points. Covers backend boundaries, storage responsibilities, and build output constraints."
name: "Tauri Backend Boundaries"
applyTo: "src-tauri/src/**/*.rs"
---
# Tauri Backend Boundaries

- Keep Tauri commands thin and focused on I/O and application boundary concerns.
- Keep serialization, storage, and project data responsibilities explicit.
- Do not move frontend rendering or gameplay logic into Rust command handlers.
- Do not edit files under `src-tauri/target/`.
- Preserve stable data contracts between frontend project types and backend storage commands.