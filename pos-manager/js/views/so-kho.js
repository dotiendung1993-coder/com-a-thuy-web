// GĐ4 — Sổ kho: mọi phiếu nhập/xuất theo thời gian, lọc được, huỷ phiếu ghi sai.
// Phiếu do máy tự sinh khi bán hàng cũng hiện ở đây (nguồn "Bán hàng") để đối chiếu được.
import { api } from '../api.js';
import { formatVND, escapeHtml, toast, todayVN, dateVN, confirmDialog } from '../ui.js';

const SOURCE_LABEL = { manual: 'Ghi tay', order: 'Bán hàng', count: 'Kiểm kho' };

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.stock) {
    container.innerHTML = '<p>Bạn không có quyền xem sổ kho.</p>';
    return;
  }
  const canManage = !!perms.stock_manage;

  const state = { from: dateVN(-30), to: todayVN(), direction: '', source: '' };
  let data = { moves: [], summary: {}, total: 0 };

  container.innerHTML = `
    <h2>Sổ kho</h2>
    <div class="filter-row">
      <input id="sk-from" type="date" value="${state.from}" />
      <input id="sk-to" type="date" value="${state.to}" />
    </div>
    <div class="filter-row">
      <select id="sk-dir">
        <option value="">Nhập và xuất</option>
        <option value="nhap">Chỉ nhập kho</option>
        <option value="xuat">Chỉ xuất kho</option>
      </select>
      <select id="sk-src">
        <option value="">Mọi nguồn</option>
        <option value="manual">Ghi tay</option>
        <option value="order">Bán hàng</option>
        <option value="count">Kiểm kho</option>
      </select>
    </div>
    <div class="today-card" id="sk-summary"></div>
    <div id="sk-list"><p>Đang tải…</p></div>
  `;

  ['sk-from', 'sk-to', 'sk-dir', 'sk-src'].forEach((id) => {
    container.querySelector(`#${id}`).addEventListener('change', () => {
      state.from = container.querySelector('#sk-from').value;
      state.to = container.querySelector('#sk-to').value;
      state.direction = container.querySelector('#sk-dir').value;
      state.source = container.querySelector('#sk-src').value;
      load();
    });
  });

  function renderSummary() {
    const s = data.summary || {};
    container.querySelector('#sk-summary').innerHTML = `
      <div class="today-card-title">TỪ ${escapeHtml(state.from)} ĐẾN ${escapeHtml(state.to)}</div>
      <div class="today-stats">
        <div class="today-stat"><span class="label">Nhập</span><span class="value">${s.qty_in ?? 0}</span></div>
        <div class="today-stat"><span class="label">Xuất</span><span class="value">${s.qty_out ?? 0}</span></div>
        <div class="today-stat"><span class="label">Tiền nhập</span><span class="value">${formatVND(s.cost_in || 0)}</span></div>
      </div>`;
  }

  function renderList() {
    const el = container.querySelector('#sk-list');
    if (!data.moves.length) { el.innerHTML = '<p>Không có phiếu kho nào trong khoảng này.</p>'; return; }

    el.innerHTML = data.moves.map((m) => `
      <div class="stock-row ${m.voided ? 'inactive' : ''}">
        <div class="stock-main">
          <div class="stock-name">
            <span class="badge-${m.direction === 'nhap' ? 'in' : 'out'}">${escapeHtml(m.direction_label)}</span>
            ${escapeHtml(m.product_name)}
            ${m.voided ? '<span class="badge-warn">Đã huỷ</span>' : ''}
          </div>
          <div class="stock-meta">
            ${escapeHtml(m.code)} · ${escapeHtml(m.occurred_date)} ·
            ${escapeHtml(SOURCE_LABEL[m.source] || m.source)}
            ${m.reason ? ' · ' + escapeHtml(m.reason) : ''}
            ${m.created_by_name ? ' · ' + escapeHtml(m.created_by_name) : ''}
          </div>
          ${m.note ? `<div class="stock-meta">${escapeHtml(m.note)}</div>` : ''}
          ${m.voided ? `<div class="stock-meta">Huỷ bởi ${escapeHtml(m.voided_by_name || '—')}${m.void_reason ? ': ' + escapeHtml(m.void_reason) : ''}</div>` : ''}
        </div>
        <div class="stock-qty">
          ${m.direction === 'nhap' ? '+' : '−'}${m.qty}${m.product_unit ? ' ' + escapeHtml(m.product_unit) : ''}
          ${m.direction === 'nhap' && m.total_cost ? `<div class="stock-sub">${formatVND(m.total_cost)}</div>` : ''}
        </div>
        ${canManage && !m.voided && m.source !== 'count'
    ? `<div class="stock-actions"><button data-void="${m.id}">Huỷ</button></div>` : ''}
      </div>`).join('');

    el.querySelectorAll('[data-void]').forEach((btn) => {
      btn.addEventListener('click', () => voidMove(data.moves.find((m) => String(m.id) === btn.dataset.void)));
    });
  }

  async function voidMove(move) {
    if (!(await confirmDialog(`Huỷ phiếu ${move.code} (${move.product_name}, ${move.qty})?`))) return;
    const reason = window.prompt('Lý do huỷ phiếu:', 'Ghi nhầm');
    if (reason === null) return;
    try {
      await api.post(`/api/mgr/stock/moves/${move.id}/void`, { reason });
      toast('Đã huỷ phiếu');
      await load();
    } catch (err) {
      toast(err?.body?.message || 'Không huỷ được phiếu', 'error');
    }
  }

  async function load() {
    const params = new URLSearchParams({ from: state.from, to: state.to, limit: '200' });
    if (state.direction) params.set('direction', state.direction);
    if (state.source) params.set('source', state.source);
    try {
      data = await api.get(`/api/mgr/stock/moves?${params}`);
      renderSummary();
      renderList();
    } catch (err) {
      container.querySelector('#sk-list').innerHTML = '<p>Không tải được sổ kho.</p>';
    }
  }

  await load();
}
