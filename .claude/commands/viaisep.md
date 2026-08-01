# /viaisep

Drive the VIAISEP AI software-engineering platform for the current project.

Prerequisites (both keys are independent):
1. LLM provider: **none needed by default** — `provider = "agent"` routes every LLM call through proxy files that you answer in-session (see the `viaisep` skill "Agent LLM Backend"). Advanced users may configure a direct provider: `viaisep config --provider openai --model gpt-4o-mini --api-key <llm-key>`, or edit the platform `config.toml` at the resolved data root (Agent-host dir, e.g. `~/.trae-cn/viaisep/config.toml`).
2. Platform auth key: `export VIAISEP_API_KEY=<platform-key>` — obtain it at https://viaisep.jiademin2688.top. Creating projects/nodes fails with HTTP 403 `quota_exceeded` if it is missing or out of quota. Free/trial users: max 3 projects, max 200 nodes per project; paid subscribers: unlimited.

Before any action:
1. Resolve the active `project_id` from `.viaisep-project` (search current and parent directories) or fall back to the sanitized current directory name.
2. Ensure the VIAISEP service is running: `curl -s http://127.0.0.1:8130/health`. If not, start it with `viaisep start --host 127.0.0.1 --port 8130 --no-open-browser` and poll `/health` until ok.
3. If VIAISEP is not installed or not configured, stop and guide the user to install it and run `viaisep config`.

Then follow the `viaisep` skill to fulfill the user's request. Choose the appropriate command:
- `viaisep init <project_id> [--requirements <path>]` — create a new project
- `viaisep grill <project_id> [--requirements <doc.md>]` — clarify requirements
- `viaisep plan <project_id> [--requirements <path>]` — generate ontology from requirements
- `viaisep generate <project_id> [--requirements <path>]` — write modules/capabilities/rules to the knowledge graph
- `viaisep analyze-reference <project_id> --source <text|path|url> [--type external|legacy]` — analyze a reference/legacy system
- `viaisep plan_tasks <project_id>` — produce `plan.json`
- `viaisep tdd <project_id>` — run the TDD loop
- `viaisep run <project_id> --requirements <path>` — one-shot full pipeline

Always verify expected artifacts after the command (project DB at `{data_root}/data/<project_id>/project.db`; generated files under the code root `src/`/`tests/` — the current directory when `init`/`run` runs in the user's folder, ADR-0040). `viaisep init`/`run` write `.viaisep-project` and register the current directory as the code root automatically. On HTTP 403 `quota_exceeded`, surface `detail.message` and `detail.upgrade_url` instead of retrying in a loop.
