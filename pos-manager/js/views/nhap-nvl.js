// GĐ5 — Nhập/Xuất NVL + Sổ NVL trong cùng một màn hình.
import { api } from '../api.js';
import { formatVND, escapeHtml, toast, openModal, promptDialog, pageTabsHtml } from '../ui.js';

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.ingredient) {
    container.innerHTML = '<p>Bạn không có quyền xem sổ NVL.</p>';
    return;
  }
  const canManage = !!perms.ingredient_manage;

  container.innerHTML = `
    <h2>Nhập / Xuất NVL</h2>
    ${pageTabsHtml('nhap-nvl', staff)}
    ${canManage ? `
    <div style="display:flex;gap:8px;margin-bottom:12px">
      <button id="nvl-btn-nhap" class="btn btn-primary" style="flex:1">+ Nhập NVL</button>
      <button id="nvl-btn-xuat" class="btn" style="flex:1">− Xuất NVL</button>
      <button id="nvl-btn-sync" class="btn" title="Ép trừ NVL ngay theo công thức + đơn đã bán">Đồng bộ ngay</button>
    </div>` : ''}
    <div class="filter-row">
      <input id="nvl-from" type="date" />
      <input id="nvl-to" type="date" />
      <select id="nvl-dir"><option value="">Tất cả</option><option value="nhap">Nhập</option><option value="xuat">Xuất</option></select>
      <button id="nvl-search" class="btn">Lọc</button>
    </div>
    <div id="nvl-summary-move" style="margin-bottom:8px"></div>
    <div id="nvl-move-list"><p>Đang tải…</p></div>
  `;

  const today = new Date().toISOString().slice(0, 10);
  container.querySelector('#nvl-from').value = today.slice(0, 7) + '-01';
  container.querySelector('#nvl-to').value = today;

  if (canManage) {
    container.querySelector('#nvl-btn-nhap').addEventListener('click', () => openMoveModal('nhap'));
    container.querySelector('#nvl-btn-xuat').addEventListener('click', () => openMoveModal('xuat'));
    container.querySelector('#nvl-btn-sync').addEventListener('click', async () => {
      try {
        const r = await api.post('/api/mgr/ingredients/sync-sold');
        toast(`Đã tạo ${r.created} phiếu xuất, huỷ ${r.voided} phiếu`);
        await load();
      } catch (err) { toast(err?.body?.message || 'Không đồng bộ được', 'error'); }
    });
  }
  container.querySelector('#nvl-search').addEventListener('click', load);

  async function openMoveModal(defaultDir) {
    let ingredients = [];
    let suppliers = [];
    try {
      const [id, sd] = await Promise.all([
        api.get('/api/mgr/ingredients'),
        api.get('/api/mgr/ingredients/suppliers'),
      ]);
      ingredients = id.items || [];
      suppliers = (sd.suppliers || []).filter((s) => s.active);
    } catch { toast('Không tải được danh sách NVL', 'error'); return; }

    if (!ingredients.length) {
      toast('Chưa có nguyên liệu nào. Vào màn "Nguyên liệu" tạo trước.', 'error'); return;
    }

    const dirLabel = defaultDir === 'nhap' ? 'Nhập NVL' : 'Xuất NVL';
    const modal = openModal(`
      <h3>${dirLabel}</h3>
      <div class="field"><label>Nguyên liệu *</label>
        <select id="nm-ing">
          <option value="">— Chọn NVL —</option>
          ${ingredients.map((i) => `<option value="${i.id}">${escapeHtml(i.name)} (${escapeHtml(i.unit)})</option>`).join('')}
        </select></div>
      <div class="field"><label>Số lượng *</label>
        <input id="nm-qty" type="number" min="0.001" step="0.001" placeholder="0" /></div>
      ${defaultDir === 'nhap' ? `
      <div class="field"><label>Giá nhập (1 đơn vị)</label>
        <input id="nm-cost" type="number" min="0" value="0" /></div>
      <div class="field"><label>Nhà cung cấp</label>
        <select id="nm-sup">
          <option value="">— Không chọn —</option>
          ${suppliers.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')}
        </select></div>` : ''}
      <div class="field"><label>Lý do</label>
        <input id="nm-reason" placeholder="${defaultDir === 'nhap' ? 'Mua NVL' : 'Chế biến'}" /></div>
      <div class="field"><label>Ghi chú</label>
        <input id="nm-note" /></div>
      <button id="nm-save" class="btn btn-primary" style="width:100%">Lưu phiếu</button>
    `);
    const ov = modal.overlay;
    ov.querySelector('#nm-save').addEventListener('click', async () => {
      const ingId = ov.querySelector('#nm-ing').value;
      const qty = parseFloat(ov.querySelector('#nm-qty').value);
      if (!ingId) { toast('Chọn NVL', 'error'); return; }
      if (!(qty > 0)) { toast('Số lượng phải > 0', 'error'); return; }
      const body = {
        direction: defaultDir,
        ingredient_id: ingId,
        qty,
        unit_cost: defaultDir === 'nhap' ? (parseFloat(ov.querySelector('#nm-cost').value) || 0) : 0,
        reason: ov.querySelector('#nm-reason').value.trim() || null,
        note: ov.querySelector('#nm-note').value.trim() || null,
      };
      if (defaultDir === 'nhap') {
        body.supplier_id = ov.querySelector('#nm-sup').value || null;
      }
      try {
        await api.post('/api/mgr/ingredients/moves', body);
        toast('Đã lưu phiếu');
        modal.close(); await load();
      } catch (err) { toast(err?.body?.message || 'Lỗi khi lưu', 'error'); }
    });
  }

  async function load() {
    const from = container.querySelector('#nvl-from').value;
    const to = container.querySelector('#nvl-to').value;
    const dir = container.querySelector('#nvl-dir').value;
    const params = new URLSearchParams({ limit: 200 });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (dir) params.set('direction', dir);
    try {
      const data = await api.get(`/api/mgr/ingredients/moves?${params}`);
      renderSummary(data.summary || {});
      renderMoves(data.moves || []);
    } catch {
      container.querySelector('#nvl-move-list').innerHTML = '<p>Không tải được sổ NVL.</p>';
    }
  }

  function renderSummary(s) {
    container.querySelector('#nvl-summary-move').innerHTML = `
      <div class="today-stats" style="background:var(--card-bg,#fff);border-radius:8px;padding:8px 12px;margin-bottom:4px">
        <div class="today-stat"><span class="label">Tổng nhập</span><span class="value">${Number(s.qty_in || 0).toFixed(3).replace(/\.?0+$/, '')}</span></div>
        <div class="today-stat"><span class="label">Tổng xuất</span><span class="value">${Number(s.qty_out || 0).toFixed(3).replace(/\.?0+$/, '')}</span></div>
        <div class="today-stat"><span class="label">Tiền nhập</span><span class="value">${formatVND(s.cost_in || 0)}</span></div>
      </div>`;
  }

  function renderMoves(moves) {
    const el = container.querySelector('#nvl-move-list');
    if (!moves.length) { el.innerHTML = '<p>Không có phiếu nào trong khoảng này.</p>'; return; }
    el.innerHTML = moves.map((m) => `
      <div class="stock-row ${m.voided ? 'voided' : ''}">
        <div class="stock-main">
          <div class="stock-name">
            ${m.voided ? '<s>' : ''}${escapeHtml(m.code)}${m.voided ? '</s> <span class="badge-warn">Đã huỷ</span>' : ''}
            — ${escapeHtml(m.ingredient_name)}
            <span style="color:${m.direction === 'nhap' ? '#2a9' : '#c44'}">${escapeHtml(m.direction_label)}</span>
          </div>
          <div class="stock-meta">
            ${m.occurred_date} · ${m.qty} ${escapeHtml(m.ingredient_unit || '')}
            ${m.unit_cost ? ' · ' + formatVND(m.unit_cost) + '/đv' : ''}
            ${m.source === 'order' ? ' · <em>Tự sinh</em>' : ''}
            ${m.reason ? ' · ' + escapeHtml(m.reason) : ''}
            ${m.supplier_name ? ' · NCC: ' + escapeHtml(m.supplier_name) : ''}
            ${m.created_by_name ? ' · ' + escapeHtml(m.created_by_name) : ''}
          </div>
        </div>
        ${canManage && !m.voided && m.source !== 'order'
    ? `<button class="btn" style="color:#c00;flex-shrink:0" data-void="${m.id}">Huỷ</button>` : ''}
      </div>`).join('');
    if (canManage) {
      el.querySelectorAll('[data-void]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const reason = await promptDialog('Lý do huỷ phiếu (tuỳ chọn):');
          if (reason === null) return;
          try {
            await api.post(`/api/mgr/ingredients/moves/${btn.dataset.void}/void`, { reason });
            toast('Đã huỷ phiếu'); await load();
          } catch (err) { toast(err?.body?.message || 'Không huỷ được', 'error'); }
        });
      });
    }
  }

  await load();
}
