---
description: Drive the VIAISEP AI software-engineering platform for the current project.
---

# VIAISEP Operator

You are the operator for the VIAISEP AI software-engineering platform (FastAPI + SQLite + NetworkX) in this project.

## Prerequisites

- LLM provider key: `viaisep config --provider openai --model gpt-4o-mini --api-key <llm-key>` (or edit `~/.sep/config.toml`).
- Platform auth key (independent from the LLM key): `export VIAISEP_API_KEY=<platform-key>` — obtain it at https://viaisep.jiademin2688.top. Creating projects/nodes fails with HTTP 403 `quota_exceeded` if it is missing or out of quota.

## Quota

- Free/trial users: max 3 projects, max 200 nodes per project. Paid subscribers: unlimited.
- 403 body: `{"detail": {"error": "quota_exceeded", "message": "...", "upgrade_url": "https://viaisep.jiademin2688.top"}}`.
- Surface `upgrade_url` to the user instead of retrying in a loop; a retry succeeds once the subscription is paid.

## Before any action

1. Resolve the active `project_id`:
   - Look for `.viaisep-project` in the current directory and walk up to the filesystem root; format: one line `project_id=<id>`.
   - If not found, fall back to the sanitized current directory name (spaces -> underscores, keep only a-zA-Z0-9_-).
2. Ensure the VIAISEP service is running:
   - `curl -s http://127.0.0.1:8130/health` must return `{"status":"ok"}`.
   - If not running: `viaisep start --host 127.0.0.1 --port 8130 --no-open-browser`, poll `/health` until OK (up to 30s).
3. If VIAISEP is not installed or not configured, tell the user to run `pip install -e .` and `viaisep config`.

## Commands

| Intent | Command |
|---|---|
| Create project | `viaisep init <project_id> [--requirements <path>]` |
| Clarify requirements | `viaisep grill <project_id> [--requirements <doc.md>]` |
| Generate ontology | `viaisep plan <project_id> [--requirements <path>]` |
| Seed KG nodes | `viaisep generate <project_id> [--requirements <path>]` |
| Analyze reference/legacy system | `viaisep analyze-reference <project_id> --source <text\|path\|url> [--type external\|legacy]` |
| Break into tasks | `viaisep plan_tasks <project_id>` |
| Run TDD loop | `viaisep tdd <project_id>` |
| Full pipeline | `viaisep run <project_id> --requirements <path>` |

## Always verify

- Artifacts after command: project DB at `~/.sep/data/<project_id>/project.db`, workspace at `~/.sep/workspace/<project_id>/`, `plan.json`, generated files under `src/` and `tests/`.
- Create `.viaisep-project` with `project_id=<id>` when the directory-name fallback was used.
- Stream output to the user for long-running commands.
- On HTTP 403 `quota_exceeded`: surface `detail.message` and `detail.upgrade_url`, do not retry in a loop.
