// GĐ2 — Thu chi: phiếu thu/chi, lọc theo ngày/chiều/nguồn tiền/phân loại.
// Việc 2 (13/08/2026) — đổi vỏ ngoài cho giống layout ảnh mẫu Website/tai chinh/
// app.sobanhang.com_mission-control (38).png: ô tìm + khoảng ngày + bộ lọc trên 1 hàng, 3 thẻ số
// liệu, bảng danh sách thay vì list thẻ dọc, nút "Khoản thu/Khoản chi" ở góc trên bên phải.
// KHÔNG đổi API/nghiệp vụ — chỉ đổi cách hiển thị. openTxnModal() export ra để so-quy.js dùng lại,
// tránh chép 2 lần cùng 1 form tạo phiếu (đúng như panel "Yêu cầu" — dùng chung 1 component).
import { api } from '../api.js';
import { formatVND, escapeHtml, toast, openModal, todayVN, promptDialog, pageTabsHtml } from '../ui.js';
import { icon } from '../icons.js';
import { createRangePicker, rangePickerHtml } from '../date-range-picker.js';

// Ngày theo giờ Việt Nam (xem ghi chú ở ui.js)
const todayStr = todayVN;

/** Cache phân loại theo chiều — dùng chung cho mọi màn gọi openTxnModal (thu-chi, sổ quỹ). */
const categoriesByDir = { thu: [], chi: [] };
async function fetchCategories(direction) {
  if (categoriesByDir[direction] && categoriesByDir[direction].length) return categoriesByDir[direction];
  const res = await api.get(`/api/mgr/transactions/categories?direction=${direction}`);
  categoriesByDir[direction] = res.categories;
  return res.categories;
}

/**
 * Hộp thoại "Phiếu thu"/"Phiếu chi" DÙNG CHUNG cho thu-chi.js và so-quy.js — tránh chép 2 lần
 * cùng 1 biểu mẫu (giống nguyên tắc "1 component" ở panel Yêu cầu, Việc 4).
 * `accounts` = danh sách nguồn tiền đã tải sẵn; `defaultAccountId` gợi ý chọn sẵn (vd đang xem
 * đúng 1 nguồn tiền ở Sổ quỹ thì mở phiếu cũng nên chọn sẵn nguồn đó).
 */
export function openTxnModal(initialDirection, { accounts, defaultAccountId, onSaved }) {
  const modal = openModal('<p>Đang tải…</p>');
  // Đợt 3 — `direction` ĐỔI ĐƯỢC ngay trong modal (2 nút toggle) thay vì phải đóng-mở lại.
  let direction = initialDirection;

  async function renderForm() {
    const cats = await fetchCategories(direction);
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    const nowLocal = now.toISOString().slice(0, 16);
    const box = modal.overlay.querySelector('.modal-box');
    const preserved = box.querySelector('#tx-amount') ? {
      amount: box.querySelector('#tx-amount').value,
      partner: box.querySelector('#tx-partner').value,
      phone: box.querySelector('#tx-phone').value,
      note: box.querySelector('#tx-note').value,
      time: box.querySelector('#tx-time').value,
    } : null;

    box.innerHTML = `
      <h3>${direction === 'thu' ? 'Khoản thu' : 'Khoản chi'}</h3>
      <div class="tx-dir-toggle">
        <button type="button" class="tx-dir-btn thu ${direction === 'thu' ? 'active' : ''}" data-dir="thu">Khoản thu</button>
        <button type="button" class="tx-dir-btn chi ${direction === 'chi' ? 'active' : ''}" data-dir="chi">Khoản chi</button>
      </div>
      <div class="field"><label>Số tiền</label><input id="tx-amount" type="number" min="0" value="${escapeHtml(preserved?.amount || '')}" /></div>
      <div class="field"><label>Nguồn tiền</label>
        <select id="tx-account">${accounts.map((a) => `<option value="${a.id}" ${String(a.id) === String(defaultAccountId) || (!defaultAccountId && a.is_default) ? 'selected' : ''}>${escapeHtml(a.name)}</option>`).join('')}</select>
      </div>
      <div class="field">
        <label>Phân loại</label>
        <select id="tx-category"><option value="">Không phân loại</option>${cats.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}</select>
        <button type="button" id="tx-add-category" class="tx-add-category-link">+ Thêm phân loại</button>
      </div>
      <div class="field"><label>${direction === 'thu' ? 'Người nộp' : 'Người nhận'} (không bắt buộc)</label><input id="tx-partner" type="text" value="${escapeHtml(preserved?.partner || '')}" /></div>
      <div class="field"><label>Số điện thoại (không bắt buộc)</label><input id="tx-phone" type="tel" value="${escapeHtml(preserved?.phone || '')}" /></div>
      <div class="field"><label>Ghi chú</label><input id="tx-note" type="text" value="${escapeHtml(preserved?.note || '')}" /></div>
      <div class="field"><label>Thời gian</label><input id="tx-time" type="datetime-local" value="${escapeHtml(preserved?.time || nowLocal)}" /></div>
      <button id="tx-submit" class="btn btn-primary ${direction === 'chi' ? 'btn-danger' : ''}" style="width:100%">Lưu phiếu</button>
    `;

    box.querySelectorAll('.tx-dir-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (btn.dataset.dir === direction) return;
        direction = btn.dataset.dir;
        await renderForm();
      });
    });

    box.querySelector('#tx-add-category').addEventListener('click', async () => {
      const name = await promptDialog('Tên phân loại mới:', { required: true, title: 'Thêm phân loại' });
      if (!name) return;
      try {
        await api.post('/api/mgr/transactions/categories', { name: name.trim(), direction });
        categoriesByDir[direction] = []; // ép fetchCategories() tải lại, có phân loại vừa thêm
        toast('Đã thêm phân loại');
        await renderForm();
      } catch (err) {
        toast(err?.body?.message || 'Không thêm được phân loại', 'error');
      }
    });

    box.querySelector('#tx-submit').addEventListener('click', async () => {
      const amount = Number(box.querySelector('#tx-amount').value);
      if (!amount || amount <= 0) { toast('Vui lòng nhập số tiền hợp lệ', 'error'); return; }
      const account_id = box.querySelector('#tx-account').value;
      if (!account_id) { toast('Vui lòng chọn nguồn tiền', 'error'); return; }
      const payload = {
        direction,
        amount,
        account_id: Number(account_id),
        category_id: box.querySelector('#tx-category').value || null,
        partner_name: box.querySelector('#tx-partner').value.trim(),
        partner_phone: box.querySelector('#tx-phone').value.trim(),
        note: box.querySelector('#tx-note').value.trim(),
        occurred_at: new Date(box.querySelector('#tx-time').value).toISOString(),
      };
      try {
        await api.post('/api/mgr/transactions', payload);
        toast(direction === 'thu' ? 'Đã tạo khoản thu' : 'Đã tạo khoản chi');
        modal.close();
        if (onSaved) await onSaved();
      } catch (err) {
        toast(err?.body?.message || 'Không lưu được phiếu', 'error');
      }
    });
  }

  renderForm();
}

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.cash) {
    container.innerHTML = '<p>Bạn không có quyền xem màn hình này.</p>';
    return;
  }
  const canManage = !!perms.cash_manage;

  let accounts = [];
  const filters = { from: todayStr(), to: todayStr(), direction: '', account_id: '', category_id: '', q: '', include_voided: '' };
  let transactions = [];
  let totals = { thu: 0, chi: 0, net: 0, count: 0 };
  // Đợt 3 Task 5 — backend listTransactions() đã nhận page/pageSize sẵn (mặc định 1/50), chỉ
  // thiếu UI. Tách khỏi `filters` (không dùng chung object) để đổi trang không bị coi là "đang
  // lọc" bởi isFiltered() ở Task 4.
  let page = 1;
  let pageSize = 30;
  // Đổi liên tiếp nhiều bộ lọc thật nhanh (vd gõ tìm kiếm rồi đổi ngay chiều thu/chi) bắn nhiều
  // load() chồng nhau — không có số thế hệ này thì phản hồi VỀ SAU có thể là của yêu cầu CŨ, ghi đè
  // lên kết quả của yêu cầu MỚI hơn đã tới trước, làm bảng hiện sai (tổng theo bộ lọc mới, dòng theo
  // bộ lọc cũ).
  let loadSeq = 0;

  const pickerIds = {
    btn: 'tc-date-btn', label: 'tc-date-label', pop: 'tc-date-pop',
    calLeft: 'tc-cal-left', calRight: 'tc-cal-right',
    quick: 'tc-quick', yearBtn: 'tc-year-btn', yearPop: 'tc-year-pop',
    sel: 'tc-sel', clear: 'tc-clear', apply: 'tc-apply',
  };

  container.innerHTML = `
    ${pageTabsHtml('thu-chi', staff)}
    <div class="hd-head">
      <h3 class="hd-title">Thu chi</h3>
      <div class="hd-head-actions">
        <button id="tc-chi" class="btn btn-ghost">－ Khoản chi</button>
        <button id="tc-thu" class="btn btn-primary">＋ Khoản thu</button>
      </div>
    </div>
    <div class="hd-stats" id="tc-stats"></div>
    <div class="hd-tools">
      <label class="hd-search">
        <span class="inline-ico">${icon('tim-kiem')}</span>
        <input id="tc-search" type="search" placeholder="Tìm số tiền, mã đơn, ghi chú" aria-label="Tìm phiếu" />
      </label>
      <div class="ord-date-wrap hd-range" id="tc-range">
        ${rangePickerHtml(pickerIds, 'Từ ngày - Đến ngày', 'Chọn khoảng ngày')}
      </div>
      <div class="tc-direction-dd" id="tc-direction-dd">
        <button type="button" class="btn tc-dd-btn" id="tc-direction-btn" aria-haspopup="listbox" aria-expanded="false">
          <span id="tc-direction-label">Thu &amp; Chi</span>
        </button>
        <div class="tc-dd-pop hidden" id="tc-direction-pop" role="listbox">
          <label class="tc-dd-item"><input type="checkbox" data-dir="thu" /> <span>Khoản thu</span></label>
          <label class="tc-dd-item"><input type="checkbox" data-dir="chi" /> <span>Khoản chi</span></label>
        </div>
      </div>
      <select id="tc-account"><option value="">Mọi nguồn tiền</option></select>
      <select id="tc-category" disabled><option value="">Chọn chiều thu/chi để lọc phân loại</option></select>
      <label class="hd-check-voided" style="display:flex;align-items:center;gap:6px;white-space:nowrap">
        <input id="tc-voided" type="checkbox" style="width:auto;min-height:auto" /> Hiện phiếu đã huỷ
      </label>
      <button id="tc-clear-filter" type="button" class="money-clear-filter hidden">× Xoá lọc</button>
      <div class="tc-cols-wrap" id="tc-cols-wrap">
        <button id="tc-cols-btn" class="btn tc-cols-btn" type="button" aria-haspopup="true" aria-expanded="false">Hiển thị cột ▾</button>
        <div id="tc-cols-pop" class="tc-cols-pop hidden" role="dialog" aria-label="Chọn cột hiển thị"></div>
      </div>
    </div>
    <div id="tc-list"><p>Đang tải…</p></div>
    <div class="tc-pagination" id="tc-pagination"></div>
  `;

  container.querySelector('#tc-thu').addEventListener('click', () =>
    openTxnModal('thu', { accounts, onSaved: load }));
  container.querySelector('#tc-chi').addEventListener('click', () =>
    openTxnModal('chi', { accounts, onSaved: load }));

  // Khác hoa-don-vao.js (mặc định RỖNG): mặc định ở đây là "hôm nay" — nút ngày phải TỰ hiện đúng
  // nhãn "hôm nay" ngay khi vào màn, không đợi người dùng bấm chọn lại mới thấy đúng, nếu không sẽ
  // hiện nhầm placeholder "Từ ngày - Đến ngày" trong khi thật ra ĐANG lọc theo hôm nay.
  const tcPicker = createRangePicker(container.querySelector('#tc-range'), pickerIds, {
    emptyLabel: 'Từ ngày - Đến ngày',
    getFrom: () => filters.from,
    getTo: () => filters.to,
    set: (from, to) => { filters.from = from; filters.to = to; },
    onCommit: () => { page = 1; load(); },
    onWarn: (m) => toast(m, 'error'),
  });
  tcPicker.updateLabel();
  tcPicker.syncQuick();

  // ── Đợt 3 Task 6 — dropdown checkbox thay <select> đơn: backend chỉ nhận ĐÚNG 1 giá trị
  // 'thu'/'chi' hoặc rỗng (= tất cả). 0 lựa chọn hoặc CẢ 2 lựa chọn đều map về "" (tất cả).
  const directionDd = { selected: new Set() };
  function syncDirectionLabel() {
    const label = container.querySelector('#tc-direction-label');
    if (directionDd.selected.size === 1 && directionDd.selected.has('thu')) label.textContent = 'Chỉ thu';
    else if (directionDd.selected.size === 1 && directionDd.selected.has('chi')) label.textContent = 'Chỉ chi';
    else label.textContent = 'Thu & Chi';
  }
  container.querySelector('#tc-direction-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const pop = container.querySelector('#tc-direction-pop');
    const willOpen = pop.classList.contains('hidden');
    pop.classList.toggle('hidden', !willOpen);
    e.currentTarget.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  });
  container.querySelector('#tc-direction-pop').addEventListener('click', (e) => e.stopPropagation());
  container.querySelector('#tc-direction-pop').addEventListener('change', async (e) => {
    const box = e.target.closest('input[type="checkbox"]');
    if (!box) return;
    if (box.checked) directionDd.selected.add(box.dataset.dir); else directionDd.selected.delete(box.dataset.dir);
    filters.direction = directionDd.selected.size === 1 ? [...directionDd.selected][0] : '';
    filters.category_id = '';
    page = 1;
    syncDirectionLabel();
    await loadCategoryFilter();
    updateClearFilterBtn();
    load();
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#tc-direction-dd')) {
      container.querySelector('#tc-direction-pop')?.classList.add('hidden');
      container.querySelector('#tc-direction-btn')?.setAttribute('aria-expanded', 'false');
    }
  }, { capture: true });
  container.querySelector('#tc-account').addEventListener('change', (e) => { filters.account_id = e.target.value; page = 1; load(); });
  container.querySelector('#tc-category').addEventListener('change', (e) => { filters.category_id = e.target.value; page = 1; load(); });
  container.querySelector('#tc-search').addEventListener('input', (e) => { filters.q = e.target.value; page = 1; load(); });
  container.querySelector('#tc-voided').addEventListener('change', (e) => { filters.include_voided = e.target.checked ? '1' : ''; page = 1; load(); });

  async function loadAccountFilter() {
    try {
      const res = await api.get('/api/mgr/cash-accounts');
      accounts = res.accounts;
      const sel = container.querySelector('#tc-account');
      sel.innerHTML = '<option value="">Mọi nguồn tiền</option>' + accounts.map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('');
    } catch { /* bỏ qua, bộ lọc vẫn dùng được nếu chưa có nguồn tiền */ }
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
    // Đợt 3 — dùng --money-in/--money-out (đã có sẵn ở css/app.css:24-25) để KPI khớp màu với
    // cột "Số tiền" trong bảng, không định nghĩa biến mới. formatVND() tự thêm dấu trừ cho số âm
    // (toLocaleString) nên phải Math.abs() rồi tự thêm dấu +/- để không bị "-‑100.000₫" lặp dấu.
    const rows = [
      ['Tổng thu', totals.thu, '+', 'var(--money-in)'],
      ['Tổng chi', totals.chi, '-', 'var(--money-out)'],
      ['Chênh lệch', totals.net, totals.net >= 0 ? '+' : '-', totals.net >= 0 ? 'var(--money-in)' : 'var(--money-out)'],
    ];
    container.querySelector('#tc-stats').innerHTML = rows.map(([label, value, sign, color]) => `
      <div class="hd-stat">
        <div class="hd-stat-value" style="color:${color}">${sign}${escapeHtml(formatVND(Math.abs(value)))}</div>
        <div class="hd-stat-label">${escapeHtml(label)}</div>
      </div>`).join('');
  }

  function renderList() {
    const el = container.querySelector('#tc-list');
    if (!transactions.length) {
      el.innerHTML = `<div class="hd-empty">${icon('tim-kiem')}<p>Không có phiếu nào phù hợp</p></div>`;
      return;
    }
    el.innerHTML = `
      <div class="hd-table-wrap">
        <table class="hd-table">
          <thead><tr>
            <th>Mã phiếu / Ngày</th><th class="hd-num">Số tiền</th>
            <th data-col="col-category">Phân loại</th>
            <th data-col="col-account">Nguồn tiền</th>
            <th data-col="col-partner">Đối tác</th>
            <th data-col="col-note">Mô tả</th>
            <th data-col="col-order-code">Mã giao dịch</th>
            ${canManage ? '<th class="hd-act-col">Thao tác</th>' : ''}
          </tr></thead>
          <tbody>
            ${transactions.map((t) => `
              <tr class="${t.voided_at ? 'hd-row-voided' : ''}">
                <td>
                  <div class="tc-td-code">${escapeHtml(t.code)}</div>
                  <div class="tc-td-sub">${escapeHtml(new Date(t.occurred_at).toLocaleString('vi-VN'))}</div>
                </td>
                <td class="hd-num" style="color:${t.direction === 'thu' ? 'var(--money-in)' : 'var(--money-out)'}">
                  ${t.direction === 'thu' ? '+' : '-'}${escapeHtml(formatVND(t.amount))}
                </td>
                <td data-col="col-category">${escapeHtml(t.category_name || 'Chưa phân loại')}</td>
                <td data-col="col-account">${escapeHtml(t.account_name || '')}</td>
                <td data-col="col-partner">${escapeHtml(t.partner_name || '—')}${t.voided_at ? `<br><small class="hd-overdue">ĐÃ HUỶ${t.void_reason ? ' — ' + escapeHtml(t.void_reason) : ''}</small>` : ''}</td>
                <td data-col="col-note">${escapeHtml(t.note || '—')}</td>
                <td data-col="col-order-code">${t.order_code ? escapeHtml(t.order_code) : '—'}</td>
                ${canManage ? `<td class="hd-act-col">${!t.voided_at ? `<button type="button" class="hd-row-btn danger" data-void="${t.id}">Huỷ phiếu</button>` : ''}</td>` : ''}
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;
    if (canManage) {
      el.querySelectorAll('[data-void]').forEach((btn) => {
        btn.addEventListener('click', () => voidTxn(parseInt(btn.dataset.void, 10)));
      });
    }
  }

  function renderPagination() {
    const el = container.querySelector('#tc-pagination');
    if (!el) return;
    const count = totals.count || 0;
    if (!count) { el.innerHTML = ''; return; }
    const start = (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, count);
    const lastPage = Math.max(Math.ceil(count / pageSize), 1);
    el.innerHTML = `
      <span class="tc-page-info">Hiển thị ${start}–${end} / ${count} kết quả</span>
      <label class="tc-page-size">
        Số dòng/trang
        <select id="tc-page-size-sel">
          ${[10, 30, 50, 100].map((n) => `<option value="${n}" ${n === pageSize ? 'selected' : ''}>${n}</option>`).join('')}
        </select>
      </label>
      <button type="button" class="btn btn-ghost tc-page-btn" id="tc-page-prev" ${page <= 1 ? 'disabled' : ''}>‹</button>
      <span class="tc-page-cur">Trang ${page}/${lastPage}</span>
      <button type="button" class="btn btn-ghost tc-page-btn" id="tc-page-next" ${page >= lastPage ? 'disabled' : ''}>›</button>
    `;
    el.querySelector('#tc-page-size-sel').addEventListener('change', (e) => {
      pageSize = parseInt(e.target.value, 10) || 30;
      page = 1;
      load();
    });
    el.querySelector('#tc-page-prev')?.addEventListener('click', () => { if (page > 1) { page -= 1; load(); } });
    el.querySelector('#tc-page-next')?.addEventListener('click', () => { if (page < lastPage) { page += 1; load(); } });
  }

  // ── Column visibility (Đợt 3, copy pattern orders.js Task 6 Đợt 2) ─────────────────────────
  const COL_KEY = 'posmgr.thuchi.cols.v1';
  const TOGGLEABLE_COLS = [
    { id: 'col-category',   label: 'Phân loại' },
    { id: 'col-account',    label: 'Nguồn tiền' },
    { id: 'col-partner',    label: 'Đối tác' },
    { id: 'col-note',       label: 'Mô tả' },
    { id: 'col-order-code', label: 'Mã giao dịch' },
  ];

  function getHiddenCols() {
    try { return JSON.parse(localStorage.getItem(COL_KEY) || '[]'); } catch { return []; }
  }
  function saveHiddenCols(arr) {
    try { localStorage.setItem(COL_KEY, JSON.stringify(arr)); } catch { /* private mode */ }
  }

  function applyColVisibility() {
    const hidden = getHiddenCols();
    const list = container.querySelector('#tc-list');
    if (!list) return;
    TOGGLEABLE_COLS.forEach(({ id }) => {
      const isHidden = hidden.includes(id);
      list.querySelectorAll(`[data-col="${id}"]`).forEach((el) => el.classList.toggle('tc-col-hidden', isHidden));
    });
  }

  function openColPop() {
    const pop = container.querySelector('#tc-cols-pop');
    const btn = container.querySelector('#tc-cols-btn');
    if (!pop || !btn) return;
    const hidden = getHiddenCols();
    pop.innerHTML = TOGGLEABLE_COLS.map(({ id, label }) => `
      <label class="tc-col-row">
        <input type="checkbox" data-col-toggle="${id}" ${hidden.includes(id) ? '' : 'checked'} />
        <span>${label}</span>
      </label>`).join('');
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
    pop.classList.toggle('hidden');
    btn.setAttribute('aria-expanded', !pop.classList.contains('hidden'));
  }

  container.querySelector('#tc-cols-btn')?.addEventListener('click', openColPop);
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#tc-cols-wrap')) {
      container.querySelector('#tc-cols-pop')?.classList.add('hidden');
      container.querySelector('#tc-cols-btn')?.setAttribute('aria-expanded', 'false');
    }
  }, { capture: true });

  async function voidTxn(id) {
    const reason = await promptDialog('Lý do huỷ phiếu:', { required: true });
    if (!reason) return;
    try {
      await api.post(`/api/mgr/transactions/${id}/void`, { reason: reason.trim() });
      toast('Đã huỷ phiếu');
      await load();
    } catch (err) {
      toast(err?.body?.message || 'Không huỷ được phiếu', 'error');
    }
  }

  // ── Đợt 3 Task 4 — chip "x Xoá lọc" ─────────────────────────────────────────────────────────
  // So sánh với TRẠNG THÁI MẶC ĐỊNH lúc mở màn (hôm nay, không lọc gì khác) — không phải object
  // rỗng, vì filters.from/to mặc định LÀ hôm nay chứ không phải chuỗi rỗng.
  function defaultFilters() {
    return { from: todayStr(), to: todayStr(), direction: '', account_id: '', category_id: '', q: '', include_voided: '' };
  }
  function isFiltered() {
    const d = defaultFilters();
    return Object.keys(d).some((k) => filters[k] !== d[k]);
  }
  function updateClearFilterBtn() {
    container.querySelector('#tc-clear-filter')?.classList.toggle('hidden', !isFiltered());
  }

  container.querySelector('#tc-clear-filter').addEventListener('click', async () => {
    Object.assign(filters, defaultFilters());
    container.querySelector('#tc-search').value = '';
    container.querySelector('#tc-account').value = '';
    container.querySelector('#tc-voided').checked = false;
    directionDd.selected.clear();
    container.querySelectorAll('#tc-direction-pop input[type="checkbox"]').forEach((cb) => { cb.checked = false; });
    syncDirectionLabel();
    page = 1;
    await loadCategoryFilter();
    tcPicker.updateLabel();
    tcPicker.syncQuick();
    updateClearFilterBtn();
    load();
  });

  function queryString() {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
    params.set('page', String(page));
    params.set('page_size', String(pageSize));
    return params.toString();
  }

  async function load() {
    updateClearFilterBtn();
    const mySeq = ++loadSeq;
    const el = container.querySelector('#tc-list');
    el.innerHTML = '<p>Đang tải…</p>';
    try {
      const res = await api.get(`/api/mgr/transactions?${queryString()}`);
      if (mySeq !== loadSeq) return; // đã có yêu cầu mới hơn xuất phát sau, bỏ phản hồi cũ này
      transactions = res.transactions;
      totals = res.totals;
      page = res.page || page;
      pageSize = res.page_size || pageSize;
      renderTotals();
      renderList();
      applyColVisibility();
      renderPagination();
    } catch (err) {
      if (mySeq !== loadSeq) return;
      if (err?.status !== 401 && err?.status !== 403) el.innerHTML = '<p>Không tải được danh sách phiếu.</p>';
    }
  }

  await loadAccountFilter();
  await load();
}
