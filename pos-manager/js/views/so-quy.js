// GĐ2 — Sổ quỹ: tồn đầu/thu/chi/tồn cuối theo nguồn tiền + dòng tiền theo ngày.
// Việc 2 (13/08/2026) — đổi vỏ ngoài cho giống layout ảnh mẫu Website/tai chinh/
// app.sobanhang.com_mission-control (42+43).png: "Sổ quỹ Tiền mặt" — 1 tab riêng cho mỗi nguồn
// tiền (+ "Tất cả"), 3 thẻ số liệu (Số dư đầu kỳ/Tổng thu/Tổng chi), ô tìm + khoảng ngày + lọc,
// bảng phiếu có cột Ẩn/Hiện, nút Khoản thu/Khoản chi/Xuất file. Trước đây chỉ có 1 bảng TỔNG các
// nguồn tiền — vẫn giữ lại bên dưới (không xoá dữ liệu tổng hợp cũ), chỉ thêm phần xem theo TỪNG
// nguồn tiền còn thiếu so với ảnh mẫu. Dùng lại openTxnModal() của thu-chi.js — không chép form.
import { api } from '../api.js';
import { formatVND, escapeHtml, toast, todayVN, pageTabsHtml, promptDialog } from '../ui.js';
import { icon } from '../icons.js';
import { createRangePicker, rangePickerHtml } from '../date-range-picker.js';
import { openTxnModal } from './thu-chi.js';

// Ngày luôn tính theo giờ Việt Nam (xem ghi chú ở ui.js) — máy chủ cũng cắt ngày theo giờ VN.
const todayStr = todayVN;

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.cash) {
    container.innerHTML = '<p>Bạn không có quyền xem màn hình này.</p>';
    return;
  }
  // Đợt 3 (16/08/2026) — gộp "Huỷ phiếu" vào kebab cuối mỗi dòng. so-quy.js TRƯỚC ĐÂY không có
  // nút này (khác thu-chi.js) — thêm mới, cùng điều kiện quyền với thu-chi.js.
  const canManage = !!perms.cash_manage;

  let accounts = [];
  let page = 1;
  let pageSize = 30; // mặc định 30 (trước đây không truyền page_size, backend tự áp mặc định 50)
  let activeAccountId = ''; // '' = Tất cả nguồn tiền
  let range = { from: todayStr(), to: todayStr() };
  let summary = null;
  let transactions = [];
  // Đợt 3 (16/08/2026) — res.totals backend ĐÃ trả sẵn {thu, chi, net, count} của ĐÚNG tập đang lọc
  // nhưng trước đây loadLedger() bỏ phí, chỉ đọc res.transactions. Dùng để vẽ hàng "Tổng" cuối
  // bảng — KHÔNG tự tính lại ở frontend, tránh sai lệch với công thức backend.
  let ledgerTotals = { thu: 0, chi: 0, net: 0, count: 0 };
  // Xem ghi chú tương tự trong thu-chi.js: chặn phản hồi CŨ ghi đè lên kết quả của lượt lọc MỚI hơn
  // khi người dùng đổi liên tiếp nhiều bộ lọc (chiều thu/chi, tìm kiếm, hiện phiếu đã huỷ) thật nhanh.
  let ledgerSeq = 0;

  const pickerIds = {
    btn: 'sq-date-btn', label: 'sq-date-label', pop: 'sq-date-pop',
    calLeft: 'sq-cal-left', calRight: 'sq-cal-right',
    quick: 'sq-quick', yearBtn: 'sq-year-btn', yearPop: 'sq-year-pop',
    sel: 'sq-sel', clear: 'sq-clear', apply: 'sq-apply',
  };

  container.innerHTML = `
    ${pageTabsHtml('so-quy', staff)}
    <div class="hd-head">
      <h3 class="hd-title" id="sq-title">Sổ quỹ</h3>
      <div class="hd-head-actions">
        <button type="button" class="btn btn-ghost" id="sq-export">${icon('tai-xuong')} Xuất file</button>
        <button type="button" class="btn btn-ghost" id="sq-chi">－ Khoản chi</button>
        <button type="button" class="btn btn-primary" id="sq-thu">＋ Khoản thu</button>
      </div>
    </div>
    <div class="tab-row hd-subtabs" id="sq-acc-tabs" role="tablist">
      <button class="tab active" type="button" role="tab" data-acc="">Tất cả</button>
    </div>
    <div class="hd-tools">
      <label class="hd-search">
        <span class="inline-ico">${icon('tim-kiem')}</span>
        <input id="sq-search" type="search" placeholder="Tìm số tiền, mã phiếu, ghi chú" aria-label="Tìm phiếu" />
      </label>
      <div class="ord-date-wrap hd-range" id="sq-range">
        ${rangePickerHtml(pickerIds, 'Từ ngày - Đến ngày', 'Chọn khoảng ngày')}
      </div>
      <div class="ord-dd sq-multiselect" id="sq-direction-dd">
        <button type="button" class="btn ord-dd-btn" id="sq-direction-btn" aria-haspopup="listbox" aria-expanded="false">
          <span class="ord-dd-label" id="sq-direction-label">Loại giao dịch</span>
          <svg class="ord-dd-caret" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
        </button>
        <div class="ord-dd-pop hidden" id="sq-direction-pop" role="listbox">
          <div class="ord-dd-list">
            <label class="ord-dd-item"><input type="checkbox" value="thu" /><span>Khoản thu</span></label>
            <label class="ord-dd-item"><input type="checkbox" value="chi" /><span>Khoản chi</span></label>
          </div>
        </div>
      </div>
      <div class="ord-dd sq-multiselect" id="sq-category-dd">
        <button type="button" class="btn ord-dd-btn" id="sq-category-btn" aria-haspopup="listbox" aria-expanded="false">
          <span class="ord-dd-label" id="sq-category-label">Mọi phân loại</span>
          <svg class="ord-dd-caret" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
        </button>
        <div class="ord-dd-pop hidden" id="sq-category-pop" role="listbox">
          <div class="ord-dd-search"><input type="search" placeholder="Tìm phân loại" aria-label="Tìm phân loại" /></div>
          <div class="ord-dd-list" id="sq-category-list"></div>
        </div>
      </div>
      <div class="ord-dd sq-multiselect" id="sq-partner-dd">
        <button type="button" class="btn ord-dd-btn" id="sq-partner-btn" aria-haspopup="listbox" aria-expanded="false">
          <span class="ord-dd-label" id="sq-partner-label">Khách hàng: tất cả</span>
          <svg class="ord-dd-caret" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
        </button>
        <div class="ord-dd-pop hidden" id="sq-partner-pop" role="listbox">
          <div class="ord-dd-search"><input type="search" placeholder="Tìm khách hàng" aria-label="Tìm khách hàng" /></div>
          <div class="ord-dd-list" id="sq-partner-list"></div>
        </div>
      </div>
      <label class="hd-check-voided" style="display:flex;align-items:center;gap:6px;white-space:nowrap">
        <input id="sq-voided" type="checkbox" style="width:auto;min-height:auto" /> Hiện phiếu đã huỷ
      </label>
      <button type="button" class="money-clear-filter hidden" id="sq-clear-filter">× Xoá lọc</button>
      <div class="ord-cols-wrap" id="sq-cols-wrap">
        <button id="sq-cols-btn" class="btn pm-col-btn" type="button" aria-haspopup="true" aria-expanded="false">Hiển thị cột ▾</button>
        <div id="sq-cols-pop" class="ord-cols-pop hidden" role="dialog" aria-label="Chọn cột hiển thị"></div>
      </div>
    </div>
    <div class="sbh-kpi" id="sq-stats"></div>
    <div id="sq-list"><p>Đang tải…</p></div>
    <div class="sq-pagination" id="sq-pagination"></div>

    <div class="section-label">Tổng hợp mọi nguồn tiền theo khoảng ngày đã chọn</div>
    <div id="sq-summary-all"><p>Đang tải…</p></div>
    <div class="section-label">Dòng tiền theo ngày</div>
    <div id="sq-daily"><p>Đang tải…</p></div>
  `;

  const filters = { direction: '', q: '', include_voided: '' };

  container.querySelector('#sq-thu').addEventListener('click', () =>
    openTxnModal('thu', { accounts, defaultAccountId: activeAccountId, onSaved: loadAll }));
  container.querySelector('#sq-chi').addEventListener('click', () =>
    openTxnModal('chi', { accounts, defaultAccountId: activeAccountId, onSaved: loadAll }));

  // Mặc định "hôm nay" (không rỗng) — phải tự đồng bộ nhãn/chip ngay khi vào màn, xem chú thích
  // tương tự trong thu-chi.js.
  const sqPicker = createRangePicker(container.querySelector('#sq-range'), pickerIds, {
    emptyLabel: 'Từ ngày - Đến ngày',
    getFrom: () => range.from,
    getTo: () => range.to,
    set: (from, to) => { range = { from, to }; },
    onCommit: () => { page = 1; loadAll(); },
    onWarn: (m) => toast(m, 'error'),
  });
  sqPicker.updateLabel();
  sqPicker.syncQuick();
  // Đợt 3 Task 12 (16/08/2026) — 3 ô lọc chọn-nhiều kiểu Sổ Bán Hàng.
  let allCategories = [];
  const directionSelected = new Set();
  const categorySelected = new Set();
  const partnerSelected = new Set();
  const SQ_DD_IDS = ['sq-direction-dd', 'sq-category-dd', 'sq-partner-dd'];
  function sqDdClose(id) {
    const root = container.querySelector(`#${id}`);
    if (!root) return;
    root.querySelector('.ord-dd-pop')?.classList.add('hidden');
    root.querySelector('.ord-dd-btn')?.setAttribute('aria-expanded', 'false');
  }
  function sqDdCloseAll(except) {
    for (const id of SQ_DD_IDS) if (id !== except) sqDdClose(id);
  }
  function sqDdOpen(id) {
    const root = container.querySelector(`#${id}`);
    if (!root) return;
    root.querySelector('.ord-dd-pop').classList.remove('hidden');
    root.querySelector('.ord-dd-btn').setAttribute('aria-expanded', 'true');
  }

  // ── Thu & Chi (2 lựa chọn cố định) ────────────────────────────────────────────────────────
  container.querySelector('#sq-direction-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const root = container.querySelector('#sq-direction-dd');
    const willOpen = root.querySelector('.ord-dd-pop').classList.contains('hidden');
    sqDdCloseAll();
    if (willOpen) sqDdOpen('sq-direction-dd');
  });
  container.querySelector('#sq-direction-pop').addEventListener('click', (e) => e.stopPropagation());
  container.querySelector('#sq-direction-pop').addEventListener('change', (e) => {
    const box = e.target.closest('input[type="checkbox"]');
    if (!box) return;
    if (box.checked) directionSelected.add(box.value); else directionSelected.delete(box.value);
    filters.direction = directionSelected.size === 1 ? [...directionSelected][0] : '';
    container.querySelector('#sq-direction-label').textContent = directionSelected.size === 1
      ? (directionSelected.has('thu') ? 'Chỉ thu' : 'Chỉ chi')
      : 'Loại giao dịch';
    container.querySelector('#sq-direction-dd').classList.toggle('has-value', directionSelected.size === 1);
    page = 1;
    loadLedger();
  });

  // ── Phân loại (tải 1 lần TOÀN BỘ thu+chi, lọc bằng ô tìm kiếm ở client) ────────────────────
  async function loadCategoryOptions() {
    try {
      const res = await api.get('/api/mgr/transactions/categories');
      allCategories = res.categories;
    } catch { allCategories = []; }
  }
  function sqCategoryRenderList() {
    const q = container.querySelector('#sq-category-pop .ord-dd-search input').value.trim().toLowerCase();
    const shown = allCategories.filter((c) => !q || c.name.toLowerCase().includes(q));
    container.querySelector('#sq-category-list').innerHTML = shown.length
      ? shown.map((c) => `
          <label class="ord-dd-item">
            <input type="checkbox" value="${c.id}" ${categorySelected.has(String(c.id)) ? 'checked' : ''} />
            <span>${escapeHtml(c.name)} (${c.direction === 'thu' ? 'Thu' : 'Chi'})</span>
          </label>`).join('')
      : '<p class="ord-dd-empty">Không tìm thấy phân loại</p>';
  }
  function sqCategorySyncButton() {
    const label = container.querySelector('#sq-category-label');
    const n = categorySelected.size;
    if (!n) label.textContent = 'Mọi phân loại';
    else if (n === 1) {
      const hit = allCategories.find((c) => String(c.id) === [...categorySelected][0]);
      label.textContent = hit ? hit.name : 'Mọi phân loại';
    } else label.textContent = `Phân loại: ${n} mục`;
    container.querySelector('#sq-category-dd').classList.toggle('has-value', n > 0);
  }
  container.querySelector('#sq-category-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const root = container.querySelector('#sq-category-dd');
    const willOpen = root.querySelector('.ord-dd-pop').classList.contains('hidden');
    sqDdCloseAll();
    if (willOpen) { sqDdOpen('sq-category-dd'); sqCategoryRenderList(); }
  });
  container.querySelector('#sq-category-pop').addEventListener('click', (e) => e.stopPropagation());
  container.querySelector('#sq-category-pop .ord-dd-search input').addEventListener('input', sqCategoryRenderList);
  container.querySelector('#sq-category-list').addEventListener('change', (e) => {
    const box = e.target.closest('input[type="checkbox"]');
    if (!box) return;
    if (box.checked) categorySelected.add(box.value); else categorySelected.delete(box.value);
    filters.category_id = [...categorySelected];
    sqCategorySyncButton();
    page = 1;
    loadLedger();
  });

  // ── Khách hàng (gọi API mới mỗi lần gõ, debounce 250ms — Task 3 backend, response bọc
  // { ok, partners }) ────────────────────────────────────────────────────────────────────────
  let partnerSearchTimer = null;
  async function sqPartnerRenderList() {
    const input = container.querySelector('#sq-partner-pop .ord-dd-search input');
    const q = input.value.trim();
    let names = [];
    try {
      const res = await api.get(`/api/mgr/transactions/partners?q=${encodeURIComponent(q)}`);
      names = Array.isArray(res.partners) ? res.partners : [];
    } catch { names = []; }
    const merged = [...new Set([...names, ...partnerSelected])];
    container.querySelector('#sq-partner-list').innerHTML = merged.length
      ? merged.map((name) => `
          <label class="ord-dd-item">
            <input type="checkbox" value="${escapeHtml(name)}" ${partnerSelected.has(name) ? 'checked' : ''} />
            <span>${escapeHtml(name)}</span>
          </label>`).join('')
      : '<p class="ord-dd-empty">Không tìm thấy khách hàng</p>';
  }
  function sqPartnerSyncButton() {
    const label = container.querySelector('#sq-partner-label');
    const n = partnerSelected.size;
    if (!n) label.textContent = 'Khách hàng: tất cả';
    else if (n === 1) label.textContent = [...partnerSelected][0];
    else label.textContent = `Khách hàng: ${n} mục`;
    container.querySelector('#sq-partner-dd').classList.toggle('has-value', n > 0);
  }
  container.querySelector('#sq-partner-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const root = container.querySelector('#sq-partner-dd');
    const willOpen = root.querySelector('.ord-dd-pop').classList.contains('hidden');
    sqDdCloseAll();
    if (willOpen) { sqDdOpen('sq-partner-dd'); sqPartnerRenderList(); }
  });
  container.querySelector('#sq-partner-pop').addEventListener('click', (e) => e.stopPropagation());
  container.querySelector('#sq-partner-pop .ord-dd-search input').addEventListener('input', () => {
    clearTimeout(partnerSearchTimer);
    partnerSearchTimer = setTimeout(sqPartnerRenderList, 250);
  });
  container.querySelector('#sq-partner-list').addEventListener('change', (e) => {
    const box = e.target.closest('input[type="checkbox"]');
    if (!box) return;
    if (box.checked) partnerSelected.add(box.value); else partnerSelected.delete(box.value);
    filters.partner_names = [...partnerSelected];
    sqPartnerSyncButton();
    page = 1;
    loadLedger();
  });

  document.addEventListener('click', () => sqDdCloseAll());

  container.querySelector('#sq-search').addEventListener('input', (e) => { filters.q = e.target.value; page = 1; loadLedger(); });
  container.querySelector('#sq-voided').addEventListener('change', (e) => { filters.include_voided = e.target.checked ? '1' : ''; page = 1; loadLedger(); });

  container.querySelector('#sq-clear-filter').addEventListener('click', () => {
    filters.direction = ''; filters.q = ''; filters.include_voided = '';
    filters.category_id = []; filters.partner_names = [];
    activeAccountId = '';
    range = { from: todayStr(), to: todayStr() };
    page = 1;
    container.querySelector('#sq-search').value = '';
    container.querySelector('#sq-voided').checked = false;
    directionSelected.clear(); categorySelected.clear(); partnerSelected.clear();
    container.querySelector('#sq-direction-label').textContent = 'Loại giao dịch';
    container.querySelector('#sq-direction-dd').classList.remove('has-value');
    sqCategorySyncButton();
    sqPartnerSyncButton();
    sqDdCloseAll();
    sqPicker.updateLabel();
    sqPicker.syncQuick();
    container.querySelector('#sq-title').textContent = 'Sổ quỹ';
    loadAll();
  });

  container.querySelector('#sq-export').addEventListener('click', () => {
    if (!transactions.length) { toast('Không có phiếu nào để xuất', 'error'); return; }
    const head = ['Mã phiếu', 'Ngày', 'Số tiền', 'Chiều', 'Phân loại', 'Nguồn tiền', 'Đối tác'];
    const cell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = transactions.map((t) => [
      t.code, new Date(t.occurred_at).toLocaleString('vi-VN'), Number(t.amount) || 0,
      t.direction === 'thu' ? 'Thu' : 'Chi', t.category_name || '', t.account_name || '', t.partner_name || '',
    ].map(cell).join(','));
    const blob = new Blob([`﻿${head.map(cell).join(',')}\n${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `so-quy-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(`Đã xuất ${transactions.length} phiếu`);
  });

  function renderAccountTabs() {
    const el = container.querySelector('#sq-acc-tabs');
    el.innerHTML = [
      `<button class="tab${activeAccountId === '' ? ' active' : ''}" type="button" role="tab" data-acc="">Tất cả</button>`,
      ...accounts.map((a) => `<button class="tab${String(activeAccountId) === String(a.id) ? ' active' : ''}" type="button" role="tab" data-acc="${a.id}">${escapeHtml(a.name)}</button>`),
    ].join('');
    el.querySelectorAll('[data-acc]').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeAccountId = btn.dataset.acc;
        container.querySelector('#sq-title').textContent = activeAccountId
          ? `Sổ quỹ ${accounts.find((a) => String(a.id) === activeAccountId)?.name || ''}`
          : 'Sổ quỹ';
        page = 1;
        loadAll();
      });
    });
  }

  function renderStats() {
    const el = container.querySelector('#sq-stats');
    if (!summary) { el.innerHTML = ''; return; }
    const row = activeAccountId
      ? summary.accounts.find((a) => String(a.id) === activeAccountId)
      : null;
    const opening = row ? row.opening : summary.total.opening;
    const thu = row ? row.thu : summary.total.thu;
    const chi = row ? row.chi : summary.total.chi;
    const closing = row ? row.closing : summary.total.closing;
    el.innerHTML = [
      ['Số dư đầu kỳ', formatVND(opening), 'kpi-c3'],
      ['Tổng thu', formatVND(thu), 'kpi-c1'],
      ['Tổng chi', formatVND(chi), 'kpi-c4'],
      ['Số dư cuối kỳ', formatVND(closing), 'kpi-c3'],
    ].map(([label, value, cls]) => `
      <div class="kpi-card ${cls}">
        <div class="kpi-label">${label}</div>
        <div class="kpi-val">${escapeHtml(value)}</div>
      </div>`).join('');
  }

  function renderLedger() {
    const el = container.querySelector('#sq-list');
    if (!transactions.length) {
      el.innerHTML = `<div class="hd-empty">${icon('tim-kiem')}<p>Không có phiếu nào phù hợp</p></div>`;
      return;
    }
    el.innerHTML = `
      <div class="sbh-card" style="padding:0"><div style="overflow-x:auto">
        <table class="sp-table" style="width:100%;min-width:680px;border-radius:0">
          <thead><tr>
            <th>Mã phiếu / Ngày</th>
            <th class="hd-num" data-col="col-thu">Số tiền thu</th>
            <th class="hd-num" data-col="col-chi">Số tiền chi</th>
            <th data-col="col-cat">Phân loại</th>
            <th data-col="col-acc">Nguồn tiền</th>
            <th data-col="col-partner">Đối tác</th>
            <th data-col="col-note">Mô tả</th>
            <th data-col="col-order">Mã giao dịch</th>
            ${canManage ? '<th class="hd-act-col">Thao tác</th>' : ''}
          </tr></thead>
          <tbody>
            ${transactions.map((t) => `
              <tr class="${t.voided_at ? 'hd-row-voided' : ''}">
                <td><div>${escapeHtml(t.code)}</div><div class="ord-td-time">${escapeHtml(new Date(t.occurred_at).toLocaleString('vi-VN'))}</div></td>
                <td class="hd-num" data-col="col-thu" style="color:var(--money-in)">${t.direction === 'thu' ? escapeHtml(formatVND(t.amount)) : '—'}</td>
                <td class="hd-num" data-col="col-chi" style="color:var(--money-out)">${t.direction === 'chi' ? escapeHtml(formatVND(t.amount)) : '—'}</td>
                <td data-col="col-cat">${escapeHtml(t.category_name || 'Chưa phân loại')}</td>
                <td data-col="col-acc">${escapeHtml(t.account_name || '')}</td>
                <td data-col="col-partner">${escapeHtml(t.partner_name || '—')}${t.voided_at ? `<br><small class="hd-overdue">ĐÃ HUỶ${t.void_reason ? ' — ' + escapeHtml(t.void_reason) : ''}</small>` : ''}</td>
                <td data-col="col-note">${escapeHtml(t.note || '—')}</td>
                <td data-col="col-order">${escapeHtml(t.order_code || '—')}</td>
                ${canManage ? `<td class="dm-act"><div class="dm-kebab-wrap"><button class="ord-kebab" data-menu="${t.id}" aria-label="Menu">${icon('them')}</button><div class="dm-kebab-menu hidden">${!t.voided_at ? `<button type="button" data-void="${t.id}">Huỷ phiếu</button>` : ''}</div></div></td>` : ''}
              </tr>`).join('')}
          </tbody>
          <tfoot>
            <tr class="sq-total-row">
              <td>Tổng (${ledgerTotals.count ?? 0} phiếu)</td>
              <td class="hd-num" data-col="col-thu" style="color:var(--money-in)">${escapeHtml(formatVND(ledgerTotals.thu || 0))}</td>
              <td class="hd-num" data-col="col-chi" style="color:var(--money-out)">${escapeHtml(formatVND(ledgerTotals.chi || 0))}</td>
              <td colspan="${canManage ? 6 : 5}"></td>
            </tr>
          </tfoot>
        </table>
      </div></div>
    `;
    if (canManage) {
      const closeAll = () => el.querySelectorAll('.dm-kebab-menu').forEach(m => m.classList.add('hidden'));
      el.querySelectorAll('.ord-kebab[data-menu]').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const menu = btn.parentElement.querySelector('.dm-kebab-menu');
          const willOpen = menu.classList.contains('hidden');
          closeAll(); menu.classList.toggle('hidden', !willOpen);
        });
      });
      document.addEventListener('click', closeAll);
      el.querySelectorAll('[data-void]').forEach(btn => {
        btn.addEventListener('click', () => { closeAll(); voidTxn(parseInt(btn.dataset.void, 10)); });
      });
    }
  }

  // ── Đợt 3 Task 11 — Hiện thị cột (copy nguyên pattern orders.js Đợt 2) ──────────────────────
  const COL_KEY = 'posmgr.soquy.cols.v1';
  const TOGGLEABLE_COLS = [
    { id: 'col-thu',     label: 'Số tiền thu' },
    { id: 'col-chi',     label: 'Số tiền chi' },
    { id: 'col-cat',     label: 'Phân loại' },
    { id: 'col-acc',     label: 'Nguồn tiền' },
    { id: 'col-partner', label: 'Đối tác' },
    { id: 'col-note',    label: 'Mô tả' },
    { id: 'col-order',   label: 'Mã giao dịch' },
  ];
  function getHiddenCols() {
    try { return JSON.parse(localStorage.getItem(COL_KEY) || '[]'); } catch { return []; }
  }
  function saveHiddenCols(arr) {
    try { localStorage.setItem(COL_KEY, JSON.stringify(arr)); } catch { /* private mode */ }
  }
  function applyColVisibility() {
    const hidden = getHiddenCols();
    const list = container.querySelector('#sq-list');
    if (!list) return;
    TOGGLEABLE_COLS.forEach(({ id }) => {
      const isHidden = hidden.includes(id);
      list.querySelectorAll(`[data-col="${id}"]`).forEach((el) => el.classList.toggle('sq-col-hidden', isHidden));
    });
  }
  function openColPop() {
    const pop = container.querySelector('#sq-cols-pop');
    const btn = container.querySelector('#sq-cols-btn');
    if (!pop || !btn) return;
    const hidden = getHiddenCols();
    pop.innerHTML = TOGGLEABLE_COLS.map(({ id, label }) =>
      `<label class="ord-col-row"><input type="checkbox" data-col-toggle="${id}" ${hidden.includes(id) ? '' : 'checked'} /><span>${label}</span></label>`
    ).join('');
    pop.querySelectorAll('[data-col-toggle]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const id = cb.dataset.colToggle;
        const h = getHiddenCols();
        if (cb.checked) { const i = h.indexOf(id); if (i !== -1) h.splice(i, 1); }
        else if (!h.includes(id)) h.push(id);
        saveHiddenCols(h);
        applyColVisibility();
      });
    });
    const wasHidden = pop.classList.contains('hidden');
    pop.classList.toggle('hidden');
    btn.setAttribute('aria-expanded', wasHidden ? 'true' : 'false');
  }
  container.querySelector('#sq-cols-btn')?.addEventListener('click', (e) => { e.stopPropagation(); openColPop(); });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#sq-cols-wrap')) {
      container.querySelector('#sq-cols-pop')?.classList.add('hidden');
      container.querySelector('#sq-cols-btn')?.setAttribute('aria-expanded', 'false');
    }
  });

  // ── Đợt 3 Task 11 — kebab "Huỷ phiếu" (copy đúng logic voidTxn() từ thu-chi.js) ─────────────
  let openMenuEl = null;
  function closeRowMenu() {
    if (openMenuEl) { openMenuEl.remove(); openMenuEl = null; }
    container.querySelectorAll('.ord-kebab[aria-expanded="true"]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
  }
  function openRowMenu(btn) {
    const id = btn.dataset.menu;
    const wasOpen = btn.getAttribute('aria-expanded') === 'true';
    closeRowMenu();
    if (wasOpen) return;
    const menu = document.createElement('div');
    menu.className = 'row-menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = `<button type="button" role="menuitem" class="danger" data-act="void">${icon('xoa')} Huỷ phiếu</button>`;
    document.body.appendChild(menu);
    const r = btn.getBoundingClientRect();
    const openUp = r.bottom + menu.offsetHeight + 8 > window.innerHeight;
    menu.style.top = `${(openUp ? r.top - menu.offsetHeight - 4 : r.bottom + 4) + window.scrollY}px`;
    menu.style.left = `${Math.max(8, r.right - menu.offsetWidth) + window.scrollX}px`;
    btn.setAttribute('aria-expanded', 'true');
    openMenuEl = menu;
    menu.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]');
      if (!act) return;
      closeRowMenu();
      if (act.dataset.act === 'void') voidTxn(parseInt(id, 10));
    });
  }
  document.addEventListener('click', closeRowMenu);

  async function voidTxn(id) {
    const reason = await promptDialog('Lý do huỷ phiếu:', { required: true });
    if (!reason) return;
    try {
      await api.post(`/api/mgr/transactions/${id}/void`, { reason: reason.trim() });
      toast('Đã huỷ phiếu');
      await loadAll();
    } catch (err) {
      toast(err?.body?.message || 'Không huỷ được phiếu', 'error');
    }
  }

  // ── Đợt 3 Task 11 — phân trang ────────────────────────────────────────────────────────────
  function renderPagination() {
    const el = container.querySelector('#sq-pagination');
    if (!el) return;
    const total = ledgerTotals.count || 0;
    if (!total) { el.innerHTML = ''; return; }
    const totalPages = Math.max(Math.ceil(total / pageSize), 1);
    const from = (page - 1) * pageSize + 1;
    const to = Math.min(page * pageSize, total);
    el.innerHTML = `<div class="ord-pager">
      <span style="color:var(--text-2,#888);font-size:13px">Hiển thị ${from}-${to} / ${total} kết quả</span>
      <div class="ord-pager-ctrl">
        <span style="font-size:13px;color:var(--text-2,#888)">Hiển thị dòng</span>
        <select id="sq-page-size" style="height:32px;padding:0 6px;border:1px solid var(--border,#ddd);border-radius:6px;font-size:13px">
          ${[30, 50, 100].map((n) => `<option value="${n}" ${n === pageSize ? 'selected' : ''}>${n}</option>`).join('')}
        </select>
        <button class="ord-page-btn" id="sq-page-prev" ${page <= 1 ? 'disabled' : ''}>&#8249;</button>
        <span class="ord-page-cur">${page} / ${totalPages}</span>
        <button class="ord-page-btn" id="sq-page-next" ${page >= totalPages ? 'disabled' : ''}>&#8250;</button>
      </div>
    </div>`;
    container.querySelector('#sq-page-size').addEventListener('change', (e) => {
      pageSize = parseInt(e.target.value, 10) || 30;
      page = 1;
      loadLedger();
    });
    container.querySelector('#sq-page-prev').addEventListener('click', () => { if (page > 1) { page -= 1; loadLedger(); } });
    container.querySelector('#sq-page-next').addEventListener('click', () => { if (page < totalPages) { page += 1; loadLedger(); } });
  }

  // ── Đợt 3 Task 11 — chip "Xoá lọc" (forward-compatible: filters.category_id/partner_names sẽ
  // được Task 12 thêm sau, đọc undefined ở đây vẫn an toàn vì hasArr() check .length) ──────────
  function updateClearFilterVisibility() {
    const btn = container.querySelector('#sq-clear-filter');
    if (!btn) return;
    const isDefaultRange = range.from === todayStr() && range.to === todayStr();
    const hasArr = (a) => Array.isArray(a) && a.length > 0;
    const active = !!(filters.direction || filters.q || filters.include_voided || activeAccountId
      || hasArr(filters.category_id) || hasArr(filters.partner_names) || !isDefaultRange);
    btn.classList.toggle('hidden', !active);
  }

  function renderSummaryAll(data) {
    const el = container.querySelector('#sq-summary-all');
    el.innerHTML = `
      <div class="sbh-card" style="padding:0"><div style="overflow-x:auto">
        <table class="sp-table" style="width:100%;min-width:520px;border-radius:0">
          <thead><tr><th>Nguồn tiền</th><th class="hd-num">Tồn đầu</th><th class="hd-num">Thu</th><th class="hd-num">Chi</th><th class="hd-num">Tồn cuối</th></tr></thead>
          <tbody>
            ${data.accounts.map((a) => `
              <tr>
                <td>${escapeHtml(a.name)}</td>
                <td class="hd-num">${formatVND(a.opening)}</td>
                <td class="hd-num">${formatVND(a.thu)}</td>
                <td class="hd-num">${formatVND(a.chi)}</td>
                <td class="hd-num">${formatVND(a.closing)}</td>
              </tr>
            `).join('')}
            <tr style="font-weight:700">
              <td>TỔNG</td>
              <td class="hd-num">${formatVND(data.total.opening)}</td>
              <td class="hd-num">${formatVND(data.total.thu)}</td>
              <td class="hd-num">${formatVND(data.total.chi)}</td>
              <td class="hd-num">${formatVND(data.total.closing)}</td>
            </tr>
          </tbody>
        </table>
      </div></div>
    `;
  }

  function renderDaily(days) {
    const el = container.querySelector('#sq-daily');
    if (!days.length) { el.innerHTML = '<p>Không có dữ liệu trong khoảng ngày này.</p>'; return; }
    el.innerHTML = `
      <div class="sbh-card" style="padding:0"><div style="overflow-x:auto">
        <table class="sp-table" style="width:100%;min-width:420px;border-radius:0">
          <thead><tr><th>Ngày</th><th class="hd-num">Thu</th><th class="hd-num">Chi</th><th class="hd-num">Chênh lệch</th></tr></thead>
          <tbody>
            ${days.map((d) => `
              <tr>
                <td>${escapeHtml(new Date(d.day).toLocaleDateString('vi-VN'))}</td>
                <td class="hd-num" style="color:var(--money-in)">${formatVND(d.thu)}</td>
                <td class="hd-num" style="color:var(--money-out)">${formatVND(d.chi)}</td>
                <td class="hd-num">${formatVND(d.net)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div></div>
    `;
  }

  async function loadAccounts() {
    try {
      const res = await api.get('/api/mgr/cash-accounts');
      accounts = res.accounts;
      renderAccountTabs();
    } catch { /* bỏ qua, vẫn xem được bảng "Tất cả" */ }
  }

  async function loadSummary() {
    try {
      summary = await api.get(`/api/mgr/cashbook/summary?from=${range.from}&to=${range.to}`);
      renderStats();
      renderSummaryAll(summary);
    } catch {
      summary = null;
      container.querySelector('#sq-summary-all').innerHTML = '<p>Không tải được sổ quỹ.</p>';
    }
  }

  async function loadDaily() {
    try {
      const params = new URLSearchParams({ from: range.from, to: range.to });
      if (activeAccountId) params.set('account_id', activeAccountId);
      const data = await api.get(`/api/mgr/cashbook/daily?${params.toString()}`);
      renderDaily(data.days);
    } catch {
      container.querySelector('#sq-daily').innerHTML = '<p>Không tải được dòng tiền theo ngày.</p>';
    }
  }

  async function loadLedger() {
    const mySeq = ++ledgerSeq;
    const el = container.querySelector('#sq-list');
    el.innerHTML = '<p>Đang tải…</p>';
    try {
      const params = new URLSearchParams({ from: range.from, to: range.to, page: String(page), page_size: String(pageSize) });
      if (activeAccountId) params.set('account_id', activeAccountId);
      if (filters.direction) params.set('direction', filters.direction);
      if (filters.q) params.set('q', filters.q);
      if (filters.include_voided) params.set('include_voided', filters.include_voided);
      if (Array.isArray(filters.category_id)) filters.category_id.forEach((v) => params.append('category_id', v));
      if (Array.isArray(filters.partner_names)) filters.partner_names.forEach((v) => params.append('partner_names', v));
      const res = await api.get(`/api/mgr/transactions?${params.toString()}`);
      if (mySeq !== ledgerSeq) return;
      transactions = res.transactions;
      ledgerTotals = res.totals;
      page = res.page;
      pageSize = res.page_size;
      renderLedger();
      applyColVisibility();
      renderPagination();
      updateClearFilterVisibility();
    } catch {
      if (mySeq !== ledgerSeq) return;
      el.innerHTML = '<p>Không tải được danh sách phiếu.</p>';
    }
  }

  async function loadAll() {
    renderAccountTabs();
    await Promise.all([loadSummary(), loadDaily(), loadLedger()]);
  }

  await Promise.all([loadAccounts(), loadCategoryOptions()]);
  await loadAll();
}
