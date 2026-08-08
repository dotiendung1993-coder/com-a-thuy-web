// GĐ2 — Thu chi: phiếu thu/chi, lọc theo ngày/chiều/nguồn tiền/phân loại.
import { api } from '../api.js';
import { formatVND, escapeHtml, toast, openModal, todayVN } from '../ui.js';

// Ngày theo giờ Việt Nam (xem ghi chú ở ui.js)
const todayStr = todayVN;

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.cash) {
    container.innerHTML = '<p>Bạn không có quyền xem màn hình này.</p>';
    return;
  }
  const canManage = !!perms.cash_manage;

  let accounts = [];
  const categoriesByDir = { thu: [], chi: [] };
  const filters = { from: todayStr(), to: todayStr(), direction: '', account_id: '', category_id: '', q: '' };
  let transactions = [];
  let totals = { thu: 0, chi: 0, net: 0, count: 0 };

  container.innerHTML = `
    <div class="tc-actions">
      <button id="tc-thu" class="btn btn-primary">＋ Phiếu thu</button>
      <button id="tc-chi" class="btn btn-danger">－ Phiếu chi</button>
    </div>
    <div class="tc-totals">
      <div class="tc-total-box"><span class="label">Tổng thu</span><span class="value thu" id="tc-total-thu">0₫</span></div>
      <div class="tc-total-box"><span class="label">Tổng chi</span><span class="value chi" id="tc-total-chi">0₫</span></div>
      <div class="tc-total-box"><span class="label">Chênh lệch</span><span class="value" id="tc-total-net">0₫</span></div>
    </div>
    <div class="tc-filters">
      <div class="orders-filters-row">
        <input id="tc-from" type="date" value="${filters.from}" />
        <input id="tc-to" type="date" value="${filters.to}" />
      </div>
      <div class="orders-filters-row">
        <select id="tc-direction">
          <option value="">Thu &amp; Chi</option>
          <option value="thu">Chỉ thu</option>
          <option value="chi">Chỉ chi</option>
        </select>
        <select id="tc-account"><option value="">Mọi nguồn tiền</option></select>
      </div>
      <div class="orders-filters-row">
        <select id="tc-category" disabled><option value="">Chọn chiều thu/chi để lọc phân loại</option></select>
        <input id="tc-search" type="search" placeholder="Tìm ghi chú / người liên quan" />
      </div>
    </div>
    <div id="tc-list"><p>Đang tải…</p></div>
  `;

  container.querySelector('#tc-thu').addEventListener('click', () => openTxnModal('thu'));
  container.querySelector('#tc-chi').addEventListener('click', () => openTxnModal('chi'));
  container.querySelector('#tc-from').addEventListener('change', (e) => { filters.from = e.target.value; load(); });
  container.querySelector('#tc-to').addEventListener('change', (e) => { filters.to = e.target.value; load(); });
  container.querySelector('#tc-direction').addEventListener('change', async (e) => {
    filters.direction = e.target.value;
    filters.category_id = '';
    await loadCategoryFilter();
    load();
  });
  container.querySelector('#tc-account').addEventListener('change', (e) => { filters.account_id = e.target.value; load(); });
  container.querySelector('#tc-category').addEventListener('change', (e) => { filters.category_id = e.target.value; load(); });
  container.querySelector('#tc-search').addEventListener('input', (e) => { filters.q = e.target.value; load(); });

  async function loadAccountFilter() {
    try {
      const res = await api.get('/api/mgr/cash-accounts');
      accounts = res.accounts;
      const sel = container.querySelector('#tc-account');
      sel.innerHTML = '<option value="">Mọi nguồn tiền</option>' + accounts.map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('');
    } catch { /* bỏ qua, bộ lọc vẫn dùng được nếu chưa có nguồn tiền */ }
  }

  async function fetchCategories(direction) {
    if (categoriesByDir[direction] && categoriesByDir[direction].length) return categoriesByDir[direction];
    const res = await api.get(`/api/mgr/transactions/categories?direction=${direction}`);
    categoriesByDir[direction] = res.categories;
    return res.categories;
  }

  async function loadCategoryFilter() {
    const sel = container.querySelector('#tc-category');
    if (!filters.direction) {
      sel.innerHTML = '<option value="">Chọn chiều thu/chi để lọc phân loại</option>';
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    const cats = await fetchCategories(filters.direction);
    sel.innerHTML = '<option value="">Mọi phân loại</option>' + cats.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  }

  function renderTotals() {
    container.querySelector('#tc-total-thu').textContent = formatVND(totals.thu);
    container.querySelector('#tc-total-chi').textContent = formatVND(totals.chi);
    container.querySelector('#tc-total-net').textContent = formatVND(totals.net);
  }

  function renderList() {
    const el = container.querySelector('#tc-list');
    if (!transactions.length) { el.innerHTML = '<p>Không có phiếu nào phù hợp.</p>'; return; }
    el.innerHTML = transactions.map((t) => `
      <div class="tc-row ${t.voided_at ? 'voided' : ''}">
        <div class="tc-row-main">
          <div class="tc-row-top">
            <span class="tc-code">${escapeHtml(t.code)}</span>
            <span class="tc-amount ${t.direction}">${t.direction === 'thu' ? '+' : '-'}${formatVND(t.amount)}</span>
          </div>
          <div class="tc-row-meta">
            ${escapeHtml(t.category_name || 'Chưa phân loại')} · ${escapeHtml(t.account_name || '')}
            ${t.partner_name ? ' · ' + escapeHtml(t.partner_name) : ''}
          </div>
          ${t.note ? `<div class="tc-row-meta">${escapeHtml(t.note)}</div>` : ''}
          <div class="tc-row-meta">${new Date(t.occurred_at).toLocaleString('vi-VN')} · ${escapeHtml(t.created_by_name || '')}</div>
          ${t.voided_at ? `<div class="tc-voided-label">ĐÃ HUỶ${t.void_reason ? ' — ' + escapeHtml(t.void_reason) : ''}</div>` : ''}
        </div>
        ${canManage && !t.voided_at ? `<button data-void="${t.id}" class="btn">Huỷ phiếu</button>` : ''}
      </div>
    `).join('');

    if (canManage) {
      el.querySelectorAll('[data-void]').forEach((btn) => {
        btn.addEventListener('click', () => voidTxn(parseInt(btn.dataset.void, 10)));
      });
    }
  }

  async function voidTxn(id) {
    const reason = window.prompt('Lý do huỷ phiếu:');
    if (reason === null) return;
    if (!reason.trim()) { toast('Vui lòng nhập lý do huỷ', 'error'); return; }
    try {
      await api.post(`/api/mgr/transactions/${id}/void`, { reason: reason.trim() });
      toast('Đã huỷ phiếu');
      await load();
    } catch (err) {
      toast(err?.body?.message || 'Không huỷ được phiếu', 'error');
    }
  }

  function openTxnModal(direction) {
    const modal = openModal('<p>Đang tải…</p>');
    fetchCategories(direction).then((cats) => {
      const now = new Date();
      now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
      const nowLocal = now.toISOString().slice(0, 16);
      modal.overlay.querySelector('.modal-box').innerHTML = `
        <h3>${direction === 'thu' ? 'Phiếu thu' : 'Phiếu chi'}</h3>
        <div class="field"><label>Số tiền</label><input id="tx-amount" type="number" min="0" /></div>
        <div class="field"><label>Nguồn tiền</label>
          <select id="tx-account">${accounts.map((a) => `<option value="${a.id}" ${a.is_default ? 'selected' : ''}>${escapeHtml(a.name)}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Phân loại</label>
          <select id="tx-category"><option value="">Không phân loại</option>${cats.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}</select>
        </div>
        <div class="field"><label>${direction === 'thu' ? 'Người nộp' : 'Người nhận'} (không bắt buộc)</label><input id="tx-partner" type="text" /></div>
        <div class="field"><label>Số điện thoại (không bắt buộc)</label><input id="tx-phone" type="tel" /></div>
        <div class="field"><label>Ghi chú</label><input id="tx-note" type="text" /></div>
        <div class="field"><label>Thời gian</label><input id="tx-time" type="datetime-local" value="${nowLocal}" /></div>
        <button id="tx-submit" class="btn btn-primary" style="width:100%">Lưu phiếu</button>
      `;
      modal.overlay.querySelector('#tx-submit').addEventListener('click', async () => {
        const amount = Number(modal.overlay.querySelector('#tx-amount').value);
        if (!amount || amount <= 0) { toast('Vui lòng nhập số tiền hợp lệ', 'error'); return; }
        const account_id = modal.overlay.querySelector('#tx-account').value;
        if (!account_id) { toast('Vui lòng chọn nguồn tiền', 'error'); return; }
        const payload = {
          direction,
          amount,
          account_id: Number(account_id),
          category_id: modal.overlay.querySelector('#tx-category').value || null,
          partner_name: modal.overlay.querySelector('#tx-partner').value.trim(),
          partner_phone: modal.overlay.querySelector('#tx-phone').value.trim(),
          note: modal.overlay.querySelector('#tx-note').value.trim(),
          occurred_at: new Date(modal.overlay.querySelector('#tx-time').value).toISOString(),
        };
        try {
          await api.post('/api/mgr/transactions', payload);
          toast(direction === 'thu' ? 'Đã tạo phiếu thu' : 'Đã tạo phiếu chi');
          modal.close();
          await load();
        } catch (err) {
          toast(err?.body?.message || 'Không lưu được phiếu', 'error');
        }
      });
    });
  }

  function queryString() {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
    return params.toString();
  }

  async function load() {
    const el = container.querySelector('#tc-list');
    el.innerHTML = '<p>Đang tải…</p>';
    try {
      const res = await api.get(`/api/mgr/transactions?${queryString()}`);
      transactions = res.transactions;
      totals = res.totals;
      renderTotals();
      renderList();
    } catch (err) {
      if (err?.status !== 401 && err?.status !== 403) el.innerHTML = '<p>Không tải được danh sách phiếu.</p>';
    }
  }

  await loadAccountFilter();
  await load();
}
