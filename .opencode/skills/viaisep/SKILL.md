---
name: viaisep
description: Drives the VIAISEP AI software-engineering platform. Use when the user wants to create, plan, generate, or evolve a software project using ontology, knowledge graph, business decision tables, or an automated TDD loop.
license: MIT
compatibility: opencode
metadata:
  category: workflow
  platform: viaisep
---

# VIAISEP Operator

## Overview

VIAISEP is a local AI software-engineering platform that turns structured requirements into working code through a knowledge graph, business decision tables, and an automated TDD loop. This skill lets an agent drive VIAISEP by starting its local FastAPI service and invoking its CLI or REST API.

## When to use

- The user asks to build a system from requirements, modules, capabilities, or business rules.
- The user wants to create a new project inside VIAISEP.
- The user wants to generate or evolve code from a dependency graph or decision table.
- The user wants to run the TDD loop for a planned set of tasks.
- The workspace contains a `.viaisep-project` marker file.

## Project binding

1. Look for `.viaisep-project` in the current directory and walk up to the filesystem root.
   - Format: one line `project_id=<id>`.
2. If no marker file exists, fall back to the sanitized current directory name.
3. Sanitize: replace spaces with underscores, keep only `a-zA-Z0-9_-`, and downcase.

## Prerequisites

- LLM provider key: `viaisep config --provider openai --model gpt-4o-mini --api-key <llm-key>` (or edit `~/.sep/config.toml`).
- Platform auth key (independent from the LLM key): `export VIAISEP_API_KEY=<platform-key>` — obtain it at <https://viaisep.jiademin2688.top>. Creating projects/nodes fails with HTTP 403 `quota_exceeded` if it is missing or out of quota.

## Quota

- Free/trial users: max **3 projects**, max **200 nodes** per project. Paid subscribers: unlimited.
- 403 body: `{"detail": {"error": "quota_exceeded", "message": "...", "upgrade_url": "https://viaisep.jiademin2688.top"}}`.
- Surface `upgrade_url` to the user instead of retrying in a loop; a retry succeeds once the subscription is paid (the backend force-refreshes the cached subscription on quota failure).

## Service lifecycle

- Check `curl -s http://127.0.0.1:8130/health` for `{"status":"ok"}`.
- If not running, start with `viaisep start --host 127.0.0.1 --port 8130 --no-open-browser` and poll `/health` until OK.
- Do not stop the service unless the user asks.

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

## Verification

- Confirm `project_id` is resolved.
- Confirm `/health` is OK.
- Confirm `VIAISEP_API_KEY` is set before creating projects/nodes.
- Confirm the CLI exits with code 0.
- Confirm expected artifacts exist: DB, workspace, `plan.json`, generated files.
- Confirm no 403 `quota_exceeded` was swallowed; surface `upgrade_url` if it occurred.
- Create `.viaisep-project` when the directory-name fallback was used.
