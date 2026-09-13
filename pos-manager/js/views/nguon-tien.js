// GĐ2 — Nguồn tiền: danh sách nguồn tiền + số dư, thêm/sửa/bật-tắt/đặt mặc định.
import { api } from '../api.js';
import { formatVND, escapeHtml, toast, openModal, confirmDialog, pageTabsHtml } from '../ui.js';
import { icon } from '../icons.js';

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
    ${pageTabsHtml('nguon-tien', staff)}
    <div class="hd-head">
      <h3 class="hd-title">Nguồn tiền</h3>
      ${canManage ? `
        <div class="hd-head-actions">
          <button type="button" class="btn btn-ghost" id="ntien-transfer">${icon('chuyen-tien')} Chuyển tiền</button>
          <button type="button" class="btn btn-primary" id="ntien-add">+ Tạo nguồn tiền mới</button>
        </div>
      ` : ''}
    </div>
    <div class="sbh-card" style="padding:0">
      <div class="sbh-card-tools">
        <input id="ntien-search" class="sbh-card-search" type="search" placeholder="Tìm nguồn tiền..." aria-label="Tìm nguồn tiền" />
      </div>
      <div id="ntien-list"><p style="padding:16px">Đang tải…</p></div>
    </div>
  `;

  if (canManage) {
    container.querySelector('#ntien-add').addEventListener('click', () => openForm());
    container.querySelector('#ntien-transfer').addEventListener('click', () => openTransfer());
  }
  container.querySelector('#ntien-search').addEventListener('input', () => renderList());

  let openMenuEl = null;
  function closeRowMenu() {
    if (openMenuEl) { openMenuEl.remove(); openMenuEl = null; }
    container.querySelectorAll('.ord-kebab[aria-expanded="true"]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
  }
  function openRowMenu(btn, acc) {
    const wasOpen = btn.getAttribute('aria-expanded') === 'true';
    closeRowMenu();
    if (wasOpen) return;
    const menu = document.createElement('div');
    menu.className = 'row-menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = `
      <button type="button" role="menuitem" data-act="edit">Sửa</button>
      ${acc.is_default ? '' : '<button type="button" role="menuitem" data-act="default">Đặt mặc định</button>'}
      <button type="button" role="menuitem" data-act="toggle">${acc.active ? 'Tắt' : 'Bật'}</button>`;
    document.body.appendChild(menu);
    const r = btn.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = `${r.bottom + 4}px`;
    menu.style.right = `${window.innerWidth - r.right}px`;
    menu.querySelectorAll('[data-act]').forEach((mi) => {
      mi.addEventListener('click', () => {
        closeRowMenu();
        if (mi.dataset.act === 'edit') openForm(acc);
        else if (mi.dataset.act === 'default') setDefault(acc);
        else if (mi.dataset.act === 'toggle') toggleActive(acc);
      });
    });
    btn.setAttribute('aria-expanded', 'true');
    openMenuEl = menu;
  }
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.row-menu') && !e.target.closest('.ord-kebab')) closeRowMenu();
  });

  function renderList() {
    const el = container.querySelector('#ntien-list');
    const q = (container.querySelector('#ntien-search')?.value || '').trim().toLowerCase();
    const filtered = q ? accounts.filter((a) => a.name.toLowerCase().includes(q)) : accounts;
    if (!filtered.length) {
      el.innerHTML = `<p class="hd-empty">${q ? 'Không tìm thấy nguồn tiền phù hợp.' : 'Chưa có nguồn tiền nào.'}</p>`;
      return;
    }
    el.innerHTML = `
      <div style="overflow-x:auto">
        <table class="sp-table" style="width:100%;min-width:380px;border-radius:0">
          <thead><tr><th>Tên nguồn tiền</th><th class="hd-num">Số dư</th>${canManage ? '<th style="width:48px"></th>' : ''}</tr></thead>
          <tbody>
            ${filtered.map((a) => `
              <tr class="${a.active ? '' : 'hd-row-voided'}">
                <td>
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
                </td>
                <td class="hd-num">${formatVND(a.balance)}</td>
                ${canManage ? `
                  <td class="ord-td-act">
                    <button type="button" class="ord-kebab" data-id="${a.id}" aria-haspopup="menu" aria-expanded="false" aria-label="Thao tác với ${escapeHtml(a.name)}">${icon('them')}</button>
                  </td>
                ` : ''}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
    if (canManage) {
      el.querySelectorAll('.ord-kebab').forEach((btn) => {
        const id = parseInt(btn.dataset.id, 10);
        const acc = accounts.find((a) => a.id === id);
        btn.addEventListener('click', (e) => { e.stopPropagation(); openRowMenu(btn, acc); });
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
    if (acc.active) {
      // Task (14/08/2026): cảnh báo rõ số dư còn lại khi tắt — tắt vẫn giữ nguyên số dư (không mất
      // tiền, đã xác nhận ở audit Sổ tiền cùng ngày) nhưng chủ quán cần biết trước khi bấm.
      const bal = Number(acc.balance || 0);
      const msg = bal > 0
        ? `Nguồn tiền "${acc.name}" hiện còn ${formatVND(bal)}. Tắt đi KHÔNG làm mất số tiền này (vẫn cộng vào Tổng số dư, bật lại xem được bình thường) — bạn có chắc muốn tắt?`
        : `Tắt nguồn tiền "${acc.name}"?`;
      if (!(await confirmDialog(msg))) return;
    }
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
      <div class="field">
        <label>Ngưỡng cảnh báo sắp hết (để trống = không cảnh báo)</label>
        <input id="nt-low-threshold" type="number" min="0" value="${acc && acc.low_balance_threshold != null ? acc.low_balance_threshold : ''}" placeholder="VD: 500000" />
      </div>
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
        low_balance_threshold: modal.overlay.querySelector('#nt-low-threshold').value.trim() || null,
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
      // ?all=1: phải xin cả nguồn tiền đã tắt — renderList()/renderTotal() bên dưới đã có sẵn
      // chỗ hiện "· Đã tắt" + nút Bật + cộng số dư của nó vào tổng (tắt không có nghĩa tiền biến
      // mất). Thiếu ?all=1 thì API tự lọc theo WHERE a.active, nguồn đã tắt biến mất khỏi cả
      // danh sách lẫn Tổng số dư dù tiền vẫn còn thật trong đó.
      const res = await api.get('/api/mgr/cash-accounts?all=1');
      accounts = res.accounts;
      kinds = res.kinds;
      renderList();
    } catch (err) {
      container.querySelector('#ntien-list').innerHTML = '<p>Không tải được danh sách nguồn tiền.</p>';
    }
  }

  await load();
}
