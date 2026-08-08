// GĐ2 — Sổ nợ 2 chiều: khách nợ quán / quán nợ NCC.
import { api } from '../api.js';
import { formatVND, escapeHtml, toast, openModal, todayVN } from '../ui.js';

const KIND_LABEL = { 'phai-thu': 'Khách nợ quán', 'phai-tra': 'Quán nợ NCC' };
const STATUS_LABEL = { open: 'Còn nợ', paid: 'Đã trả xong', cancelled: 'Đã huỷ' };

// Ngày theo giờ Việt Nam (xem ghi chú ở ui.js) — dùng để tô đỏ khoản nợ quá hạn
const todayStr = todayVN;

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.debt) {
    container.innerHTML = '<p>Bạn không có quyền xem màn hình này.</p>';
    return;
  }
  const canManage = !!perms.cash_manage;

  let kind = 'phai-thu';
  let status = 'open';
  let q = '';
  let debts = [];
  let totals = { phai_thu: 0, phai_tra: 0, net: 0, count: 0 };
  let accounts = [];

  container.innerHTML = `
    <div class="orders-tabs" id="sn-tabs">
      <button class="chip active" data-kind="phai-thu">Khách nợ quán</button>
      <button class="chip" data-kind="phai-tra">Quán nợ NCC</button>
    </div>
    <div class="tc-totals">
      <div class="tc-total-box"><span class="label" id="sn-total-label">Tổng khách còn nợ</span><span class="value chi" id="sn-total">0₫</span></div>
      <div class="tc-total-box"><span class="label">Số khoản nợ</span><span class="value" id="sn-count">0</span></div>
    </div>
    <button id="sn-add" class="btn btn-primary" style="width:100%;margin-bottom:10px">+ Ghi nợ mới</button>
    <div class="orders-filters-row">
      <select id="sn-status">
        <option value="open">Còn nợ</option>
        <option value="paid">Đã trả xong</option>
        <option value="cancelled">Đã huỷ</option>
        <option value="">Tất cả</option>
      </select>
      <input id="sn-search" type="search" placeholder="Tìm tên / SĐT" />
    </div>
    <div id="sn-list"><p>Đang tải…</p></div>
  `;

  container.querySelectorAll('[data-kind]').forEach((b) => {
    b.addEventListener('click', () => {
      kind = b.dataset.kind;
      container.querySelectorAll('[data-kind]').forEach((x) => x.classList.toggle('active', x === b));
      container.querySelector('#sn-total-label').textContent = kind === 'phai-thu' ? 'Tổng khách còn nợ' : 'Tổng quán còn nợ NCC';
      load();
    });
  });
  container.querySelector('#sn-add').addEventListener('click', () => openDebtModal());
  container.querySelector('#sn-status').addEventListener('change', (e) => { status = e.target.value; load(); });
  container.querySelector('#sn-search').addEventListener('input', (e) => { q = e.target.value; load(); });

  function overdue(d) {
    return d.status === 'open' && d.due_date && new Date(d.due_date) < new Date(todayStr());
  }

  function renderList() {
    const el = container.querySelector('#sn-list');
    if (!debts.length) { el.innerHTML = '<p>Không có khoản nợ nào phù hợp.</p>'; return; }
    el.innerHTML = debts.map((d) => `
      <button class="debt-row ${overdue(d) ? 'overdue' : ''}" data-id="${d.id}">
        <div class="debt-row-top">
          <span class="debt-partner">${escapeHtml(d.partner_name)}</span>
          <span class="debt-remaining">${formatVND(d.remaining)}</span>
        </div>
        <div class="debt-row-meta">
          ${escapeHtml(d.partner_phone || '')} · ${STATUS_LABEL[d.status] || d.status}
          ${d.due_date ? ' · Hạn ' + new Date(d.due_date).toLocaleDateString('vi-VN') : ''}
          ${overdue(d) ? ' · QUÁ HẠN' : ''}
        </div>
      </button>
    `).join('');
    el.querySelectorAll('.debt-row').forEach((row) => {
      const id = parseInt(row.dataset.id, 10);
      row.addEventListener('click', () => openDetailModal(id));
    });
  }

  function renderTotals() {
    container.querySelector('#sn-total').textContent = formatVND(kind === 'phai-thu' ? totals.phai_thu : totals.phai_tra);
    container.querySelector('#sn-count').textContent = totals.count ?? 0;
  }

  async function loadAccounts() {
    if (accounts.length) return;
    try {
      const res = await api.get('/api/mgr/cash-accounts');
      accounts = res.accounts;
    } catch { /* bỏ qua, modal thu/trả nợ sẽ báo lỗi nếu chưa có nguồn tiền */ }
  }

  function openDebtModal() {
    const modal = openModal(`
      <h3>Ghi nợ mới — ${KIND_LABEL[kind]}</h3>
      <div class="field"><label>${kind === 'phai-thu' ? 'Tên khách' : 'Tên nhà cung cấp'}</label><input id="dn-name" type="text" /></div>
      <div class="field"><label>Số điện thoại</label><input id="dn-phone" type="tel" /></div>
      <div class="field"><label>Số tiền nợ</label><input id="dn-amount" type="number" min="0" /></div>
      <div class="field"><label>Hạn trả (không bắt buộc)</label><input id="dn-due" type="date" /></div>
      <div class="field"><label>Ghi chú</label><input id="dn-note" type="text" /></div>
      <button id="dn-submit" class="btn btn-primary" style="width:100%">Lưu khoản nợ</button>
    `);
    modal.overlay.querySelector('#dn-submit').addEventListener('click', async () => {
      const partner_name = modal.overlay.querySelector('#dn-name').value.trim();
      const amount = Number(modal.overlay.querySelector('#dn-amount').value);
      if (!partner_name || !amount || amount <= 0) { toast('Vui lòng nhập đủ tên và số tiền', 'error'); return; }
      try {
        await api.post('/api/mgr/debts', {
          kind,
          partner_name,
          partner_phone: modal.overlay.querySelector('#dn-phone').value.trim(),
          amount,
          due_date: modal.overlay.querySelector('#dn-due').value || null,
          note: modal.overlay.querySelector('#dn-note').value.trim(),
        });
        toast('Đã ghi nợ');
        modal.close();
        await load();
      } catch (err) {
        toast(err?.body?.message || 'Không ghi được nợ', 'error');
      }
    });
  }

  async function openDetailModal(id) {
    const modal = openModal('<p>Đang tải…</p>');
    await loadAccounts();
    try {
      const res = await api.get(`/api/mgr/debts/${id}`);
      renderDetail(modal, res.debt);
    } catch {
      modal.overlay.querySelector('.modal-box').innerHTML = '<p>Không tải được chi tiết khoản nợ.</p>';
    }
  }

  function renderDetail(modal, debt) {
    const payLabel = debt.kind === 'phai-thu' ? 'Thu nợ' : 'Trả nợ';
    modal.overlay.querySelector('.modal-box').innerHTML = `
      <h3>${escapeHtml(debt.partner_name)}</h3>
      <p>${escapeHtml(debt.partner_phone || '')} · ${STATUS_LABEL[debt.status] || debt.status}</p>
      <div class="pay-summary">
        <div><span>Tổng nợ</span><span>${formatVND(debt.amount)}</span></div>
        <div><span>Đã trả</span><span>${formatVND(debt.paid_amount)}</span></div>
        <div class="pay-total"><span>Còn lại</span><span>${formatVND(debt.remaining)}</span></div>
      </div>
      ${debt.note ? `<p>${escapeHtml(debt.note)}</p>` : ''}
      ${debt.status === 'open' ? `<button id="dd-pay" class="btn btn-primary" style="width:100%">${payLabel}</button>` : ''}
      ${debt.status === 'open' && canManage ? '<button id="dd-cancel" class="btn" style="width:100%;margin-top:8px;color:var(--danger)">Huỷ khoản nợ</button>' : ''}
      <div class="section-label">Lịch sử trả</div>
      <div id="dd-payments">
        ${(debt.payments || []).length ? debt.payments.map((p) => `
          <div class="tc-row ${p.voided_at ? 'voided' : ''}">
            <div class="tc-row-main">
              <div class="tc-row-top">
                <span class="tc-code">${escapeHtml(p.code)}</span>
                <span class="tc-amount thu">${formatVND(p.amount)}</span>
              </div>
              <div class="tc-row-meta">${new Date(p.occurred_at).toLocaleString('vi-VN')} · ${escapeHtml(p.created_by_name || '')}</div>
              ${p.voided_at ? '<div class="tc-voided-label">ĐÃ HUỶ</div>' : ''}
            </div>
          </div>
        `).join('') : '<p>Chưa có lần trả nào.</p>'}
      </div>
    `;
    const payBtn = modal.overlay.querySelector('#dd-pay');
    if (payBtn) payBtn.addEventListener('click', () => openPayModal(debt));
    const cancelBtn = modal.overlay.querySelector('#dd-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', () => cancelDebt(debt, modal));
  }

  function openPayModal(debt) {
    const payLabel = debt.kind === 'phai-thu' ? 'Thu nợ' : 'Trả nợ';
    const modal = openModal(`
      <h3>${payLabel} — ${escapeHtml(debt.partner_name)}</h3>
      <div class="field"><label>Số tiền</label><input id="pd-amount" type="number" min="0" value="${debt.remaining}" /></div>
      <div class="field"><label>Nguồn tiền</label>
        <select id="pd-account">${accounts.map((a) => `<option value="${a.id}" ${a.is_default ? 'selected' : ''}>${escapeHtml(a.name)}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Ghi chú</label><input id="pd-note" type="text" /></div>
      <button id="pd-submit" class="btn btn-primary" style="width:100%">Xác nhận ${payLabel.toLowerCase()}</button>
    `);
    modal.overlay.querySelector('#pd-submit').addEventListener('click', async () => {
      const amount = Number(modal.overlay.querySelector('#pd-amount').value);
      const account_id = modal.overlay.querySelector('#pd-account').value;
      if (!amount || amount <= 0) { toast('Vui lòng nhập số tiền hợp lệ', 'error'); return; }
      if (!account_id) { toast('Vui lòng chọn nguồn tiền', 'error'); return; }
      try {
        await api.post(`/api/mgr/debts/${debt.id}/pay`, {
          amount,
          account_id: Number(account_id),
          note: modal.overlay.querySelector('#pd-note').value.trim(),
        });
        toast('Đã ghi nhận thanh toán');
        modal.close();
        await load();
      } catch (err) {
        toast(err?.body?.message || 'Không lưu được', 'error');
      }
    });
  }

  async function cancelDebt(debt, modal) {
    const reason = window.prompt('Lý do huỷ khoản nợ:');
    if (reason === null) return;
    if (!reason.trim()) { toast('Vui lòng nhập lý do huỷ', 'error'); return; }
    try {
      await api.post(`/api/mgr/debts/${debt.id}/cancel`, { reason: reason.trim() });
      toast('Đã huỷ khoản nợ');
      modal.close();
      await load();
    } catch (err) {
      toast(err?.body?.message || 'Không huỷ được', 'error');
    }
  }

  async function load() {
    const el = container.querySelector('#sn-list');
    el.innerHTML = '<p>Đang tải…</p>';
    try {
      const params = new URLSearchParams({ kind });
      if (status) params.set('status', status);
      if (q) params.set('q', q);
      const res = await api.get(`/api/mgr/debts?${params.toString()}`);
      debts = res.debts;
      totals = res.totals;
      renderTotals();
      renderList();
    } catch (err) {
      if (err?.status !== 401 && err?.status !== 403) el.innerHTML = '<p>Không tải được danh sách nợ.</p>';
    }
  }

  await loadAccounts();
  await load();
}
