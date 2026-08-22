// Đợt 6 (17/08/2026) v2 — Kiểm kho: giao diện SoBanHang v2 (ảnh mẫu Website v2\Quản lý kho\Kiểm
// kho). Màn danh sách đổi sang KPI + bảng + filter kiểu v2; màn chi tiết đếm số (tạo phiếu, gõ số
// đếm, "Cân bằng kho") GIỮ NGUYÊN logic bản cũ — đã đúng, chỉ đổi phần vỏ danh sách.
// GIỚI HẠN CHỦ Ý (đã trao đổi trước khi làm): kiểm kho NVL chưa có ở backend (chỉ createCount cho
// sản phẩm, xem GĐ4/GĐ5) — tab "Nguyên vật liệu" trong ảnh mẫu chưa làm ở đợt này.
import { api } from '../api.js';
import { escapeHtml, toast, confirmDialog, promptDialog } from '../ui.js';

const STATUS_LABEL = { draft: 'Đang đếm', balanced: 'Đã cân bằng kho', cancelled: 'Đã huỷ' };

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.stock) {
    container.innerHTML = '<p>Bạn không có quyền xem kiểm kho.</p>';
    return;
  }
  const canManage = !!perms.stock_manage;

  let counts = [];
  let openCount = null;
  // Số vừa gõ nhưng CHƯA lưu. Luôn vẽ bảng từ map này khi có — nếu vẽ lại bằng số của máy chủ
  // thì số người dùng vừa gõ biến mất khỏi màn hình mà vẫn nằm trong hàng chờ lưu (bug-065).
  const pending = new Map();
  let filterDiffOnly = false;

  container.innerHTML = `<div id="kk-body"><p>Đang tải…</p></div>`;

  function renderListScreen() {
    const balanced = counts.filter((c) => c.status === 'balanced').length;
    const draft = counts.filter((c) => c.status === 'draft').length;
    const cancelled = counts.filter((c) => c.status === 'cancelled').length;

    container.querySelector('#kk-body').innerHTML = `
      <div class="page-head">
        <h2>Kiểm kho</h2>
        <div style="display:flex;gap:8px">
          <button id="kk-excel" class="btn">Tải Excel</button>
          ${canManage ? '<button id="kk-new" class="btn btn-primary">+ Tạo phiếu kiểm kho</button>' : ''}
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px">
        <div class="kpi-card"><div class="kpi-val">${draft}</div><div class="kpi-label">Đang kiểm kho</div></div>
        <div class="kpi-card"><div class="kpi-val" style="color:var(--primary,#16a34a)">${balanced}</div><div class="kpi-label">Đã cân bằng kho</div></div>
        <div class="kpi-card"><div class="kpi-val">${cancelled}</div><div class="kpi-label">Đã huỷ</div></div>
      </div>
      <div style="overflow-x:auto">
        <table class="sp-table" style="width:100%;min-width:520px">
          <thead><tr><th>MÃ PHIẾU</th><th>NGÀY TẠO</th><th>NHÂN VIÊN</th><th>TRẠNG THÁI</th><th style="width:90px">CHÊNH LỆCH</th>${canManage ? '<th style="width:40px"></th>' : ''}</tr></thead>
          <tbody>
            ${counts.length ? counts.map((c) => `
            <tr class="${c.status === 'cancelled' ? 'row-inactive' : ''}">
              <td style="font-weight:500">${escapeHtml(c.code)}</td>
              <td>${escapeHtml(String(c.created_at).slice(0, 10))}</td>
              <td>${escapeHtml(c.created_by_name || '—')}</td>
              <td><span class="badge-${c.status === 'balanced' ? 'ok' : c.status === 'cancelled' ? 'warn' : 'default'}">${escapeHtml(STATUS_LABEL[c.status] || c.status)}</span></td>
              <td>${c.diff_count}</td>
              ${canManage ? `<td><button class="btn" data-open="${c.id}" style="padding:4px 10px;font-size:12px">Mở</button></td>` : ''}
            </tr>`).join('') : `<tr><td colspan="6" style="text-align:center;padding:32px;color:#999">Chưa có phiếu kiểm kho nào.</td></tr>`}
          </tbody>
        </table>
      </div>
    `;
    if (canManage) container.querySelector('#kk-new').addEventListener('click', createCount);
    container.querySelector('#kk-excel').addEventListener('click', () => toast('Tính năng đang phát triển', 'info'));
    container.querySelectorAll('[data-open]').forEach((btn) => {
      btn.addEventListener('click', () => openDetail(btn.dataset.open));
    });
  }

  async function createCount() {
    const note = await promptDialog('Ghi chú cho phiếu kiểm kho:', { placeholder: 'Bỏ trống cũng được' });
    if (note === null) return;
    try {
      const res = await api.post('/api/mgr/stock/counts', { note: note.trim() || null });
      toast(`Đã tạo phiếu ${res.count.code} với ${res.count.items.length} món`);
      openCount = res.count;
      pending.clear();
      renderDetailScreen();
    } catch (err) {
      toast(err?.body?.message || 'Không tạo được phiếu kiểm kho', 'error');
    }
  }

  async function openDetail(id) {
    try {
      const res = await api.get(`/api/mgr/stock/counts/${id}`);
      openCount = res.count;
      pending.clear();
      renderDetailScreen();
    } catch (err) {
      toast(err?.body?.message || 'Không mở được phiếu', 'error');
    }
  }

  function effectiveCounted(it) {
    return pending.has(it.menu_id) ? pending.get(it.menu_id) : it.counted_qty;
  }

  function renderDetailScreen() {
    const c = openCount;
    const editable = canManage && c.status === 'draft';
    const rows = c.items.filter((it) => !filterDiffOnly || effectiveCounted(it) !== it.system_qty);

    container.querySelector('#kk-body').innerHTML = `
      <button id="kk-back" class="btn" style="margin-bottom:12px">← Danh sách phiếu</button>
      <div class="today-card">
        <div class="today-card-title">${escapeHtml(c.code)} — ${escapeHtml(STATUS_LABEL[c.status] || c.status)}</div>
        <div class="today-stats">
          <div class="today-stat"><span class="label">Số món</span><span class="value">${c.summary.products}</span></div>
          <div class="today-stat"><span class="label">Món lệch</span><span class="value">${c.summary.diff_products}</span></div>
          <div class="today-stat"><span class="label">Thừa</span><span class="value">${c.summary.qty_surplus}</span></div>
          <div class="today-stat"><span class="label">Thiếu</span><span class="value">${c.summary.qty_missing}</span></div>
        </div>
      </div>
      <label style="display:flex;align-items:center;gap:8px;margin:8px 0">
        <input id="kk-diff-only" type="checkbox" style="width:auto;min-height:auto" ${filterDiffOnly ? 'checked' : ''} />
        Chỉ hiện món lệch
      </label>
      <div id="kk-pending" class="hint"></div>
      <div class="stock-table">
        <div class="stock-table-head">
          <span>Món</span><span>Kho hệ thống</span><span>Kho thực tế</span><span>SL lệch</span>
        </div>
        ${rows.map((it) => {
    const counted = effectiveCounted(it);
    const diff = Math.round((counted - it.system_qty) * 1000) / 1000;
    return `<div class="stock-table-row">
            <span>${escapeHtml(it.product_name)}${it.unit ? ' (' + escapeHtml(it.unit) + ')' : ''}</span>
            <span>${it.system_qty}</span>
            <span>${editable
    ? `<input data-menu="${it.menu_id}" type="number" step="0.001" min="0" value="${counted}" />`
    : counted}</span>
            <span class="${diff === 0 ? '' : diff > 0 ? 'diff-plus' : 'diff-minus'}">${diff > 0 ? '+' : ''}${diff}</span>
          </div>`;
  }).join('')}
      </div>
      ${editable ? `
        <button id="kk-save" class="btn" style="width:100%;margin-top:12px">Lưu số đếm</button>
        <button id="kk-balance" class="btn btn-primary" style="width:100%;margin-top:8px">Hoàn thành (Cân bằng kho)</button>
        <button id="kk-cancel" class="btn" style="width:100%;margin-top:8px">Huỷ phiếu</button>
        <p class="hint">"Cân bằng kho" sẽ tự lưu số đang gõ rồi sinh phiếu điều chỉnh. Sau khi cân bằng, phiếu bị khoá vĩnh viễn.</p>
      ` : ''}
    `;

    container.querySelector('#kk-back').addEventListener('click', async () => {
      if (pending.size && !(await confirmDialog(`Còn ${pending.size} món chưa lưu. Thoát và bỏ số đang gõ?`))) return;
      pending.clear();
      openCount = null;
      await loadList();
    });
    container.querySelector('#kk-diff-only').addEventListener('change', (e) => {
      filterDiffOnly = e.target.checked;
      renderDetailScreen();
    });

    container.querySelectorAll('[data-menu]').forEach((input) => {
      input.addEventListener('input', () => {
        pending.set(input.dataset.menu, Number(input.value) || 0);
        renderPendingNote();
      });
    });
    renderPendingNote();

    if (editable) {
      container.querySelector('#kk-save').addEventListener('click', () => saveCounts(true));
      container.querySelector('#kk-balance').addEventListener('click', balance);
      container.querySelector('#kk-cancel').addEventListener('click', cancelCount);
    }
  }

  function renderPendingNote() {
    const el = container.querySelector('#kk-pending');
    if (!el) return;
    el.textContent = pending.size ? `Còn ${pending.size} món đã gõ nhưng CHƯA lưu.` : '';
  }

  async function saveCounts(showToast) {
    if (!pending.size) {
      if (showToast) toast('Không có thay đổi nào để lưu');
      return true;
    }
    const items = [...pending.entries()].map(([menu_id, counted_qty]) => ({ menu_id, counted_qty }));
    try {
      const res = await api.patch(`/api/mgr/stock/counts/${openCount.id}/items`, { items });
      openCount = res.count;
      pending.clear();
      if (showToast) toast(`Đã lưu ${res.updated} món`);
      renderDetailScreen();
      return true;
    } catch (err) {
      toast(err?.body?.message || 'Không lưu được số đếm', 'error');
      return false;
    }
  }

  async function balance() {
    // Lưu số đang gõ TRƯỚC khi cân bằng, nếu không thì cân bằng theo số cũ mà người dùng tưởng
    // là số mới — sai lệch kho im lặng.
    if (!(await saveCounts(false))) return;
    if (!(await confirmDialog(
      `Cân bằng kho theo phiếu ${openCount.code}? Sau bước này phiếu bị khoá, không sửa được nữa.`
    ))) return;
    try {
      const res = await api.post(`/api/mgr/stock/counts/${openCount.id}/balance`);
      toast(`Đã cân bằng kho — sinh ${res.adjustments} phiếu điều chỉnh`);
      openCount = res.count;
      renderDetailScreen();
    } catch (err) {
      toast(err?.body?.message || 'Không cân bằng được', 'error');
    }
  }

  async function cancelCount() {
    if (!(await confirmDialog(`Huỷ phiếu ${openCount.code}? Số đã đếm sẽ bỏ đi.`))) return;
    try {
      await api.post(`/api/mgr/stock/counts/${openCount.id}/cancel`);
      toast('Đã huỷ phiếu kiểm kho');
      pending.clear();
      openCount = null;
      await loadList();
    } catch (err) {
      toast(err?.body?.message || 'Không huỷ được phiếu', 'error');
    }
  }

  async function loadList() {
    try {
      const res = await api.get('/api/mgr/stock/counts');
      counts = res.counts || [];
      renderListScreen();
    } catch (err) {
      container.querySelector('#kk-body').innerHTML = '<p>Không tải được danh sách phiếu kiểm kho.</p>';
    }
  }

  await loadList();
}
