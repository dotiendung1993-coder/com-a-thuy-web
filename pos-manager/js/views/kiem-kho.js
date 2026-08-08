// GĐ4 — Kiểm kho: tạo phiếu (chụp tồn sổ sách), gõ số đếm thực tế, rồi "Cân bằng kho".
// Cân bằng KHÔNG sửa thẳng con số tồn — nó sinh phiếu nhập/xuất điều chỉnh, nên sổ kho luôn có
// dấu vết ai đã điều chỉnh cái gì.
import { api } from '../api.js';
import { escapeHtml, toast, confirmDialog } from '../ui.js';

const STATUS_LABEL = { draft: 'Đang đếm', balanced: 'Đã cân bằng', cancelled: 'Đã huỷ' };

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

  container.innerHTML = `
    <h2>Kiểm kho</h2>
    <div id="kk-body"><p>Đang tải…</p></div>
  `;

  function renderListScreen() {
    container.querySelector('#kk-body').innerHTML = `
      ${canManage ? '<button id="kk-new" class="btn btn-primary" style="width:100%;margin-bottom:12px">+ Tạo phiếu kiểm kho</button>' : ''}
      ${counts.length ? counts.map((c) => `
        <div class="stock-row ${c.status === 'cancelled' ? 'inactive' : ''}">
          <div class="stock-main">
            <div class="stock-name">${escapeHtml(c.code)}
              <span class="badge-${c.status === 'balanced' ? 'default' : 'warn'}">${escapeHtml(STATUS_LABEL[c.status] || c.status)}</span>
            </div>
            <div class="stock-meta">
              ${escapeHtml(String(c.created_at).slice(0, 10))} · ${c.product_count} món ·
              ${c.diff_count} món lệch
              ${c.created_by_name ? ' · ' + escapeHtml(c.created_by_name) : ''}
            </div>
            ${c.note ? `<div class="stock-meta">${escapeHtml(c.note)}</div>` : ''}
          </div>
          <div class="stock-actions"><button data-open="${c.id}">Mở</button></div>
        </div>`).join('') : '<p>Chưa có phiếu kiểm kho nào.</p>'}
    `;
    if (canManage) container.querySelector('#kk-new').addEventListener('click', createCount);
    container.querySelectorAll('[data-open]').forEach((btn) => {
      btn.addEventListener('click', () => openDetail(btn.dataset.open));
    });
  }

  async function createCount() {
    const note = window.prompt('Ghi chú cho phiếu kiểm kho (bỏ trống cũng được):', '');
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
          <span>Món</span><span>Sổ sách</span><span>Đếm thực tế</span><span>Lệch</span>
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
        <button id="kk-balance" class="btn btn-primary" style="width:100%;margin-top:8px">Cân bằng kho</button>
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
