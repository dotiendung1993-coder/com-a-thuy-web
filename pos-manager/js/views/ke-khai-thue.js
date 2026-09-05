// Việc "Thuế" (19/08/2026) — Kê khai thuế (ảnh Website v2\Thuế\Screenshot 2026-08-12 225118.png cho
// thấy mục sidebar này tồn tại; nội dung màn KHÔNG có ảnh mẫu — tự thiết kế dựa trên danh sách 8
// quyền "Kê khai thuế" đã chốt với chủ quán 17/8 (config.js PERMISSION_CATALOG): tạo/xem/sửa/xoá kỳ
// kê khai, tải excel/pdf/xml, gửi tờ khai đến TCT.
//
// "Tải file xml tờ khai" / "Gửi tờ khai đến TCT" KHOÁ (disabled) — quán chưa có tài khoản
// thuedientu.gdt.gov.vn (xem settings-service.js key e_invoice), không giả vờ chạy thật, đúng
// nguyên tắc đã áp dụng cho Sàn TMĐT. "Tải Excel" xuất file .xlsx THẬT (SheetJS, giống nha-cung-cap.js).
// "Tải PDF" mở cửa sổ in — bản TÓM TẮT THAM KHẢO, ghi rõ KHÔNG phải tờ khai chính thức (tránh nhầm
// thành chứng từ giả).
import { api } from '../api.js';
import { formatVND, escapeHtml, toast, openModal, confirmDialog, todayVN, monthStartVN, pageTabsHtml } from '../ui.js';

const PIT_METHOD_LABEL = {
  exempt: 'Miễn thuế', pp1: 'PP1 — % doanh thu', pp2: 'PP2 — 15% lợi nhuận', fixed_17: '17% lợi nhuận',
};
const STATUS_LABEL = { nhap: 'Nháp', da_gui: 'Đã đánh dấu gửi' };

let xlsxLibPromise = null;
function loadXlsxLib() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!xlsxLibPromise) {
    xlsxLibPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = new URL('../vendor/xlsx.mini.min.js', import.meta.url).href;
      s.onload = () => (window.XLSX ? resolve(window.XLSX) : reject(new Error('Không tải được thư viện Excel')));
      s.onerror = () => reject(new Error('Không tải được thư viện Excel — kiểm tra kết nối mạng'));
      document.head.appendChild(s);
    });
  }
  return xlsxLibPromise;
}

async function exportPeriodExcel(period) {
  const XLSX = await loadXlsxLib();
  const rows = [
    ['Kỳ kê khai', period.period_label],
    ['Từ ngày', period.period_from],
    ['Đến ngày', period.period_to],
    ['Doanh thu', period.revenue],
    ['Thuế GTGT', period.vat_amount ?? 'Chưa cấu hình tỷ lệ'],
    ['Thuế TNCN', period.pit_amount ?? 'Chưa cấu hình tỷ lệ'],
    ['Trạng thái', STATUS_LABEL[period.status] || period.status],
    ['Ghi chú', period.note || ''],
    [],
    ['Đây là số liệu ước tính tham khảo nội bộ, không phải tờ khai thuế chính thức.'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 20 }, { wch: 30 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Ke khai thue');
  XLSX.writeFile(wb, `ke-khai-thue-${period.period_from}-${period.period_to}.xlsx`);
}

function printPeriod(period) {
  const w = window.open('', '_blank');
  if (!w) { toast('Trình duyệt chặn cửa sổ mới — cho phép popup để in', 'error'); return; }
  w.document.write(`<html><head><title>${escapeHtml(period.period_label)}</title>
    <style>body{font-family:Arial,sans-serif;padding:24px;color:#111}
    h1{font-size:17px;margin-bottom:4px}
    table{width:100%;border-collapse:collapse;margin-top:14px}
    td{padding:7px 4px;border-bottom:1px solid #eee;font-size:14px}
    td:first-child{color:#666;width:160px}
    .note{margin-top:20px;font-size:12px;color:#666;line-height:1.5}</style></head><body>
    <h1>Bản tóm tắt kỳ kê khai thuế</h1>
    <div style="color:#c00;font-weight:600;font-size:13px">KHÔNG phải tờ khai thuế chính thức</div>
    <table>
      <tr><td>Kỳ</td><td>${escapeHtml(period.period_label)}</td></tr>
      <tr><td>Từ ngày</td><td>${period.period_from}</td></tr>
      <tr><td>Đến ngày</td><td>${period.period_to}</td></tr>
      <tr><td>Doanh thu</td><td>${formatVND(period.revenue)}</td></tr>
      <tr><td>Thuế GTGT</td><td>${period.vat_amount == null ? 'Chưa cấu hình tỷ lệ' : formatVND(period.vat_amount)}</td></tr>
      <tr><td>Thuế TNCN</td><td>${period.pit_amount == null ? 'Chưa cấu hình tỷ lệ' : formatVND(period.pit_amount)}</td></tr>
      <tr><td>Ghi chú</td><td>${escapeHtml(period.note || '')}</td></tr>
    </table>
    <p class="note">Đây là bản tóm tắt tham khảo nội bộ, số liệu ước tính dựa trên phân loại sổ kế
    toán đã thiết lập — KHÔNG phải tờ khai thuế chính thức gửi cơ quan thuế. Hỏi kế toán hoặc cán bộ
    thuế trước khi nộp thật.</p>
    </body></html>`);
  w.document.close();
  w.print();
}

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.report) {
    container.innerHTML = '<p>Bạn không có quyền xem màn hình này.</p>';
    return;
  }
  const canManage = !!perms.report_manage;

  let classification = null;
  let periods = [];

  container.innerHTML = `
    ${pageTabsHtml('ke-khai-thue', staff)}
    <div id="kkt-status"><p>Đang tải…</p></div>
    <div class="card">
      <div class="card-head">
        <h3>Các kỳ kê khai</h3>
        ${canManage ? '<button id="kkt-add" class="btn btn-primary">+ Tạo kỳ kê khai</button>' : ''}
      </div>
      <div id="kkt-list"><p>Đang tải…</p></div>
    </div>
  `;

  function statusHtml() {
    if (!classification || !classification.completed) {
      return `<div class="card" style="border-left:3px solid var(--danger)">
        <strong>Chưa thiết lập sổ kế toán</strong>
        <p style="margin:6px 0 10px;color:var(--text-2);font-size:13.5px">Cần chọn nhóm doanh thu &amp; phương pháp tính thuế trước khi tạo kỳ kê khai.</p>
        <a href="#/thiet-lap-so-ke-toan" class="btn btn-primary">Thiết lập sổ kế toán</a>
      </div>`;
    }
    const g = classification.revenue_group;
    return `<div class="card" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
      <div><strong>Nhóm ${escapeHtml(g)}</strong> · ${escapeHtml(PIT_METHOD_LABEL[classification.pit_method] || '')} · ${escapeHtml(classification.activity_label || '')}</div>
      <a href="#/thiet-lap-so-ke-toan" style="font-size:13px">Chỉnh sửa thiết lập</a>
    </div>`;
  }

  function rowActionsHtml(p) {
    const lockedTitleXml = 'Cần định dạng XML đúng chuẩn Tổng cục Thuế — POS Manager chưa tích hợp';
    const lockedTitleSend = 'Cần kết nối trực tiếp với hệ thống thuedientu.gdt.gov.vn — quán chưa có tài khoản/API này';
    return `
      <button class="btn" data-act="excel" data-id="${p.id}" title="Tải file Excel">Excel</button>
      <button class="btn" data-act="pdf" data-id="${p.id}" title="Tải bản tóm tắt PDF">PDF</button>
      <button class="btn" disabled title="${lockedTitleXml}">XML</button>
      ${canManage ? `
        <button class="btn" data-act="edit" data-id="${p.id}">Sửa</button>
        <button class="btn" disabled title="${lockedTitleSend}">Gửi tờ khai</button>
        <button class="btn" data-act="delete" data-id="${p.id}" style="color:var(--danger)">Xoá</button>
      ` : ''}
    `;
  }

  function renderList() {
    const el = container.querySelector('#kkt-list');
    if (!periods.length) { el.innerHTML = '<p>Chưa có kỳ kê khai nào.</p>'; return; }
    el.innerHTML = `<div class="sbh-card" style="padding:0"><div style="overflow-x:auto"><table class="sp-table" style="width:100%;border-radius:0">
      <thead><tr><th>Kỳ</th><th>Từ - đến</th><th>Doanh thu</th><th>GTGT</th><th>TNCN</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
      <tbody>
        ${periods.map((p) => `<tr>
          <td>${escapeHtml(p.period_label)}</td>
          <td>${p.period_from} → ${p.period_to}</td>
          <td>${formatVND(p.revenue)}</td>
          <td>${p.vat_amount == null ? '<span style="color:var(--text-3)">Chưa cấu hình</span>' : formatVND(p.vat_amount)}</td>
          <td>${p.pit_amount == null ? '<span style="color:var(--text-3)">Chưa cấu hình</span>' : formatVND(p.pit_amount)}</td>
          <td>${escapeHtml(STATUS_LABEL[p.status] || p.status)}</td>
          <td style="white-space:nowrap">${rowActionsHtml(p)}</td>
        </tr>`).join('')}
      </tbody>
    </table></div></div>`;

    el.querySelectorAll('[data-act]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const period = periods.find((p) => p.id === btn.dataset.id);
        if (!period) return;
        if (btn.dataset.act === 'excel') exportPeriodExcel(period);
        else if (btn.dataset.act === 'pdf') printPeriod(period);
        else if (btn.dataset.act === 'edit') openEditModal(period);
        else if (btn.dataset.act === 'delete') deletePeriod(period);
      });
    });
  }

  async function loadAll() {
    try {
      const [cRes, pRes] = await Promise.all([
        api.get('/api/mgr/settings/tax_classification'),
        api.get('/api/mgr/tax-filing/periods'),
      ]);
      classification = cRes.value;
      periods = pRes.periods;
      container.querySelector('#kkt-status').innerHTML = statusHtml();
      renderList();
    } catch (err) {
      if (err?.status !== 401 && err?.status !== 403) {
        container.querySelector('#kkt-list').innerHTML = '<p>Không tải được danh sách kỳ kê khai.</p>';
      }
    }
  }

  function suggestLabel(from, to) {
    const y = from.slice(0, 4);
    if (from === `${y}-01-01` && to === `${y}-12-31`) return `Năm ${y}`;
    return `${from} → ${to}`;
  }

  function openCreateModal() {
    const today = todayVN();
    const year = today.slice(0, 4);
    const modal = openModal(`
      <h3>Tạo kỳ kê khai</h3>
      <div class="wiz-actions" style="justify-content:flex-start;margin:0 0 10px">
        <button type="button" class="chip" data-preset="month">Tháng này</button>
        <button type="button" class="chip" data-preset="year">Năm nay</button>
      </div>
      <div class="field"><label>Tên kỳ</label><input id="kkt-label" type="text" placeholder="VD: Quý 3/2026" /></div>
      <div class="orders-filters-row">
        <input id="kkt-from" type="date" value="${monthStartVN()}" />
        <input id="kkt-to" type="date" value="${today}" />
      </div>
      <div class="field"><label>Ghi chú</label><input id="kkt-note" type="text" /></div>
      <div id="kkt-preview" style="margin:10px 0;font-size:13.5px;color:var(--text-2)">Đang tính…</div>
      <button id="kkt-submit" class="btn btn-primary" style="width:100%">Tạo kỳ</button>
    `);
    const $ = (sel) => modal.overlay.querySelector(sel);
    const labelInput = $('#kkt-label');
    let labelTouched = false;
    labelInput.addEventListener('input', () => { labelTouched = true; });

    async function refreshPreview() {
      const from = $('#kkt-from').value;
      const to = $('#kkt-to').value;
      if (!from || !to || from > to) { $('#kkt-preview').textContent = 'Chọn khoảng ngày hợp lệ.'; return; }
      if (!labelTouched) labelInput.value = suggestLabel(from, to);
      $('#kkt-preview').textContent = 'Đang tính…';
      try {
        const { estimate } = await api.get(`/api/mgr/tax-filing/estimate?from=${from}&to=${to}`);
        const vat = estimate.vat_amount == null ? (estimate.vat_note || 'Chưa cấu hình') : formatVND(estimate.vat_amount);
        const pit = estimate.pit_amount == null ? (estimate.pit_note || 'Chưa cấu hình') : formatVND(estimate.pit_amount);
        $('#kkt-preview').innerHTML = `Doanh thu ${formatVND(estimate.revenue)} · GTGT: ${escapeHtml(String(vat))} · TNCN: ${escapeHtml(String(pit))}`;
      } catch {
        $('#kkt-preview').textContent = 'Không tính được ước tính.';
      }
    }
    $('#kkt-from').addEventListener('change', refreshPreview);
    $('#kkt-to').addEventListener('change', refreshPreview);
    $('[data-preset="month"]').addEventListener('click', () => {
      $('#kkt-from').value = monthStartVN(); $('#kkt-to').value = today; labelTouched = false; refreshPreview();
    });
    $('[data-preset="year"]').addEventListener('click', () => {
      $('#kkt-from').value = `${year}-01-01`; $('#kkt-to').value = today; labelTouched = false; refreshPreview();
    });
    refreshPreview();

    $('#kkt-submit').addEventListener('click', async () => {
      try {
        await api.post('/api/mgr/tax-filing/periods', {
          period_label: labelInput.value.trim(),
          period_from: $('#kkt-from').value,
          period_to: $('#kkt-to').value,
          note: $('#kkt-note').value.trim(),
        });
        toast('Đã tạo kỳ kê khai');
        modal.close();
        await loadAll();
      } catch (err) {
        toast(err?.body?.message || 'Không tạo được kỳ kê khai', 'error');
      }
    });
  }

  function openEditModal(period) {
    const modal = openModal(`
      <h3>Sửa kỳ kê khai</h3>
      <div class="field"><label>Tên kỳ</label><input id="kkt-e-label" type="text" value="${escapeHtml(period.period_label)}" /></div>
      <div class="field"><label>Ghi chú</label><input id="kkt-e-note" type="text" value="${escapeHtml(period.note || '')}" /></div>
      <div class="field"><label>Trạng thái</label>
        <select id="kkt-e-status">
          <option value="nhap" ${period.status === 'nhap' ? 'selected' : ''}>Nháp</option>
          <option value="da_gui" ${period.status === 'da_gui' ? 'selected' : ''}>Đã đánh dấu gửi (thủ công — không gửi hệ thống thật)</option>
        </select>
      </div>
      <button id="kkt-e-submit" class="btn btn-primary" style="width:100%">Lưu</button>
    `);
    const $ = (sel) => modal.overlay.querySelector(sel);
    $('#kkt-e-submit').addEventListener('click', async () => {
      try {
        await api.put(`/api/mgr/tax-filing/periods/${period.id}`, {
          period_label: $('#kkt-e-label').value.trim(),
          note: $('#kkt-e-note').value.trim(),
          status: $('#kkt-e-status').value,
        });
        toast('Đã lưu');
        modal.close();
        await loadAll();
      } catch (err) {
        toast(err?.body?.message || 'Không lưu được', 'error');
      }
    });
  }

  async function deletePeriod(period) {
    const ok = await confirmDialog(`Xoá kỳ kê khai "${period.period_label}"? Không thể hoàn tác.`, { danger: true });
    if (!ok) return;
    try {
      await api.del(`/api/mgr/tax-filing/periods/${period.id}`);
      toast('Đã xoá');
      await loadAll();
    } catch (err) {
      toast(err?.body?.message || 'Không xoá được', 'error');
    }
  }

  if (canManage) container.querySelector('#kkt-add').addEventListener('click', openCreateModal);
  await loadAll();
}
