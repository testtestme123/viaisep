/**
 * State Machine D3 Rendering Module
 * 状态图 D3 渲染器 - 支持状态、转换、拖拽交互
 */

(function() {
  'use strict';

  // ==================== 配置常量 ====================
  const CONFIG = {
    stateWidth: 140,
    stateHeight: 80,
    stateRadius: 12,
    gap: 40,
    colors: {
      state: '#FFFFFF',
      stateBorder: '#1E40AF',
      stateFill: '#DBEAFE',
      transition: '#64748B',
      initial: '#DC2626',
      final: '#16A34A',
      fg: '#1f2937'
    }
  };

  // ==================== 独立工具函数 ====================
  // 独立函数，避免在模板字符串中 this 上下文丢失的问题
  function escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ==================== 数据模型 ====================
  class StateMachineData {
    constructor(id, name) {
      this.id = id || 'sm-' + Date.now();
      this.name = name || '默认状态机';
      this.states = [];
      this.transitions = []; // {from: stateId, to: stateId, label: string}
    }

    addState(name, x = 200, y = 200, isInitial = false, isFinal = false) {
      const state = {
        id: 'state-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
        name: name || '状态 ' + (this.states.length + 1),
        x: x,
        y: y,
        type: isInitial ? 'initial' : (isFinal ? 'final' : 'normal'),
        isInitial: isInitial,
        isFinal: isFinal
      };
      this.states.push(state);
      return state;
    }

    addTransition(fromId, toId, label = '') {
      this.transitions.push({ from: fromId, to: toId, label: label || '' });
    }
  }

  // ==================== StateMachineRenderer ====================
  class StateMachineRenderer {
    constructor(containerId, projectId) {
      this.container = document.getElementById(containerId);
      if (!this.container) {
        console.error('StateMachineRenderer: Container not found:', containerId);
        return;
      }
      this.projectId = projectId;
      this.svg = null;
      this.g = null;
      this.currentSm = null;
      this.dragSubject = null;
      this.dragOffset = { x: 0, y: 0 };
      this.d3Available = typeof d3 !== 'undefined';

      if (this.d3Available) {
        this.init();
      } else {
        this.container.innerHTML = '<div style="padding:2rem;text-align:center;color:#64748b">D3 library not available</div>';
      }
    }

    init() {
      // 移除旧的 SVG（保留容器内预设的按钮等元素）
      const oldSvg = this.container.querySelector('svg');
      if (oldSvg) oldSvg.remove();

      this.svg = d3.select(this.container)
        .append('svg')
        .attr('width', '100%')
        .attr('height', '100%')
        .attr('viewBox', `0 0 ${this.getWidth()} ${this.getHeight()}`)
        .call(d3.zoom().on('zoom', (event) => {
          if (this.g) this.g.attr('transform', event.transform);
        }))
        .append('g');

      this.g = this.svg.append('g');

      // 加载状态机
      this.loadCurrentSm();

      console.log('✅ StateMachineRenderer initialized');
    }

    getWidth() {
      const rect = this.container.getBoundingClientRect();
      return Math.max(rect.width, 800);
    }

    getHeight() {
      const rect = this.container.getBoundingClientRect();
      return Math.max(rect.height, 600);
    }

    async loadCurrentSm() {
      try {
        if (!this.projectId) {
          this.currentSm = this.createDefaultStateMachine();
          this.renderStateMachine();
          return;
        }

        const resp = await fetch(`/api/projects/${this.projectId}/state-machines`);
        if (!resp.ok) throw new Error('Failed to load state machines: ' + resp.status);

        const data = await resp.json();

        if (data && data.length > 0) {
          this.currentSm = data[0];
        } else {
          // 创建默认状态机
          this.currentSm = this.createDefaultStateMachine();
        }

        this.renderStateMachine();
      } catch (error) {
        console.error('Error loading state machine:', error);
        this.currentSm = this.createDefaultStateMachine();
        this.renderStateMachine();
      }
    }

    createDefaultStateMachine() {
      const data = new StateMachineData('default-' + this.projectId, '默认状态机');

      // 添加初始状态（圆形）
      const initialState = data.addState('开始', 200, 150, true, false);

      // 添加普通状态 - 所有变量必须用 const 声明
      const state1 = data.addState('处理订单', 400, 250);
      const state2 = data.addState('库存检查', 200, 400);
      const state3 = data.addState('发货', 600, 400);
      const state4 = data.addState('完成', 400, 600, false, true);

      // 添加转换
      data.addTransition(initialState.id, state1.id, '创建');
      data.addTransition(state1.id, state2.id, '检查库存');
      data.addTransition(state2.id, state1.id, '库存不足');
      data.addTransition(state2.id, state3.id, '库存充足');
      data.addTransition(state3.id, state4.id, '发货完成');

      return data;
    }

    renderStateMachine() {
      if (!this.currentSm || !this.g) return;

      this.g.selectAll('*').remove();

      // 设置视口
      this.svg.attr('viewBox', `0 0 ${this.getWidth()} ${this.getHeight()}`);

      // 先绘制连接线（在状态下方）
      this.drawTransitions();

      // 再绘制状态（在连线上方）
      this.drawStates();

      // 绑定交互事件
      this.bindInteractions();
    }

    drawStates() {
      const statesGroup = this.g.append('g').attr('class', 'states-group');

      this.currentSm.states.forEach(state => {
        const group = statesGroup.append('g')
          .attr('class', 'state-group')
          .attr('transform', `translate(${state.x}, ${state.y})`)
          .call(d3.drag()
            .on('start', (e) => this.startDragState(e, state))
            .on('drag', (e) => this.dragState(e, state))
            .on('end', () => this.endDragState(state))
          );

        // 根据状态类型绘制不同图形
        if (state.type === 'initial') {
          // 初始状态：实心红色圆
          group.append('circle')
            .attr('r', CONFIG.stateRadius)
            .attr('fill', CONFIG.colors.initial);
        } else if (state.type === 'final') {
          // 最终状态：双圈（外环空心，内环实心绿色）
          group.append('circle')
            .attr('r', CONFIG.stateRadius * 2.5)
            .attr('fill', 'none')
            .attr('stroke', CONFIG.colors.final)
            .attr('stroke-width', 2);
          group.append('circle')
            .attr('r', CONFIG.stateRadius)
            .attr('fill', CONFIG.colors.final);
        } else {
          // 普通状态：带圆角的矩形
          group.append('rect')
            .attr('x', -CONFIG.stateWidth / 2)
            .attr('y', -CONFIG.stateHeight / 2)
            .attr('width', CONFIG.stateWidth)
            .attr('height', CONFIG.stateHeight)
            .attr('rx', 12)
            .attr('ry', 12)
            .attr('fill', CONFIG.colors.stateFill)
            .attr('stroke', CONFIG.colors.stateBorder)
            .attr('stroke-width', 2)
            .on('contextmenu', (e) => this.showContextMenu(e, state));

          // 状态名称
          group.append('text')
            .attr('x', 0)
            .attr('y', 5)
            .attr('text-anchor', 'middle')
            .attr('font-size', '14px')
            .attr('fill', CONFIG.colors.fg)
            .text(state.name);

          // 编辑按钮
          group.append('text')
            .attr('x', CONFIG.stateWidth / 2 - 8)
            .attr('y', -CONFIG.stateHeight / 2 + 8)
            .attr('font-size', '10px')
            .attr('fill', '#94a3b8')
            .attr('cursor', 'pointer')
            .text('✏️')
            .on('click', (e) => {
              e.stopPropagation();
              this.editStateName(state);
            });
        }
      });
    }

    drawTransitions() {
      const transitionsGroup = this.g.append('g').attr('class', 'transitions-group');

      this.currentSm.transitions.forEach(trans => {
        const fromState = this.currentSm.states.find(s => s.id === trans.from);
        const toState = this.currentSm.states.find(s => s.id === trans.to);

        if (!fromState || !toState) return;

        const fromX = fromState.x;
        const fromY = fromState.y + CONFIG.stateHeight / 2;
        const toX = toState.x;
        const toY = toState.y - CONFIG.stateHeight / 2;

        // 绘制箭头路径（使用 Bezier 曲线避免重叠）
        const offset = fromX === toX ? 60 : 0; // 垂直排列时水平偏移
        const controlX = fromX + offset;

        const pathData = `M ${fromX} ${fromY} C ${controlX} ${fromY}, ${controlX} ${toY}, ${toX} ${toY}`;

        transitionsGroup.append('path')
          .attr('d', pathData)
          .attr('fill', 'none')
          .attr('stroke', CONFIG.colors.transition)
          .attr('stroke-width', 2)
          .attr('marker-end', 'url(#arrowhead-state)');

        // 添加转换标签
        if (trans.label) {
          transitionsGroup.append('text')
            .attr('x', (fromX + toX) / 2)
            .attr('y', (fromY + toY) / 2 - 10)
            .attr('text-anchor', 'middle')
            .attr('font-size', '12px')
            .attr('fill', CONFIG.colors.transition)
            .text(trans.label);
        }
      });

      // 定义箭头标记（只创建一次）
      const svgNode = this.svg.node();
      if (svgNode && !svgNode.querySelector('#arrowhead-state')) {
        this.svg.append('defs').append('marker')
          .attr('id', 'arrowhead-state')
          .attr('viewBox', '0 -5 10 10')
          .attr('refX', 10)
          .attr('refY', 0)
          .attr('markerWidth', 6)
          .attr('markerHeight', 6)
          .attr('orient', 'auto')
          .append('path')
          .attr('d', 'M0,-5L10,0L0,5')
          .attr('fill', CONFIG.colors.transition);
      }
    }

    bindInteractions() {
      // 画布空白处双击添加新状态
      this.svg.on('dblclick', (e) => {
        // 只在点击空白处时添加（非状态节点）
        if (e.target.tagName === 'svg' || e.target.tagName === 'rect') {
          const point = d3.pointer(e);
          this.addState(point[0], point[1]);
        }
      });
    }

    addState(x = 200, y = 200) {
      const state = this.currentSm.addState(`状态 ${this.currentSm.states.length + 1}`, x, y);
      this.renderStateMachine();
      this.saveStateMachine();
      return state;
    }

    startDragState(e, state) {
      this.dragSubject = { type: 'state', id: state.id };
      const point = d3.pointer(e);
      this.dragOffset = { x: point[0] - state.x, y: point[1] - state.y };
    }

    dragState(e, state) {
      if (!this.dragSubject) return;

      const point = d3.pointer(e);
      state.x = point[0] - this.dragOffset.x;
      state.y = point[1] - this.dragOffset.y;

      // 只更新被拖动状态的位置，避免全量重绘卡顿
      this.g.selectAll('.state-group')
        .filter(d => d && d.id === state.id)
        .attr('transform', `translate(${state.x}, ${state.y})`);

      // 更新连线
      this.updateTransitions();
    }

    endDragState(state) {
      this.dragSubject = null;
      // 拖拽结束后全量渲染一次确保对齐
      this.renderStateMachine();
      // 异步保存
      setTimeout(() => this.saveStateMachine(), 100);
    }

    // 拖拽时局部更新连线
    updateTransitions() {
      this.g.selectAll('.transitions-group').remove();
      const newGroup = this.g.insert('g', '.states-group').attr('class', 'transitions-group');
      this.drawTransitionsInto(newGroup);
    }

    drawTransitionsInto(transitionsGroup) {
      this.currentSm.transitions.forEach(trans => {
        const fromState = this.currentSm.states.find(s => s.id === trans.from);
        const toState = this.currentSm.states.find(s => s.id === trans.to);
        if (!fromState || !toState) return;

        const fromX = fromState.x;
        const fromY = fromState.y + CONFIG.stateHeight / 2;
        const toX = toState.x;
        const toY = toState.y - CONFIG.stateHeight / 2;
        const offset = fromX === toX ? 60 : 0;
        const controlX = fromX + offset;
        const pathData = `M ${fromX} ${fromY} C ${controlX} ${fromY}, ${controlX} ${toY}, ${toX} ${toY}`;

        transitionsGroup.append('path')
          .attr('d', pathData)
          .attr('fill', 'none')
          .attr('stroke', CONFIG.colors.transition)
          .attr('stroke-width', 2)
          .attr('marker-end', 'url(#arrowhead-state)');

        if (trans.label) {
          transitionsGroup.append('text')
            .attr('x', (fromX + toX) / 2)
            .attr('y', (fromY + toY) / 2 - 10)
            .attr('text-anchor', 'middle')
            .attr('font-size', '12px')
            .attr('fill', CONFIG.colors.transition)
            .text(trans.label);
        }
      });
    }

    editStateName(state) {
      const newName = prompt('请输入新名称:', state.name);
      if (newName && newName.trim()) {
        state.name = newName.trim();
        this.renderStateMachine();
        this.saveStateMachine();
      }
    }

    showContextMenu(e, state) {
      e.preventDefault();

      // 移除已有菜单（使用专属 class，避免误删图谱的 #node-context-menu）
      const existing = document.querySelector('.d3-context-menu');
      if (existing) existing.remove();

      const menu = document.createElement('div');
      menu.className = 'd3-context-menu';
      menu.style.display = 'block';
      menu.style.left = e.pageX + 'px';
      menu.style.top = e.pageY + 'px';

      const deleteItem = document.createElement('div');
      deleteItem.className = 'context-menu-item';
      deleteItem.textContent = '删除状态';
      deleteItem.onclick = () => {
        this.deleteState(state.id);
        menu.remove();
      };
      menu.appendChild(deleteItem);

      const editItem = document.createElement('div');
      editItem.className = 'context-menu-item';
      editItem.textContent = '重命名';
      editItem.onclick = () => {
        this.editStateName(state);
        menu.remove();
      };
      menu.appendChild(editItem);

      document.body.appendChild(menu);

      setTimeout(() => {
        document.addEventListener('click', function closeMenu() {
          menu.remove();
          document.removeEventListener('click', closeMenu);
        }, { once: true });
      }, 0);
    }

    saveStateMachine() {
      if (!this.currentSm || !this.projectId) return;

      // 简化保存逻辑 - PUT 到后端
      fetch(`/api/projects/${this.projectId}/state-machines/${this.currentSm.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: this.currentSm.name,
          states: this.currentSm.states,
          transitions: this.currentSm.transitions
        })
      }).catch(err => console.error('Save failed:', err));
    }

    deleteState(stateId) {
      if (!this.currentSm) return;
      this.currentSm.states = this.currentSm.states.filter(s => s.id !== stateId);
      // 移除相关转换
      this.currentSm.transitions = this.currentSm.transitions.filter(
        t => t.from !== stateId && t.to !== stateId
      );
      this.renderStateMachine();
      this.saveStateMachine();
    }

    setData(data) {
      this.currentSm = data;
      this.renderStateMachine();
    }

    refresh() {
      if (this.currentSm) {
        this.loadCurrentSm();
      }
    }

    // ==================== 状态机管理表单 ====================
    openManageForm() {
      if (!this.currentSm) return;

      // 移除已有模态框
      const existing = document.getElementById('sm-form-modal');
      if (existing) existing.remove();

      const modal = document.createElement('div');
      modal.id = 'sm-form-modal';
      modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000;overflow-y:auto;padding:2rem;';

      const content = document.createElement('div');
      content.style.cssText = 'background:white;border-radius:8px;width:100%;max-width:800px;max-height:90vh;overflow-y:auto;box-shadow:0 10px 25px rgba(0,0,0,0.2);';

      // 预先转义状态名称，避免模板字符串中 this 上下文问题
      const statesHtml = this.currentSm.states.map(state => {
        const escapedName = escapeHtml(state.name);
        const stateId = state.id;
        return `
          <div style="display:flex;gap:0.5rem;margin-bottom:0.5rem;padding:0.5rem;background:#f9fafb;border-radius:4px;">
            <select onchange="window._smInstance && window._smInstance.updateStateType('${stateId}', this.value)" style="flex:1;padding:0.3rem;border:1px solid #d1d5db;border-radius:4px;font-size:0.875rem;">
              <option value="normal" ${state.type === 'normal' ? 'selected' : ''}>普通</option>
              <option value="initial" ${state.type === 'initial' ? 'selected' : ''}>初始</option>
              <option value="final" ${state.type === 'final' ? 'selected' : ''}>最终</option>
            </select>
            <input type="text" value="${escapedName}" style="flex:1;padding:0.3rem;border:1px solid #d1d5db;border-radius:4px;font-size:0.875rem;" onchange="window._smInstance && window._smInstance.updateStateName('${stateId}', this.value)">
            <button onclick="window._smInstance && window._smInstance.deleteState('${stateId}')" style="padding:0.3rem 0.6rem;background:#ef4444;color:white;border:none;border-radius:4px;cursor:pointer;">删除</button>
          </div>
        `;
      }).join('');

      content.innerHTML = `
        <div style="padding:1.5rem;">
          <h3 style="margin-bottom:1.5rem;font-size:1.25rem;color:#1f2937;">状态机管理</h3>

          <div style="margin-bottom:1.5rem;">
            <label style="display:block;font-weight:600;color:#374151;margin-bottom:0.5rem;">状态列表</label>
            <div id="sm-states-list" style="border:1px solid #d1d5db;border-radius:4px;padding:0.5rem;margin-bottom:0.5rem;max-height:200px;overflow-y:auto;">
              ${statesHtml}
            </div>
            <button onclick="window._smInstance && window._smInstance.addNewState()" style="padding:0.5rem 1rem;background:#10b981;color:white;border:none;border-radius:4px;cursor:pointer;">+ 添加状态</button>
          </div>

          <div style="text-align:right;">
            <button onclick="document.getElementById('sm-form-modal').remove()" style="padding:0.5rem 1rem;background:#e5e7eb;color:#374151;border:none;border-radius:4px;cursor:pointer;">取消</button>
            <button onclick="window._smInstance && window._smInstance.saveSmSettings()" style="padding:0.5rem 1rem;background:#3b82f6;color:white;border:none;border-radius:4px;cursor:pointer;">保存设置</button>
          </div>
        </div>
      `;

      modal.appendChild(content);
      document.body.appendChild(modal);

      modal.onkeydown = (e) => { if (e.key === 'Escape') modal.remove(); };
      modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    }

    updateStateName(stateId, newName) {
      const state = this.currentSm.states.find(s => s.id === stateId);
      if (state) {
        state.name = newName;
        this.renderStateMachine();
      }
    }

    updateStateType(stateId, type) {
      const state = this.currentSm.states.find(s => s.id === stateId);
      if (state) {
        state.type = type;
        this.renderStateMachine();
      }
    }

    addNewState() {
      this.currentSm.addState(`状态 ${this.currentSm.states.length + 1}`, Math.random() * 300 + 200, Math.random() * 300 + 100);
      this.renderStateMachine();
      this.saveStateMachine();
      // 重新打开表单以显示新状态
      this.openManageForm();
    }

    saveSmSettings() {
      this.saveStateMachine();
      const modal = document.getElementById('sm-form-modal');
      if (modal) modal.remove();
      alert('状态机设置已保存！');
    }
  }

  // ==================== 单例管理 ====================
  let instance = null;

  function getInstance(containerId, projectId) {
    if (!instance) {
      instance = new StateMachineRenderer(containerId, projectId);
    } else {
      instance.projectId = projectId;
      instance.loadCurrentSm();
    }
    // 保存到全局以便 HTML onclick 访问
    window._smInstance = instance;
    return instance;
  }

  // ==================== 暴露到全局 ====================
  // 关键：必须暴露到 window，否则外部无法访问
  window.StateMachineRenderer = StateMachineRenderer;
  window.StateMachineData = StateMachineData;
  window.getStateMachineInstance = getInstance;
  // HTML onclick 直接调用：StateMachineInstance('container', projectId)
  window.StateMachineInstance = getInstance;

})();
