# VIAISEP — AI Software Engineering Platform

This system addresses the core pain point of AI Coding — the two-way opacity between intent and results: AI struggles to understand human intent accurately, while humans cannot fully grasp what AI Coding has accomplished, making it hard to assess the current state and issue effective next-step instructions.

The system uses the **Three Stores** (Ontology Model, Knowledge Graph, Business Rules) as the collaboration medium to build a human-AI closed loop:

1. **AI Writes** — AI persistently writes each step of its coding output into the Three Stores in real time;
2. **Visual Presentation** — the frontend reads data from the Three Stores and presents it intuitively through visualizations such as dependency graphs and business decision tables;
3. **Human-AI Collaboration** — users read the visual output, select graph elements, and issue new instructions to AI in natural language;
4. **Context Reconstruction** — AI extracts the relevant data from the Three Stores based on the instruction and assembles precise context.

This mechanism eliminates AI coding hallucinations at the root and significantly improves the accuracy of instruction communication and overall AI coding efficiency.

## System Architecture

**The human-AI closed loop at a glance**:

<img width="1547" height="233" alt="image" src="https://github.com/user-attachments/assets/e99f999d-99e5-40e1-8ef2-b58ec5073f40" />


**Feature overview**:
<img width="1904" height="250" alt="image" src="https://github.com/user-attachments/assets/42ffccd7-03bb-489c-8dfc-02e02ac9f42d" />



## Features

- **Project Management & Quota**: Create and list projects; free/trial users are limited to 3 projects and 2000 nodes per project. Exceeding the limit returns HTTP 403 with an upgrade link.
- **Knowledge Graph**: Express modules, capabilities, and their dependencies with nodes and edges. Supports node/edge CRUD, drag positioning (500ms debounced auto-save), one-click auto layout, Swimlane and State Machine modeling, and automatic locking during code generation.
- **Ontology Modeling**: Maintain ontology class hierarchies and properties, constraining the semantic boundaries of the knowledge graph and decision rules to guarantee code-ontology alignment.
- **Business Decision Table**: Express business rules as condition-action matrices; supports rule CRUD, conflict detection, AI-generated rule draft confirmation/rejection, and conversion of rules into executable code.
- **Quality Gate**: Built-in 8 checks (pytest, ruff, mypy, bandit, knowledge-graph cycle detection, code-ontology alignment, 90% coverage threshold, and marking "needs clarification" after 10 failed fixes), with a coverage view and one-click re-run.
- **Engineering Collaboration**: Submit modification requests, analyze reference/legacy systems and import results into the Three Stores, keep decision trails, browse the file tree, and import/export projects.
- **CLI Full Pipeline**: `grill` requirements interview → `plan` ontology planning → `generate` code generation → `plan_tasks` task breakdown → `tdd` test-driven loop → `run` one-shot orchestration; plus `analyze-reference` reference-system analysis and `extract-lessons` lesson extraction.

## Deployment (to Coding Agents)

### 1. Prerequisites

```powershell
pip install -e .          # or pip install viaisep
export VIAISEP_API_KEY=<platform-key>   # Platform auth key (required to create projects/nodes) Get from https://viaisep.jiademin2688.top
# LLM needs no config by default: provider=agent is answered in-session by the driving agent (ADR-0039)
# Advanced users may opt in: viaisep config --provider openai --model gpt-4o-mini --api-key <LLM_KEY>
```

### 2. One-Click Install (TRAE / Claude Code / Codex)

```powershell
.\scripts\install-viaisep-skill.ps1        # Windows, installs all platforms by default
./scripts/install-viaisep-skill.sh          # Linux/macOS
python scripts/install-viaisep-skill.py     # Fallback inside the Trae CN sandbox (when PS1 is blocked)
# Pick platforms: -Platform trae,claude,codex (PS1) / CLI args (py)
```

> The packaged artifact `dist/viaisep/scripts/` ships the installer and the consistency checker (`install-viaisep-skill.ps1` / `.sh`, `verify-agent-skill.py`), so the dist directory alone is sufficient for deployment — no source tree required.

The script automatically does four things:

- Registers the skill into each agent's global directory (see the table below)
- Initializes each agent's dedicated data root `~/{host_dir}/viaisep/` (data/、workspace/、config.toml), writing `provider = "agent"` + `model = "trae_builtin"` into config.toml when absent (ADR-0039); `proxy_file` is derived from `data_root` as `{data_root}/.agent_proxy`, never written to the config file (ADR-0041)
- `load_config` auto-backs-up and rebuilds the default config when config.toml is corrupt or missing, so the CLI is never bricked (ADR-0041)
- Patches the TRAE sandbox: writes `"viaisep*": {"execEnv": "host"}` into `~/.trae-cn/permission/global.json` so the packaged CLI bypasses the sandbox

| Agent       | Skill location                                            | Data root             |
| ----------- | --------------------------------------------------------- | --------------------- |
| TRAE        | `~/.trae-cn/skills/viaisep/SKILL.md`                      | `~/.trae-cn/viaisep/` |
| Claude Code | `~/.claude/skills/viaisep/SKILL.md`                       | `~/.claude/viaisep/`  |
| Codex       | `~/.codex/prompts/viaisep.md` (referenced via `!viaisep`) | `~/.codex/viaisep/`   |

### 3. Other Agents (Cursor / OpenCode / Gemini CLI)

Both the repo and the packaged artifact `dist/viaisep/` ship the config copies (relative paths preserved). Copy them into the target agent's global config directory:

- **Cursor**: `.cursor/rules/viaisep.mdc`
- **OpenCode**: `.opencode/skills/viaisep/SKILL.md`
- **Gemini CLI**: `.gemini/commands/viaisep.toml`

> `dist/viaisep/` is fully self-contained: `viaisep.exe` (server) + `_internal/static` (frontend) + `scripts/` (install/verify scripts) + all agent config sources (`.trae/`, `skills/`, `.codex/`, `.cursor/`, `.opencode/`, `.gemini/`, `.claude/`, `.claude-plugin/`). Running `scripts\install-viaisep-skill.ps1` inside the dist directory completes the deployment independently.
> Note: when running the PowerShell installer inside the Trae CN sandbox, the `safe_rm_aliases.ps1` wrapper intercepts `Copy-Item` and refuses to write to `~/.claude` and `~/.codex` (paths not in the sandbox allowlist) — modifying `resourceAuthorization.filesystem.readWrite` does not help. In that case, fall back to the Python edition: `python scripts/install-viaisep-skill.py` (`shutil` is not intercepted). Other agent environments have no such restriction.

### 4. Consistency Check

```powershell
python scripts\verify-agent-skill.py   # exit code 0 = all passed, CI-ready
```

### 5. Data Roots & Multi-Agent Isolation (ADR-0038)

- Each agent uses its own data root, so projects and quota data never interfere with each other
- Data root resolution priority: `VIAISEP_HOME` env var → agent data root (deployment config) → existing `~/.sep` → default `~/.sep`
- config.toml is auto-rebuilt with defaults when missing or corrupt (ADR-0041), so the CLI is never bricked
- Start the service: `viaisep start` (defaults to `127.0.0.1:8130`, auto-opens the browser; use `--host 0.0.0.0` for LAN access)

### 6. Triple-Store Follows Code Root (ADR-0043)

- Project-level platform assets — the triple-store DB (`project.db`), the current requirements snapshot (`requirements.json`), etc. — live under a hidden directory `{code_root}/.viaisep-data/`, co-located with the user's source code
- **Asset consistency**: when users `git init` / use IDE collaboration / migrate projects, the triple-store travels with the code — same repo, same backup, same migration
- **Security boundary**: generated code is forbidden from directly reading/writing `.viaisep-data/` (must go through platform APIs to touch the triple-store); users, IDEs, and git are not restricted
- **Backward compatibility**: when the legacy location (`~/{host_dir}/viaisep/data/{project_id}/project.db`) exists, the first `get_project()` call auto-migrates it to the new location without deleting the old one (user cleans up manually)
- **Project deletion**: removes `code_root/.viaisep-data/` (platform-asset residue) plus platform metadata; user source code under `code_root` is preserved (per ADR-0040)

## Agent LLM Backend (In-Session Processing)

VIAISEP carries no LLM key by default — LLM calls are answered in-session by the driving agent via the proxy file protocol (ADR-0039):

- **LLM proxy protocol**: the CLI writes `{proxy_file}.req.{uuid}`, the agent polls the proxy dir, answers with its own LLM session, and writes `{proxy_file}.resp.{uuid}` (default timeout 600s)
- **Human-turn proxy protocol** (ADR-0042): when `grill` / `init` interview / `run --loop` grill needs to ask the human a question, it writes `{proxy_file}.human_req.{uuid}`; the agent relays the question to the real user and writes `{proxy_file}.human_resp.{uuid}` with the reply. If the user is unavailable, write `{"answer": "done"}` so the session ends gracefully
- **Prerequisite**: set `VIAISEP_AGENT_MODE=1` before driving these commands in the background, or the session falls back to `input()` and raises `EOFError` (no tty). Default timeout is 3600s, configurable via `VIAISEP_HUMAN_TIMEOUT`

The proxy file lives at `{data_root}/.agent_proxy` (derived from data\_root per ADR-0041). File-name rules: `src/llm/agent_provider.proxy_*_path` and `human_*_path` are the single source of truth — never hand-craft.

## CLI Reference

### Configuration & Service

| Command                                                                | Purpose                                                                                        |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `viaisep config --provider openai --model gpt-4o-mini --api-key <key>` | Configure the LLM Provider (openai/ollama, `--base-url` for custom endpoints)                  |
| `viaisep start [--host 127.0.0.1] [--port 8130] [--no-open-browser]`   | Start the Web service; default port 8130 with auto browser launch                              |
| `viaisep init <project_id> [--name] [--requirements <path>]`           | Create project database and workspace (with `--requirements` skips the requirements interview) |

### Requirements & Modeling

| Command                                                           | Purpose                                                           |
| ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| `viaisep grill <project_id> [--requirements <doc.md>] [--output]` | Requirements-clarification interview; outputs `requirements.json` |
| `viaisep plan <project_id> [--requirements <path>]`               | Generate the ontology model from requirements                     |
| `viaisep generate <project_id> [--requirements <path>]`           | Generate code and seed knowledge-graph nodes/rules                |
| `viaisep plan_tasks <project_id> [--output]`                      | Break work into tasks; produces `<project_id>_plan.json`          |

### Execution & Loop

| Command                                                                      | Purpose                                                                                                                                   |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `viaisep tdd <project_id> [--plan <plan.json>] [--max-retries 10] [--watch]` | Test-driven loop: write tests → implement → write back; `--watch` watches plan.json and runs new tasks automatically                      |
| `viaisep run <project_id> --requirements <path>`                             | One-shot pipeline `init → plan → generate → plan_tasks → tdd`; `--loop` enables the design-driven loop (Observe→Choose→Act→Verify→Record) |

### Engineering Aids

| Command                                                                                       | Purpose                                                                              |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `viaisep analyze-reference <project_id> --source <text\|path\|url> [--type external\|legacy]` | Analyze a reference/legacy system and import the findings into the Three Stores      |
| `viaisep graphify <project_id> [--source-dir] [--format json\|html\|both] [--sync-to-kg]`     | Extract a code knowledge graph from source                                           |
| `viaisep extract-lessons <project_id> [--threshold 3] [--promote] [--schedule]`               | Extract high-frequency lessons; optionally promote to AGENTS.md or run on a schedule |

## Frontend Guide

**1. Project area**: Create/switch projects at the top; enter a project ID and name when creating. The UI shows the upgrade link when quota runs out.

**2. Dependency graph** (main view):

- Right-click or use the toolbar "add node" to create module/capability nodes; fill in name and description
- Drag nodes to reposition (auto-saved); drag from one node to another to create a dependency edge
- Scroll to zoom, drag the canvas to pan; the toolbar "auto layout" tidies connections
- Select a node/edge to edit or delete (cascades to related edges and rules)

**3. Swimlane / State Machine**: Create swimlane definitions or state machines, configure phases/states and transitions, rendered live in the graph.

**4. Decision table** (auxiliary view):

- Add a decision table and define condition/action columns
- Add/delete rule rows; click cells to edit; changes are saved automatically
- Conflicting rules show a red warning with the conflict reason; AI-generated drafts must be confirmed or discarded per row

**5. Quality & engineering operations**:

- The "coverage" panel shows code/rule coverage (≥90% marked done)
- The "generate code" button triggers AI generation while the page is locked; "quality report" shows the 8 gate results and can be re-run
- "Modification requests" submit change requests and track their status; "reference analysis" imports external/legacy system findings

**6. Data sync**: The page polls the version number automatically so edits in other sessions refresh the graph and decision table.
