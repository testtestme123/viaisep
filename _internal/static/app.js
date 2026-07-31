// 最小版 app.js - 核心功能补丁
let API_BASE = window.location.origin;
let currentProjectId = null;
let decisionRecords = [];
let decisionLevelFilter = "";
let decisionTypeFilter = "";

function escapeHtml(text) {
    if (!text) return "";
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// ========== 全局拦截：403 配额耗尽统一弹窗 ==========
let _quotaModalEl = null;
let _quotaUpgradeReturning = false;

function showQuotaExceededModal(message, upgradeUrl) {
    var url = escapeHtml(upgradeUrl || "https://viaisep.jiademin2688.top");
    if (_quotaModalEl) { _quotaModalEl.remove(); }
    var overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;";
    var box = document.createElement("div");
    box.style.cssText = "background:#fff;border-radius:12px;padding:24px;max-width:400px;width:90%;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.2);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;";
    box.innerHTML =
        '<div style="font-size:2rem;">&#128683;</div>' +
        '<h3 style="margin:12px 0 8px;color:#1f2937;">配额已用尽</h3>' +
        '<p style="color:#6b7280;font-size:.875rem;line-height:1.6;margin-bottom:16px;">' + escapeHtml(message || "当前套餐配额已用完，升级套餐以获得更好的体验。") + '</p>' +
        '<p style="color:#9ca3af;font-size:.75rem;line-height:1.5;margin-bottom:16px;">充值完成后返回本页将自动刷新，重新提交即可生效。</p>' +
        '<div style="display:flex;gap:8px;justify-content:center;">' +
        '<a href="' + url + '" target="_blank" rel="noopener" style="background:#3b82f6;color:#fff;padding:8px 20px;border-radius:8px;text-decoration:none;font-size:.875rem;">去充值</a>' +
        '<button type="button" style="background:#f3f4f6;color:#374151;padding:8px 20px;border:none;border-radius:8px;font-size:.875rem;cursor:pointer;">知道了</button>' +
        '</div>';
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    _quotaModalEl = overlay;
    var upgradeLink = box.querySelector("a");
    if (upgradeLink) {
        upgradeLink.addEventListener("click", function() { _quotaUpgradeReturning = true; });
    }
    box.querySelector("button").addEventListener("click", function() { overlay.remove(); _quotaModalEl = null; });
    overlay.addEventListener("click", function(e) { if (e.target === overlay) { overlay.remove(); _quotaModalEl = null; } });
}

(function installGlobalQuotaInterceptor() {
    var nativeFetch = window.fetch;
    window.fetch = function(input, init) {
        return nativeFetch.call(this, input, init).then(function(response) {
            if (response.status === 403) {
                response.clone().json()
                    .then(function(body) {
                        var detail = body && body.detail;
                        if (detail && detail.error === "quota_exceeded") {
                            showQuotaExceededModal(detail.message, detail.upgrade_url);
                        }
                    })
                    .catch(function() { /* 非 JSON 的 403 响应忽略 */ });
            }
            return response;
        });
    };
    // 用户从充值页面返回时自动刷新，同步最新配额状态
    document.addEventListener("visibilitychange", function() {
        if (document.visibilityState === "visible" && _quotaUpgradeReturning) {
            _quotaUpgradeReturning = false;
            window.location.reload();
        }
    });
})();

function selectProject(id) {
    currentProjectId = id;
    var s = document.getElementById("generation-status");
    if (s) s.textContent = "项目: " + (id || "无");
    // 项目切换时重置各视图实例，确保下次打开时重新加载数据
    window._swimlaneInstance = null;
    window._smInstance = null;
    // 刷新本体类视图（如果已初始化）
    if (typeof window.refreshOntologyView === 'function' && id) {
        window.refreshOntologyView(id);
    }
}

function initViewTabs() {
    var tabs = document.querySelectorAll(".view-tab");
    tabs.forEach(function(tab) {
        tab.addEventListener("click", function() {
            var viewId = this.getAttribute("data-view");
            document.querySelectorAll(".mental-model-view").forEach(function(v) { v.classList.remove("active"); });
            document.getElementById(viewId).classList.add("active");
            tabs.forEach(function(t) { t.classList.toggle("active", t === this); }, this);
            if (viewId === "quality-report-view") loadQualityReport();
            if (viewId === "decision-records-view") loadDecisions();
            // 初始化/刷新泳道图（如果切换到泳道视图）
            if (viewId === "swimlane-view") {
                if (!window._swimlaneInstance) {
                    window._swimlaneInstance = new SwimlaneRenderer('swimlane-view', currentProjectId);
                    console.log('✅ SwimlaneRenderer 初始化为泳道视图');
                } else {
                    window._swimlaneInstance.projectId = currentProjectId;
                    window._swimlaneInstance.loadCurrentLane();
                    window._swimlaneInstance.refresh();
                }
            }

            // 初始化/刷新状态机（如果切换到状态图视图）
            if (viewId === "state-machine-view") {
                if (!window._smInstance) {
                    window._smInstance = new StateMachineRenderer('state-machine-view', currentProjectId);
                    console.log('✅ StateMachineRenderer 初始化为状态图视图');
                } else {
                    window._smInstance.projectId = currentProjectId;
                    window._smInstance.loadCurrentSm();
                    window._smInstance.refresh();
                }
            }

            // 初始化/刷新本体类视图
            if (viewId === "ontology-view" && typeof window.refreshOntologyView === 'function') {
                window.refreshOntologyView(currentProjectId);
            }

        });
    });
}

// ========== 质量报告 ==========
async function loadQualityReport() {
    var view = document.getElementById("quality-report-view");
    if (!view || !currentProjectId) return;
    view.innerHTML = '<div style="padding:var(--space-6);text-align:center;">加载覆盖率数据...</div>';
    try {
        var resp = await fetch(API_BASE + "/api/projects/" + currentProjectId + "/coverage");
        if (!resp.ok) throw new Error(await resp.text());
        var report = await resp.json();
        renderQualityReport(view, report);
    } catch (err) {
        view.innerHTML = '<div style="padding:var(--space-6);color:red;">加载失败: ' + err.message + "</div>";
    }
}

function renderQualityReport(container, report) {
    var codeCoverage = report.knowledge_graph && report.knowledge_graph.coverage_percent ? report.knowledge_graph.coverage_percent : 0;
    var ruleCoverage = report.logical_rules && report.logical_rules.coverage_percent ? report.logical_rules.coverage_percent : 0;
    var ontologyNodes = report.ontology && report.ontology.nodes ? report.ontology.nodes : [];
    var html = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:var(--space-3);padding:var(--space-3);">';

    // 卡片1: 代码实现覆盖度
    html += '<div style="background:#EFF6FF;border:1px solid #DBEAFE;border-radius:var(--radius);padding:var(--space-3);">';
    html += '<div style="font-size:0.75rem;font-weight:600;color:#1E40AF;margin-bottom:var(--space-2);">&#128218; 代码实现覆盖度</div>';
    html += '<div style="font-size:2rem;font-weight:700;color:#1E3A8A;">' + codeCoverage.toFixed(1) + "%</div>";
    html += '<div style="font-size:0.75rem;color:#64748B;margin-top:var(--space-1);函数:' + (report.knowledge_graph && report.knowledge_graph.function_count ? report.knowledge_graph.function_count : 0) + ' 类:' + (report.knowledge_graph && report.knowledge_graph.class_count ? report.knowledge_graph.class_count : 0) + ' 已实现:' + (report.knowledge_graph && report.knowledge_graph.implemented ? report.knowledge_graph.implemented : 0) + "</div></div></div>";

    // 卡片2: 业务规则覆盖度
    html += '<div style="background:#FEF3C7;border:1px solid #FDE68A;border-radius:var(--radius);padding:var(--space-3);">';
    html += '<div style="font-size:0.75rem;font-weight:600;color:#92400E;margin-bottom:var(--space-2);">&#128219; 业务规则覆盖度</div>';
    html += '<div style="font-size:2rem;font-weight:700;color:#D97706;">' + ruleCoverage.toFixed(1) + "%</div>";
    html += '<div style="font-size:0.75rem;color:#64748B;margin-top:var(--space-1);总数:' + (report.logical_rules && report.logical_rules.total ? report.logical_rules.total : 0) + ' 活跃:' + (report.logical_rules && report.logical_rules.active ? report.logical_rules.active : 0) + ' 实现:' + (report.logical_rules && report.logical_rules.implemented_in_code ? report.logical_rules.implemented_in_code : 0) + "</div></div></div>";

    // 卡片3: 本体节点状态
    html += '<div style="background:#F0fdf4;border:1px solid #DCFCE7;border-radius:var(--radius);padding:var(--space-3);max-height:400px;overflow:hidden;display:flex;flex-direction:column;">';
    html += '<div style="font-size:0.75rem;font-weight:600;color:#166534;margin-bottom:var(--space-2);">&#128170; 本体节点状态</div>';
    html += '<div style="font-size:0.85rem;color:#1f2937;margin-bottom:var(--space-1);总节点数: ' + ontologyNodes.length + '"></div>';
    if (ontologyNodes.length > 0) {
        html += '<div style="display:flex;gap:var(--space-1);margin-bottom:var(--space-1);flex-wrap:wrap;">';
        var implemented = ontologyNodes.filter(function(n) { return n.status === "implemented"; }).length;
        html += '<span style="background:#dcfce7;padding:2px 6px;border-radius:4px;font-size:0.75rem;">已实现 ' + implemented + '</span>';
        html += '<span style="background:#fef3c7;padding:2px 6px;border-radius:4px;font-size:0.75rem;">待实现 ' + (ontologyNodes.length - implemented) + "</span></span>";
        html += '</div>';
    }
    html += '<div style="flex:1;overflow-y:auto;font-size:0.7rem;color:#4b5563;border:1px solid var(--color-border);border-radius:var(--radius-sm);padding:var(--space-2);margin-top:var(--space-1);">';
    if (ontologyNodes.length === 0) {
        html += '<div style="color:#9ca3af;text-align:center;padding:var(--space-2);">暂无本体节点</div>';
    } else {
        ontologyNodes.forEach(function(node) {
            html += '<div style="padding:2px 0;display:flex;justify-content:space-between;border-bottom:1px solid #f3f4f6;"><strong>' + node.name + '</strong> (' + node.type + ') <span style="' + (node.status === "implemented" ? "color:#16a34a" : "#f59e0b") + '">' + node.status + '</span></div>';
        });
    }
    html += '</div></div></div>';

    // 汇总栏
    html += '<div style="margin-top:var(--space-3);padding:var(--space-3);background:#f8fafc;border:1px solid var(--color-border);border-radius:var(--radius);text-align:center;">';
    var statusText = (codeCoverage >= 90 && ruleCoverage >= 90) ? "&#10003;&#10003; 开发完成度达标" : "&#9989;&#9989; 开发进行中";
    html += '<div style="font-size:1rem;font-weight:600;color:#1E40AF;">' + statusText + "</div>";
    html += '<div style="font-size:0.85rem;color:#64748B;margin-top:var(--space-1);">当代码覆盖度和规则覆盖率均 &ge; 90% 时标记为完成。</div>';
    html += '</div>';
    html += '</div>';
    container.innerHTML = html;
}

// ========== 决策记录 ==========
async function loadDecisions() {
    var list = document.getElementById("decision-records-list");
    if (!list || !currentProjectId) return;
    list.innerHTML = '<div style="padding:var(--space-6);text-align:center;">加载中...</div>';
    try {
        var params = new URLSearchParams();
        if (decisionLevelFilter) params.append("level", decisionLevelFilter);
        if (decisionTypeFilter) params.append("decision_type", decisionTypeFilter);
        var url = API_BASE + "/api/projects/" + currentProjectId + "/decisions" + (params.toString() ? "?" + params.toString() : "");
        var resp = await fetch(url);
        if (!resp.ok) throw new Error(await resp.text());
        var records = await resp.json();
        renderDecisionList(list, records);
    } catch (err) {
        list.innerHTML = '<div style="padding:var(--space-6);color:red;">加载失败: ' + err.message + "</div>";
    }
}

function renderDecisionList(container, records) {
    if (!records || records.length === 0) {
        container.innerHTML = '<div style="padding:var(--space-6);text-align:center;color:var(--color-muted-fg);">暂无决策记录</div>';
        return;
    }
    var html = '';
    records.forEach(function(r) {
        var levelLabel = (r.level === 'task' ? '任务' : (r.level === 'rule' ? '规则' : '异常'));
        var levelColor = (r.level === 'task' ? '#3B82F6' : (r.level === 'rule' ? '#10B981' : '#EF4444'));
        var dateStr = r.created_at ? (new Date(r.created_at)).toLocaleString('zh-CN') : '';
        html += '<div style="padding:var(--space-2);margin-bottom:var(--space-2);border:1px solid var(--color-border);border-radius:var(--radius);background:var(--color-card);cursor:pointer;" onclick="alert(\'' + (r.decision || '') + '\')" style="user-select:none;"><div style="display:flex;align-items:center;gap:var(--space-1);margin-bottom:var(--space-1);"><span style="background:' + levelColor + ';color:white;padding:2px 6px;border-radius:4px;font-size:0.75rem;font-weight:bold;">' + levelLabel + '</span><span style="font-size:0.75rem;color:#6b7280;">' + dateStr + '</span></div><div style="font-weight:500;margin-bottom:var(--space-1);">' + (r.decision || '(无内容)') + '</div><div style="font-size:0.75rem;color:#6b7280;">' + ((r.context || '').substring(0, 80)) + ((r.context || '').length > 80 ? '...' : '') + '</div></div>';
    });
    container.innerHTML = html;
}

// 过滤器绑定
function attachDecisionFilters() {
    var levelSelect = document.getElementById("decision-level-filter");
    var typeSelect = document.getElementById("decision-type-filter");
    if (!levelSelect || !typeSelect) return;
    var apply = function() {
        decisionLevelFilter = levelSelect.value;
        decisionTypeFilter = typeSelect.value;
        if (typeof loadDecisions === 'function') loadDecisions();
    };
    levelSelect.addEventListener("change", apply);
    typeSelect.addEventListener("change", apply);
}

// DOM 就绪后初始化
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function() {
        initViewTabs();
        attachDecisionFilters();
    });
} else {
    initViewTabs();
    attachDecisionFilters();
}

console.log("[AppJS Patch] Quality Report and Decision Records patches loaded successfully.");