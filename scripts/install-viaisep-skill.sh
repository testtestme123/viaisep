#!/usr/bin/env bash
# =============================================================================
# VIAISEP - Agent Skill 安装脚本 (trae / claude / codex 全局注册)
# 支持 Linux/macOS (Bash) 和 Windows (Git Bash / WSL)
#
# 用法: ./install-viaisep-skill.sh [all|trae|claude|codex]
#   默认 all，安装全部平台; 可指定单个或多个(空格分隔)
# =============================================================================
set -euo pipefail

# ---- 颜色 ----
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

info()  { echo -e "${BLUE}[INFO]${NC}  $1"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
err()   { echo -e "${RED}[ERROR]${NC} $1"; }

# ---- 路径检测 ----
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# ---- 平台解析 ----
PLATFORMS="${*:-all}"
REQUESTED=()
if [[ "$PLATFORMS" == *"all"* ]]; then
    REQUESTED=(trae claude codex)
else
    for p in $PLATFORMS; do
        case "$p" in
            trae|claude|codex) REQUESTED+=("$p") ;;
            *) err "未知平台: $p (可选: trae, claude, codex, all)"; exit 1 ;;
        esac
    done
fi
REQUESTED=($(echo "${REQUESTED[@]}" | tr ' ' '\n' | sort -u | tr '\n' ' '))

echo ""
info "============================================"
info " VIAISEP Agent Skill 安装"
info "============================================"
echo ""
info "代码库目录 : $REPO_DIR"
info "目标平台   : ${REQUESTED[*]}"
info "平台       : $(uname -s)"
echo ""

# ---- Step 1: 安装 VIAISEP 包 (dist 打包模式自带 exe，无需 pip 安装) ----
if [[ -f "$REPO_DIR/pyproject.toml" ]]; then
    info "Step 1/4: 安装 VIAISEP 包 (pip install -e)..."
    if command -v viaisep &>/dev/null; then
        warn "viaisep 已安装，跳过 pip install"
        info "  版本: $(viaisep --version 2>/dev/null || echo 'unknown')"
    else
        pip install -e "$REPO_DIR" 2>&1 | tail -1
        if command -v viaisep &>/dev/null; then
            ok "viaisep 安装成功"
        else
            err "pip install 后 viaisep 命令仍不可用，检查 PATH"
            exit 1
        fi
    fi
else
    info "dist 分发模式（无 pyproject.toml），跳过 pip install；运行 $REPO_DIR/viaisep"
fi

# ---- Step 2: 准备安装计划 ----
info "Step 2/5: 准备安装目标..."
declare -a NAMES SOURCES TARGETS HOSTDIRS
for p in "${REQUESTED[@]}"; do
    case "$p" in
        trae)
            NAMES+=("trae")
            SOURCES+=("$REPO_DIR/.trae/skills/viaisep/SKILL.md")
            TARGETS+=("$HOME/.trae-cn/skills/viaisep/SKILL.md")
            HOSTDIRS+=(".trae-cn")
            ;;
        claude)
            NAMES+=("claude")
            SOURCES+=("$REPO_DIR/skills/viaisep/SKILL.md")
            TARGETS+=("$HOME/.claude/skills/viaisep/SKILL.md")
            HOSTDIRS+=(".claude")
            ;;
        codex)
            NAMES+=("codex")
            SOURCES+=("$REPO_DIR/.codex/prompts/viaisep.md")
            TARGETS+=("$HOME/.codex/prompts/viaisep.md")
            HOSTDIRS+=(".codex")
            ;;
    esac
done

# ---- Step 3: 复制文件 ----
info "Step 3/5: 复制文件..."
for i in "${!NAMES[@]}"; do
    if [[ ! -f "${SOURCES[$i]}" ]]; then
        err "源文件不存在: ${SOURCES[$i]}"
        exit 1
    fi
    mkdir -p "$(dirname "${TARGETS[$i]}")"
    cp "${SOURCES[$i]}" "${TARGETS[$i]}"
    ok "[${NAMES[$i]}] 已复制 -> ${TARGETS[$i]}"
done

# ---- Step 4: 初始化各 Agent 数据根 (ADR-0038) ----
info "Step 4/5: 初始化各 Agent 数据根..."
for i in "${!NAMES[@]}"; do
    DATA_ROOT="$HOME/${HOSTDIRS[$i]}/viaisep"
    mkdir -p "$DATA_ROOT/data" "$DATA_ROOT/workspace"
    CFG_PATH="$DATA_ROOT/config.toml"
    if [[ ! -f "$CFG_PATH" ]]; then
        printf '[platform]\ndata_root = "%s"\n' "$DATA_ROOT" > "$CFG_PATH"
        ok "[${NAMES[$i]}] 数据根已创建 -> $DATA_ROOT"
    else
        ok "[${NAMES[$i]}] 数据根已存在: $DATA_ROOT"
    fi
done

# ---- Step 4.5: TRAE 沙箱规则补丁 (viaisep* -> host) ----
info "Step 4.5/5: 补丁 TRAE 沙箱规则 (viaisep*)..."
if [[ " ${REQUESTED[*]} " == *" trae "* ]]; then
    PERMISSION_FILE="$HOME/.trae-cn/permission/global.json"
    if [[ -f "$PERMISSION_FILE" ]]; then
        RESULT=$(python3 - "$PERMISSION_FILE" <<'PYEOF'
import json, re, sys
path = sys.argv[1]
raw = open(path, encoding="utf-8").read()
if '"viaisep' in raw:
    print("skip")
    sys.exit(0)
m = re.search(r'(?m)^(\s*)"cd \*"\s*:\s*\{[^}]*\}', raw)
if not m:
    print("no-anchor")
    sys.exit(1)
indent = m.group(1)
insert = ('\n%s"viaisep*": {\n%s  "approval": "allow",\n%s  "execEnv": "host"\n%s}'
          % (indent, indent, indent, indent))
new = raw[:m.end()] + "," + insert + raw[m.end():]
json.loads(new)  # 写入前验证补丁后仍是合法 JSON
open(path, "w", encoding="utf-8").write(new)
print("patched")
PYEOF
        )
        case "$RESULT" in
            patched)   ok "[trae] viaisep* host 规则已写入 -> $PERMISSION_FILE" ;;
            skip)      ok "[trae] viaisep* 规则已存在，跳过" ;;
            no-anchor) warn "[trae] 未找到 'cd *' 锚点，跳过沙箱补丁" ;;
            *)         warn "[trae] 沙箱补丁失败: $RESULT" ;;
        esac
    else
        warn "[trae] 权限配置不存在，跳过: $PERMISSION_FILE"
    fi
fi

# ---- Step 5: 验证 ----
info "Step 5/5: 验证安装..."
for i in "${!NAMES[@]}"; do
    if [[ -f "${TARGETS[$i]}" ]]; then
        ok "[${NAMES[$i]}] OK: ${TARGETS[$i]}"
    else
        warn "[${NAMES[$i]}] 未找到: ${TARGETS[$i]}"
    fi
    DATA_ROOT="$HOME/${HOSTDIRS[$i]}/viaisep"
    if [[ -f "$DATA_ROOT/config.toml" ]]; then
        ok "[${NAMES[$i]}] 数据根 OK: $DATA_ROOT"
    else
        warn "[${NAMES[$i]}] 数据根缺失: $DATA_ROOT"
    fi
done

if command -v viaisep &>/dev/null; then
    ok "viaisep 命令可用"
else
    warn "viaisep 命令不可用，请确认 pip install 完成"
fi

if [[ " ${REQUESTED[*]} " == *" trae "* ]]; then
    if [[ -f "$HOME/.trae-cn/permission/global.json" ]] && grep -q '"viaisep\*"' "$HOME/.trae-cn/permission/global.json"; then
        ok "[trae] 沙箱规则 OK: viaisep* -> host"
    else
        warn "[trae] 沙箱规则缺失: viaisep* (打包态 CLI 可能被沙箱限制)"
    fi
fi

echo ""
ok "============================================"
ok " 安装完成！重启 IDE 后即可使用"
ok " 已安装: ${REQUESTED[*]}"
ok "============================================"
echo ""
info "可用命令验证:"
info "  viaisep --help        # 查看 CLI 帮助"
info "  viaisep start         # 启动 Web UI"
echo ""
