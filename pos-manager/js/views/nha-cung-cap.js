// Đợt 7 (18/08/2026) — Đối tác > Nhà cung cấp, giao diện SoBanHang v2.
// Kế hoạch: ảnh mẫu "Website v2\Đối tác\Nhà cung cấp" (6 ảnh: danh sách + KPI, menu 3 chấm dòng,
// dropdown "+Tạo nhà cung cấp", modal Thêm nhà cung cấp, 2 modal Excel thêm hàng loạt/cập nhật).
//
// Giới hạn CHỦ Ý (đã ghi trong báo cáo bàn giao):
//  - Bấm dòng/tên NCC hoặc "Chỉnh sửa" đều mở CHUNG modal sửa (ảnh không có màn chi tiết riêng).
//  - "Tạo phiếu nhập hàng" chuyển sang màn Sổ nhập hàng (#/nhap-hang) nhưng KHÔNG preselect sẵn NCC
//    — nhap-hang.js không thuộc phạm vi được sửa của Đợt 7 (chỉ được sửa file này).
//  - "Phiếu gần nhất/Tổng tiền nhập/Phải thu-trả" tính từ API mới (xem ingredient-service.js hàm
//    listSuppliersOverview) — "Phải thu/trả" khớp theo TÊN với Sổ nợ (pos_debts không có cột
//    supplier_id) nên chỉ đúng khi tên NCC không trùng đối tác khác trong Sổ nợ.
//
// Việc 3 (18/08/2026) — 2 modal "(Excel)" nay đọc/ghi FILE .xlsx THẬT bằng thư viện SheetJS (thay
// cho CSV đơn giản hoá trước đây). Không có bundler trong dự án (script type=module tải thẳng, xem
// index.html) nên vendor bản UMD `js/vendor/xlsx.mini.min.js` (bản "mini", chỉ đọc/ghi .xlsx/.xlsm,
// đủ dùng, nhẹ hơn bản full ~3 lần) — tải ĐỘNG (lazy) qua thẻ <script> lúc bấm mở modal, KHÔNG đưa
// vào sw.js SHELL_FILES vì nặng (~280KB) và ít dùng, không đáng cache-warm mỗi lần deploy. Bản trên
// npm ("xlsx" 0.18.5) có 2 lỗ hổng CVE mức cao (prototype pollution + ReDoS) CHƯA có bản vá trên
// npm registry — đã cài thẳng bản vá 0.20.3 từ CDN chính chủ SheetJS (cdn.sheetjs.com) thay vì
// npm registry, xem package.json.
import { api } from '../api.js';
import { formatVND, escapeHtml, toast, openModal, alertDialog } from '../ui.js';
import { icon } from '../icons.js';

const LS_PAGESIZE = 'posmgr.ncc.pagesize.v1';
const SHEET_HEADER = ['Ten', 'SDT', 'Email', 'DiaChi'];

function fmtDateVN(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}

// ─── Excel (.xlsx) helpers ──────────────────────────────────────────────────────────────────
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
async function downloadXlsx(filename, dataRows) {
  const XLSX = await loadXlsxLib();
  const ws = XLSX.utils.aoa_to_sheet([SHEET_HEADER, ...dataRows]);
  ws['!cols'] = SHEET_HEADER.map(() => ({ wch: 22 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Nha cung cap');
  XLSX.writeFile(wb, filename);
}
// Trả mảng object khoá CHỮ THƯỜNG không dấu (vd. {ten, sdt, email, diachi}) — giữ đúng hình dạng
// dữ liệu như bản CSV cũ để 2 hàm xử lý import/update bên dưới không phải sửa lại logic đọc cột.
async function parseXlsxFile(file) {
  const XLSX = await loadXlsxLib();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  return rows.map((r) => {
    const obj = {};
    Object.keys(r).forEach((k) => { obj[k.trim().toLowerCase()] = String(r[k] ?? '').trim(); });
    return obj;
  });
}

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.ingredient) {
    container.innerHTML = '<p>Bạn không có quyền xem nhà cung cấp.</p>';
    return;
  }
  const canManage = !!perms.ingredient_manage;

  let state = { q: '' };
  let data = { kpi: { pending_count: 0, pending_amount: 0, completed_count: 0, completed_amount: 0, phai_thu: 0, phai_tra: 0 }, suppliers: [] };
  let page = 1;
  let pageSize = parseInt(localStorage.getItem(LS_PAGESIZE) || '10', 10);
  const uploadHistory = []; // chỉ lưu trong phiên hiện tại (không có bảng lưu trữ lịch sử ở backend)

  container.innerHTML = `
    <div class="page-head">
      <h2>Nhà cung cấp</h2>
      ${canManage ? `
      <div style="display:flex;gap:0;position:relative">
        <div style="display:flex;border-radius:8px;overflow:hidden">
          <button id="ncc-new" class="btn btn-primary" style="border-radius:0;border-right:1px solid rgba(255,255,255,.3)">+ Tạo nhà cung cấp</button>
          <button id="ncc-new-drop" class="btn btn-primary" style="border-radius:0;padding:0 8px">▾</button>
        </div>
        <div id="ncc-new-menu" class="row-menu" style="display:none;position:absolute;top:100%;right:0;z-index:200;min-width:240px">
          <button type="button" data-nm="new">+ Nhà cung cấp mới</button>
          <button type="button" data-nm="import">↑ Thêm nhiều nhà cung cấp (Excel)</button>
          <button type="button" data-nm="update">↻ Cập nhật hàng loạt (Excel)</button>
          <button type="button" data-nm="export">↓ Tải nhà cung cấp</button>
        </div>
      </div>` : ''}
    </div>

    <div id="ncc-kpi" class="sbh-kpi"></div>

    <div class="sbh-card" style="padding:0">
    <div class="sbh-card-tools">
      <input id="ncc-q" class="sbh-card-search" type="search" placeholder="Tìm kiếm nhà cung cấp" />
    </div>

    <div style="overflow-x:auto">
      <table class="sp-table" id="ncc-table" style="width:100%;min-width:560px;border-radius:0">
        <thead><tr>
          <th>NHÀ CUNG CẤP</th>
          <th>EMAIL</th>
          <th style="width:130px">PHIẾU GẦN NHẤT</th>
          <th style="width:130px">TỔNG TIỀN NHẬP</th>
          <th style="width:130px" title="Số dương = quán còn nợ NCC · số âm = NCC còn nợ quán">PHẢI THU / PHẢI TRẢ ⓘ</th>
          ${canManage ? '<th style="width:40px"></th>' : ''}
        </tr></thead>
        <tbody id="ncc-tbody"></tbody>
      </table>
    </div>

    <div id="ncc-paginator" style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;gap:12px;flex-wrap:wrap">
      <span id="ncc-page-info" style="color:#666;font-size:13px"></span>
      <div id="ncc-page-btns" style="display:flex;gap:4px"></div>
      <div style="display:flex;align-items:center;gap:6px;font-size:13px">
        Hiển thị
        <select id="ncc-page-size" style="width:auto;padding:4px 8px">
          ${[10, 20, 30, 50].map((n) => `<option value="${n}" ${n === pageSize ? 'selected' : ''}>${n}</option>`).join('')}
        </select>
      </div>
    </div>
    </div>
  `;

  // ─── Tìm kiếm ────────────────────────────────────────────────────────────────
  const qEl = container.querySelector('#ncc-q');
  let searchTimer = null;
  qEl.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.q = qEl.value.trim(); page = 1; load(); }, 300);
  });

  // ─── Split button "+ Tạo nhà cung cấp" ──────────────────────────────────────
  if (canManage) {
    const newMenu = container.querySelector('#ncc-new-menu');
    container.querySelector('#ncc-new').addEventListener('click', () => openSupplierModal(null));
    container.querySelector('#ncc-new-drop').addEventListener('click', (e) => {
      e.stopPropagation();
      newMenu.style.display = newMenu.style.display === 'block' ? 'none' : 'block';
    });
    document.addEventListener('click', () => { newMenu.style.display = 'none'; });
    newMenu.querySelectorAll('[data-nm]').forEach((btn) => {
      btn.addEventListener('click', () => {
        newMenu.style.display = 'none';
        if (btn.dataset.nm === 'new') openSupplierModal(null);
        else if (btn.dataset.nm === 'import') openImportModal();
        else if (btn.dataset.nm === 'update') openUpdateModal();
        else if (btn.dataset.nm === 'export') exportSuppliers();
      });
    });
  }

  container.querySelector('#ncc-page-size').addEventListener('change', (e) => {
    pageSize = parseInt(e.target.value, 10);
    page = 1;
    try { localStorage.setItem(LS_PAGESIZE, String(pageSize)); } catch { /* */ }
    renderList();
    renderPaginator();
  });

  // ─── Render KPI ──────────────────────────────────────────────────────────────
  function renderKpi() {
    const k = data.kpi;
    container.querySelector('#ncc-kpi').innerHTML = `
      <div class="kpi-card kpi-c3">
        <div class="kpi-label">Tổng phiếu chờ xác nhận</div>
        <div class="kpi-val">${formatVND(k.pending_amount)}</div>
      </div>
      <div class="kpi-card kpi-c1">
        <div class="kpi-label">Tổng phiếu hoàn thành</div>
        <div class="kpi-val">${formatVND(k.completed_amount)}</div>
      </div>
      <div class="kpi-card kpi-c1">
        <div class="kpi-label">Nợ phải thu</div>
        <div class="kpi-val">${formatVND(k.phai_thu)}</div>
      </div>
      <div class="kpi-card kpi-c4">
        <div class="kpi-label">Nợ phải trả</div>
        <div class="kpi-val">${formatVND(k.phai_tra)}</div>
      </div>`;
  }

  // ─── Render bảng ─────────────────────────────────────────────────────────────
  function pagedItems() {
    const start = (page - 1) * pageSize;
    return data.suppliers.slice(start, start + pageSize);
  }

  function debtCellHtml(s) {
    const net = s.phai_tra - s.phai_thu;
    if (!net) return '<span style="font-size:13px">0</span>';
    const color = net > 0 ? '#c00' : 'var(--primary,#16a34a)';
    return `<span style="font-size:13px;font-weight:600;color:${color}" title="Phải thu ${formatVND(s.phai_thu)} · Phải trả ${formatVND(s.phai_tra)}">${formatVND(Math.abs(net))}</span>`;
  }

  function renderList() {
    const paged = pagedItems();
    const tbody = container.querySelector('#ncc-tbody');
    const colspan = canManage ? 6 : 5;
    if (!data.suppliers.length) {
      tbody.innerHTML = `<tr><td colspan="${colspan}" style="text-align:center;padding:48px;color:#999">
        <div style="font-weight:600">Chưa có nhà cung cấp nào</div>
        ${canManage ? '<div style="margin-top:12px"><button id="ncc-empty-new" class="btn btn-primary">+ Tạo nhà cung cấp</button></div>' : ''}
      </td></tr>`;
      tbody.querySelector('#ncc-empty-new')?.addEventListener('click', () => openSupplierModal(null));
      return;
    }
    tbody.innerHTML = paged.map((s) => `
      <tr data-sid="${s.id}" class="${s.active === false ? 'row-inactive' : ''}">
        <td>
          <div style="display:flex;align-items:center;gap:10px">
            <span style="width:32px;height:32px;border-radius:50%;background:var(--primary-soft,#EAF6ED);color:var(--primary,#16a34a);display:inline-flex;align-items:center;justify-content:center;flex:none">
              <span style="width:18px;height:18px;display:inline-block">${icon('nha-cung-cap')}</span>
            </span>
            <div>
              <div class="ncc-name-cell" data-edit="${s.id}" style="font-weight:600;color:var(--primary,#16a34a);cursor:pointer">${escapeHtml(s.name)}
                ${s.active === false ? '<span class="badge-warn" style="margin-left:6px">Ngừng hợp tác</span>' : ''}
                ${s.is_customer ? '<span class="badge-ok" style="margin-left:6px">Cũng là KH</span>' : ''}
              </div>
              ${s.phone ? `<div style="font-size:12px;color:#888">${escapeHtml(s.phone)}</div>` : ''}
            </div>
          </div>
        </td>
        <td style="font-size:13px;color:#666">${s.email ? escapeHtml(s.email) : '—'}</td>
        <td style="font-size:13px">
          ${s.last_doc ? `<div style="color:var(--primary,#16a34a);font-weight:500">${fmtDateVN(s.last_doc.created_at)}</div>
            <div style="font-size:12px;color:#888">${escapeHtml(s.last_doc.code)} ${s.phai_tra > 0 ? `<span title="Còn nợ nhà cung cấp" style="display:inline-flex;width:13px;height:13px;vertical-align:-2px;color:#D97706">${icon('canh-bao')}</span>` : ''}</div>`
            : '<span style="color:#999">—</span>'}
        </td>
        <td style="font-size:13px">${formatVND(s.total_import)}<div style="font-size:12px;color:#888">${s.completed_doc_count} phiếu</div></td>
        <td>${debtCellHtml(s)}</td>
        ${canManage ? `<td class="dm-act"><div class="dm-kebab-wrap"><button class="ord-kebab" data-menu="${s.id}" aria-label="Thao tác">${icon('them')}</button><div class="dm-kebab-menu hidden"><button type="button" data-act="nhap">Tạo phiếu nhập hàng</button><button type="button" data-act="edit">Chỉnh sửa</button></div></div></td>` : ''}
      </tr>`).join('');

    if (canManage) {
      tbody.querySelectorAll('.ncc-name-cell').forEach((cell) => {
        cell.addEventListener('click', () => {
          const s = data.suppliers.find((x) => String(x.id) === cell.dataset.edit);
          if (s) openSupplierModal(s);
        });
      });
      const closeAll = () => tbody.querySelectorAll('.dm-kebab-menu').forEach(m => m.classList.add('hidden'));
      tbody.querySelectorAll('.ord-kebab[data-menu]').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const menu = btn.parentElement.querySelector('.dm-kebab-menu');
          const willOpen = menu.classList.contains('hidden');
          closeAll(); menu.classList.toggle('hidden', !willOpen);
        });
      });
      document.addEventListener('click', closeAll);
      tbody.querySelectorAll('[data-act]').forEach(btn => {
        btn.addEventListener('click', () => {
          closeAll();
          const s = data.suppliers.find(x => String(x.id) === btn.closest('.dm-kebab-wrap')?.querySelector('[data-menu]')?.dataset.menu);
          if (!s) return;
          if (btn.dataset.act === 'edit') openSupplierModal(s);
          else { toast('Mở Sổ nhập hàng', 'info'); location.hash = '#/nhap-hang'; }
        });
      });
    }
  }

  function renderPaginator() {
    const total = data.suppliers.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (page > totalPages) page = totalPages;
    const start = total ? (page - 1) * pageSize + 1 : 0;
    const end = Math.min(page * pageSize, total);
    container.querySelector('#ncc-page-info').textContent = total ? `Hiển thị ${start}-${end} / ${total} kết quả` : '';

    const btns = container.querySelector('#ncc-page-btns');
    if (totalPages <= 1) { btns.innerHTML = ''; return; }
    let html = `<button ${page === 1 ? 'disabled' : ''} data-pg="${page - 1}" class="btn" style="padding:4px 10px">‹</button>`;
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= page - 2 && i <= page + 2)) {
        html += `<button data-pg="${i}" class="btn ${i === page ? 'btn-primary' : ''}" style="padding:4px 10px">${i}</button>`;
      } else if (i === page - 3 || i === page + 3) {
        html += '<span style="padding:0 4px">…</span>';
      }
    }
    html += `<button ${page === totalPages ? 'disabled' : ''} data-pg="${page + 1}" class="btn" style="padding:4px 10px">›</button>`;
    btns.innerHTML = html;
    btns.querySelectorAll('[data-pg]').forEach((btn) => {
      btn.addEventListener('click', () => { page = parseInt(btn.dataset.pg, 10); renderList(); renderPaginator(); });
    });
  }

  // ─── Kebab menu dòng ─────────────────────────────────────────────────────────
  let openMenuEl = null;
  function closeRowMenu() {
    if (openMenuEl) { openMenuEl.remove(); openMenuEl = null; }
    container.querySelectorAll('.ord-kebab[aria-expanded="true"]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
  }
  function openRowMenu(btn) {
    const s = data.suppliers.find((x) => String(x.id) === btn.dataset.menu);
    if (!s) return;
    const wasOpen = btn.getAttribute('aria-expanded') === 'true';
    closeRowMenu();
    if (wasOpen) return;
    const menu = document.createElement('div');
    menu.className = 'row-menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = `
      <button type="button" role="menuitem" data-act="nhap">${icon('nhap-hang')} Tạo phiếu nhập hàng</button>
      <button type="button" role="menuitem" data-act="edit">${icon('chinh-sua')} Chỉnh sửa</button>`;
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
      if (act.dataset.act === 'edit') openSupplierModal(s);
      else {
        toast(`Mở Sổ nhập hàng — chọn "${s.name}" làm nhà cung cấp trong phiếu mới`, 'info');
        location.hash = '#/nhap-hang';
      }
    });
  }
  document.addEventListener('click', closeRowMenu);

  // ─── Modal Thêm / Sửa nhà cung cấp ───────────────────────────────────────────
  function openSupplierModal(sup) {
    const isNew = !sup;
    const inv = sup?.invoice_info || null;
    const modal = openModal(`
      <h3>${isNew ? 'Thêm nhà cung cấp' : 'Sửa nhà cung cấp'}</h3>
      <div class="field"><label>Tên nhà cung cấp <i class="req" style="color:var(--danger)">*</i></label>
        <input id="ncc-name" value="${sup ? escapeHtml(sup.name) : ''}" placeholder="Nhập tên nhà cung cấp" /></div>
      <div class="field"><label>Số điện thoại</label>
        <input id="ncc-phone" value="${sup?.phone ? escapeHtml(sup.phone) : ''}" placeholder="Nhập số điện thoại" /></div>
      <div class="pform-switches">
        <div class="pform-row"><span>Đồng thời là khách hàng</span>
          <label class="sw"><input id="ncc-iscust" type="checkbox" ${sup?.is_customer ? 'checked' : ''} /><i></i></label></div>
      </div>
      <details class="pform-img-url" ${sup?.email || sup?.address ? 'open' : ''}>
        <summary>Thông tin thêm</summary>
        <div class="field" style="margin-top:10px"><label>Email</label>
          <input id="ncc-email" value="${sup?.email ? escapeHtml(sup.email) : ''}" placeholder="Nhập email" /></div>
        <div class="field"><label>Địa chỉ liên hệ</label>
          <input id="ncc-address" value="${sup?.address ? escapeHtml(sup.address) : ''}" placeholder="Địa chỉ chi tiết" /></div>
      </details>
      ${isNew ? `
      <div class="pform-switches">
        <div class="pform-row"><span>Công nợ ban đầu</span>
          <label class="sw"><input id="ncc-debt-toggle" type="checkbox" /><i></i></label></div>
      </div>
      <div id="ncc-debt-fields" class="hidden">
        <div class="field"><label>Số tiền quán còn nợ nhà cung cấp</label>
          <input id="ncc-debt-amount" type="number" min="0" step="1000" value="0" /></div>
        <div class="field"><label>Hạn trả (không bắt buộc)</label>
          <input id="ncc-debt-due" type="date" /></div>
      </div>` : ''}
      <div class="pform-switches">
        <div class="pform-row"><span>Thông tin hoá đơn</span>
          <label class="sw"><input id="ncc-inv-toggle" type="checkbox" ${inv ? 'checked' : ''} /><i></i></label></div>
      </div>
      <div id="ncc-inv-fields" class="${inv ? '' : 'hidden'}">
        <div class="field"><label>Mã số thuế</label>
          <input id="ncc-inv-tax" value="${inv?.tax_code ? escapeHtml(inv.tax_code) : ''}" /></div>
        <div class="field"><label>Tên công ty</label>
          <input id="ncc-inv-name" value="${inv?.company_name ? escapeHtml(inv.company_name) : ''}" /></div>
        <div class="field"><label>Địa chỉ công ty</label>
          <input id="ncc-inv-addr" value="${inv?.company_address ? escapeHtml(inv.company_address) : ''}" /></div>
      </div>
      ${!isNew ? `<div class="pform-switches">
        <div class="pform-row"><span>Đang hợp tác</span>
          <label class="sw"><input id="ncc-active" type="checkbox" ${sup.active !== false ? 'checked' : ''} /><i></i></label></div>
      </div>` : ''}
      <div style="display:flex;gap:10px;margin-top:14px">
        <button id="ncc-cancel" class="btn btn-ghost" style="flex:1">Huỷ</button>
        <button id="ncc-save" class="btn btn-primary" style="flex:1">${isNew ? 'Xác nhận' : 'Lưu'}</button>
      </div>
    `);
    const ov = modal.overlay;
    ov.querySelector('#ncc-cancel').addEventListener('click', modal.close);

    const debtToggle = ov.querySelector('#ncc-debt-toggle');
    debtToggle?.addEventListener('change', () => { ov.querySelector('#ncc-debt-fields').classList.toggle('hidden', !debtToggle.checked); });
    const invToggle = ov.querySelector('#ncc-inv-toggle');
    invToggle.addEventListener('change', () => { ov.querySelector('#ncc-inv-fields').classList.toggle('hidden', !invToggle.checked); });

    ov.querySelector('#ncc-save').addEventListener('click', async () => {
      const name = ov.querySelector('#ncc-name').value.trim();
      if (!name) { toast('Tên nhà cung cấp không được trống', 'error'); return; }
      const payload = {
        name,
        phone: ov.querySelector('#ncc-phone').value.trim() || null,
        email: ov.querySelector('#ncc-email').value.trim() || null,
        address: ov.querySelector('#ncc-address').value.trim() || null,
        is_customer: ov.querySelector('#ncc-iscust').checked,
        invoice_info: invToggle.checked ? {
          tax_code: ov.querySelector('#ncc-inv-tax').value.trim(),
          company_name: ov.querySelector('#ncc-inv-name').value.trim(),
          company_address: ov.querySelector('#ncc-inv-addr').value.trim(),
        } : null,
      };
      if (!isNew) payload.active = ov.querySelector('#ncc-active').checked;
      if (isNew && debtToggle.checked) {
        const amount = Number(ov.querySelector('#ncc-debt-amount').value) || 0;
        if (amount > 0) {
          payload.initial_debt = { amount, due_date: ov.querySelector('#ncc-debt-due').value || null };
        }
      }
      try {
        if (isNew) await api.post('/api/mgr/ingredients/suppliers/full', payload);
        else await api.patch(`/api/mgr/ingredients/suppliers/${sup.id}/full`, payload);
        toast(isNew ? 'Đã tạo nhà cung cấp' : 'Đã cập nhật');
        modal.close();
        await load();
      } catch (err) {
        toast(err?.body?.message || 'Lỗi khi lưu', 'error');
      }
    });
  }

  // ─── Xuất Excel toàn bộ nhà cung cấp ("Tải nhà cung cấp") ────────────────────
  async function exportSuppliers() {
    try {
      const rows = data.suppliers.map((s) => [s.name, s.phone || '', s.email || '', s.address || '']);
      await downloadXlsx('nha-cung-cap.xlsx', rows);
      toast('Đã tải file nha-cung-cap.xlsx');
    } catch (err) {
      toast(err?.message || 'Không tải được file Excel', 'error');
    }
  }

  function historyBtn(modalOv, key) {
    modalOv.querySelector('[data-imp-history]').addEventListener('click', () => {
      const items = uploadHistory.filter((h) => h.key === key);
      if (!items.length) { alertDialog('Chưa có lượt tải lên nào trong phiên này.'); return; }
      const msg = items.map((h) => `${h.at} — ${h.filename}: ${h.success}/${h.total} thành công${h.fail ? `, ${h.fail} lỗi` : ''}`).join('\n');
      alertDialog(msg, { title: 'Lịch sử tải lên' });
    });
  }

  function bindDropZone(modalOv, onFile) {
    const dropEl = modalOv.querySelector('[data-imp-drop]');
    const fileEl = modalOv.querySelector('[data-imp-file]');
    dropEl.addEventListener('click', () => fileEl.click());
    dropEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileEl.click(); } });
    fileEl.addEventListener('change', () => { if (fileEl.files?.[0]) onFile(fileEl.files[0]); });
    ['dragenter', 'dragover'].forEach((ev) => dropEl.addEventListener(ev, (e) => { e.preventDefault(); dropEl.classList.add('dragover'); }));
    ['dragleave', 'drop'].forEach((ev) => dropEl.addEventListener(ev, (e) => { e.preventDefault(); dropEl.classList.remove('dragover'); }));
    dropEl.addEventListener('drop', (e) => { const f = e.dataTransfer?.files?.[0]; if (f) onFile(f); });
  }

  // ─── Modal "Thêm nhiều nhà cung cấp (Excel)" ────────────────────────────────
  function openImportModal() {
    const modal = openModal(`
      <h3>Tạo hàng loạt nhà cung cấp (Excel)</h3>
      <p class="hint">Nhận file .xlsx. Cột: ${SHEET_HEADER.join(', ')} — dòng đầu là tiêu đề, tối đa 5.000 dòng.</p>
      <div class="pform-drop" data-imp-drop role="button" tabindex="0"
        style="padding:28px 16px;text-align:center;border:1.5px dashed var(--line);border-radius:10px;margin:10px 0">
        <input type="file" data-imp-file accept=".xlsx" hidden />
        <div style="font-weight:600">Kéo thả file vào đây hoặc bấm để chọn file</div>
        <div class="hint">(.xlsx)</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="button" class="btn" data-imp-template">Tải tệp mẫu</button>
        <button type="button" class="btn" data-imp-history>Lịch sử tải lên</button>
      </div>
      <div id="ncc-imp-result" class="hint" style="margin-top:10px"></div>
      <button id="ncc-imp-close" class="btn" style="width:100%;margin-top:12px">Đóng</button>
    `);
    const ov = modal.overlay;
    ov.querySelector('#ncc-imp-close').addEventListener('click', modal.close);
    ov.querySelector('[data-imp-template]').addEventListener('click', async () => {
      try {
        await downloadXlsx('mau-them-nha-cung-cap.xlsx', [['Nhà cung cấp A', '0900000000', 'a@example.com', 'Địa chỉ mẫu']]);
      } catch (err) {
        toast(err?.message || 'Không tải được tệp mẫu', 'error');
      }
    });
    historyBtn(ov, 'import');
    bindDropZone(ov, async (file) => {
      const resultEl = ov.querySelector('#ncc-imp-result');
      resultEl.textContent = 'Đang xử lý…';
      let rows;
      try {
        rows = await parseXlsxFile(file);
      } catch (err) {
        resultEl.textContent = err?.message || 'Không đọc được file Excel — kiểm tra đúng định dạng .xlsx.';
        return;
      }
      let success = 0, fail = 0;
      for (const row of rows) {
        const name = row.ten || row.name || '';
        if (!name) { fail++; continue; }
        try {
          await api.post('/api/mgr/ingredients/suppliers/full', {
            name, phone: row.sdt || row.phone || null, email: row.email || null, address: row.diachi || row.address || null,
          });
          success++;
        } catch { fail++; }
      }
      uploadHistory.push({ key: 'import', filename: file.name, total: rows.length, success, fail, at: new Date().toLocaleString('vi-VN') });
      resultEl.textContent = `Đã thêm ${success}/${rows.length} nhà cung cấp${fail ? `, ${fail} dòng lỗi` : ''}.`;
      toast(`Đã thêm ${success} nhà cung cấp từ file`);
      await load();
    });
  }

  // ─── Modal "Cập nhật hàng loạt (Excel)" ──────────────────────────────────────
  function openUpdateModal() {
    const modal = openModal(`
      <h3>Cập nhật nhiều nhà cung cấp (Excel)</h3>
      <p class="hint">Chỉ cập nhật khi tên nhà cung cấp trong file trùng với hệ thống. Cột: ${SHEET_HEADER.join(', ')}.</p>
      <button type="button" class="btn" id="ncc-upd-existing" style="width:100%;margin:8px 0">↓ Tải danh sách hiện có</button>
      <div class="pform-drop" data-imp-drop role="button" tabindex="0"
        style="padding:28px 16px;text-align:center;border:1.5px dashed var(--line);border-radius:10px;margin:10px 0">
        <input type="file" data-imp-file accept=".xlsx" hidden />
        <div style="font-weight:600">Kéo thả file vào đây hoặc bấm để chọn file</div>
        <div class="hint">(.xlsx)</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="button" class="btn" data-imp-history>Lịch sử tải lên</button>
      </div>
      <div id="ncc-upd-result" class="hint" style="margin-top:10px"></div>
      <button id="ncc-upd-close" class="btn" style="width:100%;margin-top:12px">Đóng</button>
    `);
    const ov = modal.overlay;
    ov.querySelector('#ncc-upd-close').addEventListener('click', modal.close);
    ov.querySelector('#ncc-upd-existing').addEventListener('click', exportSuppliers);
    historyBtn(ov, 'update');
    bindDropZone(ov, async (file) => {
      const resultEl = ov.querySelector('#ncc-upd-result');
      resultEl.textContent = 'Đang xử lý…';
      let rows;
      try {
        rows = await parseXlsxFile(file);
      } catch (err) {
        resultEl.textContent = err?.message || 'Không đọc được file Excel — kiểm tra đúng định dạng .xlsx.';
        return;
      }
      let success = 0, notFound = 0;
      for (const row of rows) {
        const name = (row.ten || row.name || '').trim();
        if (!name) continue;
        const match = data.suppliers.find((s) => s.name.trim().toLowerCase() === name.toLowerCase());
        if (!match) { notFound++; continue; }
        const patch = {};
        if (row.sdt || row.phone) patch.phone = row.sdt || row.phone;
        if (row.email) patch.email = row.email;
        if (row.diachi || row.address) patch.address = row.diachi || row.address;
        if (!Object.keys(patch).length) continue;
        try { await api.patch(`/api/mgr/ingredients/suppliers/${match.id}/full`, patch); success++; }
        catch { notFound++; }
      }
      uploadHistory.push({ key: 'update', filename: file.name, total: rows.length, success, fail: notFound, at: new Date().toLocaleString('vi-VN') });
      resultEl.textContent = `Đã cập nhật ${success}/${rows.length} nhà cung cấp${notFound ? `, ${notFound} dòng không khớp tên` : ''}.`;
      toast(`Đã cập nhật ${success} nhà cung cấp`);
      await load();
    });
  }

  // ─── Tải dữ liệu ─────────────────────────────────────────────────────────────
  async function load() {
    const params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    try {
      const res = await api.get(`/api/mgr/ingredients/suppliers/overview?${params}`);
      data = res;
      renderKpi();
      renderList();
      renderPaginator();
    } catch {
      container.querySelector('#ncc-tbody').innerHTML = `<tr><td colspan="${canManage ? 6 : 5}"><p>Không tải được danh sách nhà cung cấp.</p></td></tr>`;
    }
  }

  await load();
}
