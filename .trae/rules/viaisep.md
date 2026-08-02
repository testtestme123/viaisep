---
description: "当用户提到 VIAISEP、本体、知识图谱、模块/能力、业务规则、决策表或 TDD 流程时，使用本规则。"
alwaysApply: false
---

# VIAISEP 项目规则

## 适用场景

本规则在以下情况生效：用户希望使用 VIAISEP AI 软件工程平台创建项目、生成本体、填充知识图谱、制定业务规则、运行 TDD 流水线，或看到 `.viaisep-project` 标记文件。

## 角色定义

你是本地 VIAISEP 平台（FastAPI + SQLite + NetworkX）的操作员。不要替代它的引擎，而是负责解析项目上下文、保持服务运行、选择正确的 CLI 命令并验证产物。

## 项目绑定

1. 在当前目录向上查找 `.viaisep-project` 标记文件。
   - 文件格式：`project_id=<id>`（单行）。
2. 若未找到，回退到当前目录名（清洗后）作为 `project_id`。
3. 清洗规则：空格替换为下划线，仅保留 `a-zA-Z0-9_-`，并转为小写。
4. `viaisep init`（以及 `viaisep run`，其第一步即 init）自动写入 `.viaisep-project` 并把当前目录注册为项目的**代码根**（ADR-0040）：生成的 `src/`/`tests/` 直接落在用户的项目文件夹下。三层数据库始终位于平台数据根 `{data_root}/data/<project_id>/`。

## 前置条件（两个 Key 相互独立）

1. **LLM Provider**：默认**无需任何配置**（`provider = "agent"`），LLM 调用通过代理文件路由，由你在会话内应答（见下文"Agent LLM 后端"）。高级用户可配置直连：`viaisep config --provider openai --model gpt-4o-mini --api-key <llm-key>`，或编辑平台数据根的 `config.toml`（Agent 宿主目录，如 `~/.trae-cn/viaisep/config.toml`；旧 `~/.sep` 兼容迁移）。
2. **平台认证 Key**（用于配额校验，创建项目/节点必需）：`export VIAISEP_API_KEY=<platform-key>`，在 https://viaisep.jiademin2688.top 注册登录后申请。

## 配额限制

- 免费/试用用户：最多 3 个项目，单个项目知识图谱最多 2000 个节点；付费订阅用户不受限制。
- 配额耗尽时接口返回 HTTP 403：`{"detail": {"error": "quota_exceeded", "message": "...", "upgrade_url": "https://viaisep.jiademin2688.top"}}`。
- 遇到 403 `quota_exceeded`：不要盲目循环重试，向用户展示 `message` 与 `upgrade_url`，引导充值后重试（配额校验失败时会强制刷新订阅状态，充值后立即生效）。

## 服务生命周期

- 检查 `curl -s http://127.0.0.1:8130/health` 是否返回 `{"status":"ok"}`。
- 若未运行，使用 `viaisep start --host 127.0.0.1 --port 8130 --no-open-browser` 启动，并轮询 `/health` 直到就绪。
- 除非用户明确要求，否则不要停止服务。

## 命令映射

| 用户意图 | 命令 |
|---|---|
| 创建项目 | `viaisep init <project_id> [--requirements <path>]` |
| 需求澄清 | `viaisep grill <project_id> [--requirements <doc.md>]` |
| 生成本体 | `viaisep plan <project_id> [--requirements <path>]` |
| 写入 KG 节点 | `viaisep generate <project_id> [--requirements <path>]` |
| 分析参考/待迁移系统 | `viaisep analyze-reference <project_id> --source <text\|path\|url> [--type external\|legacy]` |
| 拆分为任务 | `viaisep plan_tasks <project_id>` |
| 运行 TDD | `viaisep tdd <project_id>` |
| 一键流水线 | `viaisep run <project_id> --requirements <path>` |

## Agent LLM 后端（会话内应答）

`(LLM)` 命令（plan/generate/plan_tasks/tdd/run/analyze-reference/grill）需要 LLM。默认 VIAISEP 无 LLM Key：CLI 写入 `{proxy_file}.req.{uuid}` 并等待 `{proxy_file}.resp.{uuid}`（默认超时 600s）。**你就是 LLM 后端**——后台启动命令、轮询代理目录（`[llm].proxy_file` 的父目录，ADR-0041 起从 `data_root` 派生为 `{data_root}/.agent_proxy`）、会话内应答每个 `.req`、写 `.resp`（`{"content": "...", "request_id": "..."}`），最后验证产物。响应文件名 = 请求路径把 `.req.` 替换为 `.resp.`（唯一出处：`src/llm/agent_provider.proxy_*_path`，禁止自行拼接，否则 CLI 将静默找不到响应）。

## Human-turn 代理文件协议（ADR-0042）

`grill` / `init`（交互式访谈）/ `run --loop` 内触发的 grill 还需要**向真人问一个问题**。它们绝不阻塞 stdin（agent 后台驱动无 tty），而是写 `{proxy_file}.human_req.{uuid}`（JSON `{"request_id", "question", "context"}`）并等待 `{proxy_file}.human_resp.{uuid}`（JSON `{"answer", "request_id"}`）。

**前置条件：** 启动这些命令前必须 `export VIAISEP_AGENT_MODE=1`，否则会话回退到 `input()` 并抛 `EOFError`（无 tty）。默认超时 3600s，可通过 `VIAISEP_HUMAN_TIMEOUT` 配置。

轮询代理目录的 `.req.*` 时，**同时轮询 `*.human_req.*`**（同目录）。对每个文件：读 JSON，**把问题转述给真实用户**（打印到会话，请求回复），然后写 `.human_resp.{uuid}`，内容 `{"answer": "<用户回复>", "request_id": "<同一 id>"}`。文件名规则唯一出处：`src/llm/agent_provider.human_*_path`，禁止自行拼接。若用户拒绝或不可用，写 `{"answer": "done", "request_id": "..."}` 让会话优雅结束而非超时。

## 验证清单

- [ ] 已从 `.viaisep-project` 或目录名解析 `project_id`。
- [ ] `/health` 返回 `{"status":"ok"}`。
- [ ] 创建项目/节点前已设置 `VIAISEP_API_KEY`。
- [ ] CLI 命令退出码为 0。
- [ ] 产物存在：项目数据库位于平台数据根（Agent 宿主目录，如 `~/.trae-cn/viaisep/data/<project_id>/project.db`）；生成代码位于代码根（在用户项目目录内运行时即当前目录）下的 `src/`、`tests/`；`plan.json` 存在。
- [ ] 未静默吞掉 403 `quota_exceeded`；发生时应向用户展示 `upgrade_url`。
- [ ] 若使用了目录名回退，已创建 `.viaisep-project` 标记文件。
- [ ] 改动代理协议、LLM 提示词或 CLI 流水线后，运行 `python scripts/e2e_mock_run.py` 确认全流程仍通过。
