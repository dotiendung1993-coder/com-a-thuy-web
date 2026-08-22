// Task 3 (13/08/2026) — HOÁ ĐƠN ĐẦU RA (ảnh HD-06).
//
// Đơn giản hơn màn đầu vào vì KHÔNG nhập tay: mỗi dòng là một đơn hàng đã hoàn thành có thật
// trong sales_orders. Đơn đã phát hành hoá đơn nằm tab "Đã phát hành", chưa thì "Chưa phát hành".
// Nhờ vậy "Tổng doanh thu" ở đây luôn khớp Báo cáo bán hàng — không có đường nào gõ lệch được.
import { api } from '../api.js';
import { escapeHtml, formatVND, toast, confirmDialog, openModal } from '../ui.js';
import { icon } from '../icons.js';
import { createRangePicker, rangePickerHtml } from '../date-range-picker.js';
import { dmy } from '../date-utils.js';
import { filterDropdownHtml, bindFilterDropdown } from '../filter-dropdown.js';

const OUT_TABS = [
  ['chua-phat-hanh', 'Chưa phát hành'],
  ['da-phat-hanh', 'Đã phát hành'],
];
const LS_COLS = 'posmgr.hoadonra.cols.v1';
const PROCESS_STATUS_LABEL = { 'chua-xu-ly': 'Chưa xử lý', 'da-xu-ly': 'Đã xử lý' };
/** Ô lọc "Trạng thái xử lý" (ảnh Website v2) — chỉ có ý nghĩa với hoá đơn ĐÃ phát hành. */
const PROCESS_STATUS_FILTER = [['chua-xu-ly', 'Hoá đơn chưa được xử lý'], ['da-xu-ly', 'Hoá đơn đã được xử lý']];
const MONEY_COLS = new Set(['total']);
const DATE_COLS = new Set(['created_at', 'issued_at']);

function readHiddenCols() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_COLS) || '[]');
    return new Set(Array.isArray(raw) ? raw.filter((x) => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

/** '2026-08-13T10:22:00Z' → '13/08/2026 10:22' theo giờ VN. */
export function stampVN(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d).reduce((a, x) => ({ ...a, [x.type]: x.value }), {});
  return `${dmy(`${p.year}-${p.month}-${p.day}`)} ${p.hour}:${p.minute}`;
}

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.report) {
    container.innerHTML = '<p>Bạn không có quyền xem hoá đơn.</p>';
    return;
  }
  const canManage = !!perms.settings_manage;

  const state = { q: '', from: '', to: '', tab: 'chua-phat-hanh', processStatus: [] };
  let data = { invoices: [], stats: {}, columns: [] };
  let hiddenCols = readHiddenCols();
  let taxRate = 0;

  const pickerIds = {
    btn: 'hdr-date-btn', label: 'hdr-date-label', pop: 'hdr-date-pop',
    calLeft: 'hdr-cal-left', calRight: 'hdr-cal-right',
    quick: 'hdr-quick', yearBtn: 'hdr-year-btn', yearPop: 'hdr-year-pop',
    sel: 'hdr-sel', clear: 'hdr-clear', apply: 'hdr-apply',
  };

  container.innerHTML = `
    <h2>Quản lý hoá đơn</h2>
    <div class="tab-row page-tabs group-nav">
      <button class="tab active" type="button" aria-current="page">${icon('hoa-don-ra')} Hoá đơn đầu ra</button>
      <a class="tab" href="#/hoa-don-vao">${icon('hoa-don-vao')} Hoá đơn đầu vào</a>
    </div>

    <div class="hd-head">
      <h3 class="hd-title">Hoá đơn đầu ra</h3>
      <div class="hd-head-actions">
        <!-- "Nhập từ file" (ảnh Website v2) — chỉ hiện ở tab "Đã phát hành", đính file .xml/.zip
             đã ký cho hoá đơn đã phát hành, khớp bằng tên file "KýHiệu_SốHoáĐơn.xml". -->
        <button type="button" class="btn btn-primary hidden" id="hdr-import-signed">${icon('nhap-hang')} Nhập từ file</button>
        <div class="hd-split" id="hdr-cog-wrap">
          <button type="button" class="btn btn-ghost hd-cog" id="hdr-cog" aria-haspopup="dialog" aria-expanded="false"
            aria-label="Ẩn / Hiện cột">${icon('cai-dat')} ▾</button>
          <div class="hd-colpop hidden" id="hdr-colpop" role="dialog" aria-label="Ẩn / Hiện cột">
            <div class="hd-colpop-head">
              <b>Ẩn / Hiện cột</b>
              <small>Chọn các cột muốn hiển thị trên bảng</small>
            </div>
            <div class="hd-colpop-list" id="hdr-collist"></div>
            <button type="button" class="btn btn-primary" id="hdr-colok">Xác nhận</button>
          </div>
        </div>
        <button type="button" class="btn btn-ghost" id="hdr-export">${icon('tai-xuong')} Xuất file</button>
      </div>
    </div>

    <div class="hd-tools">
      <label class="hd-search">
        <span class="inline-ico">${icon('tim-kiem')}</span>
        <input id="hdr-q" type="search" placeholder="Tên khách hàng, số hoá đơn" aria-label="Tìm hoá đơn đầu ra" />
      </label>
      <div class="ord-date-wrap hd-range" id="hdr-range">
        ${rangePickerHtml(pickerIds, 'Từ ngày - Đến ngày', 'Chọn khoảng ngày')}
      </div>
      ${filterDropdownHtml('hdr-procstatus', 'Trạng thái xử lý', PROCESS_STATUS_FILTER)}
      <button type="button" class="btn btn-ghost hd-filter-btn" id="hdr-clear-filter"
        title="Xoá mọi bộ lọc">${icon('tim-kiem')} Xoá lọc</button>
    </div>

    <div class="hd-stats hd-stats-2" id="hdr-stats"></div>

    <div class="tab-row hd-subtabs" id="hdr-subtabs" role="tablist">
      ${OUT_TABS.map(([v, label], i) => `
        <button class="tab${i === 0 ? ' active' : ''}" type="button" role="tab" data-tab="${v}">
          ${escapeHtml(label)}
        </button>`).join('')}
    </div>

    <div id="hdr-list"><p>Đang tải…</p></div>
  `;

  const qInput = container.querySelector('#hdr-q');
  let qTimer = null;
  qInput.addEventListener('input', () => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => { state.q = qInput.value.trim(); load(); }, 300);
  });

  createRangePicker(container.querySelector('#hdr-range'), pickerIds, {
    emptyLabel: 'Từ ngày - Đến ngày',
    getFrom: () => state.from,
    getTo: () => state.to,
    set: (from, to) => { state.from = from; state.to = to; },
    onCommit: () => load(),
    onWarn: (m) => toast(m, 'error'),
  });

  const procStatusFilter = bindFilterDropdown(container, 'hdr-procstatus', () => closeAllPops(), (vals) => {
    state.processStatus = vals; load();
  });

  container.querySelector('#hdr-clear-filter').addEventListener('click', () => {
    state.q = ''; state.from = ''; state.to = ''; state.processStatus = [];
    qInput.value = '';
    procStatusFilter.reset();
    container.querySelector(`#${pickerIds.clear}`).click();
  });

  const importSignedBtn = container.querySelector('#hdr-import-signed');
  container.querySelectorAll('#hdr-subtabs .tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.tab = btn.dataset.tab;
      container.querySelectorAll('#hdr-subtabs .tab').forEach((b) => b.classList.toggle('active', b === btn));
      importSignedBtn.classList.toggle('hidden', state.tab !== 'da-phat-hanh' || !canManage);
      load();
    });
  });
  importSignedBtn.classList.toggle('hidden', state.tab !== 'da-phat-hanh' || !canManage);
  importSignedBtn.addEventListener('click', () => openImportSigned());

  // ── Ẩn / Hiện cột ─────────────────────────────────────────────────────────
  const colPop = container.querySelector('#hdr-colpop');
  // Bug (18/08/2026, phát hiện lúc kiểm tay trên Chrome thật) — cùng gốc rễ với màn đầu vào: router
  // dùng CHUNG một `container`, bấm sang màn khác rồi bấm chuột lần nữa là closure cũ vẫn chạy,
  // querySelector('#hdr-cog') tìm trong nội dung màn MỚI không ra gì → null → .setAttribute() ném
  // lỗi trắng console. Dùng `?.` để yên lặng bỏ qua khi đã rời màn.
  function closeAllPops() {
    colPop.classList.add('hidden');
    procStatusFilter.close();
    container.querySelector('#hdr-cog')?.setAttribute('aria-expanded', 'false');
  }
  document.addEventListener('click', closeAllPops);
  container.querySelector('#hdr-cog-wrap').addEventListener('click', (e) => e.stopPropagation());
  container.querySelector('#hdr-cog').addEventListener('click', () => {
    const show = colPop.classList.contains('hidden');
    closeAllPops();
    colPop.classList.toggle('hidden', !show);
    container.querySelector('#hdr-cog').setAttribute('aria-expanded', show ? 'true' : 'false');
    if (show) drawColList();
  });
  container.querySelector('#hdr-colok').addEventListener('click', () => {
    const next = new Set();
    colPop.querySelectorAll('[data-col]').forEach((cb) => { if (!cb.checked) next.add(cb.dataset.col); });
    if (next.size >= data.columns.length) { toast('Phải chừa lại ít nhất một cột', 'error'); return; }
    hiddenCols = next;
    try { localStorage.setItem(LS_COLS, JSON.stringify([...hiddenCols])); } catch { /* riêng tư */ }
    closeAllPops();
    renderList();
  });
  function drawColList() {
    colPop.querySelector('#hdr-collist').innerHTML = data.columns.map(([key, label]) => `
      <label class="hd-colrow">
        <span>${escapeHtml(label)}</span>
        <input type="checkbox" data-col="${key}" ${hiddenCols.has(key) ? '' : 'checked'} />
      </label>`).join('');
  }

  /** Giá trị THÔ của một ô — dùng cho cả bảng lẫn file xuất, giống màn đầu vào. */
  function rawCell(r, key) {
    if (key === 'customer_name') return r.customer_name || 'Khách lẻ';
    if (key === 'customer_phone') return r.customer_phone || '';
    if (key === 'invoice_type') return r.invoice_type || (r.issued ? 'Hoá đơn GTGT' : '');
    if (key === 'serial' || key === 'invoice_no') return r[key] || '—';
    if (DATE_COLS.has(key)) return r[key] ? stampVN(r[key]) : '—';
    if (MONEY_COLS.has(key)) return formatVND(Number(r[key]) || 0);
    return r[key] == null ? '' : String(r[key]);
  }

  container.querySelector('#hdr-export').addEventListener('click', () => {
    if (!data.invoices.length) { toast('Không có hoá đơn nào để xuất', 'error'); return; }
    const cols = data.columns.filter(([key]) => !hiddenCols.has(key));
    const cell = (v) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const head = cols.map(([, label]) => cell(label)).join(',');
    const lines = data.invoices.map((r) => cols.map(([key]) => cell(rawCell(r, key))).join(','));
    const blob = new Blob([`﻿${head}\n${lines.join('\n')}`],
      { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `hoa-don-dau-ra-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(`Đã xuất ${data.invoices.length} dòng`);
  });

  /** Nút "Nhập từ file" (ảnh Website v2) — đọc .xml/.zip ngay trong trình duyệt, gửi base64 lên. */
  function openImportSigned() {
    const { overlay, close } = openModal(`
      <h3>Nhập file hoá đơn đầu ra</h3>
      <p class="hint">Hoá đơn chỉ được cập nhật khi đúng định dạng file, mẫu số/ký hiệu, chữ ký số
        hợp lệ. Đặt tên file đúng khuôn <b>KýHiệu_SốHoáĐơn.xml</b> (hoặc .zip) để máy khớp đúng hoá
        đơn đã phát hành — liên hệ nhà cung cấp để được gửi lại file đúng tên nếu cần.</p>
      <input type="file" id="hdr-signed-file" accept=".xml,.zip" multiple />
      <div id="hdr-signed-log" class="hint"></div>
      <div class="dlg-actions">
        <button class="btn" id="hdr-signed-cancel">Huỷ</button>
        <button class="btn btn-primary" id="hdr-signed-ok" disabled>Nhập file</button>
      </div>
    `);
    let files = [];
    const log = overlay.querySelector('#hdr-signed-log');
    const okBtn = overlay.querySelector('#hdr-signed-ok');
    overlay.querySelector('#hdr-signed-cancel').addEventListener('click', close);
    overlay.querySelector('#hdr-signed-file').addEventListener('change', async (e) => {
      const list = [...(e.target.files || [])];
      if (!list.length) return;
      files = await Promise.all(list.map((f) => new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ name: f.name, content_base64: String(reader.result).split(',')[1] || '' });
        reader.onerror = () => resolve({ name: f.name, content_base64: '' });
        reader.readAsDataURL(f);
      })));
      log.textContent = `Đã chọn ${files.length} file.`;
      okBtn.disabled = !files.length;
    });
    okBtn.addEventListener('click', async () => {
      okBtn.disabled = true;
      try {
        const res = await api.post('/api/mgr/invoices/out/import-signed', { files });
        toast(`Đã nhập ${res.added} file${res.skipped.length ? `, bỏ qua ${res.skipped.length} file không khớp` : ''}`);
        close();
        load();
      } catch (err) {
        okBtn.disabled = false;
        toast(err?.body?.message || 'Không nhập được file', 'error');
      }
    });
  }

  function renderStats() {
    const s = data.stats || {};
    container.querySelector('#hdr-stats').innerHTML = [
      ['Tổng doanh thu', formatVND(s.revenue || 0)],
      ['Số lượng', String(s.count ?? 0)],
    ].map(([label, value]) => `
      <div class="hd-stat">
        <div class="hd-stat-value">${escapeHtml(value)}</div>
        <div class="hd-stat-label">${escapeHtml(label)}</div>
      </div>`).join('');
  }

  function renderList() {
    const el = container.querySelector('#hdr-list');
    if (!data.invoices.length) {
      el.innerHTML = `<div class="hd-empty">${icon('tim-kiem')}<p>Không tìm thấy kết quả phù hợp</p></div>`;
      return;
    }
    const cols = data.columns.filter(([key]) => !hiddenCols.has(key));
    el.innerHTML = `
      <div class="hd-table-wrap">
        <table class="hd-table">
          <thead><tr>
            ${cols.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join('')}
            ${canManage ? '<th class="hd-act-col">Thao tác</th>' : '<th>Trạng thái</th>'}
          </tr></thead>
          <tbody>
            ${data.invoices.map((r) => `
              <tr>
                ${cols.map(([key]) => `<td class="${MONEY_COLS.has(key) ? 'hd-num' : ''}">${escapeHtml(rawCell(r, key))}</td>`).join('')}
                ${canManage ? `<td class="hd-act-col">${r.issued
    ? `<button type="button" class="hd-row-btn" data-toggle="${r.order_id}">${r.process_status === 'da-xu-ly' ? 'Bỏ xử lý' : 'Đã xử lý'}</button>
       <button type="button" class="hd-row-btn danger" data-cancel="${r.order_id}">Huỷ phát hành</button>`
    : `<button type="button" class="hd-row-btn" data-issue="${r.order_id}">Phát hành</button>`}</td>`
    : `<td>${r.issued ? (PROCESS_STATUS_LABEL[r.process_status] || 'Đã phát hành') : 'Chưa phát hành'}</td>`}
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <p class="hint">Hiện ${data.invoices.length} đơn${data.invoices.length >= 500 ? ' (tối đa 500 dòng — thu hẹp khoảng ngày để xem tiếp)' : ''}.</p>
    `;
    if (!canManage) return;
    el.querySelectorAll('[data-issue]').forEach((b) => b.addEventListener('click', () =>
      openIssue(data.invoices.find((x) => String(x.order_id) === b.dataset.issue))));
    el.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', async () => {
      const r = data.invoices.find((x) => String(x.order_id) === b.dataset.toggle);
      const next = r.process_status === 'da-xu-ly' ? 'chua-xu-ly' : 'da-xu-ly';
      try {
        await api.patch(`/api/mgr/invoices/out/${r.order_id}`, { process_status: next });
        toast(next === 'da-xu-ly' ? 'Đã chuyển sang đã xử lý' : 'Đã chuyển về chưa xử lý');
        load();
      } catch (err) { toast(err?.body?.message || 'Không đổi được', 'error'); }
    }));
    el.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', async () => {
      const r = data.invoices.find((x) => String(x.order_id) === b.dataset.cancel);
      if (!await confirmDialog(`Huỷ phát hành hoá đơn của đơn ${r.order_code}?`,
        { title: 'Huỷ phát hành', okText: 'Huỷ phát hành', danger: true })) return;
      try {
        await api.del(`/api/mgr/invoices/out/${r.order_id}`);
        toast('Đã huỷ phát hành');
        load();
      } catch (err) { toast(err?.body?.message || 'Không huỷ được', 'error'); }
    }));
  }

  /** Hộp thoại phát hành: điền ký hiệu + số hoá đơn, thuế suất lấy sẵn từ Cài đặt › Quản lý thuế. */
  function openIssue(r) {
    const { overlay, close } = openModal(`
      <h3>Phát hành hoá đơn — đơn ${escapeHtml(r.order_code || '')}</h3>
      <p class="hint">Tổng tiền khách đã trả: <b>${escapeHtml(formatVND(Number(r.total) || 0))}</b>.
        Tiền thuế được TÁCH RA từ số này (giá bán đã gồm thuế), không cộng thêm.</p>
      <form id="hdr-form">
        <div class="field"><label>Ký hiệu hoá đơn</label>
          <input name="serial" type="text" placeholder="VD: 1C26TAA" /></div>
        <div class="field"><label>Số hoá đơn</label>
          <input name="invoice_no" type="text" placeholder="VD: 00000123" /></div>
        <div class="field"><label>Mẫu số</label>
          <input name="form_no" type="text" placeholder="VD: 1/001" /></div>
        <div class="field"><label>Tên người mua</label>
          <input name="buyer_name" type="text" value="${escapeHtml(r.customer_name || '')}" /></div>
        <div class="field"><label>Mã số thuế người mua</label>
          <input name="buyer_tax_code" type="text" /></div>
        <div class="field"><label>Địa chỉ người mua</label>
          <input name="buyer_address" type="text" /></div>
        <div class="field"><label>Thuế suất (%)</label>
          <input name="tax_rate" type="number" step="0.1" min="0" value="${taxRate}" /></div>
        <div class="dlg-actions">
          <button type="button" class="btn" id="hdr-form-cancel">Huỷ</button>
          <button type="submit" class="btn btn-primary">Phát hành</button>
        </div>
      </form>
    `);
    overlay.querySelector('#hdr-form-cancel').addEventListener('click', close);
    overlay.querySelector('#hdr-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {};
      new FormData(e.target).forEach((val, key) => { payload[key] = String(val).trim(); });
      try {
        await api.post(`/api/mgr/invoices/out/${r.order_id}`, payload);
        toast(`Đã phát hành hoá đơn cho đơn ${r.order_code}`);
        close();
        load();
      } catch (err) { toast(err?.body?.message || 'Không phát hành được', 'error'); }
    });
  }

  async function load() {
    const params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.from) params.set('from', state.from);
    if (state.to) params.set('to', state.to);
    if (state.processStatus.length) params.set('process_status', state.processStatus.join(','));
    params.set('tab', state.tab);
    try {
      data = await api.get(`/api/mgr/invoices/out?${params}`);
      renderStats();
      renderList();
    } catch (err) {
      container.querySelector('#hdr-list').innerHTML =
        `<p>Không tải được danh sách hoá đơn.${err?.body?.message ? ` ${escapeHtml(err.body.message)}` : ''}</p>`;
    }
  }

  // Thuế suất mặc định chỉ để điền sẵn ô trong hộp thoại — hỏng thì vẫn phát hành được với 0%.
  try {
    const res = await api.get('/api/mgr/settings/tax');
    if (res.value?.enabled) taxRate = Number(res.value.rate) || 0;
  } catch { /* bỏ qua */ }

  await load();
}
