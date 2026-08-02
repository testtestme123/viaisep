"""校验所有 Agent 平台的 viaisep 技能副本与主源 SKILL.md 的一致性。

用法:
    python scripts/verify-agent-skill.py [--source PATH]

规则:
    - 精确副本 (EXACT_COPIES): 哈希必须与主源完全一致
    - 成对一致 (IDENTICAL_PAIRS): 独立变体之间应相互一致 (.trae 与其全局安装副本)
    - 内容级检查 (CONTENT_CHECKS): 独立变体无需与主源一致，但关键契约必须存在
      （含 Agent LLM Backend 协议描述）且不得引用旧路径 (~/.sep/)

退出码:
    0 全部通过; 1 存在缺失或哈希不一致或内容检查失败
"""
import argparse
import hashlib
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent

# 哈希必须与主源完全一致的副本
EXACT_COPIES = [
    ".claude/skills/viaisep/SKILL.md",
    ".claude-plugin/skills/viaisep/SKILL.md",
    ".opencode/skills/viaisep/SKILL.md",
]

# 独立变体: 不与主源相同, 但成对之间应一致
IDENTICAL_PAIRS = [
    (".trae/skills/viaisep/SKILL.md", "~/.trae-cn/skills/viaisep/SKILL.md"),
]

# 内容级检查: (相对路径, 必须包含的子串列表, 禁止包含的子串列表)
# 关键契约: Agent LLM Backend 协议描述 + 代码根绑定 (ADR-0040)
#           + human-turn 代理文件协议 (ADR-0042)
CONTENT_CHECKS = [
    (
        ".codex/prompts/viaisep.md",
        ["Agent LLM Backend", "proxy_*_path", "code root", "ADR-0040",
         "human_req", "human_resp", "ADR-0042", "VIAISEP_AGENT_MODE"],
        ["~/.sep/"],
    ),
    (
        ".cursor/rules/viaisep.mdc",
        ["Agent LLM Backend", "proxy_*_path", "code root", "ADR-0040",
         "human_req", "human_resp", "ADR-0042", "VIAISEP_AGENT_MODE"],
        ["~/.sep/"],
    ),
    (
        ".gemini/commands/viaisep.toml",
        ["Agent LLM Backend", "proxy_*_path", "code root", "ADR-0040",
         "human_req", "human_resp", "ADR-0042", "VIAISEP_AGENT_MODE"],
        ["~/.sep/"],
    ),
    (
        ".trae/rules/viaisep.md",
        ["Agent LLM 后端", "proxy_*_path", "代码根", "ADR-0040",
         "human_req", "human_resp", "ADR-0042", "VIAISEP_AGENT_MODE"],
        ["~/.sep/"],
    ),
]


def md5(path: Path) -> str:
    return hashlib.md5(path.read_bytes()).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="校验 viaisep 技能副本与主源 SKILL.md 的一致性"
    )
    parser.add_argument(
        "--source",
        type=Path,
        default=PROJECT_ROOT / "skills" / "viaisep" / "SKILL.md",
        help="主源 SKILL.md 路径",
    )
    args = parser.parse_args()

    source = args.source
    failures: list[str] = []

    if not source.exists():
        print(f"FAIL  主源缺失: {source}")
        return 1

    source_hash = md5(source)
    print(f"主源: {source}  ({source_hash[:12]})")

    for rel in EXACT_COPIES:
        p = PROJECT_ROOT / rel
        ok = p.exists() and md5(p) == source_hash
        print(f"{'OK  ' if ok else 'FAIL'}  {rel:<52} {'hash 一致' if ok else '缺失或哈希不一致'}")
        if not ok:
            failures.append(rel)

    for rel, dest in IDENTICAL_PAIRS:
        pa = PROJECT_ROOT / rel
        pb = Path(dest).expanduser()
        if not pa.exists() or not pb.exists():
            print(f"FAIL  {rel} <-> {dest}: 存在缺失")
            failures.append(rel)
            continue
        ok = md5(pa) == md5(pb)
        print(f"{'OK  ' if ok else 'FAIL'}  {rel} <-> {dest:<22} {'一致' if ok else '不一致'}")
        if not ok:
            failures.append(rel)

    for rel, must_have, must_not_have in CONTENT_CHECKS:
        p = PROJECT_ROOT / rel
        if not p.exists():
            print(f"FAIL  {rel:<52} 缺失")
            failures.append(rel)
            continue
        text = p.read_text(encoding="utf-8", errors="replace")
        missing = [kw for kw in must_have if kw not in text]
        forbidden = [kw for kw in must_not_have if kw in text]
        status = "OK" if not missing and not forbidden else "FAIL"
        detail = []
        if missing:
            detail.append(f"缺关键词: {missing}")
        if forbidden:
            detail.append(f"含禁止旧路径: {forbidden}")
        print(f"{status}  {rel:<52} {' '.join(detail) if detail else '内容检查通过'}")
        if not status == "OK":
            failures.append(rel)

    if failures:
        print(f"\n共 {len(failures)} 项未通过")
        return 1
    print("\n全部通过")
    return 0


if __name__ == "__main__":
    sys.exit(main())
