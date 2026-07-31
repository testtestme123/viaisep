---
name: viaisep
description: Drives the VIAISEP AI software-engineering platform to build systems from requirements through TDD. Use when the user wants to create, plan, generate, or evolve a software project using the knowledge-graph and visual-interaction platform. Use when the task involves structured requirements, module dependency graphs, business decision tables, or TDD-generated code.
---

# VIAISEP Agent Skill

## Overview

VIAISEP is a local AI software-engineering platform that turns structured requirements into working code through a knowledge graph, business decision tables, and an automated TDD loop. This skill lets an agent drive VIAISEP by starting its local FastAPI service and invoking its CLI or REST API.

The agent does not replace VIAISEP's engine. It acts as the operator: detecting the project context, ensuring the service is running, choosing the right VIAISEP command, and verifying the results.

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
2. LLM provider must be configured (this is the **LLM provider key**, independent from the platform auth key):
   ```bash
   viaisep config --provider openai --model gpt-4o-mini --api-key <llm-key>
   ```
   Or edit the platform config file at the resolved data root (default `~/.sep/config.toml`).
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

- **Free/trial users**: at most **3 projects** total, and at most **200 nodes** per project knowledge graph.
- **Paid subscribers**: unlimited projects and nodes.
- Subscription state is fetched once from the platform (`GET /api/auth/check-subscription`) and cached for **1 hour**; when a quota check fails, the cache is force-refreshed so a just-upgraded user is served immediately on retry.

When quota is exhausted the API returns **HTTP 403** with a structured body:

```json
{"detail": {"error": "quota_exceeded", "message": "...", "upgrade_url": "https://viaisep.jiademin2688.top"}}
```

The web UI intercepts these 403 responses globally and shows an upgrade dialog that opens `upgrade_url`; the page auto-refreshes when the user returns. **Agents should surface `upgrade_url` to the user instead of blindly retrying** — a retry only succeeds after the subscription becomes paid.

## Core Process

### Step 1: Ensure project context

- Resolve `project_id` using the project-binding rules above.
- If the marker file is missing but the directory name is being used, offer to create `.viaisep-project` after the first successful command so future sessions are stable.

### Step 2: Ensure service is reachable

- Run the service-lifecycle check.
- If VIAISEP is not installed or not configured, guide the user through installation and `viaisep config` before proceeding.

### Step 3: Choose the command

Map the user's intent to one of the VIAISEP commands:

| User intent | Command | Notes |
|---|---|---|
| "Create a project" / "Start from requirements" | `viaisep init <project_id>` | Creates project DB and workspace. Use `--requirements <path>` to skip the interview. |
| "Generate ontology" / "Plan the domain" | `viaisep plan <project_id>` | Requires `requirements.json`. |
| "Write KG nodes" / "Seed modules and capabilities" | `viaisep generate <project_id>` | Requires `requirements.json`. |
| "Break into tasks" | `viaisep plan_tasks <project_id>` | Produces `<project_id>_plan.json`. |
| "Run TDD" | `viaisep tdd <project_id>` | Consumes `plan.json`. |
| "Build everything from requirements" | `viaisep run <project_id> --requirements <path>` | One-shot pipeline: init → plan → generate → plan_tasks → tdd. |
| "Add a module/rule and regenerate" | `viaisep generate` then `viaisep plan_tasks` then `viaisep tdd` | Incremental workflow. |
| "Clarify requirements" (grill session) | `viaisep grill <project_id> [--requirements <doc.md>]` | Interactive requirements interview; outputs `requirements.json`. |
| "Analyze a reference/legacy system" | `viaisep analyze-reference <project_id> --source <text\|path\|url> [--type external\|legacy]` | Imports domain model, modules, and rule drafts into the three databases. |

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
- Capture stdout/stderr.
- For long-running commands (`run`, `tdd`), stream output to the user; do not hide it.
- If a command returns a non-zero exit code, stop and surface the error.
- If a project/node creation returns HTTP 403 with `detail.error == "quota_exceeded"`, do **not** retry in a loop. Surface the `detail.message` and `detail.upgrade_url` to the user and wait for them to upgrade.

### Step 6: Verify

After each command, confirm expected artifacts:

- After `init`: project DB exists at `{data_root}/data/<project_id>/project.db` and workspace at `{data_root}/workspace/<project_id>/`.
- After `plan`: business ontology tables populated in project DB.
- After `generate`: KG nodes for modules/capabilities exist; `DesignToken` node created when `frontend_stack` is set.
- After `plan_tasks`: `<project_id>_plan.json` exists and contains a `tasks` array.
- After `tdd` / `run`: all tasks `completed`; generated files exist under `{data_root}/workspace/<project_id>/src/` and `tests/`.

`tdd` and `run` execute the local quality gate (8 checks: pytest, ruff, mypy, bandit, knowledge-graph cycle detection, code-ontology alignment, coverage ≥ 90%, and "needs clarification" marking). If a task is left `failed`/`pending`, read the gate report before claiming success.

Use the REST API to verify when the CLI output is ambiguous:

```bash
curl -s http://127.0.0.1:8130/api/projects/<project_id>/graph
curl -s http://127.0.0.1:8130/api/projects/<project_id>/files
```

### Step 7: Reflect artifacts back to the workspace

VIAISEP stores generated code under the platform data root (`{data_root}/workspace/<project_id>/`). If the user wants the code inside the current repository, copy or symlink the relevant files:
```bash
cp -r {data_root}/workspace/<project_id>/src/* ./src/
cp -r {data_root}/workspace/<project_id>/tests/* ./tests/
```

Only do this when the user asks, and prefer symlinks for live projects so subsequent `viaisep tdd` runs stay in sync.

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
| "I'll skip the verification step" | VIAISEP commands can succeed at the CLI level while producing empty or wrong artifacts. Always verify the expected output exists. |
| "The generated code is in the platform data root, so I don't need to copy it" | If the user is working in a git repo, the generated code must be reflected there before it can be committed or reviewed. |

## Red Flags

- Running VIAISEP commands without resolving `project_id` first.
- Starting multiple `viaisep start` instances on the same port.
- Editing generated code directly in `{data_root}/workspace/<project_id>/` without telling the user.
- Assuming `/health` is running without checking.
- Forgetting to create `.viaisep-project` after using the directory-name fallback.
- Running `viaisep run` without a `requirements.json`.
- Running quota-checked operations without `VIAISEP_API_KEY` set.
- Retrying a 403 `quota_exceeded` in a loop instead of surfacing `upgrade_url`.

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
