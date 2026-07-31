/**
 * Ontology CRUD Extension Module
 * 本体类 CRUD 扩展模块 - 独立文件，与主 app.js 分离加载
 */

(function() {
    'use strict';

    // ==================== 工具函数 ====================
    function escapeHtml(text) {
        if (!text) return '';
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                   .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    function uuid() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c == 'y' ? r & 0x3 | 0x8 : r;
            return v.toString(16);
        });
    }

    // ==================== OntologyCRUD 单例 ====================
    window.OntologyCRUD = window.OntologyCRUD || (function() {
        let instance = null;

        class OntologyManager {
            constructor(containerId, projectId) {
                this.container = document.getElementById(containerId);
                this.projectId = projectId;
                this.currentMode = 'list';
                this.currentOntology = null;
                this.ontologies = [];
                this.init();
            }

            async init() {
                this.createModal();
                await this.loadOntologies();
                this.setupEventListeners();
                this.render();
            }

            createModal() {
                let modal = document.getElementById('ontology-modal');
                if (!modal) {
                    modal = document.createElement('div');
                    modal.id = 'ontology-modal';
                    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:none;align-items:center;justify-content:center;z-index:1000;';

                    const backdrop = document.createElement('div');
                    backdrop.id = 'modal-backdrop';
                    backdrop.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;';

                    const content = document.createElement('div');
                    content.style.cssText = 'background:white;border-radius:8px;width:90%;max-width:800px;max-height:90vh;overflow:auto;box-shadow:0 10px 25px rgba(0,0,0,0.2);';

                    const header = document.createElement('div');
                    header.style.cssText = 'padding:1rem;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;';
                    
                    const title = document.createElement('h3');
                    title.id = 'modal-title';
                    title.style.cssText = 'margin:0;font-size:1.25rem;color:#1f2937;';

                    const closeBtn = document.createElement('button');
                    closeBtn.id = 'close-modal';
                    closeBtn.textContent = '×';
                    closeBtn.style.cssText = 'background:none;border:none;font-size:1.5rem;cursor:pointer;color:#6b7280;';

                    header.appendChild(title);
                    header.appendChild(closeBtn);

                    const body = document.createElement('div');
                    body.id = 'modal-body';
                    body.style.cssText = 'padding:1.5rem;';

                    const footer = document.createElement('div');
                    footer.style.cssText = 'padding:1rem;border-top:1px solid #eee;display:flex;justify-content:flex-end;gap:0.5rem;';

                    const cancelBtn = document.createElement('button');
                    cancelBtn.id = 'cancel-ontology';
                    cancelBtn.textContent = '取消';
                    cancelBtn.style.cssText = 'padding:0.5rem 1rem;border:1px solid #d1d5db;background:white;border-radius:4px;cursor:pointer;';

                    const saveBtn = document.createElement('button');
                    saveBtn.id = 'save-ontology';
                    saveBtn.textContent = '保存';
                    saveBtn.style.cssText = 'padding:0.5rem 1rem;background:#3b82f6;color:white;border:none;border-radius:4px;cursor:pointer;';

                    footer.appendChild(cancelBtn);
                    footer.appendChild(saveBtn);

                    content.appendChild(header);
                    content.appendChild(body);
                    content.appendChild(footer);
                    modal.appendChild(backdrop);
                    modal.appendChild(content);
                    document.body.appendChild(modal);

                    closeBtn.onclick = () => this.hideModal();
                    backdrop.onclick = (e) => { if(e.target===backdrop) this.hideModal(); };
                }
            }

            async loadOntologies() {
                try {
                    const resp = await fetch(API_BASE + '/api/projects/' + this.projectId + '/ontology/classes');
                    if (resp.ok) this.ontologies = await resp.json();
                } catch(e) {
                    this.ontologies = this.getMockOntologies();
                }
            }

            getMockOntologies() {
                return [
                    {id:'cls-module',name:'Module','description':'模块，表示系统中的一个功能单元或服务边界',properties:[{key:'name','value':'string'},{key:'description','value':'string'}],relationships:['has_capability']},
                    {id:'cls-capability',name:'Capability','description':'能力，模块提供的核心业务能力',properties:[{key:'name','value':'string'},{key:'priority','value':'number'}],relationships:['implemented_by']},
                    {id:'cls-security-check',name:'SecurityCheck','description':'安全检查节点类型',properties:[{key:'violation','value':'string'},{key:'severity','value':'string'}],relationships:['applied_to']},
                    {id:'cls-code-review',name:'CodeReview','description':'代码评审节点类型',properties:[{key:'axis','value':'string'},{key:'severity','value':'string'}],relationships:['on_file']},
                    {id:'cls-design-token',name:'DesignToken','description':'UI 设计 Token',properties:[{key:'category','value':'string'},{key:'token_key','value':'string'}],relationships:['used_in']}
                ];
            }

            render() {
                this.currentMode = 'list';
                this.showListView();
            }

            showListView() {
                this.currentMode = 'list';
                this.hideModal();
                const container = this.container;
                if (!container) return;
                
                const hasOntologies = this.ontologies && this.ontologies.length > 0;
                
                container.innerHTML = `
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
                        <h2 style="font-size:1.5rem;font-weight:600;color:#111827;">🧬 全局元模式本体类</h2>
                        <button id="btn-create-ontology" style="padding:0.5rem 1rem;background:#3b82f6;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:500;">+ 新建本体类</button>
                    </div>
                    ${!hasOntologies ? 
                      '<div style="text-align:center;padding:3rem;color:#9ca3af;"><p>暂无本体类定义。点击"+ 新建"开始添加。</p></div>' :
                      `<div class="ontology-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1rem;">
                        ${this.ontologies.map(cls => `
                            <div class="ontology-card" onclick="OntologyCRUD.instance.openDetail('${cls.id}')">
                                <div style="font-weight:600;color:#111827;margin-bottom:0.5rem;">${escapeHtml(cls.name)}</div>
                                <div style="font-size:0.875rem;color:#6b7280;margin-bottom:0.75rem;line-height:1.4;">${escapeHtml(cls.description || '无描述')}</div>
                                <div style="font-size:0.75rem;color:#9ca3af;">属性: ${cls.properties?.length || 0} 个</div>
                                <div style="font-size:0.75rem;color:#9ca3af;margin-top:0.25rem;">关联: ${cls.relationships?.length || 0} 个</div>
                            </div>
                        `).join('')}
                      </div>`
                    }`;
                
                document.getElementById('btn-create-ontology')?.addEventListener('click', () => this.showCreateModal());
            }

            openDetail(id) {
                this.currentOntology = this.ontologies.find(o => o.id === id);
                if (!this.currentOntology) return;
                const cls = this.currentOntology;
                const propsHTML = cls.properties && cls.properties.length > 0 ?
                    cls.properties.map(p => `<div style="display:flex;gap:0.5rem;margin-bottom:0.5rem;"><input type="text" readonly value="${escapeHtml(p.key)}" style="flex:1;padding:0.25rem;border:1px solid #ddd;border-radius:4px;font-size:0.875rem;"><input type="text" readonly value="${escapeHtml(p.value)}" style="flex:1;padding:0.25rem;border:1px solid #ddd;border-radius:4px;font-size:0.875rem;"></div>`).join('') : '<div style="color:#9ca3af;font-style:italic;">暂无属性</div>';
                const relsHTML = cls.relationships && cls.relationships.length > 0 ?
                    cls.relationships.map(r => `<span style="background:#f3f4f6;padding:0.25rem 0.5rem;border-radius:12px;font-size:0.75rem;margin-right:0.25rem;margin-bottom:0.25px;display:inline-block;">${escapeHtml(r)}</span>`).join('') : '<div style="color:#9ca3af;font-style:italic;">暂无关系</div>';
                
                this.showModal('详情 - ' + escapeHtml(cls.name), `
                    <div style="margin-bottom:1.5rem;">
                        <label style="display:block;font-weight:600;color:#374151;margin-bottom:0.25rem;">名称</label>
                        <div style="background:#f9fafb;padding:0.75rem;border:1px solid #e5e7eb;border-radius:4px;font-size:1rem;color:#111827;">${escapeHtml(cls.name)}</div>
                    </div>
                    <div style="margin-bottom:1.5rem;">
                        <label style="display:block;font-weight:600;color:#374151;margin-bottom:0.25rem;">描述</label>
                        <div style="background:#f9fafb;padding:0.75rem;border:1px solid #e5e7eb;border-radius:4px;color:#374151;line-height:1.5;">${escapeHtml(cls.description || '无描述')}</div>
                    </div>
                    <div style="margin-bottom:1.5rem;">
                        <label style="display:block;font-weight:600;color:#374151;margin-bottom:0.5rem;">属性</label>
                        <div>${propsHTML}</div>
                        <button onclick="OntologyCRUD.instance.editProperties('${cls.id}')" style="margin-top:0.5rem;padding:0.25rem 0.75rem;background:#10b981;color:white;border:none;border-radius:4px;cursor:pointer;font-size:0.875rem;">编辑属性</button>
                    </div>
                    <div>
                        <label style="display:block;font-weight:600;color:#374151;margin-bottom:0.5rem;">关系</label>
                        <div>${relsHTML}</div>
                    </div>
                    <div style="margin-top:1.5rem;display:flex;gap:0.5rem;">
                        <button onclick="OntologyCRUD.instance.editOntology('${cls.id}')" style="padding:0.5rem 1rem;background:#3b82f6;color:white;border:none;border-radius:4px;cursor:pointer;">编辑本体类</button>
                        <button onclick="OntologyCRUD.instance.deleteOntology('${cls.id}')" style="padding:0.5rem 1rem;background:#ef4444;color:white;border:none;border-radius:4px;cursor:pointer;">删除</button>
                    </div>
                `);
            }

            editProperties(id) {
                this.currentOntology = this.ontologies.find(o => o.id === id);
                if (!this.currentOntology) return;
                const existingProps = this.currentOntology.properties || [];
                let propsHTML = existingProps.map((p, i) => `
                    <div style="display:flex;gap:0.5rem;margin-bottom:0.5rem;">
                        <input type="text" class="prop-key" placeholder="属性名" value="${escapeHtml(p.key)}" style="flex:1;padding:0.5rem;border:1px solid #d1d5db;border-radius:4px;font-size:0.875rem;">
                        <input type="text" class="prop-value" placeholder="属性值" value="${escapeHtml(p.value)}" style="flex:1;padding:0.5rem;border:1px solid #d1d5db;border-radius:4px;font-size:0.875rem;">
                        <button class="remove-prop" style="padding:0.5rem;background:#ef4444;color:white;border:none;border-radius:4px;cursor:pointer;" data-index="${i}">×</button>
                    </div>
                `).join('');
                propsHTML += `
                    <div style="display:flex;margin-bottom:1rem;">
                        <input type="text" class="prop-key" placeholder="属性名" style="flex:1;padding:0.5rem;border:1px solid #d1d5db;border-radius:4px;font-size:0.875rem;margin-right:0.5rem;">
                        <input type="text" class="prop-value" placeholder="属性值" style="flex:1;padding:0.5rem;border:1px solid #d1d5db;border-radius:4px;font-size:0.875rem;margin-right:0.5rem;">
                        <button id="add-prop-quick" style="padding:0.5rem 1rem;background:#10b981;color:white;border:none;border-radius:4px;cursor:pointer;">添加</button>
                    </div>
                `;
                this.showModal('编辑属性 - ' + escapeHtml(this.currentOntology.name), `
                    <div style="margin-bottom:1rem;">${propsHTML}</div>
                    <div style="text-align:right;">
                        <button id="cancel-edit-props" style="padding:0.5rem 1rem;background:#e5e7eb;color:#374151;border:none;border-radius:4px;cursor:pointer;">取消</button>
                        <button id="save-edit-props" style="padding:0.5rem 1rem;background:#3b82f6;color:white;border:none;border-radius:4px;cursor:pointer;">保存</button>
                    </div>
                `);
                document.getElementById('add-prop-quick')?.addEventListener('click', () => this.addQuickProp());
                document.querySelectorAll('.remove-prop').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const idx = parseInt(e.target.dataset.index);
                        if (this.currentOntology?.properties) this.currentOntology.properties.splice(idx, 1);
                        this.editProperties(id);
                    });
                });
                document.getElementById('cancel-edit-props')?.addEventListener('click', () => this.hideModal());
                document.getElementById('save-edit-props')?.addEventListener('click', () => this.saveProps());
            }

            addQuickProp() {
                const keys = document.querySelectorAll('.prop-key');
                const vals = document.querySelectorAll('.prop-value');
                const newKey = keys[keys.length - 1].value.trim();
                const newVal = vals[vals.length - 1].value.trim();
                if (newKey) {
                    if (!this.currentOntology.properties) this.currentOntology.properties = [];
                    this.currentOntology.properties.push({ key: newKey, value: newVal });
                    keys[keys.length - 1].value = '';
                    vals[vals.length - 1].value = '';
                }
            }

            saveProps() {
                const keys = document.querySelectorAll('.prop-key');
                const vals = document.querySelectorAll('.prop-value');
                const newProps = [];
                for (let i = 0; i < keys.length; i++) {
                    const k = keys[i].value.trim();
                    const v = vals[i]?.value.trim();
                    if (k) newProps.push({ key: k, value: v });
                }
                if (this.currentOntology) {
                    this.currentOntology.properties = newProps;
                    this.saveOntologyToBackend(this.currentOntology);
                    this.hideModal();
                    this.showListView();
                }
            }

            showCreateModal() {
                this.currentMode = 'create';
                this.currentOntology = null;
                this.showModal('新建本体类', `
                    <div style="max-height:70vh;overflow-y:auto;">
                        <div style="margin-bottom:1rem;">
                            <label style="display:block;font-weight:600;color:#374151;margin-bottom:0.25rem;">名称 *</label>
                            <input type="text" id="new-name" placeholder="例如: Module" style="width:100%;padding:0.5rem;border:1px solid #d1d5db;border-radius:4px;font-size:0.875rem;">
                        </div>
                        <div style="margin-bottom:1rem;">
                            <label style="display:block;font-weight:600;color:#374151;margin-bottom:0.25rem;">描述</label>
                            <textarea id="new-desc" placeholder="描述..." rows="3" style="width:100%;padding:0.5rem;border:1px solid #d1d5db;border-radius:4px;font-size:0.875rem;resize:vertical;"></textarea>
                        </div>
                        <div style="margin-bottom:1rem;">
                            <label style="display:block;font-weight:600;color:#374151;margin-bottom:0.5rem;">属性（键值对）</label>
                            <div id="new-props-container">
                                <div style="display:flex;gap:0.5rem;margin-bottom:0.5rem;">
                                    <input type="text" class="new-p-key" placeholder="属性名" style="flex:1;padding:0.5rem;border:1px solid #d1d5db;border-radius:4px;font-size:0.875rem;">
                                    <input type="text" class="new-p-value" placeholder="属性值" style="flex:1;padding:0.5rem;border:1px solid #d1d5db;border-radius:4px;font-size:0.875rem;">
                                    <button class="rm-new-prop" style="padding:0.5rem;background:#ef4444;color:white;border:none;border-radius:4px;cursor:pointer;">×</button>
                                </div>
                            </div>
                            <button id="add-new-prop" style="margin-bottom:1rem;padding:0.25rem 0.75rem;background:#10b981;color:white;border:none;border-radius:4px;cursor:pointer;">+ 添加属性</button>
                        </div>
                        <div style="margin-bottom:1rem;">
                            <label style="display:block;font-weight:600;color:#374151;margin-bottom:0.5rem;">关系（每行一个）</label>
                            <textarea id="new-rels" placeholder="每行一个关系，例如: has_capability\nimplemented_by" rows="3" style="width:100%;padding:0.5rem;border:1px solid #d1d5db;border-radius:4px;font-size:0.875rem;resize:vertical;"></textarea>
                        </div>
                    </div>
                `);
                document.getElementById('add-new-prop')?.addEventListener('click', () => this.addNewPropRow());
                document.querySelectorAll('.rm-new-prop').forEach(b => b.addEventListener('click', e => e.target.closest('div').remove()));
                document.getElementById('save-ontology')?.addEventListener('click', () => this.createOntology());
                document.getElementById('cancel-ontology')?.addEventListener('click', () => this.hideModal());
            }

            addNewPropRow() {
                const container = document.getElementById('new-props-container');
                if (!container) return;
                const div = document.createElement('div');
                div.style.display = 'flex';
                div.style.gap = '0.5rem';
                div.style.marginBottom = '0.5rem';
                div.innerHTML = `
                    <input type="text" class="new-p-key" placeholder="属性名" style="flex:1;padding:0.5rem;border:1px solid #d1d5db;border-radius:4px;font-size:0.875rem;">
                    <input type="text" class="new-p-value" placeholder="属性值" style="flex:1;padding:0.5rem;border:1px solid #d1d5db;border-radius:4px;font-size:0.875rem;">
                    <button class="rm-new-prop" style="padding:0.5rem;background:#ef4444;color:white;border:none;border-radius:4px;cursor:pointer;">×</button>
                `;
                container.appendChild(div);
                div.querySelector('.rm-new-prop').addEventListener('click', e => e.target.closest('div').remove());
            }

            createOntology() {
                const name = document.getElementById('new-name')?.value.trim();
                if (!name) { alert('请输入名称！'); return; }
                const properties = [];
                document.querySelectorAll('.new-p-key').forEach((ki, i) => {
                    const k = ki.value.trim();
                    const v = document.querySelectorAll('.new-p-value')[i]?.value.trim() || '';
                    if (k) properties.push({ key: k, value: v });
                });
                const rels = document.getElementById('new-rels')?.value?.split(/[\r\n,]+/) || [];
                const newOnto = { id: 'cls-' + uuid(), name, description: document.getElementById('new-desc')?.value || '', properties, relationships: rels.filter(Boolean) };
                this.saveOntologyToBackend(newOnto, true);
            }

            editOntology(id) {
                this.currentOntology = this.ontologies.find(o => o.id === id);
                if (!this.currentOntology) return;
                const cls = this.currentOntology;
                const propsHTML = (cls.properties || []).map((p, i) => `
                    <div style="display:flex;gap:0.5rem;margin-bottom:0.5rem;">
                        <input type="text" class="edit-p-key" placeholder="属性名" value="${escapeHtml(p.key)}" style="flex:1;padding:0.5rem;border:1px solid #d1d5db;border-radius:4px;font-size:0.875rem;">
                        <input type="text" class="edit-p-value" placeholder="属性值" value="${escapeHtml(p.value)}" style="flex:1;padding:0.5rem;border:1px solid #d1d5db;border-radius:4px;font-size:0.875rem;">
                        <button class="rm-edit-prop" style="padding:0.5rem;background:#ef4444;color:white;border:none;border-radius:4px;cursor:pointer;" data-index="${i}">×</button>
                    </div>
                `).join('');
                this.showModal('编辑本体类 - ' + escapeHtml(cls.name), `
                    <div style="max-height:70vh;overflow-y:auto;">
                        <div style="margin-bottom:1rem;">
                            <label style="display:block;font-weight:600;color:#374151;margin-bottom:0.25rem;">名称 *</label>
                            <input type="text" id="edit-name" value="${escapeHtml(cls.name)}" style="width:100%;padding:0.5rem;border:1px solid #d1d5db;border-radius:4px;font-size:0.875rem;">
                        </div>
                        <div style="margin-bottom:1rem;">
                            <label style="display:block;font-weight:600;color:#374151;margin-bottom:0.25rem;">描述</label>
                            <textarea id="edit-desc" rows="3" style="width:100%;padding:0.5rem;border:1px solid #d1d5db;border-radius:4px;font-size:0.875rem;resize:vertical;">${escapeHtml(cls.description || '')}</textarea>
                        </div>
                        <div style="margin-bottom:1rem;">
                            <label style="display:block;font-weight:600;color:#374151;margin-bottom:0.5rem;">属性</label>
                            <div id="edit-props-container">${propsHTML}</div>
                            <button id="add-edit-prop" style="margin-bottom:1rem;padding:0.25rem 0.75rem;background:#10b981;color:white;border:none;border-radius:4px;cursor:pointer;">+ 添加属性</button>
                        </div>
                    </div>
                `);
                document.getElementById('add-edit-prop')?.addEventListener('click', () => this.addEditProp());
                document.querySelectorAll('.rm-edit-prop').forEach(b => b.addEventListener('click', e => {
                    const idx = parseInt(b.dataset.index);
                    if (cls?.properties) cls.properties.splice(idx, 1);
                    this.editOntology(id);
                }));
                document.getElementById('cancel-ontology')?.addEventListener('click', () => this.hideModal());
                document.getElementById('save-ontology')?.addEventListener('click', () => this.updateOntology());
            }

            addEditProp() {
                if (!this.currentOntology) this.currentOntology = { properties: [] };
                this.currentOntology.properties.push({ key: '', value: '' });
                this.editOntology(this.currentOntology.id);
            }

            updateOntology() {
                const name = document.getElementById('edit-name')?.value.trim();
                const desc = document.getElementById('edit-desc')?.value.trim();
                if (!name) { alert('请输入名称！'); return; }
                const props = [];
                document.querySelectorAll('.edit-p-key').forEach((ki, i) => {
                    const k = ki.value.trim();
                    const v = document.querySelectorAll('.edit-p-value')[i]?.value.trim() || '';
                    if (k) props.push({ key: k, value: v });
                });
                this.currentOntology.name = name;
                this.currentOntology.description = desc;
                this.currentOntology.properties = props;
                this.saveOntologyToBackend(this.currentOntology);
                this.hideModal();
                this.showListView();
            }

            deleteOntology(id) {
                if (!confirm('确定要删除吗？')) return;
                this.ontologies = this.ontologies.filter(o => o.id !== id);
                fetch(API_BASE + '/api/projects/' + this.projectId + '/ontology/classes/' + id, { method: 'DELETE' }).catch(() => {});
                this.hideModal();
                this.showListView();
            }

            async saveOntologyToBackend(onto, isNew = false) {
                const url = API_BASE + '/api/projects/' + this.projectId + '/ontology/classes' + (isNew ? '' : '/' + onto.id);
                const method = isNew ? 'POST' : 'PUT';
                const payload = { name: onto.name, description: onto.description, properties: onto.properties, relationships: onto.relationships };
                try {
                    const resp = await fetch(url, { method, headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
                    if (!resp.ok) throw new Error(await resp.text());
                    const result = await resp.json();
                    if (isNew) this.ontologies.push(result);
                    else { const idx = this.ontologies.findIndex(o => o.id === onto.id); if(idx>=0) this.ontologies[idx] = result; }
                    alert(isNew ? '创建成功！' : '更新成功！');
                } catch(e) { alert('保存失败: ' + e.message); }
            }

            showModal(title, contentHTML) {
                const modal = document.getElementById('ontology-modal');
                document.getElementById('modal-title').textContent = title;
                document.getElementById('modal-body').innerHTML = contentHTML;
                modal.style.display = 'flex';
            }

            hideModal() {
                const modal = document.getElementById('ontology-modal');
                if (modal) modal.style.display = 'none';
            }

            setupEventListeners() {
                // 事件监听在初始化时已内联绑定
            }
        }

        return {
            getInstance: (cid, pid) => { if(!instance) instance = new OntologyManager(cid, pid); return instance; },
            showList: () => instance?.showListView(),
            openDetail: (id) => instance?.openDetail(id),
            refresh: () => instance?.loadOntologies().then(() => instance?.showListView())
        };
    })();

    // 页面 DOM 加载完成后初始化本体类管理器
    document.addEventListener('DOMContentLoaded', () => {
        if (window.OntologyCRUD && typeof window.OntologyCRUD.getInstance === 'function') {
            // 等待 currentProjectId 变为可用（app.js 可能在其后加载）
            const tryInit = (attempts = 0) => {
                const projId = (typeof currentProjectId !== 'undefined' && currentProjectId) || 'demo_proj';
                const container = document.getElementById('ontology-view');
                if (container) {
                    window.OntologyCRUD.getInstance('ontology-view', projId);
                    console.log('✅ OntologyCRUD 初始化完成，项目:', projId);
                } else if (attempts < 10) {
                    setTimeout(() => tryInit(attempts + 1), 100);
                }
            };
            tryInit();
        }
    });

    // 当项目切换时刷新本体类列表
    window.refreshOntologyView = function(projectId) {
        if (window.OntologyCRUD && typeof window.OntologyCRUD.getInstance === 'function') {
            const inst = window.OntologyCRUD.getInstance('ontology-view', projectId);
            if (inst && typeof inst.loadOntologies === 'function') {
                inst.projectId = projectId;
                inst.loadOntologies().then(() => inst.showListView && inst.showListView());
            }
        }
    };
})();