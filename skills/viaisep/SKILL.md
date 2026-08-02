---
name: viaisep
description: Drives the VIAISEP AI software-engineering platform to build systems from requirements through TDD. Use when the user wants to create, plan, generate, or evolve a software project using the knowledge-graph and visual-interaction platform. Use when the task involves structured requirements, module dependency graphs, business decision tables, or TDD-generated code.
---

# VIAISEP Agent Skill

## Overview

VIAISEP is a local AI software-engineering platform that turns structured requirements into working code through a knowledge graph, business decision tables, and an automated TDD loop. This skill lets an agent drive VIAISEP by starting its local FastAPI service and invoking its CLI or REST API.

The agent does not replace VIAISEP's engine. It acts as the operator: detecting the project context, ensuring the service is running, choosing the right VIAISEP command, and verifying the results.

The agent is **also the LLM backend**. VIAISEP itself carries no LLM API key. When a command needs the LLM (plan / generate / plan_tasks / tdd / run / analyze-reference), VIAISEP writes a request file and waits; the agent answers it in-session. See [Agent LLM Backend](#agent-llm-backend-in-session-processing) below.

## When to Use

- The user asks to "build a system" from requirements, modules, capabilities, or business rules.
- The user wants to create a new project inside VIAISEP.
- The user wants to generate code from a dependency graph or decision table.
- The user wants to run TDD to implement a planned set of tasks.
- The user wants to evolve an existing VIAISEP project (add modules, change rules, regenerate code).
- The workspace contains a `.viaisep-project` marker file.

**When NOT to use:**
- The task is a single-file change with no requirements, no modules, and no business rules. Use ordinary coding instead.
- The user explicitly wants to work outside the VIAISEP platform (plain repo, no KG).

## Prerequisites

1. VIAISEP must be installed in the current Python environment:
   ```bash
   pip install -e .
   ```
2. LLM provider: **no configuration needed by default.** The skill installer writes `provider = "agent"` and `model = "trae_builtin"` into the platform `config.toml` when no LLM config exists; `proxy_file` is derived from `data_root` as `{data_root}/.agent_proxy` (ADR-0041), never written to config.toml. VIAISEP then routes every LLM call through proxy files, which you answer in-session (see below). This LLM provider is independent from the platform auth key. Advanced users may instead configure a direct provider:
   ```bash
   viaisep config --provider openai --model gpt-4o-mini --api-key <llm-key>
   ```
   Or edit the platform config file at the resolved data root (Agent-host dir, e.g. `~/.trae-cn/viaisep/config.toml`; legacy `~/.sep` is still compatible during migration).
3. Platform auth key must be set as an environment variable. Register and request it at <https://viaisep.jiademin2688.top>:
   ```bash
   export VIAISEP_API_KEY=<platform-key>
   ```
   Creating projects and nodes fails with HTTP 403 `quota_exceeded` when this key is missing or its quota is exhausted. The LLM provider key and the platform auth key are independent — both must be configured.

## Project Binding

Before any VIAISEP command, determine the active `project_id`:

1. **Look for `.viaisep-project`** in the current directory, then walk up to the filesystem root.
   - If found, read `project_id` from it. The file format is one line:
     ```
     project_id=ecommerce
     ```
2. **Fallback to directory name.** If no marker file exists, use the current directory name as `project_id`.
3. **Sanitize.** Replace spaces with underscores, remove characters other than `a-zA-Z0-9_-`, and downcase.

If neither strategy yields a valid `project_id`, ask the user for one.

## Service Lifecycle

VIAISEP exposes a local HTTP API. Most operations can also be performed through the `viaisep` CLI. The skill uses the CLI as the primary interface but keeps the service running so the web UI and job polling work.

### Start the service

1. Check whether VIAISEP is already running:
   ```bash
   curl -s http://127.0.0.1:8130/health
   ```
   Expected response: `{"status":"ok"}`.
2. If not running, start it in the background:
   ```bash
   viaisep start --host 127.0.0.1 --port 8130 --no-open-browser
   ```
3. Wait up to 30 seconds, polling `/health` every 2 seconds, until it returns `ok`.
4. If it still fails, report the error and stop.

### Stop the service

Do not stop the service unless the user explicitly asks. VIAISEP is designed to stay running so the web UI and watch mode work.

## Platform Auth & Quota

Quota is enforced per platform auth key (`VIAISEP_API_KEY`):

- **Free/trial users**: at most **3 projects** total, and at most **2000 nodes** per project knowledge graph.
- **Paid subscribers**: unlimited projects and nodes.
- Subscription state is fetched once from the platform (`GET /api/auth/check-subscription`) and cached for **1 hour**; when a quota check fails, the cache is force-refreshed so a just-upgraded user is served immediately on retry.

When quota is exhausted the API returns **HTTP 403** with a structured body:

```json
{"detail": {"error": "quota_exceeded", "message": "...", "upgrade_url": "https://viaisep.jiademin2688.top"}}
```

The web UI intercepts these 403 responses globally and shows an upgrade dialog that opens `upgrade_url`; the page auto-refreshes when the user returns. **Agents should surface `upgrade_url` to the user instead of blindly retrying** — a retry only succeeds after the subscription becomes paid.

## Agent LLM Backend (In-Session Processing)

Commands marked `(LLM)` need the LLM. VIAISEP writes `{proxy_file}.req.{uuid}` and waits for `{proxy_file}.resp.{uuid}` (default timeout 600s). **You are the LLM backend — answer these requests in-session**, never from an external API:

1. **Start the command in the background** so you stay free to serve requests:
   ```bash
   # PowerShell
   Start-Job -ScriptBlock { viaisep plan <project_id> } | Out-Null
   # bash
   viaisep plan <project_id> &
   ```
   Or run it in a second terminal.
2. **Poll the proxy directory** — the parent dir of `[llm].proxy_file` (ADR-0041: derived from `data_root` as `{data_root}/.agent_proxy`, e.g. `~/.trae-cn/viaisep/.agent_proxy`). Requests appear as siblings:
   ```bash
   ls <proxy_dir>/*.req.*
   ```
3. For each request file, read the JSON, answer with your own LLM session, then write the response:
   - Request: `{"request_id": "...", "messages": [...], "system": "...", "model": "..."}`
   - Response: write to the same path with `.req.` replaced by `.resp.`, payload `{"content": "...", "request_id": "..."}`.
   - **File-name rule is single-source of truth**: `req = {proxy_file}.req.{request_id}`, `resp = {proxy_file}.resp.{request_id}`. The only authoritative implementation is `src/llm/agent_provider.proxy_request_path` / `proxy_response_path` — never hand-craft these names, or the CLI will silently never find your response.
4. Continue polling until the command exits, then verify the artifacts (Step 6).

If a request cannot be answered (e.g. missing context), write an explicit explanation as `content` — a real response beats a timeout. If a command seems stuck, check for a waiting `.req` file and answer it.

### Human-Turn Proxy Protocol (ADR-0042)

Commands `grill` and `init` (interactive interview), plus grill triggered inside `run --loop`, also need to **ask the human a question**. They never block on stdin (agent-driven mode has no tty); instead they write a human-turn request file and you relay it to the real user:

**Prerequisite:** set `VIAISEP_AGENT_MODE=1` before starting `grill` / `init` / `run --loop` so the session routes human-turn questions through this protocol instead of `input()` (which raises `EOFError` in agent-driven mode with no tty). Default human-turn timeout is 3600s, configurable via `VIAISEP_HUMAN_TIMEOUT`.

1. While polling the proxy dir for `.req.*`, **also poll for `*.human_req.*`** (same dir).
2. For each `*.human_req.{uuid}` file, read JSON `{"request_id", "question", "context"}`:
   - **Relay the question to the real user** — print it in your conversation, ask the user to respond.
   - On receiving the user's answer, write `{proxy_file}.human_resp.{uuid}` with payload `{"answer": "<user reply>", "request_id": "<same id>"}`.
3. File-name rule (single source of truth): `human_req = {proxy_file}.human_req.{request_id}`, `human_resp = {proxy_file}.human_resp.{request_id}`. Authoritative implementation: `src/llm/agent_provider.human_request_path` / `human_response_path` — never hand-craft.
4. If the user declines or is unavailable, write `{"answer": "done", "request_id": "..."}` so the grill session ends gracefully instead of timing out (default 3600s).

Both `.req` (LLM) and `.human_req` (human) files coexist in the same proxy dir; poll both in one pass.

## Core Process

### Step 1: Ensure project context

- Resolve `project_id` using the project-binding rules above.
- `viaisep init` (and `viaisep run`, whose first step is init) writes `.viaisep-project` and registers the current directory as the project's code root automatically — run it from the user's project folder so generated code lands there (ADR-0040).

### Step 2: Ensure service is reachable

- Run the service-lifecycle check.
- If VIAISEP is not installed or not configured, guide the user through installation and `viaisep config` before proceeding.

### Step 3: Choose the command

Map the user's intent to one of the VIAISEP commands:

| User intent | Command | Notes |
|---|---|---|
| "Create a project" / "Start from requirements" | `viaisep init <project_id>` | Creates project DB and workspace. Use `--requirements <path>` to skip the interview. |
| "Generate ontology" / "Plan the domain" | `viaisep plan <project_id>` | `(LLM)` Requires `requirements.json`. |
| "Write KG nodes" / "Seed modules and capabilities" | `viaisep generate <project_id>` | `(LLM)` Requires `requirements.json`. |
| "Break into tasks" | `viaisep plan_tasks <project_id>` | `(LLM)` Produces `<project_id>_plan.json`. |
| "Run TDD" | `viaisep tdd <project_id>` | `(LLM)` Consumes `plan.json`. |
| "Build everything from requirements" | `viaisep run <project_id> --requirements <path>` | `(LLM)` One-shot pipeline: init → plan → generate → plan_tasks → tdd. |
| "Add a module/rule and regenerate" | `viaisep generate` then `viaisep plan_tasks` then `viaisep tdd` | `(LLM)` Incremental workflow. |
| "Clarify requirements" (grill session) | `viaisep grill <project_id> [--requirements <doc.md>]` | `(LLM)` Interactive requirements interview; outputs `requirements.json`. |
| "Analyze a reference/legacy system" | `viaisep analyze-reference <project_id> --source <text\|path\|url> [--type external\|legacy]` | `(LLM)` Imports domain model, modules, and rule drafts into the three databases. |

`(LLM)` commands follow the [Agent LLM Backend](#agent-llm-backend-in-session-processing) flow: run in background, serve `.req` files in-session, write `.resp`, then verify.

### Step 4: Prepare `requirements.json` when needed

If the command needs `--requirements` and the user has not provided a file, do one of:

1. Use an existing `<project_id>_requirements.json` in the current directory.
2. If the user has described requirements in the conversation, write a minimal `requirements.json` yourself:
   ```json
   {
     "name": "E-commerce Demo",
     "description": "Online shop with users, products, orders, and cart",
     "frontend_stack": "html-tailwind",
     "modules": [
       {"name": "用户服务", "description": "User registration and login", "layer": "backend"},
       {"name": "登录页", "description": "Login page", "layer": "frontend"}
     ],
     "capabilities": [
       {"name": "用户认证", "description": "Authenticate users"}
     ],
     "rules": [],
     "constraints": []
   }
   ```
3. Otherwise, ask the user for requirements before running the command.

### Step 5: Execute and observe

- Run the chosen `viaisep` CLI command.
- For `(LLM)` commands, follow the [Agent LLM Backend](#agent-llm-backend-in-session-processing) flow: start the command in the background, serve `.req` files in-session, write `.resp`, and wait for the command to exit.
- Capture stdout/stderr.
- For long-running commands (`run`, `tdd`), stream output to the user; do not hide it.
- If a command returns a non-zero exit code, stop and surface the error.
- If a project/node creation returns HTTP 403 with `detail.error == "quota_exceeded"`, do **not** retry in a loop. Surface the `detail.message` and `detail.upgrade_url` to the user and wait for them to upgrade.

### Step 6: Verify

After each command, confirm expected artifacts:

- After `init`: project DB exists at `{code_root}/.viaisep-data/project.db` (ADR-0043: triple-store follows code root); code root is either the current directory (when `init` runs inside the coding agent's project folder, per ADR-0040) or `{data_root}/workspace/<project_id>/` by default. Legacy `{data_root}/data/<project_id>/project.db` (if any) is auto-migrated on first access; old location left for user cleanup.
- After `plan`: business ontology tables populated in project DB.
- After `generate`: KG nodes for modules/capabilities exist; `DesignToken` node created when `frontend_stack` is set.
- After `plan_tasks`: `<project_id>_plan.json` exists and contains a `tasks` array.
- After `tdd` / `run`: all tasks `completed`; generated files exist under the project code root (`src/` and `tests/`).

`tdd` and `run` execute the local quality gate (8 checks: pytest, ruff, mypy, bandit, knowledge-graph cycle detection, code-ontology alignment, coverage ≥ 90%, and "needs clarification" marking). If a task is left `failed`/`pending`, read the gate report before claiming success.

For `(LLM)` commands, verify no `.req` file is left unanswered in the proxy directory.

Use the REST API to verify when the CLI output is ambiguous:

```bash
curl -s http://127.0.0.1:8130/api/projects/<project_id>/graph
curl -s http://127.0.0.1:8130/api/projects/<project_id>/files
```

### Step 7: Generated code lands in the project code root

VIAISEP writes generated code to the project's **code root** (ADR-0040): the current directory when `init`/`run` executes inside the coding agent's project folder, otherwise `{data_root}/workspace/<project_id>/` by default. Per **ADR-0043**, the three-layer database (`project.db`) and other project-level platform assets also follow the code root, living under the hidden directory `{code_root}/.viaisep-data/` so the triple-store travels with the code for git/backup/migration consistency. Generated code is forbidden from directly reading/writing `.viaisep-data/` (must go through platform APIs); users/IDE/git are unrestricted.

When you drive VIAISEP from the user's project folder (typical for coding agents), the generated `src/` and `tests/` already appear directly in that folder — no copy step is needed, and the code is ready for git/IDE collaboration. Only when the project has no binding (platform workspace fallback) would you copy files into the user's repo, and only when the user asks; prefer symlinks for live projects so subsequent `viaisep tdd` runs stay in sync.

## REST API Reference

Keep these endpoints available for verification and incremental operations:

| Endpoint | Method | Purpose |
|---|---|---|
| `/health` | GET | Service health check |
| `/api/projects` | GET | List projects |
| `/api/projects` | POST | Create a project (quota-checked, may return 403 `quota_exceeded`) |
| `/api/projects/{id}/version` | GET | Data version (frontend polling; reload when changed) |
| `/api/projects/{id}/graph` | GET | Get KG nodes and edges |
| `/api/projects/{id}/graph/nodes` | POST | Create a node (quota-checked, may return 403 `quota_exceeded`) |
| `/api/projects/{id}/rules` | GET/POST | List/create rules |
| `/api/projects/{id}/decision-tables` | GET/POST | List/create business decision tables |
| `/api/projects/{id}/modification-requests` | POST | Submit a modification request (selection-assistant primary path) |
| `/api/projects/{id}/modification-requests/{rid}` | GET | Poll modification execution status |
| `/api/projects/{id}/coverage` | GET | Coverage report |
| `/api/projects/{id}/quality-report` | GET | Quality gate report |
| `/api/projects/{id}/generate` | POST | Trigger generation job |
| `/api/projects/{id}/files` | GET | List generated files |
| `/api/jobs/{job_id}` | GET | Poll generation job status |

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "I'll just edit the code directly; VIAISEP is overkill" | If the task involves structured requirements, modules, rules, or TDD, bypassing VIAISEP loses the knowledge graph and regeneration ability. Direct edits are fine only for trivial fixes. |
| "The service is too heavy to keep running" | VIAISEP is a local FastAPI + SQLite service. It consumes minimal resources and enables the web UI, watch mode, and job polling. Stop it only when asked. |
| "I can guess the project_id from context" | Always use `.viaisep-project` or the directory name. Guessing creates duplicate projects and orphaned databases. |
| "VIAISEP needs an LLM API key before anything works" | No. By default VIAISEP routes LLM calls through proxy files and you answer them in-session. A direct provider (openai/ollama) is optional. |
| "I'll skip the verification step" | VIAISEP commands can succeed at the CLI level while producing empty or wrong artifacts. Always verify the expected output exists. |
| "The generated code is in the platform data root, so I don't need to copy it" | If the project is bound to the user's folder (coding-agent flow), generated code is already in it. For unbound projects (platform workspace fallback), code must be reflected into the user's git repo before it can be committed or reviewed. |

## Red Flags

- Running VIAISEP commands without resolving `project_id` first.
- Starting multiple `viaisep start` instances on the same port.
- Editing generated code directly in `{data_root}/workspace/<project_id>/` without telling the user.
- Assuming `/health` is running without checking.
- Forgetting to create `.viaisep-project` after using the directory-name fallback.
- Running `viaisep run` without a `requirements.json`.
- Running quota-checked operations without `VIAISEP_API_KEY` set.
- Retrying a 403 `quota_exceeded` in a loop instead of surfacing `upgrade_url`.
- Running an `(LLM)` command without serving its `.req` files — the command will block until timeout.
- Answering `.req` files from an external API instead of the in-session LLM.
- **Running `grill` / `init` (interactive) / `run --loop` without polling `*.human_req.*`** — grill will hang waiting for a human answer that never comes (ADR-0042).
- **Answering `.human_req` files with content from the in-session LLM** — human-turn requests must be relayed to the real user, not auto-answered by the LLM.

## Verification

Before finishing any VIAISEP-driven task, confirm:

- [ ] `project_id` is resolved from `.viaisep-project` or directory name.
- [ ] VIAISEP service responds with `{"status":"ok"}` at `/health`.
- [ ] `VIAISEP_API_KEY` is set before creating projects or nodes.
- [ ] The chosen command returned exit code 0.
- [ ] Expected artifacts exist (DB, workspace, plan.json, generated files).
- [ ] For `run` / `tdd`: all tasks are `completed` and tests pass (quality gate: 8 checks, coverage ≥ 90%).
- [ ] No 403 `quota_exceeded` was swallowed silently; `upgrade_url` was surfaced when it occurred.
- [ ] Generated code is reflected back to the user's workspace if requested.
- [ ] `.viaisep-project` marker file is created when directory-name fallback was used.
- [ ] After changing the proxy protocol, LLM prompts, or the CLI pipeline: run `python scripts/e2e_mock_run.py` to confirm the full flow still passes end-to-end.
