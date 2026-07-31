/**
 * Swimlane D3 Rendering Module
 * 泳道图 D3 渲染器 - 支持拖拽、连线、编辑交互
 */

(function() {
  'use strict';

  // ==================== 配置常量 ====================
  const CONFIG = {
    laneHeight: 80,
    laneGap: 10,
    stepWidth: 120,
    stepHeight: 50,
    stepGap: 20,
    borderRadius: 8,
    colors: {
      lane: '#E0F2FE',
      laneBorder: '#0EA5E9',
      step: '#FFFFFF',
      stepBorder: '#1E40AF',
      stepFill: '#DBEAFE',
      line: '#64748B',
      highlight: '#F59E0B'
    }
  };

  // ==================== 数据模型 ====================
  class SwimlaneData {
    constructor(id, name, description) {
      this.id = id || 'swimlane-' + Date.now();
      this.name = name || '默认泳道图';
      this.description = description || '';
      this.lanes = [];
      this.steps = [];
      this.connections = []; // {source: stepId, target: stepId}
    }

    addLane(name) {
      const lane = {
        id: 'lane-' + Date.now(),
        name: name || '参与方 ' + (this.lanes.length + 1),
        y: this.lanes.length * (CONFIG.laneHeight + CONFIG.laneGap)
      };
      this.lanes.push(lane);
      return lane;
    }

    addStep(laneId, x, y, name = '步骤') {
      const step = {
        id: 'step-' + Date.now(),
        laneId: laneId,
        x: x || 100,
        y: y || 0,
        name: name,
        type: 'process'
      };
      this.steps.push(step);
      return step;
    }

    addConnection(sourceId, targetId) {
      this.connections.push({ source: sourceId, target: targetId });
    }
  }

  // ==================== SwimlaneRenderer ====================
  class SwimlaneRenderer {
    constructor(containerId, projectId) {
      this.container = document.getElementById(containerId);
      if (!this.container) {
        console.error('Container not found:', containerId);
        return;
      }
      this.projectId = projectId;
      this.svg = null;
      this.g = null;
      this.currentLane = null;
      this.dragSubject = null; // {type: 'step'|'lane', id, element, offset}
      this.dragOffset = { x: 0, y: 0 };
      this.contextMenuTarget = null;
      this.d3Available = typeof d3 !== 'undefined';
      this.isDrawingEdge = false;
      this.edgeTempLine = null;
      this.edgeStartNode = null;

      if (this.d3Available) {
        this.init();
      } else {
        console.warn('D3 library not found, swimlane rendering fallback to static view');
        this.renderStaticFallback();
      }
    }

    init() {
      // 清空容器
      this.container.innerHTML = '';

      // 创建 SVG
      this.svg = d3.select(this.container)
        .append('svg')
        .attr('width', '100%')
        .attr('height', '100%')
        .attr('viewBox', `0 0 ${this.getWidth()} ${this.getHeight()}`)
        .call(d3.zoom().on('zoom', (event) => {
          this.g.attr('transform', event.transform);
        }))
        .append('g');

      this.g = this.svg.append('g');

      // 添加背景网格（可选，帮助对齐）
      this.drawGrid();

      // 加载当前泳道图
      this.loadCurrentLane();

      // 绑定右键菜单事件
      this.bindContextMenu();

      console.log('✅ SwimlaneRenderer initialized');
    }

    getWidth() {
      const rect = this.container.getBoundingClientRect();
      return Math.max(rect.width, 800);
    }

    getHeight() {
      const rect = this.container.getBoundingClientRect();
      const lanesCount = this.currentLane?.lanes?.length || 0;
      return Math.max(rect.height, (lanesCount + 1) * (CONFIG.laneHeight + CONFIG.laneGap) + 100);
    }

    drawGrid() {
      const width = this.getWidth();
      const height = this.getHeight();

      const defs = this.svg.append('defs');
      const pattern = defs.append('pattern')
        .attr('id', 'grid')
        .attr('width', 20)
        .attr('height', 20)
        .attr('patternUnits', 'userSpaceOnUse');

      pattern.append('path')
        .attr('d', 'M 20 0 L 0 0 0 20')
        .attr('fill', 'none')
        .attr('stroke', '#f1f5f9')
        .attr('stroke-width', 1);

      this.svg.append('rect')
        .attr('width', '100%')
        .attr('height', '100%')
        .attr('fill', 'url(#grid)');
    }

    async loadCurrentLane() {
      try {
        if (!this.projectId) {
          // 无项目时也创建默认数据，确保泳道图不空白
          this.currentLane = this.createDefaultLane();
          this.renderSwimlane();
          return;
        }

        // 尝试从后端获取泳道图数据
        const resp = await fetch(`/api/projects/${this.projectId}/swimlanes`);
        if (!resp.ok) throw new Error('Failed to load swimlanes');

        const data = await resp.json();

        if (data && data.length > 0) {
          this.currentLane = data[0]; // 默认加载第一个
        } else {
          // 没有则创建默认数据
          this.currentLane = this.createDefaultLane();
        }

        this.renderSwimlane();
      } catch (error) {
        console.error('Error loading swimlane:', error);
        this.currentLane = this.createDefaultLane();
        this.renderSwimlane();
      }
    }

    createDefaultLane() {
      const data = new SwimlaneData(
        'default-' + this.projectId,
        '默认流程',
        '系统默认泳道图'
      );

      // 创建 3 个泳道
      for (let i = 0; i < 3; i++) {
        data.addLane(`参与方 ${i + 1}`);
      }

      // 在第一个泳道添加一些示例步骤
      data.addStep(data.lanes[0].id, 100, CONFIG.laneHeight / 2, '开始');
      data.addStep(data.lanes[0].id, 100, CONFIG.laneHeight * 1.5, '处理订单');
      data.addStep(data.lanes[1].id, 100, CONFIG.laneHeight / 2, '库存检查');
      data.addStep(data.lanes[0].id, 100, CONFIG.laneHeight * 2.5, '完成');

      // 添加连接（直接使用步骤对象的 id，无需拆分重组）
      data.addConnection(data.steps[0].id, data.steps[1].id);
      data.addConnection(data.steps[1].id, data.steps[3].id);

      return data;
    }

    renderSwimlane() {
      if (!this.currentLane || !this.g) return;

      // 清空画布
      this.g.selectAll('*').remove();

      // 更新视图尺寸
      this.svg.attr('viewBox', `0 0 ${this.getWidth()} ${this.getHeight()}`);

      // 绘制泳道
      this.drawLanes();

      // 绘制步骤
      this.drawSteps();

      // 绘制连接线
      this.drawConnections();

      // 添加交互事件
      this.bindInteractions();
    }

    drawLanes() {
      if (!this.currentLane.lanes || this.currentLane.lanes.length === 0) return;

      const laneGroup = this.g.append('g').attr('class', 'lanes-group');

      this.currentLane.lanes.forEach((lane, index) => {
        // 泳道背景
        laneGroup.append('rect')
          .attr('x', 0)
          .attr('y', lane.y)
          .attr('width', this.getWidth())
          .attr('height', CONFIG.laneHeight)
          .attr('fill', CONFIG.colors.lane)
          .attr('stroke', CONFIG.colors.laneBorder)
          .attr('stroke-width', 2)
          .attr('rx', CONFIG.borderRadius)
          .call(d3.drag()
            .on('start', (e) => this.startDragLane(e, lane))
            .on('drag', (e) => this.dragLane(e, lane))
            .on('end', () => this.endDragLane(lane))
          );

        // 泳道名称标签
        laneGroup.append('text')
          .attr('x', 10)
          .attr('y', lane.y + CONFIG.laneHeight / 2 + 5)
          .attr('font-size', '14px')
          .attr('font-weight', 'bold')
          .attr('fill', CONFIG.colors.laneBorder)
          .text(lane.name);
      });
    }

    drawSteps() {
      if (!this.currentLane.steps || this.currentLane.steps.length === 0) return;

      const stepsGroup = this.g.append('g').attr('class', 'steps-group');

      this.currentLane.steps.forEach(step => {
        const lane = this.currentLane.lanes.find(l => l.id === step.laneId);
        if (!lane) return;

        const group = stepsGroup.append('g')
          .attr('class', 'step-group')
          .attr('transform', `translate(${step.x}, ${step.y})`)
          .call(d3.drag()
            .on('start', (e) => this.startDragStep(e, step))
            .on('drag', (e) => this.dragStep(e, step))
            .on('end', () => this.endDragStep(step))
          );

        // 步骤矩形（带圆角）
        group.append('rect')
          .attr('x', -CONFIG.stepWidth / 2)
          .attr('y', -CONFIG.stepHeight / 2)
          .attr('width', CONFIG.stepWidth)
          .attr('height', CONFIG.stepHeight)
          .attr('rx', CONFIG.borderRadius)
          .attr('ry', CONFIG.borderRadius)
          .attr('fill', CONFIG.colors.stepFill)
          .attr('stroke', CONFIG.colors.stepBorder)
          .attr('stroke-width', 2)
          .on('contextmenu', (e) => this.showContextMenu(e, step));

        // 步骤文本
        group.append('text')
          .attr('x', 0)
          .attr('y', 5)
          .attr('text-anchor', 'middle')
          .attr('font-size', '12px')
          .attr('fill', CONFIG.colors.fg)
          .text(step.name);

        // 添加编辑按钮（双击可编辑名称）
        group.append('text')
          .attr('x', CONFIG.stepWidth / 2 - 10)
          .attr('y', -CONFIG.stepHeight / 2 + 10)
          .attr('font-size', '10px')
          .attr('fill', '#94a3b8')
          .attr('cursor', 'pointer')
          .text('✏️')
          .on('click', (e) => {
            e.stopPropagation();
            this.editStepName(step);
          });
      });
    }

    drawConnections() {
      if (!this.currentLane.connections || this.currentLane.connections.length === 0) return;

      const connectionsGroup = this.g.append('g').attr('class', 'connections-group').raise();

      this.currentLane.connections.forEach(conn => {
        const sourceStep = this.currentLane.steps.find(s => s.id === conn.source);
        const targetStep = this.currentLane.steps.find(s => s.id === conn.target);

        if (!sourceStep || !targetStep) return;

        const sourceX = sourceStep.x + CONFIG.stepWidth / 2;
        const sourceY = sourceStep.y;
        const targetX = targetStep.x;
        const targetY = targetStep.y + CONFIG.stepHeight / 2;

        // 使用 Bezier 曲线绘制连接线
        const pathData = `M ${sourceX} ${sourceY} C ${(sourceX + targetX) / 2} ${sourceY}, ${(sourceX + targetX) / 2} ${targetY}, ${targetX} ${targetY}`;

        connectionsGroup.append('path')
          .attr('d', pathData)
          .attr('fill', 'none')
          .attr('stroke', CONFIG.colors.line)
          .attr('stroke-width', 2)
          .attr('marker-end', 'url(#arrowhead)');
      });

      // 定义箭头标记
      if (this.svg.select('#arrowhead').empty()) {
        this.svg.append('defs').append('marker')
          .attr('id', 'arrowhead')
          .attr('viewBox', '0 -5 10 10')
          .attr('refX', 15)
          .attr('refY', 0)
          .attr('markerWidth', 6)
          .attr('markerHeight', 6)
          .attr('orient', 'auto')
          .append('path')
          .attr('d', 'M0,-5L10,0L0,5')
          .attr('fill', CONFIG.colors.line);
      }
    }

    bindInteractions() {
      // 左键拖拽添加新步骤
      this.g.on('mousedown', (e) => {
        if (e.button === 0 && e.target.tagName === 'svg') {
          this.startAddingStep(e);
        }
      });

      // 双击泳道添加步骤
      this.g.selectAll('.lanes-group rect')
        .on('dblclick', (e) => {
          const lane = d3.select(e.currentTarget).datum();
          this.addStepToLane(lane);
        });
    }

    startAddingStep(e) {
      const rect = this.container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // 查找点击的泳道
      let targetLane = null;
      for (const lane of this.currentLane.lanes) {
        if (y >= lane.y && y <= lane.y + CONFIG.laneHeight) {
          targetLane = lane;
          break;
        }
      }

      if (targetLane) {
        this.addStepToLane(targetLane, x, y);
      }
    }

    addStepToLane(lane, x = 100, y = lane.y + CONFIG.laneHeight / 2) {
      const step = this.currentLane.addStep(lane.id, x, y, '新步骤');
      this.renderSwimlane();
      this.saveLaneData();
    }

    startDragLane(e, lane) {
      this.dragSubject = { type: 'lane', id: lane.id, element: d3.select(e.target) };
      const point = d3.pointer(e);
      this.dragOffset = { x: point[0] - lane.x, y: point[1] - lane.y };
      d3.select(e.sourceEvent.target).style('cursor', 'grabbing');
    }

    dragLane(e, lane) {
      if (!this.dragSubject) return;

      const point = d3.pointer(e);
      const newY = point[1] - this.dragOffset.y;

      // 更新泳道位置并重新排序
      lane.y = newY;
      this.currentLane.lanes.sort((a, b) => a.y - b.y);

      // 重新渲染（简单但可靠）
      this.renderSwimlane();
      
      // 异步保存，避免拖拽卡顿
      setTimeout(() => this.saveLaneData(), 100);
    }

    endDragLane(lane) {
      this.dragSubject = null;
      // 异步保存，避免拖拽卡顿
      setTimeout(() => this.saveLaneData(), 100);
    }

    startDragStep(e, step) {
      this.dragSubject = { type: 'step', id: step.id, element: d3.select(e.currentTarget).parent() };
      const point = d3.pointer(e);
      this.dragOffset = { x: point[0] - step.x, y: point[1] - step.y };
      d3.select(e.currentTarget).style('cursor', 'grabbing');
    }

    dragStep(e, step) {
      if (!this.dragSubject) return;

      const point = d3.pointer(e);
      // 直接更新数据，避免重渲染所有步骤
      step.x = point[0] - this.dragOffset.x;
      step.y = point[1] - this.dragOffset.y;

      // 只更新该步骤的位置，不重新绘制整个泳道（性能优化）
      const group = this.g.selectAll('.step-group')
        .filter(d => d.id === step.id);
      group.attr('transform', `translate(${step.x}, ${step.y})`);

      // 同步更新连接线
      this.updateConnectionLines();

      // 异步保存，避免拖拽卡顿
      setTimeout(() => this.saveLaneData(), 100);
    }

    endDragStep(step) {
      this.dragSubject = null;
      // 异步保存，避免拖拽卡顿
      setTimeout(() => this.saveLaneData(), 100);
    }

    // 更新连接线位置（当步骤移动时）
    updateConnectionLines() {
      if (!this.currentLane || !this.currentLane.connections.length) return;

      // 移除旧连接
      this.g.selectAll('.connections-group path').remove();

      // 重新绘制所有连接
      this.drawConnections();
    }

    editStepName(step) {
      const newName = prompt('请输入新名称:', step.name);
      if (newName && newName.trim()) {
        step.name = newName.trim();
        this.renderSwimlane();
        this.saveLaneData();
      }
    }

    deleteStep(stepId) {
      if (!this.currentLane) return;
      this.currentLane.steps = this.currentLane.steps.filter(s => s.id !== stepId);
      // 也移除相关的连接
      this.currentLane.connections = this.currentLane.connections.filter(
        c => c.source !== stepId && c.target !== stepId
      );
      this.renderSwimlane();
      this.saveLaneData();
    }

    showContextMenu(e, step) {
      e.preventDefault();
      e.stopPropagation();

      // 移除已有菜单（使用专属 class，避免误删图谱的 #node-context-menu）
      const existingMenu = document.querySelector('.d3-context-menu');
      if (existingMenu) existingMenu.remove();

      const menu = document.createElement('div');
      menu.className = 'd3-context-menu';
      menu.style.display = 'block';
      menu.style.left = e.pageX + 'px';
      menu.style.top = e.pageY + 'px';

      menu.innerHTML = `
        <div class="context-menu-item" onclick="SwimlaneInstance.deleteStep('${step.id}')">删除步骤</div>
      `;

      document.body.appendChild(menu);

      // 点击其他地方关闭菜单
      setTimeout(() => {
        document.addEventListener('click', function closeMenu() {
          menu.remove();
          document.removeEventListener('click', closeMenu);
        }, { once: true });
      }, 0);

      this.contextMenuTarget = step;
    }

    // ==================== 泳道管理表单 ====================
    manageLanesForm() {
      if (!this.currentLane) return;

      // 移除已有模态框，避免 HTML 结构重复定义
      const existing = document.getElementById('swimlane-form-modal');
      if (existing) existing.remove();

      const modal = document.createElement('div');
      modal.id = 'swimlane-form-modal';
      modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000;overflow-y:auto;padding:2rem;';

      const content = document.createElement('div');
      content.style.cssText = 'background:white;border-radius:8px;width:100%;max-width:700px;max-height:90vh;overflow-y:auto;box-shadow:0 10px 25px rgba(0,0,0,0.2);';

      content.innerHTML = `
        <div style="padding:1.5rem;">
          <h3 style="margin-bottom:1.5rem;font-size:1.25rem;color:#1f2937;">泳道管理</h3>
          
          <!-- 泳道列表 -->
          <div style="margin-bottom:1.5rem;">
            <label style="display:block;font-weight:600;color:#374151;margin-bottom:0.5rem;">泳道列表（参与方）</label>
            <div id="lanes-list" style="border:1px solid #d1d5db;border-radius:4px;padding:0.5rem;margin-bottom:0.5rem;max-height:200px;overflow-y:auto;">
              ${this.currentLane.lanes.map((lane, i) => `
                <div style="display:flex;gap:0.5rem;margin-bottom:0.5rem;padding:0.5rem;background:#f9fafb;border-radius:4px;">
                  <input type="text" value="${escapeHtml(lane.name)}" style="flex:1;padding:0.3rem;border:1px solid #d1d5db;border-radius:4px;font-size:0.875rem;" onchange="SwimlaneInstance.updateLaneName(${lane.id}, this.value)">
                  <button onclick="SwimlaneInstance.deleteLane(${lane.id})" style="padding:0.3rem 0.6rem;background:#ef4444;color:white;border:none;border-radius:4px;cursor:pointer;">删除</button>
                </div>
              `).join('')}
            </div>
            <button onclick="SwimlaneInstance.addNewLane()" style="padding:0.5rem 1rem;background:#10b981;color:white;border:none;border-radius:4px;cursor:pointer;">+ 添加泳道</button>
          </div>

          <!-- 保存按钮 -->
          <div style="text-align:right;">
            <button onclick="document.getElementById('swimlane-form-modal').remove()" style="padding:0.5rem 1rem;background:#e5e7eb;color:#374151;border:none;border-radius:4px;cursor:pointer;">取消</button>
            <button onclick="SwimlaneInstance.saveLanesOrder()" style="padding:0.5rem 1rem;background:#3b82f6;color:white;border:none;border-radius:4px;cursor:pointer;">保存顺序</button>
          </div>
        </div>
      `;

      modal.appendChild(content);
      document.body.appendChild(modal);

      // ESC 键关闭
      modal.onkeydown = (e) => {
        if (e.key === 'Esc') modal.remove();
      };

      // 点击背景关闭
      modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
      };
    }

    updateLaneName(laneId, newName) {
      if (!this.currentLane) return;
      const lane = this.currentLane.lanes.find(l => l.id === laneId);
      if (lane) {
        lane.name = newName;
        this.renderSwimlane();
      }
    }

    addNewLane() {
      if (!this.currentLane) return;
      const newLane = this.currentLane.addLane(`参与方 ${this.currentLane.lanes.length + 1}`);
      this.renderSwimlane();
      this.manageLanesForm(); // 重新打开以显示新泳道
    }

    deleteLane(laneId) {
      if (!this.currentLane) return;
      if (!confirm('确定要删除这个泳道吗？关联的步骤也会一并删除')) return;

      this.currentLane.lanes = this.currentLane.lanes.filter(l => l.id !== laneId);
      // 移除该泳道的所有步骤
      this.currentLane.steps = this.currentLane.steps.filter(s => s.laneId !== laneId);
      // 移除相关连接
      this.currentLane.connections = this.currentLane.connections.filter(
        c => c.source !== laneId && c.target !== laneId
      );

      this.renderSwimlane();
      this.manageLanesForm(); // 重新打开
      this.saveLaneData();
    }

    saveLanesOrder() {
      // 泳道顺序已自动排序，只需保存数据
      this.saveLaneData();
      document.getElementById('swimlane-form-modal')?.remove();
      alert('泳道设置已保存！');
    }

    escapeHtml(text) {
      if (!text) return '';
      return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                 .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    saveLaneData() {
      if (!this.currentLane || !this.projectId) return;

      // 保存数据到后端
      fetch(`/api/projects/${this.projectId}/swimlanes/${this.currentLane.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: this.currentLane.name,
          lanes: this.currentLane.lanes,
          steps: this.currentLane.steps,
          connections: this.currentLane.connections
        })
      }).catch(err => console.error('Save failed:', err));
    }

    bindContextMenu() {
      // 右键菜单样式已在全局 CSS 中定义
    }

    renderStaticFallback() {
      this.container.innerHTML = `
        <div style="padding: 2rem; text-align: center; color: #64748b;">
          <p>D3 library not available</p>
          <p>Swimlane rendering will be in static mode</p>
        </div>
      `;
    }

    setData(data) {
      this.currentLane = data;
      this.renderSwimlane();
    }

    refresh() {
      if (this.currentLane) {
        this.loadCurrentLane();
      }
    }

    // 打开泳道管理表单（供外部调用）
    openManageLanesForm() {
      this.manageLanesForm();
    }

    // ==================== 导入/导出 JSON ====================
    exportToJSON() {
      if (!this.currentLane) {
        alert('没有可导出的泳道图数据');
        return;
      }
      const dataStr = JSON.stringify(this.currentLane, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `swimlane-${this.currentLane.id || 'export'}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      console.log('✅ 泳道图已导出为 JSON');
    }

    importFromJSON(file) {
      if (!file) {
        alert('请选择 JSON 文件');
        return;
      }
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = JSON.parse(e.target.result);
          // 数据格式校验
          if (!data.lanes || !Array.isArray(data.lanes)) {
            alert('JSON 格式无效：缺少 lanes 数组');
            return;
          }
          // 生成新 ID 以避免冲突
          if (!data.id) data.id = 'swimlane-' + Date.now();
          if (!data.name) data.name = '导入的泳道图';
          if (!data.steps) data.steps = [];
          if (!data.connections) data.connections = [];

          this.currentLane = data;
          this.renderSwimlane();
          this.saveLaneData();
          alert('泳道图导入成功！');
          console.log('✅ 泳道图已从 JSON 导入');
        } catch (err) {
          alert('JSON 解析失败: ' + err.message);
          console.error('导入失败:', err);
        }
      };
      reader.readAsText(file);
    }

    // 打开导入对话框
    openImportDialog() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) this.importFromJSON(file);
      };
      input.click();
    }
  }

  // 使用 window._swimlaneInstance 作为单例全局实例
function getInstance(containerId, projectId) {
    if (!window._swimlaneInstance) {
        window._swimlaneInstance = new SwimlaneRenderer(containerId, projectId);
    } else {
        window._swimlaneInstance.projectId = projectId;
        window._swimlaneInstance.loadCurrentLane();
        window._swimlaneInstance.refresh();
    }
    return window._swimlaneInstance;
}

  // 暴露公共方法给全局
  window.SwimlaneRenderer = SwimlaneRenderer;

  return {
    createDefault: (projectId) => {
      const data = new SwimlaneData('default-' + projectId, '默认流程', '系统默认泳道图');
      for (let i = 0; i < 3; i++) {
        data.addLane('参与方' + (i + 1));
      }
      return data;
    },
    import: (projectId, data) => {
      if (window._swimlaneInstance) {
        window._swimlaneInstance.setData(data);
        window._swimlaneInstance.refresh();
      }
    }
  };
})();

// 简单暴露全局实例 - 供 HTML onclick 直接调用
window.SwimlaneInstance = function(containerId, projectId) {
    if (!window._swimlaneInstance) {
        window._swimlaneInstance = new SwimlaneRenderer(containerId, projectId);
    } else {
        window._swimlaneInstance.projectId = projectId;
        window._swimlaneInstance.loadCurrentLane();
        window._swimlaneInstance.refresh();
    }
    return window._swimlaneInstance;
};

// 静态方法：获取当前实例（用于泳道管理按钮）
window.getSwimlaneInstance = function() {
    return window._swimlaneInstance;
};