// GĐ2 — Nguồn tiền: danh sách nguồn tiền + số dư, thêm/sửa/bật-tắt/đặt mặc định.
import { api } from '../api.js';
import { formatVND, escapeHtml, toast, openModal, confirmDialog } from '../ui.js';

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.cash) {
    container.innerHTML = '<p>Bạn không có quyền xem màn hình này.</p>';
    return;
  }
  const canManage = !!perms.cash_manage;

  let accounts = [];
  let kinds = [];

  container.innerHTML = `
    <div class="section-label">Tổng số dư</div>
    <div class="today-card" id="ntien-total"><div class="today-card-loading">Đang tải…</div></div>
    ${canManage ? `
      <div style="display:flex;gap:8px;margin:12px 0">
        <button id="ntien-add" class="btn btn-primary" style="flex:1">+ Thêm nguồn tiền</button>
        <button id="ntien-transfer" class="btn" style="flex:1">Chuyển tiền</button>
      </div>
    ` : ''}
    <div id="ntien-list"><p>Đang tải…</p></div>
  `;

  if (canManage) {
    container.querySelector('#ntien-add').addEventListener('click', () => openForm());
    container.querySelector('#ntien-transfer').addEventListener('click', () => openTransfer());
  }

  function renderTotal() {
    const total = accounts.reduce((s, a) => s + Number(a.balance || 0), 0);
    container.querySelector('#ntien-total').innerHTML = `
      <div class="today-card-title">TỔNG SỐ DƯ</div>
      <div class="today-stats"><div class="today-stat"><span class="value">${formatVND(total)}</span></div></div>
    `;
  }

  function renderList() {
    const el = container.querySelector('#ntien-list');
    if (!accounts.length) { el.innerHTML = '<p>Chưa có nguồn tiền nào.</p>'; return; }
    el.innerHTML = accounts.map((a) => `
      <div class="cash-account-row ${a.active ? '' : 'inactive'}">
        <div class="cash-account-main">
          <div class="cash-account-name">
            ${escapeHtml(a.name)}
            ${a.is_default ? '<span class="badge-default">Mặc định</span>' : ''}
            ${a.active ? '' : ' · Đã tắt'}
          </div>
          <div class="cash-account-meta">
            ${escapeHtml(a.kind_label || a.kind)}
            ${a.bank_name ? ' · ' + escapeHtml(a.bank_name) : ''}
            ${a.account_no ? ' · ' + escapeHtml(a.account_no) : ''}
          </div>
          ${a.note ? `<div class="cash-account-meta">${escapeHtml(a.note)}</div>` : ''}
        </div>
        <div class="cash-account-balance">${formatVND(a.balance)}</div>
        ${canManage ? `
          <div class="cash-account-actions">
            <button data-action="edit" data-id="${a.id}">Sửa</button>
            ${a.is_default ? '' : `<button data-action="default" data-id="${a.id}">Đặt mặc định</button>`}
            <button data-action="toggle" data-id="${a.id}">${a.active ? 'Tắt' : 'Bật'}</button>
          </div>
        ` : ''}
      </div>
    `).join('');

    if (canManage) {
      el.querySelectorAll('[data-action]').forEach((btn) => {
        const id = parseInt(btn.dataset.id, 10);
        const acc = accounts.find((a) => a.id === id);
        btn.addEventListener('click', () => {
          if (btn.dataset.action === 'edit') openForm(acc);
          else if (btn.dataset.action === 'default') setDefault(acc);
          else if (btn.dataset.action === 'toggle') toggleActive(acc);
        });
      });
    }
  }

  async function setDefault(acc) {
    try {
      await api.patch(`/api/mgr/cash-accounts/${acc.id}`, { is_default: true });
      toast('Đã đặt làm nguồn mặc định');
      await load();
    } catch (err) {
      toast(err?.body?.message || 'Không đặt được mặc định', 'error');
    }
  }

  async function toggleActive(acc) {
    if (acc.active && !(await confirmDialog(`Tắt nguồn tiền "${acc.name}"?`))) return;
    try {
      await api.patch(`/api/mgr/cash-accounts/${acc.id}`, { active: !acc.active });
      toast(acc.active ? 'Đã tắt nguồn tiền' : 'Đã bật lại nguồn tiền');
      await load();
    } catch (err) {
      toast(err?.body?.message || 'Không cập nhật được', 'error');
    }
  }

  function openForm(acc) {
    const isEdit = !!acc;
    const kindOptions = kinds.map((k) => `<option value="${k.value}" ${acc && acc.kind === k.value ? 'selected' : ''}>${escapeHtml(k.label)}</option>`).join('');
    const modal = openModal(`
      <h3>${isEdit ? 'Sửa nguồn tiền' : 'Thêm nguồn tiền'}</h3>
      <div class="field"><label>Tên nguồn tiền</label><input id="nt-name" type="text" value="${acc ? escapeHtml(acc.name) : ''}" /></div>
      <div class="field"><label>Loại</label><select id="nt-kind" ${isEdit ? 'disabled' : ''}>${kindOptions}</select></div>
      <div class="field"><label>Ngân hàng (nếu có)</label><input id="nt-bank" type="text" value="${acc ? escapeHtml(acc.bank_name || '') : ''}" /></div>
      <div class="field"><label>Số tài khoản</label><input id="nt-accno" type="text" value="${acc ? escapeHtml(acc.account_no || '') : ''}" /></div>
      <div class="field"><label>Chủ tài khoản</label><input id="nt-holder" type="text" value="${acc ? escapeHtml(acc.account_holder || '') : ''}" /></div>
      ${isEdit ? '' : '<div class="field"><label>Số dư ban đầu</label><input id="nt-opening" type="number" value="0" /></div>'}
      <div class="field"><label>Ghi chú</label><input id="nt-note" type="text" value="${acc ? escapeHtml(acc.note || '') : ''}" /></div>
      <label style="display:flex;align-items:center;gap:8px;margin:8px 0">
        <input id="nt-default" type="checkbox" style="width:auto;min-height:auto" ${acc && acc.is_default ? 'checked' : ''} /> Đặt làm nguồn mặc định
      </label>
      <button id="nt-submit" class="btn btn-primary" style="width:100%">${isEdit ? 'Lưu' : 'Tạo nguồn tiền'}</button>
    `);
    modal.overlay.querySelector('#nt-submit').addEventListener('click', async () => {
      const name = modal.overlay.querySelector('#nt-name').value.trim();
      if (!name) { toast('Vui lòng nhập tên nguồn tiền', 'error'); return; }
      const payload = {
        name,
        bank_name: modal.overlay.querySelector('#nt-bank').value.trim(),
        account_no: modal.overlay.querySelector('#nt-accno').value.trim(),
        account_holder: modal.overlay.querySelector('#nt-holder').value.trim(),
        note: modal.overlay.querySelector('#nt-note').value.trim(),
        is_default: modal.overlay.querySelector('#nt-default').checked,
      };
      try {
        if (isEdit) {
          await api.patch(`/api/mgr/cash-accounts/${acc.id}`, payload);
          toast('Đã lưu');
        } else {
          payload.kind = modal.overlay.querySelector('#nt-kind').value;
          payload.opening_balance = Number(modal.overlay.querySelector('#nt-opening').value) || 0;
          await api.post('/api/mgr/cash-accounts', payload);
          toast('Đã tạo nguồn tiền');
        }
        modal.close();
        await load();
      } catch (err) {
        toast(err?.body?.message || 'Không lưu được', 'error');
      }
    });
  }

  function openTransfer() {
    const activeAccounts = accounts.filter((a) => a.active);
    if (activeAccounts.length < 2) {
      import('../ui.js').then(({ toast }) => toast('Cần ít nhất 2 nguồn tiền đang hoạt động để chuyển tiền', 'error'));
      return;
    }
    const opts = activeAccounts.map((a) => `<option value="${a.id}">${escapeHtml(a.name)} (${formatVND(a.balance)})</option>`).join('');
    const modal = openModal(`
      <h3>Chuyển tiền</h3>
      <div class="field"><label>Từ nguồn tiền</label><select id="nt-from">${opts}</select></div>
      <div class="field"><label>Đến nguồn tiền</label><select id="nt-to">${opts}</select></div>
      <div class="field"><label>Số tiền</label><input id="nt-amt" type="number" min="1" placeholder="0" /></div>
      <div class="field"><label>Ghi chú</label><input id="nt-note" type="text" placeholder="Ví dụ: Nạp tiền ATM" /></div>
      <button id="nt-ok" class="btn btn-primary" style="width:100%">Chuyển tiền</button>
    `);
    // Mặc định đến = tài khoản thứ 2
    const toSel = modal.overlay.querySelector('#nt-to');
    if (toSel.options.length > 1) toSel.selectedIndex = 1;

    modal.overlay.querySelector('#nt-ok').addEventListener('click', async () => {
      const fromId = Number(modal.overlay.querySelector('#nt-from').value);
      const toId   = Number(modal.overlay.querySelector('#nt-to').value);
      const amount = Number(modal.overlay.querySelector('#nt-amt').value);
      const note   = modal.overlay.querySelector('#nt-note').value.trim();
      if (fromId === toId) { toast('Nguồn tiền đi và đến phải khác nhau', 'error'); return; }
      if (!amount || amount <= 0) { toast('Vui lòng nhập số tiền hợp lệ', 'error'); return; }
      try {
        const res = await api.post('/api/mgr/cash-accounts/transfer', { from_account_id: fromId, to_account_id: toId, amount, note });
        toast(`Đã chuyển ${formatVND(amount)} — mã ${res.ref_code}`);
        modal.close();
        await load();
      } catch (err) {
        toast(err?.body?.message || 'Không chuyển được tiền', 'error');
      }
    });
  }

  async function load() {
    try {
      const res = await api.get('/api/mgr/cash-accounts');
      accounts = res.accounts;
      kinds = res.kinds;
      renderTotal();
      renderList();
    } catch (err) {
      container.querySelector('#ntien-list').innerHTML = '<p>Không tải được danh sách nguồn tiền.</p>';
    }
  }

  await load();
}
