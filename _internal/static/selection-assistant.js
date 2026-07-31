/**
 * 图形选择助手 - 前端交互实现（原生 JavaScript 版本）
 * 
 * 功能：专注于元素选择和描述生成，禁止所有直接图形编辑修改
 * 交互模式：仅允许单击选择 + Shift多选，所有修改必须通过文本描述提交
 */

class SelectionAssistant {
    constructor() {
        // 选择状态
        this.selectedElements = new Map();  // elementId → elementData
        this.isMultiSelectMode = false;
        
        // UI元素
        this.sidebar = null;
        this.canvas = null;
        this.descriptionTextarea = null;
        this.submitButton = null;
        
        // API端点
        this.apiBaseUrl = '/api/projects';
        this.projectId = this.getProjectId();  // 从URL或全局变量获取
        
        // 防提交状态
        this.isSubmitting = false;
        this.submitTimeout = null;
    }

    /**
     * 初始化助手 - 简洁模式
     */
    init() {
        this.canvas = document.getElementById('canvas') || document.querySelector('.canvas');
        this.sidebar = document.getElementById('sidebar') || document.querySelector('.sidebar');
        this.descriptionTextarea = document.getElementById('description-textarea') || 
                                   document.querySelector('#description-textarea, .description-textarea');
        this.submitButton = document.getElementById('submit-btn') || 
                            document.querySelector('#submit-btn, .submit-btn, [data-action="submit"]');
        
        if (!this.canvas || !this.sidebar || !this.descriptionTextarea || !this.submitButton) {
            console.error('SelectionAssistant: 无法找到必需的UI元素');
            return;
        }

        // ===== 优化：为简洁模式添加 CSS 类 =====
        if (this.sidebar) {
            this.sidebar.classList.add('simplified-sidebar');
        }
        
        this.bindCanvasEvents();
        this.bindKeyboardEvents();
        this.bindSidebarEvents();
        this.initButtonDebouncing();
        this.updateSidebar();
    }

    // ========================================================================
    // 2. 画布交互事件
    // ========================================================================

    /**
     * 绑定画布事件
     */
    bindCanvasEvents() {
        // 使用事件委托：在 canvas 上监听 click 事件
        this.canvas.addEventListener('click', (event) => {
            const target = event.target;
            
            // 检查是否点击了节点或边
            if (target.classList.contains('node') || target.classList.contains('edge')) {
                // 保存 event 供 handleElementClick 使用
                event.currentSelectedElement = target;
                this.handleElementClick(target);
                return;
            }
            
            // 检查是否点击了空白背景
            if (target === this.canvas || target.classList.contains('canvas-background')) {
                this.clearSelection();
                this.updateAllElementsVisual();
                this.updateSidebar();
                return;
            }
        });
    }

    /**
     * 处理元素点击（仅选择，禁止任何直接编辑）
     */
    handleElementClick(element) {
        // 从事件中获取或直接传入元素
        const el = element || event.currentTarget;
        const elementId = el.dataset.id;
        const elementType = el.classList.contains('node') ? 'node' : 'edge';
        const isShiftPressed = event.shiftKey;
        
        if (!isShiftPressed) {
            // 非Shift模式：清空之前的选择，只选中当前元素
            this.clearSelection();
        }
        
        // 切换选中状态
        if (this.selectedElements.has(elementId)) {
            this.deselectElement(elementId);
        } else {
            this.selectElement(elementId, el, elementType);
        }
        
        this.updateElementVisual(elementId);
        this.updateSidebar();
    }

    /**
     * 选择元素
     */
    selectElement(elementId, element, elementType) {
        const elementData = {
            id: elementId,
            type: elementType,
            name: element.querySelector('.label')?.textContent || element.dataset.name,
            properties: this.extractElementProperties(element, elementType)
        };
        
        this.selectedElements.set(elementId, elementData);
        element.classList.add('selected');
    }

    /**
     * 取消选择元素
     */
    deselectElement(elementId) {
        this.selectedElements.delete(elementId);
        const element = this.canvas.querySelector(`[data-id="${elementId}"]`);
        if (element) {
            element.classList.remove('selected');
        }
    }

    /**
     * 清空所有选择
     */
    clearSelection() {
        // 移除所有选中视觉样式
        this.canvas.querySelectorAll('.selected').forEach(el => {
            el.classList.remove('selected');
        });
        this.selectedElements.clear();
    }

    /**
     * 提取元素属性（用于生成描述文本）
     */
    extractElementProperties(element, elementType) {
        const properties = {};
        
        if (elementType === 'node') {
            properties.type = element.dataset.nodeType || 'Module';
            properties.description = element.dataset.description || '';
            properties.status = element.dataset.status || 'active';
            properties.position = {
                x: parseFloat(element.getAttribute('x')) || 0,
                y: parseFloat(element.getAttribute('y')) || 0
            };
        } else if (elementType === 'edge') {
            properties.source = element.dataset.source;
            properties.target = element.dataset.target;
            properties.relationType = element.dataset.relationType || 'depends_on';
            properties.label = element.querySelector('.edge-label')?.textContent || '';
        }
        
        return properties;
    }

    // ========================================================================
    // 3. 键盘事件（仅保留纯选择相关操作，删除所有编辑快捷键）
    // ========================================================================

    /**
     * 绑定键盘事件
     */
    bindKeyboardEvents() {
        document.addEventListener('keydown', (event) => {
            // Ctrl+A: 全选
            if (event.ctrlKey && event.key === 'a') {
                event.preventDefault();
                this.selectAllElements();
            }
            
            // Escape: 清空选择
            if (event.key === 'Escape') {
                this.clearSelection();
                this.updateAllElementsVisual();
                this.updateSidebar();
            }
            
            // ⚠️ 已禁用以下编辑快捷键：
            // - Delete/Backspace: 不再支持直接删除，通过提交流程完成
            // - 右键菜单: 已完全隐藏/禁用编辑选项
        });
    }

    /**
     * 全选所有元素
     */
    selectAllElements() {
        this.clearSelection();
        
        // 选择所有节点
        this.canvas.querySelectorAll('.node').forEach((element) => {
            const elementId = element.dataset.id;
            this.selectElement(elementId, element, 'node');
        });
        
        // 选择所有边
        this.canvas.querySelectorAll('.edge').forEach((element) => {
            const elementId = element.dataset.id;
            this.selectElement(elementId, element, 'edge');
        });
        
        this.updateAllElementsVisual();
        this.updateSidebar();
    }

    // ========================================================================
    // 4. 侧边栏交互
    // ========================================================================

    /**
     * 绑定侧边栏事件
     */
    bindSidebarEvents() {
        // 取消按钮
        const cancelButton = this.sidebar.querySelector('.btn-cancel');
        if (cancelButton) {
            cancelButton.addEventListener('click', () => {
                this.handleCancel();
            });
        }
        
        // 清空选择按钮
        const clearButton = this.sidebar.querySelector('.btn-clear');
        if (clearButton) {
            clearButton.addEventListener('click', () => {
                this.clearSelection();
                this.updateAllElementsVisual();
                this.updateSidebar();
            });
        }
        
        // ⚠️ 提交按钮通过 initButtonDebouncing 绑定（去抖处理）
    }

    /**
     * 更新侧边栏内容（简洁模式）
     */
    updateSidebar() {
        const count = this.selectedElements.size;
        
        // 更新计数
        const countElement = this.sidebar.querySelector('.selected-count-badge');
        if (countElement) {
            countElement.textContent = count;
        }
        
        // 更新元素列表
        const elementList = this.sidebar.querySelector('.compact-element-list');
        if (elementList) {
            elementList.innerHTML = '';
            
            if (count === 0) {
                elementList.innerHTML = `
                    <div class="empty-state-message">
                        请在画布上选择要修改的元素
                    </div>
                `;
                
                // 自动清空描述文本框
                if (this.descriptionTextarea) {
                    this.descriptionTextarea.value = '';
                }
            } else {
                // 渲染元素列表项
                this.selectedElements.forEach((elementData, elementId) => {
                    elementList.append(this.renderElementItem(elementData));
                });
                
                // ✅ 自动生成选中元素的描述文本
                this.generateDescriptionFromSelection();
            }
        }
        
        // 更新按钮状态
        if (this.submitButton) {
            this.submitButton.disabled = count === 0;
        }
    }

    /**
 * ✅ 增强版渲染 - 显示带本体类信息的元素（已应用 compact 模式）
 * 
 * 现在在元素列表中显示本体类映射（ontology_class），帮助AI更准确地识别元素类型
 */
renderElementItem(elementData) {
    const container = document.createElement('div');
    container.className = 'compact-element-item';
    container.dataset.elementId = elementData.id;
    
    const icon = elementData.type === 'node' ? '📦' : '🔗';
    
    // 获取本体类信息（如果有）
    const ontologyClass = elementData.properties?.ontology_class || elementData.type;
    const typeLabel = this.truncateText(ontologyClass, 8);
    
    container.innerHTML = `
        <span class="compact-element-icon">${icon}</span>
        <div class="element-name-with-type">
            <span class="compact-element-name">${this.truncateText(elementData.name, 12)}</span>
            ${typeLabel ? `<span class="element-type-badge">${typeLabel}</span>` : ''}
        </div>
    `;
    
    // 添加工具提示显示完整信息（包括本体类和位置）
    const fullInfo = `${elementData.name} (${ontologyClass}) [${elementData.type}]`;
    container.title = fullInfo;
    
    return container;
}

/**
 * ✅ 根据选中元素自动生成自然语言描述文本
 */
generateDescriptionFromSelection() {
    if (!this.descriptionTextarea || this.selectedElements.size === 0) {
        return;
    }
    
    const elements = Array.from(this.selectedElements.values());
    const nodeCount = elements.filter(e => e.type === 'node').length;
    const edgeCount = elements.length - nodeCount;
    
    let description = '';
    if (nodeCount > 0) {
        description += `${nodeCount} 个`;
        if (nodeCount === 1) {
            const node = elements.find(e => e.type === 'node');
            description += `节点 "${node.name}"`;
        } else {
            description += `节点`;
        }
    }
    
    if (edgeCount > 0) {
        if (description) description += '、';
        description += `${edgeCount} 条关系`;
    }
    
    description += '\n请选择要进行的修改操作（如："修改描述"、"调整位置"、"更改类型"等）';
    
    // 设置到 textarea（但不覆盖用户输入，如果用户已输入则保持原样）
    if (this.descriptionTextarea.value.trim() === '') {
        this.descriptionTextarea.value = description;
    }
}

/**
 * 📦 生成标准化 JSON 数据结构（用于 AI 精确映射数据库）
 * 
 * 返回格式符合 Selection Request Schema specification：
 * - 包含 element_id（唯一标识，用于精确更新）
 * - 包含 semantic_type（本体类或关系类型）
 * - 包含 history_snapshot（版本控制，防止并发冲突）
 * - 包含完整的属性和元数据
 * 
 * @returns {Object} standardizedSelectionRequest
 */
generateStandardizedSelectionRequest() {
    const now = new Date().toISOString();
    
    const request = {
        request_id: this.generateRequestId(),
        timestamp: now,
        project_id: this.projectId,
        elements: [],
        user_intent: {
            natural_language_description: this.descriptionTextarea.value.trim(),
            operation_type: this.inferRequestType(this.descriptionTextarea.value.trim()),
            confirmation_required: false
        }
    };
    
    // 为每个选中的元素生成标准化结构
    this.selectedElements.forEach((elementData, elementId) => {
        const standardizedElem = this.standardizeElementForDatabase(elementData);
        request.elements.push(standardizedElem);
    });
    
    return request;
}

/**
 * 单个元素的标准化转换（适配三个数据库的映射需求）
 * @param {Object} elementData - 原始元素数据
 * @returns {Object} 标准化后的元素对象
 */
standardizeElementForDatabase(elementData) {
    const props = elementData.properties;
    
    // 提取本体类映射（自动推导）
    const ontologyClass = this.extractOntologyClassForDatabase(elementData);
    
    // 构建历史快照（用于乐观锁和审计）
    const historySnapshot = {
        created_at: this.getElementTimestamp(elementData, 'created_at'),
        updated_at: this.getElementTimestamp(elementData, 'updated_at'),
        version: this.getVersion(elementData)
    };
    
    return {
        element_id: elementData.id,
        element_type: elementData.type,
        semantic_type: elementData.type === 'edge' ? 
            (props.relationType || 'depends_on') : 
            (props.type || 'Module'),
        source: elementData.type === 'edge' ? props.source : undefined,
        target: elementData.type === 'edge' ? props.target : undefined,
        properties: {
            name: elementData.name,
            description: props.description || '',
            status: props.status || 'active',
            ontology_class: ontologyClass,
            position: {
                x: props.position?.x || 0,
                y: props.position?.y || 0
            },
            additional_properties: this.extractAdditionalProperties(elementData)
        },
        history_snapshot: historySnapshot
    };
}

/**
 * 从元素数据中提取本体类映射（用于映射到本体模型数据库）
 */
extractOntologyClassForDatabase(elementData) {
    const props = elementData.properties;
    
    // 优先使用显式设置的 ontology_class
    if (props.ontology_class) {
        return props.ontology_class;
    }
    
    // 从 type 字段推导
    const typeMap = {
        'Module': 'cls-module',
        'Capability': 'cls-capability',
        'Function': 'cls-function',
        'Class': 'cls-class',
        'SecurityCheck': 'cls-security-check',
        'CodeReview': 'cls-code-review',
        'DesignToken': 'cls-design-token'
    };
    
    const inferred = typeMap[props.type];
    if (inferred) {
        return inferred;
    }
    
    // 默认映射：cls- + 小写类型名
    return `cls-${(props.type || 'element').toLowerCase()}`;
}

/**
 * 获取元素的时间戳（支持 dataset 属性或生成默认值）
 */
getElementTimestamp(elementData, fieldKey) {
    const el = this.canvas.querySelector(`[data-id="${elementData.id}"]`);
    if (el && el.dataset[fieldKey]) {
        return el.dataset[fieldKey];
    }
    // 返回当前时间作为 fallback
    return new Date().toISOString();
}

/**
 * 获取版本号（用于乐观锁）
 */
getVersion(elementData) {
    const el = this.canvas.querySelector(`[data-id="${elementData.id}"]`);
    if (el && el.dataset.version) {
        return parseInt(el.dataset.version, 10);
    }
    return 1;
}

/**
 * 提取额外的自定义属性（用于扩展性）
 */
extractAdditionalProperties(elementData) {
    const knownKeys = ['name', 'description', 'status', 'ontology_class', 'position'];
    const additional = {};
    
    for (const key in elementData.properties) {
        if (!knownKeys.includes(key)) {
            additional[key] = elementData.properties[key];
        }
    }
    
    return additional;
}

/**
 * 生成请求 ID（简易 UUID v4 实现）
 */
generateRequestId() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

/**
 * 截断长文本
 */
truncateText(text, maxLength) {
    if (!text || text.length <= maxLength) {
        return text;
    }
    return text.substring(0, maxLength) + '...';
}

// NOTE: duplicate generated - see line 332-363 for the main implementation

    /**
     * 生成选择摘要
     */
    generateSelectionSummary() {
        const elements = Array.from(this.selectedElements.values());
        const nodeCount = elements.filter(e => e.type === 'node').length;
        const edgeCount = elements.length - nodeCount;
        
        let summary = '';
        if (nodeCount > 0) {
            summary += `${nodeCount} 个节点`;
        }
        if (edgeCount > 0) {
            if (summary) summary += '，';
            summary += `${edgeCount} 条边`;
        }
        
        return summary;
    }

    // ========================================================================
    // 5. 视觉反馈
    // ========================================================================

    /**
     * 更新单个元素的视觉状态
     */
    updateElementVisual(elementId) {
        const element = this.canvas.querySelector(`[data-id="${elementId}"]`);
        const isSelected = this.selectedElements.has(elementId);
        
        if (isSelected) {
            element.classList.add('selected');
            element.style.stroke = '#3b82f6';
            element.style.strokeWidth = '3px';
        } else {
            element.classList.remove('selected');
            element.style.stroke = '';
            element.style.strokeWidth = '';
        }
    }

    /**
     * 更新所有元素的视觉状态
     */
    updateAllElementsVisual() {
        this.selectedElements.forEach((elementData, elementId) => {
            this.updateElementVisual(elementId);
        });
    }

    // ========================================================================
    // 6. 提交修改请求
    // ========================================================================

    /**
     * 处理提交（已增强为发送标准化 JSON 数据结构）
     */
    async handleSubmit() {
        const userDescription = this.descriptionTextarea.value.trim();
        
        if (!userDescription) {
            alert('请输入修改要求');
            return;
        }
        
        // 自动推断请求类型
        const requestType = this.inferRequestType(userDescription);
        
        await this.submitModification(requestType, userDescription);
    }

    /**
     * 推断请求类型
     */
    inferRequestType(userDescription) {
        const desc = userDescription.toLowerCase();
        
        if (desc.includes('添加') || desc.includes('创建') || desc.includes('新增')) {
            return 'create';
        } else if (desc.includes('删除') || desc.includes('移除')) {
            return 'delete';
        } else if (desc.includes('重构') || desc.includes('重组') || desc.includes('调整结构')) {
            return 'restructure';
        } else {
            return 'update';  // 默认为更新
        }
    }

    /**
     * ⚠️ 新增：按钮点击去抖保护
     */
    initButtonDebouncing() {
        if (this.submitButton) {
            this.submitButton.addEventListener('click', () => {
                clearTimeout(this.submitTimeout);
                this.submitTimeout = setTimeout(() => {
                    if (!this.isSubmitting && this.selectedElements.size > 0) {
                        this.handleSubmit();
                    }
                }, 300); // 300ms 去抖窗口
            });
        }
    }

    /**
     * 提交修改请求到后端（已增强为发送标准化 JSON 数据结构）
     * 
     * 现在同时包含：
     * 1. userDescription - 人类可读的自然语言描述
     * 2. standardizedRequestJSON - 机器可读的结构化数据（含 element_id、semantic_type、history_snapshot 等）
     * 3. 完整的选中元素列表
     */
    async submitModification(requestType, userDescription) {
        // ⚠️ 防止重复提交
        if (this.isSubmitting) {
            alert('当前操作正在进行中，请稍后再试');
            return;
        }
        
        this.isSubmitting = true;
        
        try {
            this.showLoading();
            
            // 📦 生成标准化的选择请求数据结构（用于精确映射三个数据库）
            const standardizedRequest = this.generateStandardizedSelectionRequest();
            
            // 构造请求数据 - 同时包含自然语言和结构化数据
            const requestData = {
                project_id: this.projectId,
                request_type: requestType,
                user_description: userDescription || standardizedRequest.user_intent.natural_language_description,
                standardized_request: standardizedRequest,  // 新增：完整的结构化数据
                elements: Array.from(this.selectedElements.values())  // 保留向后兼容的原始元素数据
            };
            
            // 发送请求
            const response = await fetch(
                `${this.apiBaseUrl}/${this.projectId}/modification-requests`,
                {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(requestData)
                }
            );
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            
            // 显示成功消息
            this.showSuccess(result.message);
            
            // 清空选择
            this.clearSelection();
            this.updateAllElementsVisual();
            this.updateSidebar();
            
            // 清空输入框
            this.descriptionTextarea.value = '';
            
            // 轮询执行状态
            this.pollExecutionStatus(result.request_id);
            
        } catch (error) {
            console.error('提交修改请求失败:', error);
            this.showError(error.message);
        } finally {
            this.hideLoading();
            // ⚠️ 重置提交状态
            this.isSubmitting = false;
        }
    }

    /**
     * 轮询执行状态
     * 
     * @param {string} requestId - 后端生成的请求ID
     */
    async pollExecutionStatus(requestId) {
        const pollInterval = 2000;  // 2秒
        const maxPolls = 150;       // 最多5分钟
        
        for (let i = 0; i < maxPolls; i++) {
            await new Promise(resolve => setTimeout(resolve, pollInterval));
            
            try {
                const response = await fetch(
                    `${this.apiBaseUrl}/${this.projectId}/modification-requests/${requestId}`
                );
                const data = await response.json();
                
                if (data.status === 'completed') {
                    this.showSuccess('修改已完成，正在刷新图形...');
                    setTimeout(() => window.location.reload(), 1000);
                    break;
                } else if (data.status === 'failed') {
                    this.showError(`修改失败: ${data.error_message || '未知错误'}`);
                    break;
                } else {
                    // 显示进度（可能包含详细的数据库更新信息）
                    const progress = data.progress || 0;
                    this.showProgress(progress);
                    
                    // 如果有详细的数据库操作信息，可以在这里显示
                    if (data.db_operations && data.db_operations.length > 0) {
                        const opsText = data.db_operations.map(op => op.action).join(', ');
                        console.log(`数据库操作: ${opsText}`);
                    }
                }
            } catch (error) {
                console.error('轮询状态失败:', error);
                this.showError(`状态轮询出错: ${error.message}`);
                break;
            }
        }
    }

    // ========================================================================
    // 7. 辅助方法
    // ========================================================================

    handleCancel() {
        this.clearSelection();
        this.updateAllElementsVisual();
        this.updateSidebar();
        if (this.descriptionTextarea) {
            this.descriptionTextarea.value = '';
        }
    }

    showLoading() {
        const loadingIndicator = this.sidebar.querySelector('.loading-indicator');
        if (loadingIndicator) {
            loadingIndicator.style.display = 'block';
        }
        if (this.submitButton) {
            this.submitButton.disabled = true;
            this.submitButton.textContent = '提交中...';
        }
    }

    hideLoading() {
        const loadingIndicator = this.sidebar.querySelector('.loading-indicator');
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
        }
        if (this.submitButton) {
            this.submitButton.disabled = false;
            this.submitButton.textContent = '提交';
        }
    }

    showSuccess(message) {
        const messageArea = this.sidebar.querySelector('.message-area');
        if (messageArea) {
            messageArea.className = 'message-area success';
            messageArea.textContent = message;
            messageArea.style.display = 'block';
        }
    }

    showError(message) {
        const messageArea = this.sidebar.querySelector('.message-area');
        if (messageArea) {
            messageArea.className = 'message-area error';
            messageArea.textContent = message;
            messageArea.style.display = 'block';
        }
    }

    showProgress(progress) {
        const progressBar = this.sidebar.querySelector('.progress-bar');
        if (progressBar) {
            progressBar.style.width = `${progress}%`;
            progressBar.textContent = `${progress}%`;
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * ⚠️ 清理所有资源，防止内存泄漏
     * 
     * 在页面卸载或SPA路由切换时调用
     */
    destroy() {
        console.log('SelectionAssistant.destroy() - 正在清理资源...');
        
        // 清除防抖定时器
        if (this.submitTimeout) {
            clearTimeout(this.submitTimeout);
            this.submitTimeout = null;
        }
        
        // 清除选中元素以解除DOM引用
        this.clearSelection();
        this.selectedElements.clear();
        
        // 置空DOM引用，帮助垃圾回收
        this.canvas = null;
        this.sidebar = null;
        this.descriptionTextarea = null;
        this.submitButton = null;
        
        // 重置状态标志
        this.isSubmitting = false;
        this.isDestroyed = true;
        
        console.log('Selection Assistant 资源已完全清理');
    }

    getProjectId() {
        // 从 URL 路径中提取：/projects/{project_id}/...
        const pathParts = window.location.pathname.split('/');
        return pathParts[2] || 'default';
    }
}

// ============================================================================
// 初始化（使用原生 DOMContentLoaded 事件）
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    try {
        const assistant = new SelectionAssistant();
        assistant.init();
        
        // 将实例保存到全局对象，便于后续手动清理（如SPA路由切换时）
        // 仅在开发环境下暴露，生产环境应移除
        if (typeof window !== 'undefined') {
            window.__selectionAssistant = assistant;
        }
        
        console.log('Selection Assistant (简洁模式) 初始化成功');
    } catch (error) {
        console.error('Selection Assistant 初始化失败:', error);
    }
});

// ⚠️ Optional: 在页面卸载前自动清理
window.addEventListener('beforeunload', () => {
    if (window.__selectionAssistant && !window.__selectionAssistant.isDestroyed) {
        window.__selectionAssistant.destroy();
    }
});

