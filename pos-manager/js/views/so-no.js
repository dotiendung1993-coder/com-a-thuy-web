// GĐ2 — Sổ nợ 2 chiều: khách nợ quán / quán nợ NCC.
// Việc 2 (13/08/2026) — đổi vỏ ngoài (thanh tab dùng chung, hàng công cụ, thẻ số liệu, bảng) cho
// giống layout ảnh mẫu Website/tai chinh/app.sobanhang.com_mission-control (40).png: 2 tab lớn,
// 3 thẻ số liệu, ô tìm + lọc trạng thái + nút Xuất file, bảng danh sách thay vì list thẻ dọc.
// KHÔNG đổi logic nghiệp vụ (ghi nợ / thu-trả nợ / huỷ) — chỉ đổi cách hiển thị + thêm Xuất file.
import { api } from '../api.js';
import { formatVND, escapeHtml, toast, openModal, todayVN, promptDialog, pageTabsHtml } from '../ui.js';
import { icon } from '../icons.js';

const KIND_LABEL = { 'phai-thu': 'Khách nợ quán', 'phai-tra': 'Quán nợ NCC' };
const STATUS_LABEL = { open: 'Còn nợ', paid: 'Đã trả xong', cancelled: 'Đã huỷ' };
// Đợt 3 Task 8 (16/08/2026) — 5 lựa chọn sắp xếp, khớp whitelist `sort` mới của debt-service.listDebts().
const SORT_OPTIONS = [
  ['recent', 'Giao dịch gần nhất'],
  ['oldest', 'Giao dịch cũ nhất'],
  ['amount_desc', 'Số tiền giảm dần'],
  ['az', 'Tên A-Z'],
  ['za', 'Tên Z-A'],
];
const SORT_LABEL = Object.fromEntries(SORT_OPTIONS);

// Ngày theo giờ Việt Nam (xem ghi chú ở ui.js) — dùng để tô đỏ khoản nợ quá hạn
const todayStr = todayVN;

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.debt) {
    container.innerHTML = '<p>Bạn không có quyền xem màn hình này.</p>';
    return;
  }
  const canManage = !!perms.cash_manage;

  let selectedKinds = []; // [] = không lọc phân loại = tất cả (bỏ ràng buộc "luôn phải có 1 kind")
  let sort = 'recent';
  let status = 'open';
  let q = '';
  let debts = [];
  let totals = { phai_thu: 0, phai_tra: 0, net: 0, count: 0, phai_thu_qua_han: 0, phai_tra_qua_han: 0 };
  let accounts = [];
  // Xem ghi chú tương tự trong thu-chi.js: chặn phản hồi CŨ ghi đè kết quả của lượt lọc MỚI hơn khi
  // đổi tab Khách/NCC + trạng thái + tìm kiếm liên tiếp thật nhanh (từng thấy tiêu đề đổi đúng nhưng
  // dữ liệu dòng vẫn của bộ lọc trước).
  let loadSeq = 0;

  container.innerHTML = `
    ${pageTabsHtml('so-no', staff)}
    <div class="hd-head">
      <h3 class="hd-title">Sổ nợ</h3>
      <div class="hd-head-actions">
        <button type="button" class="btn btn-ghost" id="sn-export">${icon('tai-xuong')} Tải báo cáo</button>
        ${canManage ? `
          <button id="sn-add-thu" class="btn sn-btn-thu" type="button">Tôi đã đưa</button>
          <button id="sn-add-tra" class="btn sn-btn-tra" type="button">Tôi đã nhận</button>
        ` : ''}
      </div>
    </div>
    <div class="hd-tools">
      <label class="hd-search">
        <span class="inline-ico">${icon('tim-kiem')}</span>
        <input id="sn-search" type="search" placeholder="Tìm khách hàng, nhà cung cấp" aria-label="Tìm khoản nợ" />
      </label>
      <select id="sn-status">
        <option value="open">Còn nợ</option>
        <option value="paid">Đã trả xong</option>
        <option value="cancelled">Đã huỷ</option>
        <option value="">Tất cả trạng thái</option>
      </select>
      <div class="sn-filter-wrap" id="sn-kind-wrap">
        <button type="button" class="btn btn-ghost sn-filter-pill" id="sn-kind-btn" aria-haspopup="true" aria-expanded="false">Phân loại ▾</button>
        <div class="sn-filter-pop hidden" id="sn-kind-pop" role="dialog" aria-label="Lọc theo phân loại">
          <label class="sn-filter-row"><input type="checkbox" id="sn-kind-thu" /> <span>Tôi phải thu</span></label>
          <label class="sn-filter-row"><input type="checkbox" id="sn-kind-tra" /> <span>Tôi phải trả</span></label>
        </div>
      </div>
      <div class="sn-filter-wrap" id="sn-sort-wrap">
        <button type="button" class="btn btn-ghost sn-filter-pill" id="sn-sort-btn" aria-haspopup="true" aria-expanded="false">${escapeHtml(SORT_LABEL.recent)} ▾</button>
        <div class="sn-sort-pop hidden" id="sn-sort-pop" role="dialog" aria-label="Sắp xếp">
          ${SORT_OPTIONS.map(([v, label]) => `<button type="button" class="sn-sort-opt${v === 'recent' ? ' active' : ''}" data-sort="${v}">${escapeHtml(label)}</button>`).join('')}
        </div>
      </div>
      <div class="ord-cols-wrap" id="sn-cols-wrap">
        <button id="sn-cols-btn" class="btn btn-ghost ord-cols-btn" type="button" aria-haspopup="true" aria-expanded="false">Hiện thị cột ▾</button>
        <div id="sn-cols-pop" class="ord-cols-pop hidden" role="dialog" aria-label="Chọn cột hiển thị"></div>
      </div>
    </div>
    <div class="hd-stats sn-kpi-row" id="sn-stats"></div>
    <div id="sn-list"><p>Đang tải…</p></div>
  `;

  if (canManage) {
    container.querySelector('#sn-add-thu').addEventListener('click', () => openDebtModal('phai-thu'));
    container.querySelector('#sn-add-tra').addEventListener('click', () => openDebtModal('phai-tra'));
  }

  // ── Đợt 3 Task 8 (16/08/2026) — filter "Phân loại" (checkbox) + sort + hiện/ẩn cột ─────────
  const closeAllSnPops = () => {
    container.querySelector('#sn-kind-pop')?.classList.add('hidden');
    container.querySelector('#sn-sort-pop')?.classList.add('hidden');
    container.querySelector('#sn-cols-pop')?.classList.add('hidden');
    container.querySelector('#sn-kind-btn')?.setAttribute('aria-expanded', 'false');
    container.querySelector('#sn-sort-btn')?.setAttribute('aria-expanded', 'false');
    container.querySelector('#sn-cols-btn')?.setAttribute('aria-expanded', 'false');
  };
  document.addEventListener('click', closeAllSnPops);
  container.querySelector('#sn-kind-wrap').addEventListener('click', (e) => e.stopPropagation());
  container.querySelector('#sn-sort-wrap').addEventListener('click', (e) => e.stopPropagation());
  container.querySelector('#sn-cols-wrap').addEventListener('click', (e) => e.stopPropagation());

  container.querySelector('#sn-kind-btn').addEventListener('click', () => {
    const pop = container.querySelector('#sn-kind-pop');
    const show = pop.classList.contains('hidden');
    closeAllSnPops();
    pop.classList.toggle('hidden', !show);
    container.querySelector('#sn-kind-btn').setAttribute('aria-expanded', String(show));
  });
  [['sn-kind-thu', 'phai-thu'], ['sn-kind-tra', 'phai-tra']].forEach(([id, kindValue]) => {
    container.querySelector(`#${id}`).addEventListener('change', (e) => {
      if (e.target.checked) { if (!selectedKinds.includes(kindValue)) selectedKinds.push(kindValue); }
      else selectedKinds = selectedKinds.filter((k) => k !== kindValue);
      load();
    });
  });

  container.querySelector('#sn-sort-btn').addEventListener('click', () => {
    const pop = container.querySelector('#sn-sort-pop');
    const show = pop.classList.contains('hidden');
    closeAllSnPops();
    pop.classList.toggle('hidden', !show);
    container.querySelector('#sn-sort-btn').setAttribute('aria-expanded', String(show));
  });
  container.querySelector('#sn-sort-pop').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-sort]');
    if (!btn) return;
    sort = btn.dataset.sort;
    container.querySelector('#sn-sort-btn').innerHTML = `${escapeHtml(SORT_LABEL[sort])} ▾`;
    container.querySelectorAll('#sn-sort-pop [data-sort]').forEach((b) => b.classList.toggle('active', b === btn));
    closeAllSnPops();
    load();
  });

  container.querySelector('#sn-cols-btn').addEventListener('click', () => {
    const pop = container.querySelector('#sn-cols-pop');
    const show = pop.classList.contains('hidden');
    closeAllSnPops();
    if (show) openSnColPop();
  });
  container.querySelector('#sn-status').addEventListener('change', (e) => { status = e.target.value; load(); });
  container.querySelector('#sn-search').addEventListener('input', (e) => { q = e.target.value; load(); });
  container.querySelector('#sn-export').addEventListener('click', () => {
    if (!debts.length) { toast('Không có khoản nợ nào để xuất', 'error'); return; }
    const head = ['Tên', 'Điện thoại', 'Phân loại', 'Số tiền nợ', 'Đã trả', 'Còn lại', 'Hạn trả', 'Trạng thái'];
    const cell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = debts.map((d) => [
      d.partner_name, d.partner_phone || '', d.kind_label || KIND_LABEL[d.kind] || d.kind,
      Number(d.amount) || 0, Number(d.paid_amount) || 0,
      Number(d.remaining) || 0, d.due_date ? new Date(d.due_date).toLocaleDateString('vi-VN') : '',
      STATUS_LABEL[d.status] || d.status,
    ].map(cell).join(','));
    const blob = new Blob([`﻿${head.map(cell).join(',')}\n${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `so-no-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(`Đã xuất ${debts.length} khoản nợ`);
  });

  function overdue(d) {
    return d.status === 'open' && d.due_date && new Date(d.due_date) < new Date(todayStr());
  }

  function renderList() {
    const el = container.querySelector('#sn-list');
    if (!debts.length) {
      el.innerHTML = `<div class="hd-empty">${icon('tim-kiem')}<p>Không có khoản nợ nào phù hợp</p></div>`;
      return;
    }
    el.innerHTML = `
      <div class="hd-table-wrap">
        <table class="hd-table" id="sn-table">
          <thead><tr>
            <th>Đối tác</th><th>Điện thoại</th>
            <th data-col="col-kind">Phân loại</th>
            <th class="hd-num">Số tiền nợ</th><th class="hd-num">Còn lại</th>
            <th>Hạn trả</th><th>Trạng thái</th>
            <th data-col="col-last">Giao dịch cuối</th>
          </tr></thead>
          <tbody>
            ${debts.map((d) => `
              <tr class="hd-row-click ${overdue(d) ? 'hd-row-danger' : ''}" data-id="${d.id}">
                <td>${escapeHtml(d.partner_name)}</td>
                <td>${escapeHtml(d.partner_phone || '—')}</td>
                <td data-col="col-kind">${escapeHtml(d.kind_label || KIND_LABEL[d.kind] || d.kind)}</td>
                <td class="hd-num">${escapeHtml(formatVND(d.amount))}</td>
                <td class="hd-num">${escapeHtml(formatVND(d.remaining))}</td>
                <td>${d.due_date ? escapeHtml(new Date(d.due_date).toLocaleDateString('vi-VN')) : '—'}${overdue(d) ? ' <b class="hd-overdue">QUÁ HẠN</b>' : ''}</td>
                <td>${escapeHtml(STATUS_LABEL[d.status] || d.status)}</td>
                <td data-col="col-last">${d.updated_at ? escapeHtml(new Date(d.updated_at).toLocaleDateString('vi-VN')) : '—'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <p class="hint">Hiện ${debts.length} khoản nợ.</p>
    `;
    el.querySelectorAll('[data-id]').forEach((row) => {
      row.addEventListener('click', () => openDetailModal(parseInt(row.dataset.id, 10)));
    });
  }

  // ── Đợt 3 Task 8 (16/08/2026) — hiện/ẩn cột (copy pattern orders.js Task 6 Đợt 2), chỉ 2 cột
  // khả thi: Phân loại (kind_label) và Giao dịch cuối (d.updated_at — có sẵn, KHÔNG cần sửa
  // backend: payDebt() set updated_at=NOW() mỗi lần thu/trả nợ). ──
  const SN_COL_KEY = 'posmgr.sono.cols.v1';
  const SN_TOGGLEABLE_COLS = [
    { id: 'col-kind', label: 'Phân loại' },
    { id: 'col-last', label: 'Giao dịch cuối' },
  ];
  function getSnHiddenCols() {
    try { return JSON.parse(localStorage.getItem(SN_COL_KEY) || '[]'); } catch { return []; }
  }
  function saveSnHiddenCols(arr) {
    try { localStorage.setItem(SN_COL_KEY, JSON.stringify(arr)); } catch { /* private mode */ }
  }
  function applyColVisibility() {
    const hidden = getSnHiddenCols();
    const table = container.querySelector('#sn-table');
    if (!table) return;
    SN_TOGGLEABLE_COLS.forEach(({ id }) => {
      const isHidden = hidden.includes(id);
      table.querySelectorAll(`[data-col="${id}"]`).forEach((el) => el.classList.toggle('sn-col-hidden', isHidden));
    });
  }
  function openSnColPop() {
    const pop = container.querySelector('#sn-cols-pop');
    const btn = container.querySelector('#sn-cols-btn');
    if (!pop || !btn) return;
    const hidden = getSnHiddenCols();
    pop.innerHTML = SN_TOGGLEABLE_COLS.map(({ id, label }) => `
      <label class="ord-col-row">
        <input type="checkbox" data-col-toggle="${id}" ${hidden.includes(id) ? '' : 'checked'} />
        <span>${label}</span>
      </label>`).join('');
    pop.querySelectorAll('[data-col-toggle]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const id = cb.dataset.colToggle;
        const h = getSnHiddenCols();
        if (cb.checked) { const i = h.indexOf(id); if (i !== -1) h.splice(i, 1); }
        else if (!h.includes(id)) h.push(id);
        saveSnHiddenCols(h);
        applyColVisibility();
      });
    });
    pop.classList.remove('hidden');
    btn.setAttribute('aria-expanded', 'true');
  }

  function renderTotals() {
    // Đợt 3 Task 7 (16/08/2026) — 4 thẻ LUÔN hiện (không phụ thuộc tab/filter đang chọn), khớp
    // ảnh mẫu Sổ nợ. 2 thẻ quá hạn dùng field mới phai_thu_qua_han/phai_tra_qua_han từ Task 2
    // backend — fallback 0 nếu backend chưa có field này.
    const cards = [
      ['sn-kpi-thu', 'Phải thu', formatVND(Number(totals.phai_thu) || 0)],
      ['sn-kpi-tra', 'Phải trả', formatVND(Number(totals.phai_tra) || 0)],
      ['sn-kpi-thu-qh', 'Phải thu quá hạn', formatVND(Number(totals.phai_thu_qua_han) || 0)],
      ['sn-kpi-tra-qh', 'Phải trả quá hạn', formatVND(Number(totals.phai_tra_qua_han) || 0)],
    ];
    container.querySelector('#sn-stats').innerHTML = cards.map(([cls, label, value]) => `
      <div class="hd-stat sn-kpi ${cls}">
        <div class="hd-stat-value">${escapeHtml(value)}</div>
        <div class="hd-stat-label">${escapeHtml(label)}</div>
      </div>`).join('');
  }

  async function loadAccounts() {
    if (accounts.length) return;
    try {
      const res = await api.get('/api/mgr/cash-accounts');
      accounts = res.accounts;
    } catch { /* bỏ qua, modal thu/trả nợ sẽ báo lỗi nếu chưa có nguồn tiền */ }
  }

  function openDebtModal(presetKind = 'phai-thu') {
    const dnKind = presetKind;
    const modal = openModal(`
      <h3>Ghi nợ mới — ${KIND_LABEL[dnKind]}</h3>
      <div class="field"><label>${dnKind === 'phai-thu' ? 'Tên khách' : 'Tên nhà cung cấp'}</label><input id="dn-name" type="text" autocomplete="off" /></div>
      <div class="field sn-suggest-wrap">
        <label>Số điện thoại</label>
        <input id="dn-phone" type="tel" autocomplete="off" />
        <div id="dn-suggest" class="sn-suggest-pop hidden"></div>
      </div>
      <div class="field"><label>Số tiền nợ</label><input id="dn-amount" type="number" min="0" /></div>
      <div class="field"><label>Hạn trả (không bắt buộc)</label><input id="dn-due" type="date" /></div>
      <div class="field"><label>Ghi chú</label><input id="dn-note" type="text" /></div>
      <button id="dn-submit" class="btn btn-primary" style="width:100%">Lưu khoản nợ</button>
    `);

    // Đợt 3 Task 9 (16/08/2026) — gợi ý tự động điền đối tác. API sẵn có CHỈ lọc theo `phone`,
    // không nhận tham số tìm theo tên — gắn vào ô SỐ ĐIỆN THOẠI để gọi đúng API thật, không sửa
    // backend (đúng ràng buộc "không sửa route ngoài phần đã liệt kê ở spec").
    const dnPhoneInput = modal.overlay.querySelector('#dn-phone');
    const dnNameInput = modal.overlay.querySelector('#dn-name');
    const dnSuggestBox = modal.overlay.querySelector('#dn-suggest');
    let dnSuggestTimer = null;
    dnPhoneInput.addEventListener('input', () => {
      clearTimeout(dnSuggestTimer);
      const q = dnPhoneInput.value.trim();
      if (q.length < 3) { dnSuggestBox.classList.add('hidden'); dnSuggestBox.innerHTML = ''; return; }
      dnSuggestTimer = setTimeout(async () => {
        try {
          const res = await api.get(`/api/mgr/customers/search?phone=${encodeURIComponent(q)}`);
          const list = res.customers || [];
          if (!list.length) { dnSuggestBox.classList.add('hidden'); dnSuggestBox.innerHTML = ''; return; }
          dnSuggestBox.innerHTML = list.map((c) => `
            <button type="button" class="sn-suggest-item" data-name="${escapeHtml(c.name)}" data-phone="${escapeHtml(c.phone)}">
              <b>${escapeHtml(c.name)}</b><span>${escapeHtml(c.phone)}</span>
            </button>`).join('');
          dnSuggestBox.classList.remove('hidden');
        } catch { /* mất mạng thì thôi, nhân viên vẫn tự gõ tay được */ }
      }, 300);
    });
    dnSuggestBox.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-name]');
      if (!btn) return;
      dnNameInput.value = btn.dataset.name;
      dnPhoneInput.value = btn.dataset.phone;
      dnSuggestBox.classList.add('hidden');
      dnSuggestBox.innerHTML = '';
    });
    document.addEventListener('click', (e) => {
      if (!modal.overlay.contains(e.target)) return;
      if (!e.target.closest('.sn-suggest-wrap')) dnSuggestBox.classList.add('hidden');
    });

    modal.overlay.querySelector('#dn-submit').addEventListener('click', async () => {
      const partner_name = modal.overlay.querySelector('#dn-name').value.trim();
      const amount = Number(modal.overlay.querySelector('#dn-amount').value);
      if (!partner_name || !amount || amount <= 0) { toast('Vui lòng nhập đủ tên và số tiền', 'error'); return; }
      try {
        await api.post('/api/mgr/debts', {
          kind: dnKind,
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
    if (payBtn) payBtn.addEventListener('click', () => openPayModal(debt, modal));
    const cancelBtn = modal.overlay.querySelector('#dd-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', () => cancelDebt(debt, modal));
  }

  // `detailModal` = modal "chi tiết khoản nợ" đang mở phía sau (renderDetail gọi hàm này) — cần giữ
  // lại để vẽ lại nó sau khi thu/trả nợ xong, nếu không nó vẫn hiện Đã trả/Còn lại/Lịch sử trả CŨ.
  function openPayModal(debt, detailModal) {
    const payLabel = debt.kind === 'phai-thu' ? 'Thu nợ' : 'Trả nợ';
    const payModal = openModal(`
      <h3>${payLabel} — ${escapeHtml(debt.partner_name)}</h3>
      <div class="field"><label>Số tiền</label><input id="pd-amount" type="number" min="0" value="${debt.remaining}" /></div>
      <div class="field"><label>Nguồn tiền</label>
        <select id="pd-account">${accounts.map((a) => `<option value="${a.id}" ${a.is_default ? 'selected' : ''}>${escapeHtml(a.name)}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Ghi chú</label><input id="pd-note" type="text" /></div>
      <button id="pd-submit" class="btn btn-primary" style="width:100%">Xác nhận ${payLabel.toLowerCase()}</button>
    `);
    payModal.overlay.querySelector('#pd-submit').addEventListener('click', async () => {
      const amount = Number(payModal.overlay.querySelector('#pd-amount').value);
      const account_id = payModal.overlay.querySelector('#pd-account').value;
      if (!amount || amount <= 0) { toast('Vui lòng nhập số tiền hợp lệ', 'error'); return; }
      if (!account_id) { toast('Vui lòng chọn nguồn tiền', 'error'); return; }
      try {
        await api.post(`/api/mgr/debts/${debt.id}/pay`, {
          amount,
          account_id: Number(account_id),
          note: payModal.overlay.querySelector('#pd-note').value.trim(),
        });
        toast('Đã ghi nhận thanh toán');
        payModal.close();
        // Vẽ lại modal chi tiết với số liệu mới ngay — tránh nhân viên nhìn số cũ tưởng chưa ghi
        // nhận rồi bấm thu/trả nợ thêm lần nữa (trả trùng).
        const fresh = await api.get(`/api/mgr/debts/${debt.id}`);
        renderDetail(detailModal, fresh.debt);
        await load();
      } catch (err) {
        toast(err?.body?.message || 'Không lưu được', 'error');
      }
    });
  }

  async function cancelDebt(debt, modal) {
    const reason = await promptDialog('Lý do huỷ khoản nợ:', { required: true });
    if (!reason) return;
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
    const mySeq = ++loadSeq;
    const el = container.querySelector('#sn-list');
    el.innerHTML = '<p>Đang tải…</p>';
    try {
      const params = new URLSearchParams();
      // Đợt 3 Task 8 — bỏ ràng buộc "luôn phải gửi 1 kind": 0 hoặc 2 lựa chọn = không lọc
      // (tất cả), đúng 1 lựa chọn = lọc như 2 tab cũ. listDebts() đã coi kind optional.
      if (selectedKinds.length === 1) params.set('kind', selectedKinds[0]);
      if (status) params.set('status', status);
      if (q) params.set('q', q);
      if (sort && sort !== 'recent') params.set('sort', sort);
      const res = await api.get(`/api/mgr/debts?${params.toString()}`);
      if (mySeq !== loadSeq) return;
      debts = res.debts;
      totals = res.totals;
      renderTotals();
      renderList();
      applyColVisibility();
    } catch (err) {
      if (mySeq !== loadSeq) return;
      if (err?.status !== 401 && err?.status !== 403) el.innerHTML = '<p>Không tải được danh sách nợ.</p>';
    }
  }

  await loadAccounts();
  await load();
}
