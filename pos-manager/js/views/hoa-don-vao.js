// Task 3 (13/08/2026) — HOÁ ĐƠN ĐẦU VÀO. Sao chép màn /invoice/in của app.sobanhang.com theo
// ảnh HD-01 → HD-05 chủ quán gửi.
//
// Bố cục đúng ảnh HD-05: tiêu đề "Quản lý hoá đơn" + 2 tab (đầu ra · đầu vào) → hàng công cụ
// (ô tìm kiếm · nút khoảng ngày · nút phễu · nút "Đồng bộ hoá đơn" có mũi tên · nút bánh răng)
// → 4 ô thống kê → 2 tab trạng thái xử lý → bảng.
//
// KHÁC app một chỗ, cố ý: nút "Đồng bộ hoá đơn" của app kéo hoá đơn từ Cơ quan thuế. Quán chưa
// nối tài khoản thuế nên nút đó báo rõ "chưa bật đồng bộ, vào Cài đặt > Hoá đơn điện tử" thay vì
// quay vòng vô tận — thà nói thật còn hơn để chủ quán bấm mãi không hiểu sao không có gì.
import { api } from '../api.js';
import { escapeHtml, formatVND, toast, confirmDialog, openModal } from '../ui.js';
import { icon } from '../icons.js';
import { createRangePicker, rangePickerHtml } from '../date-range-picker.js';
import { dmy } from '../date-utils.js';
import { filterDropdownHtml, bindFilterDropdown } from '../filter-dropdown.js';

const LS_COLS = 'posmgr.hoadon.cols.v1';

const PROCESS_TABS = [
  ['chua-xu-ly', 'Hoá đơn chưa xử lý'],
  ['da-xu-ly', 'Hoá đơn đã xử lý'],
];
const INVOICE_STATUS_LABEL = {
  moi: 'Mới', 'hop-le': 'Hợp lệ', 'da-thay-the': 'Đã thay thế',
  'da-huy': 'Đã huỷ', 'dieu-chinh': 'Điều chỉnh',
};
// Đợt 2 (18/08/2026) — đổi nhãn khớp đúng chữ trong ảnh Website v2 (bộ ảnh mới): "Kết quả kiểm
// tra" có 4 lựa chọn Hợp lệ / Chưa xác nhận / Cảnh báo / Không hợp lệ. Giá trị lưu trong CSDL giữ
// nguyên (chua-kiem/khop/lech/khong-tim-thay) — chỉ đổi CHỮ hiện ra màn hình.
const CHECK_STATUS_LABEL = {
  'chua-kiem': 'Chưa xác nhận', khop: 'Hợp lệ', lech: 'Cảnh báo', 'khong-tim-thay': 'Không hợp lệ',
};
const PAYMENT_METHOD_LABEL = { 'tien-mat': 'Tiền mặt', 'chuyen-khoan': 'Chuyển khoản', the: 'Thẻ', khac: 'Khác' };
const PAYMENT_STATUS_LABEL = { 'chua-thanh-toan': 'Chưa thanh toán', 'da-thanh-toan': 'Đã thanh toán', 'mot-phan': 'Một phần' };
/** Ô lọc nhiều-chọn "Trạng thái hoá đơn" / "Kết quả kiểm tra" (ảnh Website v2, HD-02/HD-03 mới). */
const INVOICE_STATUS_FILTER = Object.keys(INVOICE_STATUS_LABEL).map((v) => [v, INVOICE_STATUS_LABEL[v]]);
const CHECK_STATUS_FILTER = Object.keys(CHECK_STATUS_LABEL).map((v) => [v, CHECK_STATUS_LABEL[v]]);
/** Cột nào là tiền, cột nào là ngày — để vẽ ô trong bảng cho đúng kiểu. */
const MONEY_COLS = new Set(['amount_before_tax', 'tax_amount', 'total_amount', 'fee_amount']);
const DATE_COLS = new Set(['created_date', 'issued_at', 'signed_at']);

/** Đọc danh sách cột đang ẩn của máy này. Hỏng dữ liệu thì coi như không ẩn cột nào. */
function readHiddenCols() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_COLS) || '[]');
    return new Set(Array.isArray(raw) ? raw.filter((x) => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.report) {
    container.innerHTML = '<p>Bạn không có quyền xem hoá đơn.</p>';
    return;
  }
  const canManage = !!perms.settings_manage;

  const state = { q: '', from: '', to: '', tab: 'chua-xu-ly', invoiceStatus: [], checkStatus: [] };
  let data = { invoices: [], stats: {}, columns: [] };
  let hiddenCols = readHiddenCols();

  const pickerIds = {
    btn: 'hdv-date-btn', label: 'hdv-date-label', pop: 'hdv-date-pop',
    calLeft: 'hdv-cal-left', calRight: 'hdv-cal-right',
    quick: 'hdv-quick', yearBtn: 'hdv-year-btn', yearPop: 'hdv-year-pop',
    sel: 'hdv-sel', clear: 'hdv-clear', apply: 'hdv-apply',
  };

  container.innerHTML = `
    <h2>Quản lý hoá đơn</h2>
    <div class="tab-row page-tabs group-nav">
      <a class="tab" href="#/hoa-don-ra">${icon('hoa-don-ra')} Hoá đơn đầu ra</a>
      <button class="tab active" type="button" aria-current="page">${icon('hoa-don-vao')} Hoá đơn đầu vào</button>
    </div>

    <div class="hd-head">
      <h3 class="hd-title">Hoá đơn đầu vào</h3>
      <div class="hd-head-actions">
        ${canManage ? '<button type="button" class="btn btn-primary" id="hdv-add-top">+ Thêm hoá đơn</button>' : ''}
        <!-- Đợt 2 (18/08/2026, ảnh Website v2) — bố cục MỚI: "Thao tác ▾" (Nhập/Xuất file) tách
             riêng khỏi nút "Đồng bộ hoá đơn" (bấm chạy thẳng, không còn menu con). -->
        <div class="hd-split" id="hdv-actions-wrap">
          <button type="button" class="btn btn-ghost" id="hdv-actions-caret"
            aria-haspopup="menu" aria-expanded="false">Thao tác ▾</button>
          <div class="hd-menu hidden" id="hdv-actions-menu" role="menu">
            <button type="button" role="menuitem" data-act="import">${icon('nhap-hang')}<span>Nhập file</span></button>
            <button type="button" role="menuitem" data-act="export">${icon('tai-xuong')}<span>Xuất file</span></button>
          </div>
        </div>
        <button type="button" class="btn btn-primary" id="hdv-sync">${icon('ma-qr')} Đồng bộ hoá đơn</button>
        <div class="hd-split" id="hdv-cog-wrap">
          <button type="button" class="btn btn-ghost hd-cog" id="hdv-cog" aria-haspopup="dialog" aria-expanded="false"
            aria-label="Ẩn / Hiện cột">${icon('cai-dat')} ▾</button>
          <div class="hd-colpop hidden" id="hdv-colpop" role="dialog" aria-label="Ẩn / Hiện cột">
            <div class="hd-colpop-head">
              <b>Ẩn / Hiện cột</b>
              <small>Chọn các cột muốn hiển thị trên bảng</small>
            </div>
            <div class="hd-colpop-list" id="hdv-collist"></div>
            <button type="button" class="btn btn-primary" id="hdv-colok">Xác nhận</button>
          </div>
        </div>
      </div>
    </div>

    <div class="hd-tools">
      <label class="hd-search">
        <span class="inline-ico">${icon('tim-kiem')}</span>
        <input id="hdv-q" type="search" placeholder="Tìm theo MST, số hoá đơn, tên nhà cung cấp"
          aria-label="Tìm hoá đơn" />
      </label>
      <div class="ord-date-wrap hd-range" id="hdv-range">
        ${rangePickerHtml(pickerIds, 'Từ ngày - Đến ngày', 'Chọn khoảng ngày')}
      </div>
      ${filterDropdownHtml('hdv-invstatus', 'Trạng thái hoá đơn', INVOICE_STATUS_FILTER)}
      ${filterDropdownHtml('hdv-checkstatus', 'Kết quả kiểm tra', CHECK_STATUS_FILTER)}
      <button type="button" class="btn btn-ghost hd-filter-btn" id="hdv-clear-filter"
        title="Xoá mọi bộ lọc">${icon('tim-kiem')} Xoá lọc</button>
    </div>

    <div class="hd-stats" id="hdv-stats"></div>

    <div class="tab-row hd-subtabs" id="hdv-subtabs" role="tablist">
      ${PROCESS_TABS.map(([v, label], i) => `
        <button class="tab${i === 0 ? ' active' : ''}" type="button" role="tab" data-tab="${v}">
          ${escapeHtml(label)}
        </button>`).join('')}
    </div>

    <div id="hdv-list"><p>Đang tải…</p></div>
  `;

  // ── Bộ lọc ────────────────────────────────────────────────────────────────
  const qInput = container.querySelector('#hdv-q');
  let qTimer = null;
  qInput.addEventListener('input', () => {
    // Gõ tới đâu tìm tới đó nhưng chờ 300ms — gõ "nhà cung cấp" mà bắn 13 lượt gọi máy chủ thì
    // kết quả về lộn xộn, cái sau đè cái trước.
    clearTimeout(qTimer);
    qTimer = setTimeout(() => { state.q = qInput.value.trim(); load(); }, 300);
  });

  createRangePicker(container.querySelector('#hdv-range'), pickerIds, {
    emptyLabel: 'Từ ngày - Đến ngày',
    getFrom: () => state.from,
    getTo: () => state.to,
    set: (from, to) => { state.from = from; state.to = to; },
    onCommit: () => load(),
    onWarn: (m) => toast(m, 'error'),
  });

  // Task 3 fix (13/08/2026, đợt sau) — nút "+ Thêm hoá đơn" trước đây CHỈ có ở empty-state, mất
  // hẳn khi danh sách đã có hoá đơn (không còn cách nào thêm mới). Ghim thêm 1 bản ở hàng trên
  // cùng, cạnh "Đồng bộ hoá đơn ▾", luôn hiện bất kể danh sách rỗng hay không.
  if (canManage) {
    container.querySelector('#hdv-add-top').addEventListener('click', () => openForm(null));
  }

  // ── 2 ô lọc nhiều-chọn mới (đợt 2, 18/08/2026) ────────────────────────────
  const invStatusFilter = bindFilterDropdown(container, 'hdv-invstatus', () => closeAllPops(), (vals) => {
    state.invoiceStatus = vals; load();
  });
  const checkStatusFilter = bindFilterDropdown(container, 'hdv-checkstatus', () => closeAllPops(), (vals) => {
    state.checkStatus = vals; load();
  });

  container.querySelector('#hdv-clear-filter').addEventListener('click', () => {
    state.q = ''; state.from = ''; state.to = ''; state.invoiceStatus = []; state.checkStatus = [];
    qInput.value = '';
    invStatusFilter.reset();
    checkStatusFilter.reset();
    // Nút "Xoá ngày" trong bảng lịch là đường duy nhất đồng bộ lại nhãn trên nút ngày.
    container.querySelector(`#${pickerIds.clear}`).click();
  });

  container.querySelectorAll('#hdv-subtabs .tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.tab = btn.dataset.tab;
      container.querySelectorAll('#hdv-subtabs .tab').forEach((b) => b.classList.toggle('active', b === btn));
      load();
    });
  });

  // ── "Thao tác ▾" (Nhập/Xuất file) + nút "Đồng bộ hoá đơn" chạy thẳng (ảnh Website v2) ─────
  const actionsMenu = container.querySelector('#hdv-actions-menu');
  const colPop = container.querySelector('#hdv-colpop');
  // Bug (18/08/2026, phát hiện lúc kiểm tay trên Chrome thật): document.addEventListener('click', …)
  // không bao giờ được gỡ khi rời màn này — router dùng CHUNG một `container`, chỉ thay
  // `innerHTML` mỗi lần chuyển màn. Bấm sang trang khác rồi bấm chuột lần nữa là closure cũ vẫn
  // chạy, querySelector('#hdv-…') tìm trong nội dung màn MỚI không ra gì, trả về null,
  // .setAttribute() ném lỗi trắng console. Dùng `?.` để yên lặng bỏ qua khi đã rời màn.
  function closeAllPops() {
    actionsMenu.classList.add('hidden');
    colPop.classList.add('hidden');
    invStatusFilter.close();
    checkStatusFilter.close();
    container.querySelector('#hdv-actions-caret')?.setAttribute('aria-expanded', 'false');
    container.querySelector('#hdv-cog')?.setAttribute('aria-expanded', 'false');
  }
  document.addEventListener('click', closeAllPops);
  container.querySelector('#hdv-actions-wrap').addEventListener('click', (e) => e.stopPropagation());
  container.querySelector('#hdv-cog-wrap').addEventListener('click', (e) => e.stopPropagation());

  container.querySelector('#hdv-actions-caret').addEventListener('click', () => {
    const show = actionsMenu.classList.contains('hidden');
    closeAllPops();
    actionsMenu.classList.toggle('hidden', !show);
    container.querySelector('#hdv-actions-caret').setAttribute('aria-expanded', show ? 'true' : 'false');
  });
  container.querySelector('#hdv-sync').addEventListener('click', () => doSync());
  actionsMenu.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    closeAllPops();
    if (btn.dataset.act === 'import') openImport();
    if (btn.dataset.act === 'export') doExport();
  });

  async function doSync() {
    let cfg = {};
    try {
      const res = await api.get('/api/mgr/settings/e_invoice');
      cfg = res.value || {};
    } catch { /* không đọc được cài đặt thì coi như chưa bật */ }
    if (!cfg.sync_enabled || !cfg.tax_account) {
      toast('Chưa bật đồng bộ với Cơ quan thuế. Vào Cài đặt › Hoá đơn điện tử để khai tài khoản.', 'error');
      return;
    }
    toast('Đã bật đồng bộ nhưng chưa nối được Cơ quan thuế. Tạm thời dùng "Nhập file" hoặc thêm tay.', 'error');
  }

  // ── Nhập file (ảnh HD-04) ────────────────────────────────────────────────
  // Đọc CSV ngay trong trình duyệt rồi gửi mảng dòng lên — không phải dựng chỗ nhận file ở máy chủ.
  function openImport() {
    if (!canManage) { toast('Bạn không có quyền nhập hoá đơn', 'error'); return; }
    const { overlay, close } = openModal(`
      <h3>Nhập file hoá đơn đầu vào</h3>
      <p class="hint">Chọn file CSV có dòng đầu là tên cột. Tên cột nhận được:
        <b>supplier_name</b> (bắt buộc), supplier_tax_code, serial, invoice_no, form_no,
        created_date, issued_at, goods_desc, amount_before_tax, tax_rate, tax_amount,
        fee_amount, total_amount.</p>
      <input type="file" id="hdv-file" accept=".csv,text/csv" />
      <div id="hdv-import-log" class="hint"></div>
      <div class="dlg-actions">
        <button class="btn" id="hdv-import-cancel">Huỷ</button>
        <button class="btn btn-primary" id="hdv-import-ok" disabled>Nhập</button>
      </div>
    `);
    let rows = [];
    const log = overlay.querySelector('#hdv-import-log');
    const okBtn = overlay.querySelector('#hdv-import-ok');
    overlay.querySelector('#hdv-import-cancel').addEventListener('click', close);
    overlay.querySelector('#hdv-file').addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        rows = parseCsv(await file.text());
        log.textContent = `Đọc được ${rows.length} dòng.`;
        okBtn.disabled = !rows.length;
      } catch (err) {
        rows = [];
        okBtn.disabled = true;
        log.textContent = err.message || 'Không đọc được file';
      }
    });
    okBtn.addEventListener('click', async () => {
      okBtn.disabled = true;
      try {
        const res = await api.post('/api/mgr/invoices/in/import', { rows });
        toast(`Đã nhập ${res.added} hoá đơn${res.skipped.length ? `, bỏ qua ${res.skipped.length} dòng trùng/lỗi` : ''}`);
        close();
        load();
      } catch (err) {
        okBtn.disabled = false;
        toast(err?.body?.message || 'Không nhập được file', 'error');
      }
    });
  }

  function doExport() {
    if (!data.invoices.length) { toast('Không có hoá đơn nào để xuất', 'error'); return; }
    // Xuất ĐÚNG những cột đang hiện, đúng thứ tự trên bảng — chủ quán mở file ra thấy y như màn hình.
    const cols = data.columns.filter(([key]) => !hiddenCols.has(key));
    const head = cols.map(([, label]) => csvCell(label)).join(',');
    const lines = data.invoices.map((inv) => cols.map(([key]) => csvCell(rawCell(inv, key))).join(','));
    // ﻿ (BOM) — thiếu nó là Excel mở ra tiếng Việt thành "HoÃ¡ Ä'Æ¡n".
    const blob = new Blob([`﻿${head}\n${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `hoa-don-dau-vao-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(`Đã xuất ${data.invoices.length} hoá đơn`);
  }

  // ── Ẩn / Hiện cột (ảnh HD-01 → HD-03) ────────────────────────────────────
  container.querySelector('#hdv-cog').addEventListener('click', () => {
    const show = colPop.classList.contains('hidden');
    closeAllPops();
    colPop.classList.toggle('hidden', !show);
    container.querySelector('#hdv-cog').setAttribute('aria-expanded', show ? 'true' : 'false');
    if (show) drawColList();
  });
  container.querySelector('#hdv-colok').addEventListener('click', () => {
    const next = new Set();
    colPop.querySelectorAll('[data-col]').forEach((cb) => { if (!cb.checked) next.add(cb.dataset.col); });
    if (next.size >= data.columns.length) {
      toast('Phải chừa lại ít nhất một cột', 'error');
      return;
    }
    hiddenCols = next;
    try { localStorage.setItem(LS_COLS, JSON.stringify([...hiddenCols])); } catch { /* riêng tư */ }
    closeAllPops();
    renderList();
  });

  function drawColList() {
    colPop.querySelector('#hdv-collist').innerHTML = data.columns.map(([key, label]) => `
      <label class="hd-colrow">
        <span>${escapeHtml(label)}</span>
        <input type="checkbox" data-col="${key}" ${hiddenCols.has(key) ? '' : 'checked'} />
      </label>`).join('');
  }

  // ── Vẽ ────────────────────────────────────────────────────────────────────
  function renderStats() {
    const s = data.stats || {};
    container.querySelector('#hdv-stats').innerHTML = [
      ['Số hoá đơn', String(s.count ?? 0)],
      ['Tổng tiền thanh toán', formatVND(s.total_amount || 0)],
      ['Tổng tiền trước thuế', formatVND(s.total_before_tax || 0)],
      ['Tổng tiền thuế', formatVND(s.total_tax || 0)],
    ].map(([label, value]) => `
      <div class="hd-stat">
        <div class="hd-stat-value">${escapeHtml(value)}</div>
        <div class="hd-stat-label">${escapeHtml(label)}</div>
      </div>`).join('');
  }

  /** Giá trị THÔ của một ô (dùng cho cả bảng lẫn file xuất). */
  function rawCell(inv, key) {
    if (key === 'invoice_status') return INVOICE_STATUS_LABEL[inv.invoice_status] || inv.invoice_status || '';
    if (key === 'check_status') return CHECK_STATUS_LABEL[inv.check_status] || inv.check_status || '';
    if (key === 'payment_method') return PAYMENT_METHOD_LABEL[inv.payment_method] || '';
    if (key === 'payment_status') return PAYMENT_STATUS_LABEL[inv.payment_status] || inv.payment_status || '';
    if (key === 'signed') return inv.signed ? 'Đã ký' : 'Chưa ký';
    if (key === 'tax_rate') return inv.tax_rate == null ? '' : `${Number(inv.tax_rate)}%`;
    if (MONEY_COLS.has(key)) return formatVND(Number(inv[key]) || 0);
    if (DATE_COLS.has(key)) return inv[key] ? dmy(String(inv[key]).slice(0, 10)) : '';
    return inv[key] == null ? '' : String(inv[key]);
  }

  function renderList() {
    const el = container.querySelector('#hdv-list');
    const cols = data.columns.filter(([key]) => !hiddenCols.has(key));
    if (!data.invoices.length) {
      el.innerHTML = `
        <div class="hd-empty">
          ${icon('tim-kiem')}
          <p>Không tìm thấy kết quả phù hợp</p>
          ${canManage ? '<button class="btn btn-primary" id="hdv-add-empty">+ Thêm hoá đơn</button>' : ''}
        </div>`;
      if (canManage) el.querySelector('#hdv-add-empty').addEventListener('click', () => openForm(null));
      return;
    }
    el.innerHTML = `
      <div class="hd-table-wrap">
        <table class="hd-table">
          <thead><tr>
            ${cols.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join('')}
            ${canManage ? '<th class="hd-act-col">Thao tác</th>' : ''}
          </tr></thead>
          <tbody>
            ${data.invoices.map((inv) => `
              <tr>
                ${cols.map(([key]) => `<td class="${MONEY_COLS.has(key) ? 'hd-num' : ''}">${escapeHtml(rawCell(inv, key))}</td>`).join('')}
                ${canManage ? `<td class="hd-act-col">
                  <button type="button" class="hd-row-btn" data-edit="${inv.id}">Sửa</button>
                  <button type="button" class="hd-row-btn" data-toggle="${inv.id}">${inv.process_status === 'da-xu-ly' ? 'Bỏ xử lý' : 'Đã xử lý'}</button>
                  <button type="button" class="hd-row-btn danger" data-del="${inv.id}">Xoá</button>
                </td>` : ''}
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <p class="hint">Hiện ${data.invoices.length} hoá đơn${data.invoices.length >= 500 ? ' (tối đa 500 dòng — thu hẹp khoảng ngày để xem tiếp)' : ''}.</p>
    `;
    if (!canManage) return;
    el.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () =>
      openForm(data.invoices.find((x) => String(x.id) === b.dataset.edit))));
    el.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', async () => {
      const inv = data.invoices.find((x) => String(x.id) === b.dataset.toggle);
      const next = inv.process_status === 'da-xu-ly' ? 'chua-xu-ly' : 'da-xu-ly';
      try {
        await api.patch(`/api/mgr/invoices/in/${inv.id}`, { process_status: next });
        toast(next === 'da-xu-ly' ? 'Đã chuyển sang đã xử lý' : 'Đã chuyển về chưa xử lý');
        load();
      } catch (err) { toast(err?.body?.message || 'Không đổi được', 'error'); }
    }));
    el.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      const inv = data.invoices.find((x) => String(x.id) === b.dataset.del);
      if (!await confirmDialog(`Xoá hoá đơn ${inv.invoice_no || ''} của "${inv.supplier_name}"?`,
        { title: 'Xoá hoá đơn', okText: 'Xoá', danger: true })) return;
      try {
        await api.del(`/api/mgr/invoices/in/${inv.id}`);
        toast('Đã xoá hoá đơn');
        load();
      } catch (err) { toast(err?.body?.message || 'Không xoá được', 'error'); }
    }));
  }

  // ── Thêm / sửa một hoá đơn ───────────────────────────────────────────────
  function openForm(inv) {
    const v = inv || {};
    // BUG (phát hiện 13/08/2026 khi thử trên Chrome thật): thêm hoá đơn 2.000.000 thuế suất 8%
    // mà bảng hiện "Tổng tiền thuế 0₫", "Tổng tiền thanh toán 0₫".
    // GỐC RỄ: ô số điền SẴN số 0 cho hoá đơn mới. Máy chủ chỉ tự tính khi trường đó RỖNG
    // (`body.tax_amount === ''`) — điền sẵn 0 nên nhánh tự tính KHÔNG BAO GIỜ chạy, và dòng gợi ý
    // "để trống thì máy tự tính" thành nói dối. Nay ô trống là trống thật.
    // Bài kiểm tự động không bắt được vì nó gửi thẳng JSON, không đi qua biểu mẫu này.
    const f = (name, label, opts = {}) => `
      <div class="field"><label>${escapeHtml(label)}</label>
        <input name="${name}" type="${opts.type || 'text'}" ${opts.step ? `step="${opts.step}"` : ''}
          value="${escapeHtml(String(v[name] ?? '').slice(0, 200))}"
          placeholder="${escapeHtml(opts.ph || '')}" /></div>`;
    const sel = (name, label, opts, labels) => `
      <div class="field"><label>${escapeHtml(label)}</label>
        <select name="${name}">
          <option value="">— Chưa chọn —</option>
          ${opts.map((o) => `<option value="${o}" ${v[name] === o ? 'selected' : ''}>${escapeHtml(labels[o] || o)}</option>`).join('')}
        </select></div>`;
    const { overlay, close } = openModal(`
      <h3>${inv ? 'Sửa hoá đơn đầu vào' : 'Thêm hoá đơn đầu vào'}</h3>
      <form id="hdv-form">
        ${f('supplier_name', 'Nhà cung cấp *', { ph: 'Tên nhà cung cấp' })}
        ${f('supplier_tax_code', 'Mã số thuế NCC')}
        ${f('serial', 'Ký hiệu hoá đơn', { ph: 'VD: 1C26TAA' })}
        ${f('invoice_no', 'Số hoá đơn', { ph: 'VD: 00001234' })}
        ${f('form_no', 'Mẫu số')}
        ${f('tax_authority_code', 'Mã CQT')}
        <div class="field"><label>Ngày lập</label>
          <input name="created_date" type="date" value="${escapeHtml(String(v.created_date || '').slice(0, 10))}" /></div>
        ${f('goods_desc', 'Hàng hoá / Dịch vụ')}
        ${f('amount_before_tax', 'Tổng tiền trước thuế', { type: 'number', step: '1' })}
        ${f('tax_rate', 'Thuế suất (%)', { type: 'number', step: '0.1' })}
        ${f('tax_amount', 'Tổng tiền thuế', { type: 'number', step: '1' })}
        ${f('fee_amount', 'Phí / Phụ thu', { type: 'number', step: '1' })}
        ${f('total_amount', 'Tổng tiền thanh toán', { type: 'number', step: '1' })}
        ${f('currency', 'Đơn vị tiền tệ', { ph: 'VND' })}
        ${sel('payment_method', 'Hình thức thanh toán', ['tien-mat', 'chuyen-khoan', 'the', 'khac'], PAYMENT_METHOD_LABEL)}
        ${sel('payment_status', 'Trạng thái thanh toán', ['chua-thanh-toan', 'da-thanh-toan', 'mot-phan'], PAYMENT_STATUS_LABEL)}
        ${f('party_address', 'Địa chỉ người bán/mua')}
        <p class="hint">Để trống Tổng tiền thuế / Tổng tiền thanh toán thì máy tự tính từ thuế suất.</p>
        <div class="dlg-actions">
          <button type="button" class="btn" id="hdv-form-cancel">Huỷ</button>
          <button type="submit" class="btn btn-primary">${inv ? 'Cập nhật' : 'Thêm'}</button>
        </div>
      </form>
    `);
    overlay.querySelector('#hdv-form-cancel').addEventListener('click', close);
    overlay.querySelector('#hdv-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {};
      new FormData(e.target).forEach((val, key) => { payload[key] = String(val).trim(); });
      if (!payload.supplier_name) { toast('Chưa nhập đơn vị cung cấp', 'error'); return; }
      try {
        if (inv) await api.patch(`/api/mgr/invoices/in/${inv.id}`, payload);
        else await api.post('/api/mgr/invoices/in', payload);
        toast(inv ? 'Đã cập nhật hoá đơn' : 'Đã thêm hoá đơn');
        close();
        load();
      } catch (err) { toast(err?.body?.message || 'Không lưu được hoá đơn', 'error'); }
    });
  }

  async function load() {
    const params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.from) params.set('from', state.from);
    if (state.to) params.set('to', state.to);
    if (state.invoiceStatus.length) params.set('invoice_status', state.invoiceStatus.join(','));
    if (state.checkStatus.length) params.set('check_status', state.checkStatus.join(','));
    params.set('tab', state.tab);
    try {
      data = await api.get(`/api/mgr/invoices/in?${params}`);
      renderStats();
      renderList();
    } catch (err) {
      container.querySelector('#hdv-list').innerHTML =
        `<p>Không tải được danh sách hoá đơn.${err?.body?.message ? ` ${escapeHtml(err.body.message)}` : ''}</p>`;
    }
  }

  await load();
}

/** Đọc CSV đơn giản: có hỗ trợ ô bọc dấu nháy kép và dấu nháy đôi bên trong ("" → "). */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const src = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; continue; }
      if (c === '"') { quoted = false; continue; }
      cell += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ',') { row.push(cell); cell = ''; continue; }
    if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
    cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }

  const head = (rows.shift() || []).map((h) => h.trim());
  if (!head.includes('supplier_name')) {
    throw new Error('File thiếu cột bắt buộc "supplier_name" ở dòng đầu');
  }
  return rows
    .filter((r) => r.some((c) => c.trim()))
    .map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

/** Bọc một ô cho file CSV: có dấu phẩy / nháy / xuống dòng thì phải bọc lại. */
export function csvCell(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
