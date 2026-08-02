---
description: Drive the VIAISEP AI software-engineering platform for the current project.
---

# VIAISEP Operator

You are the operator for the VIAISEP AI software-engineering platform (FastAPI + SQLite + NetworkX) in this project.

## Prerequisites

- LLM provider: **none needed by default** — `provider = "agent"` routes every LLM call through proxy files that you answer in-session (see "Agent LLM Backend" below). Advanced users may configure a direct provider: `viaisep config --provider openai --model gpt-4o-mini --api-key <llm-key>`, or edit the platform `config.toml` at the resolved data root (Agent-host dir, e.g. `~/.trae-cn/viaisep/config.toml`; legacy `~/.sep` is compatible during migration).
- Platform auth key (independent from the LLM key): `export VIAISEP_API_KEY=<platform-key>` — obtain it at https://viaisep.jiademin2688.top. Creating projects/nodes fails with HTTP 403 `quota_exceeded` if it is missing or out of quota.

## Quota

- Free/trial users: max 3 projects, max 2000 nodes per project. Paid subscribers: unlimited.
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

## Agent LLM Backend (In-Session Processing)

`(LLM)` commands (plan/generate/plan_tasks/tdd/run/analyze-reference/grill) need the LLM. VIAISEP writes `{proxy_file}.req.{uuid}` and waits for `{proxy_file}.resp.{uuid}` (default timeout 600s). **You are the LLM backend** — run the command in the background, poll the proxy dir (parent of `[llm].proxy_file`, derived from `data_root` as `{data_root}/.agent_proxy` per ADR-0041), answer each `.req` in-session, write `.resp` (`{"content": "...", "request_id": "..."}`), then verify artifacts. Response file name = request path with `.req.` replaced by `.resp.` — single source of truth is `src/llm/agent_provider.proxy_*_path`; never hand-craft the names.

## Human-Turn Proxy Protocol (ADR-0042)

`grill` / `init` (interactive interview) / grill inside `run --loop` also need to **ask the human a question**. They never block on stdin (agent-driven mode has no tty); they write `{proxy_file}.human_req.{uuid}` (JSON `{"request_id", "question", "context"}`) and wait for `{proxy_file}.human_resp.{uuid}` (JSON `{"answer", "request_id"}`).

**Prerequisite:** set `VIAISEP_AGENT_MODE=1` before starting these commands, or the session falls back to `input()` and raises `EOFError` (no tty). Default timeout 3600s, configurable via `VIAISEP_HUMAN_TIMEOUT`.

While polling the proxy dir for `.req.*`, **also poll for `*.human_req.*`** (same dir). For each: read JSON, **relay the question to the real user** (print it, ask for a reply), then write `.human_resp.{uuid}` with `{"answer": "<user reply>", "request_id": "<same id>"}`. File-name rule (single source of truth): `src/llm/agent_provider.human_*_path` — never hand-craft. If the user declines or is unavailable, write `{"answer": "done", "request_id": "..."}` so the session ends gracefully instead of timing out.

## Always verify

- Artifacts after command: project DB at `{data_root}/data/<project_id>/project.db` (data_root = Agent-host dir, e.g. `~/.trae-cn/viaisep`), `plan.json`, generated files under the code root (`src/` and `tests/`). The code root is the current directory when `init`/`run` runs inside the user's project folder (ADR-0040); otherwise it defaults to `{data_root}/workspace/<project_id>/`.
- `viaisep init` (and `viaisep run`) write `.viaisep-project` and register the current directory as the code root automatically.
- Stream output to the user for long-running commands.
- On HTTP 403 `quota_exceeded`: surface `detail.message` and `detail.upgrade_url`, do not retry in a loop.
