// GĐ6 — Khách hàng: danh sách + gán nhóm + xem điểm tích luỹ.
// Task 2 (10/08/2026) — nút 3 chấm ở cuối mỗi dòng (sửa nhanh / xem điểm), sửa được TOÀN BỘ thông
// tin khách (tên, SĐT, địa chỉ, email, ngày sinh, ghi chú) và ĐẶT ĐƯỢC ẢNH ĐẠI DIỆN — ảnh dùng
// chung cột avatar_url với Chat Center.
//
// Đợt 7 (18/08/2026) — viết lại giao diện theo ảnh mẫu Sổ Bán Hàng v2 (Downloads/SoBanHang/
// Website v2/Đối tác/Khách hàng): page-head + KPI card + bảng .sp-table (cùng kiểu san-pham.js
// Đợt 5) thay cho danh sách .stock-row cũ. Backend bổ sung: POST / (tạo khách tay), GET /tags
// (nhãn), và mỗi dòng khách trả kèm tags/last_order_code/receivable/payable (customer-service.js).
//
// KHÔNG LÀM (xem báo cáo output/2026-08-18-dot7-khachhang-nhomkhach-baocao.md để biết vì sao):
//   • Toggle "Đồng thời là nhà cung cấp" trong modal tạo khách — đụng vào Nhà cung cấp (màn của
//     agent khác trong cùng đợt, không được sửa ingredient-service.js/ingredients.js).
//   • Toggle "Thông tin nợ cũ" / "Thông tin xuất hoá đơn" trong modal tạo khách — cần bảng dữ liệu
//     mới hoàn toàn ngoài phạm vi nhiệm vụ (chỉ khach-hang.js/nhom-khach.js + backend customers).
//   • "Tạo hàng loạt (Excel)" / "Cập nhật nhiều (Excel)" — giữ nút cho đúng bố cục ảnh nhưng bấm ra
//     toast "Tính năng đang phát triển", giống cách san-pham.js (Đợt 5) đã làm với các nút tương tự.
import { api, getApiBase } from '../api.js';
import { formatVND, escapeHtml, toast, openModal, confirmDialog, resolveImg } from '../ui.js';
import { icon } from '../icons.js';

// Chữ cái đầu của tên — ảnh dự phòng khi khách chưa có ảnh đại diện (đỡ trống trơn một ô xám).
function initialOf(c) {
  const s = String(c.name || c.phone || '?').trim();
  return s ? s[0].toUpperCase() : '?';
}

function avatarHtml(c) {
  return c.avatar_url
    ? `<img class="kh-ava" src="${escapeHtml(resolveImg(c.avatar_url))}" alt="" loading="lazy" />`
    : `<span class="kh-ava kh-ava-txt">${escapeHtml(initialOf(c))}</span>`;
}

function fmtDateTime(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

// 6 chỉ số đúng như hộp "Cài đặt hiển thị" của ảnh mẫu (không có "Số đơn hàng" như bản v1 cũ).
const STAT_DEFS = [
  ['total_spent', 'Tổng đơn hàng', (s) => `${formatVND(s.total_spent)} <small>/ ${s.order_count} đơn</small>`],
  ['new_customers', 'Khách mới', (s) => `${s.new_customers} <small>khách</small>`],
  ['returning_customers', 'Khách quay lại', (s) => `${s.returning_customers} <small>khách</small>`],
  ['receivable', 'Phải thu', (s) => formatVND(s.receivable)],
  ['payable', 'Phải trả', (s) => formatVND(s.payable)],
  ['points', 'Điểm tích luỹ', (s) => `${s.points} <small>điểm</small>`],
];
const STAT_KEY = 'posmgr.khStats.v2';
const DEFAULT_STATS = ['total_spent', 'new_customers', 'returning_customers', 'receivable'];
const MAX_STATS = 4;

// Cột có thể ẩn/hiện trong bảng — đúng 5 lựa chọn trong hộp "HIỂN THỊ CỘT" của ảnh mẫu.
const COL_DEFS = [
  { key: 'nhan', label: 'Nhãn' },
  { key: 'don', label: 'Đơn gần nhất' },
  { key: 'tong', label: 'Tổng đơn đã giao' },
  { key: 'no', label: 'Phải thu/Trả' },
  { key: 'diem', label: 'Điểm tích luỹ' },
];
const LS_COLS = 'posmgr.kh.cols.v1';
const LS_PAGESIZE = 'posmgr.kh.pagesize.v1';

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.customer) {
    container.innerHTML = '<p>Bạn không có quyền xem màn hình này.</p>';
    return;
  }
  const canManage = !!perms.customer_manage;

  let state = { q: '', group_id: '', tag: '', from: '', to: '' };
  let data = { customers: [], total: 0 };
  let groups = [];
  let tags = [];
  let summary = null;
  const selected = new Set();
  let page = 1;
  let pageSize = parseInt(localStorage.getItem(LS_PAGESIZE) || '30', 10);

  function readStatPrefs() {
    try {
      const raw = JSON.parse(localStorage.getItem(STAT_KEY) || 'null');
      const known = Array.isArray(raw) ? raw.filter((k) => STAT_DEFS.some(([d]) => d === k)) : [];
      return known.length ? known.slice(0, MAX_STATS) : [...DEFAULT_STATS];
    } catch { return [...DEFAULT_STATS]; }
  }
  let statKeys = readStatPrefs();

  let visibleCols = new Set(
    JSON.parse(localStorage.getItem(LS_COLS) || 'null') || COL_DEFS.map((c) => c.key)
  );

  container.innerHTML = `
    <div class="page-head">
      <h2>Danh bạ</h2>
      <div style="display:flex;gap:8px;align-items:center;position:relative">
        <div style="position:relative">
          <button id="kh-stat-cfg" class="btn" type="button" title="Cài đặt hiển thị">${icon('cai-dat') || ''} ▾</button>
        </div>
        ${canManage ? `
        <div style="display:flex;border-radius:8px;overflow:hidden">
          <button id="kh-new" class="btn btn-primary" style="border-radius:0;border-right:1px solid rgba(255,255,255,.3)">+ Tạo khách hàng</button>
          <button id="kh-new-drop" class="btn btn-primary" style="border-radius:0;padding:0 8px">▾</button>
        </div>
        <div id="kh-new-menu" class="row-menu" style="display:none;position:absolute;top:100%;right:0;min-width:240px;z-index:200">
          <button type="button" data-nm="tao">Tạo khách hàng</button>
          <button type="button" data-nm="excel-in">Tạo hàng loạt khách hàng (Excel)</button>
          <button type="button" data-nm="excel-up">Cập nhật nhiều khách hàng (Excel)</button>
        </div>` : ''}
      </div>
    </div>

    <div id="kh-kpi" style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px"></div>

    <div class="filter-row">
      <input id="kh-q" type="search" placeholder="Tìm khách hàng" />
      <input id="kh-from" type="date" aria-label="Từ ngày" />
      <input id="kh-to" type="date" aria-label="Đến ngày" />
      <select id="kh-tag"><option value="">Nhãn</option></select>
      <select id="kh-group"><option value="">Nhóm khách hàng</option></select>
      <div style="position:relative">
        <button id="kh-col-btn" class="btn" style="font-size:13px">Hiển thị cột ▾</button>
        <div id="kh-col-drop" hidden style="position:absolute;right:0;background:var(--card-bg,#fff);border:1px solid var(--border,#ddd);border-radius:8px;min-width:190px;z-index:100;padding:8px;box-shadow:0 4px 12px rgba(0,0,0,.1);margin-top:4px">
          ${COL_DEFS.map((c) => `
          <label style="display:flex;align-items:center;gap:8px;padding:6px 8px;cursor:pointer">
            <input type="checkbox" data-col="${c.key}" ${visibleCols.has(c.key) ? 'checked' : ''} style="width:auto;min-height:auto" />
            ${escapeHtml(c.label)}
          </label>`).join('')}
        </div>
      </div>
    </div>

    <div style="overflow-x:auto">
      <table class="sp-table" id="kh-table" style="width:100%;min-width:760px">
        <thead id="kh-thead"></thead>
        <tbody id="kh-tbody"><tr><td colspan="8" style="text-align:center;padding:24px">Đang tải…</td></tr></tbody>
      </table>
    </div>

    <div id="kh-paginator" style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;gap:12px;flex-wrap:wrap">
      <span id="kh-page-info" style="color:#666;font-size:13px"></span>
      <div id="kh-page-btns" style="display:flex;gap:4px"></div>
      <div style="display:flex;align-items:center;gap:6px;font-size:13px">
        Hiển thị dòng
        <select id="kh-page-size" style="width:auto;padding:4px 8px">
          ${[10, 30, 50, 100].map((n) => `<option value="${n}" ${n === pageSize ? 'selected' : ''}>${n}</option>`).join('')}
        </select>
      </div>
    </div>
  `;

  // ── Tìm kiếm + bộ lọc ────────────────────────────────────────────────────────────────────────
  const qEl = container.querySelector('#kh-q');
  const groupEl = container.querySelector('#kh-group');
  const tagEl = container.querySelector('#kh-tag');
  const fromEl = container.querySelector('#kh-from');
  const toEl = container.querySelector('#kh-to');

  let timer = null;
  qEl.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => { state.q = qEl.value.trim(); page = 1; load(); }, 300);
  });
  groupEl.addEventListener('change', () => { state.group_id = groupEl.value; page = 1; load(); });
  tagEl.addEventListener('change', () => { state.tag = tagEl.value; page = 1; load(); });
  [fromEl, toEl].forEach((el) => el.addEventListener('change', () => {
    state.from = fromEl.value; state.to = toEl.value; page = 1; load(); loadSummary();
  }));

  // ── Cột hiển thị ─────────────────────────────────────────────────────────────────────────────
  const colDrop = container.querySelector('#kh-col-drop');
  container.querySelector('#kh-col-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    colDrop.hidden = !colDrop.hidden;
  });
  document.addEventListener('click', () => { colDrop.hidden = true; });
  colDrop.querySelectorAll('[data-col]').forEach((cb) => {
    cb.addEventListener('change', () => {
      if (cb.checked) visibleCols.add(cb.dataset.col); else visibleCols.delete(cb.dataset.col);
      try { localStorage.setItem(LS_COLS, JSON.stringify([...visibleCols])); } catch { /* riêng tư: bỏ qua */ }
      renderTableHead();
      renderList();
    });
  });

  container.querySelector('#kh-page-size').addEventListener('change', (e) => {
    pageSize = parseInt(e.target.value, 10);
    page = 1;
    try { localStorage.setItem(LS_PAGESIZE, String(pageSize)); } catch { /* */ }
    renderList();
    renderPaginator();
  });

  // ── "Cài đặt hiển thị" — chọn 1–4 thẻ chỉ số muốn nhìn (đúng luật của ảnh) ─────────────────────
  function renderKpi() {
    const el = container.querySelector('#kh-kpi');
    if (!summary) { el.innerHTML = ''; return; }
    el.innerHTML = statKeys.map((k) => {
      const def = STAT_DEFS.find(([d]) => d === k);
      if (!def) return '';
      return `<div class="kpi-card"><div class="kpi-val">${def[2](summary)}</div><div class="kpi-label">${escapeHtml(def[1])}</div></div>`;
    }).join('');
  }

  container.querySelector('#kh-stat-cfg').addEventListener('click', () => {
    const modal = openModal(`
      <h3>Cài đặt hiển thị</h3>
      <p class="picker-hint">Chọn ít nhất 1 và tối đa ${MAX_STATS} hiển thị.</p>
      <div class="kh-stat-picker">
        ${STAT_DEFS.map(([k, label]) => `<label class="kh-stat-opt">
          <input type="checkbox" value="${escapeHtml(k)}" ${statKeys.includes(k) ? 'checked' : ''} />
          <span>${escapeHtml(label)}</span>
        </label>`).join('')}
      </div>
      <div class="order-detail-actions">
        <button id="khs-cancel" class="btn" type="button">Quay lại</button>
        <button id="khs-ok" class="btn btn-primary" type="button">Xác nhận</button>
      </div>
    `);
    const boxes = [...modal.overlay.querySelectorAll('.kh-stat-picker input')];
    const sync = () => {
      const n = boxes.filter((b) => b.checked).length;
      boxes.forEach((b) => { b.disabled = !b.checked && n >= MAX_STATS; });
    };
    boxes.forEach((b) => b.addEventListener('change', sync));
    sync();
    modal.overlay.querySelector('#khs-cancel').addEventListener('click', () => modal.close());
    modal.overlay.querySelector('#khs-ok').addEventListener('click', () => {
      const picked = boxes.filter((b) => b.checked).map((b) => b.value);
      if (!picked.length) return toast('Chọn ít nhất 1 chỉ số', 'error');
      statKeys = picked;
      try { localStorage.setItem(STAT_KEY, JSON.stringify(statKeys)); } catch { /* riêng tư: bỏ qua */ }
      renderKpi();
      modal.close();
    });
  });

  async function loadSummary() {
    const qs = new URLSearchParams();
    if (fromEl.value) qs.set('from', fromEl.value);
    if (toEl.value) qs.set('to', toEl.value);
    try {
      const res = await api.get(`/api/mgr/customers/summary${qs.toString() ? '?' + qs : ''}`);
      summary = res.summary;
    } catch { summary = null; }
    renderKpi();
  }

  async function loadGroups() {
    try {
      const res = await api.get('/api/mgr/customers/groups');
      groups = res.groups || [];
      groupEl.innerHTML = '<option value="">Nhóm khách hàng</option>'
        + groups.map((g) => `<option value="${g.id}">${escapeHtml(g.name)}${g.active ? '' : ' (ẩn)'}</option>`).join('');
    } catch { /* không tải được nhóm thì vẫn dùng được */ }
  }

  async function loadTags() {
    try {
      const res = await api.get('/api/mgr/customers/tags');
      tags = res.tags || [];
      tagEl.innerHTML = '<option value="">Nhãn</option>'
        + tags.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
    } catch { /* không tải được nhãn thì vẫn dùng được */ }
  }

  // ── Bảng ─────────────────────────────────────────────────────────────────────────────────────
  function renderTableHead() {
    container.querySelector('#kh-thead').innerHTML = `<tr>
      <th style="width:32px"><input id="kh-check-all" type="checkbox" style="width:auto;min-height:auto" /></th>
      <th>KHÁCH HÀNG</th>
      ${visibleCols.has('nhan') ? '<th>NHÃN</th>' : ''}
      ${visibleCols.has('don')  ? '<th>ĐƠN GẦN NHẤT</th>' : ''}
      ${visibleCols.has('tong') ? '<th>TỔNG ĐƠN ĐÃ GIAO</th>' : ''}
      ${visibleCols.has('no')   ? '<th>PHẢI THU/TRẢ</th>' : ''}
      ${visibleCols.has('diem') ? '<th>ĐIỂM TÍCH LUỸ</th>' : ''}
      <th style="width:40px"></th>
    </tr>`;
    container.querySelector('#kh-check-all')?.addEventListener('change', (e) => {
      const paged = pagedItems();
      if (e.target.checked) paged.forEach((c) => selected.add(c.id));
      else paged.forEach((c) => selected.delete(c.id));
      renderList();
    });
  }

  function pagedItems() {
    const start = (page - 1) * pageSize;
    return data.customers.slice(start, start + pageSize);
  }

  function renderList() {
    const paged = pagedItems();
    const tbody = container.querySelector('#kh-tbody');
    const colCount = 3 + COL_DEFS.filter((c) => visibleCols.has(c.key)).length;
    if (!data.customers.length) {
      tbody.innerHTML = `<tr><td colspan="${colCount}" style="text-align:center;padding:32px;color:#999">Không tìm thấy khách hàng nào.</td></tr>`;
      return;
    }
    tbody.innerHTML = paged.map((c) => `
      <tr data-cid="${c.id}">
        <td><input type="checkbox" data-pick="${c.id}" ${selected.has(c.id) ? 'checked' : ''} style="width:auto;min-height:auto" /></td>
        <td>
          <div style="display:flex;align-items:center;gap:8px">
            ${avatarHtml(c)}
            <div>
              <div style="font-weight:500">${escapeHtml(c.name || '—')}${c.is_supplier ? '<span class="badge-ok" style="margin-left:6px">Cũng là NCC</span>' : ''}</div>
              <div style="font-size:12px;color:#888">${escapeHtml(c.phone)}</div>
            </div>
          </div>
        </td>
        ${visibleCols.has('nhan') ? `<td>${(c.tags || []).map((t) => `<span class="badge-default">${escapeHtml(t)}</span>`).join(' ') || '—'}</td>` : ''}
        ${visibleCols.has('don')  ? `<td>${c.last_order_code ? `<div>${escapeHtml(c.last_order_code)}</div><div style="font-size:12px;color:#888">${fmtDateTime(c.last_order_at)}</div>` : '—'}</td>` : ''}
        ${visibleCols.has('tong') ? `<td><div>${formatVND(c.total_spent)}</div><div style="font-size:12px;color:#888">${c.order_count} đơn hàng</div></td>` : ''}
        ${visibleCols.has('no')   ? `<td>${c.receivable > 0
            ? `<span style="color:var(--money-in,#16a34a)">${formatVND(c.receivable)}</span>`
            : c.payable > 0
              ? `<span style="color:var(--danger,#c00)">-${formatVND(c.payable)}</span>`
              : '—'}</td>` : ''}
        ${visibleCols.has('diem') ? `<td>${c.points ?? 0} điểm</td>` : ''}
        <td>${canManage ? `<button class="ord-kebab" data-menu="${c.id}" aria-haspopup="menu" aria-expanded="false"
            aria-label="Thao tác với khách ${escapeHtml(c.name || c.phone)}">${icon('them')}</button>` : ''}</td>
      </tr>`).join('');

    tbody.querySelectorAll('[data-pick]').forEach((box) => {
      box.addEventListener('change', () => {
        const id = Number(box.dataset.pick);
        if (box.checked) selected.add(id); else selected.delete(id);
      });
    });
    if (canManage) {
      tbody.querySelectorAll('.ord-kebab').forEach((btn) => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); openRowMenu(btn); });
      });
    }
  }

  function renderPaginator() {
    const total = data.customers.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (page > totalPages) page = totalPages;
    const start = total ? (page - 1) * pageSize + 1 : 0;
    const end = Math.min(page * pageSize, total);
    container.querySelector('#kh-page-info').textContent = total ? `Hiển thị ${start}–${end} / ${total} kết quả` : '';

    const btns = container.querySelector('#kh-page-btns');
    if (totalPages <= 1) { btns.innerHTML = ''; return; }
    let html = `<button ${page === 1 ? 'disabled' : ''} data-pg="${page - 1}" class="btn" style="padding:4px 10px">‹</button>`;
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= page - 2 && i <= page + 2)) {
        html += `<button data-pg="${i}" class="btn ${i === page ? 'btn-primary' : ''}" style="padding:4px 10px">${i}</button>`;
      } else if (i === page - 3 || i === page + 3) {
        html += `<span style="padding:0 4px">…</span>`;
      }
    }
    html += `<button ${page === totalPages ? 'disabled' : ''} data-pg="${page + 1}" class="btn" style="padding:4px 10px">›</button>`;
    btns.innerHTML = html;
    btns.querySelectorAll('[data-pg]').forEach((btn) => {
      btn.addEventListener('click', () => { page = parseInt(btn.dataset.pg, 10); renderList(); renderPaginator(); });
    });
  }

  // ── Menu 3 chấm — dùng chung .row-menu với màn Đơn hàng/Sản phẩm. ─────────────────────────────
  let openMenuEl = null;
  function closeRowMenu() {
    if (openMenuEl) { openMenuEl.remove(); openMenuEl = null; }
    container.querySelectorAll('.ord-kebab[aria-expanded="true"]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
  }
  function openRowMenu(btn) {
    const c = data.customers.find((x) => String(x.id) === btn.dataset.menu);
    if (!c) return;
    const wasOpen = btn.getAttribute('aria-expanded') === 'true';
    closeRowMenu();
    if (wasOpen) return;
    const menu = document.createElement('div');
    menu.className = 'row-menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = `
      <button type="button" role="menuitem" data-act="edit">${icon('chinh-sua')} Sửa thông tin</button>
      <button type="button" role="menuitem" data-act="group">${icon('nhom-khach')} Gán nhóm khách</button>
      <button type="button" role="menuitem" data-act="loyalty">${icon('tich-diem')} Lịch sử điểm</button>`;
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
      if (act.dataset.act === 'edit') openEdit(c);
      else if (act.dataset.act === 'group') openDetail(c);
      else location.hash = `#/tich-diem?customer_id=${c.id}`;
    });
  }
  document.addEventListener('click', closeRowMenu);

  // ── "+ Tạo khách hàng" (Đợt 7) — split button + menu Excel (placeholder) ───────────────────────
  if (canManage) {
    const newMenu = container.querySelector('#kh-new-menu');
    container.querySelector('#kh-new').addEventListener('click', () => openCreate());
    container.querySelector('#kh-new-drop').addEventListener('click', (e) => {
      e.stopPropagation();
      newMenu.style.display = newMenu.style.display === 'block' ? 'none' : 'block';
    });
    document.addEventListener('click', () => { newMenu.style.display = 'none'; });
    newMenu.querySelectorAll('[data-nm]').forEach((btn) => {
      btn.addEventListener('click', () => {
        newMenu.style.display = 'none';
        if (btn.dataset.nm === 'tao') { openCreate(); return; }
        toast('Tính năng đang phát triển', 'info');
      });
    });
  }

  function groupOptionsHtml(selectedId) {
    if (!groups.length) return '<option value="">— Chưa có nhóm khách hàng —</option>';
    return '<option value="">— Không nhóm —</option>'
      + groups.filter((g) => g.active).map((g) => `<option value="${g.id}" ${String(selectedId) === String(g.id) ? 'selected' : ''}>${escapeHtml(g.name)}</option>`).join('');
  }

  // ── Tạo khách hàng (Đợt 7) — Tên*/SĐT/Nhóm/Email/Ngày sinh/Giới tính/Địa chỉ/Nhãn/Ghi chú ──────
  function openCreate() {
    const modal = openModal(`
      <h3>Tạo khách hàng mới</h3>
      <div class="field"><label for="kh-c-name">Tên khách hàng <i class="req">*</i></label>
        <input id="kh-c-name" type="text" placeholder="Nguyễn Văn A" /></div>
      <div class="field"><label for="kh-c-phone">Số điện thoại</label>
        <input id="kh-c-phone" type="tel" placeholder="0912345678" /></div>
      <div class="pform-switches">
        <div class="pform-row"><span>Đồng thời là nhà cung cấp</span>
          <label class="sw"><input id="kh-c-issup" type="checkbox" /><i></i></label></div>
      </div>
      <div class="field"><label for="kh-c-group">Nhóm khách hàng</label>
        <select id="kh-c-group">${groupOptionsHtml('')}</select></div>
      <div class="field"><label for="kh-c-email">Email</label>
        <input id="kh-c-email" type="email" placeholder="vana@gmail.com" /></div>
      <div class="field"><label for="kh-c-dob">Ngày sinh</label>
        <input id="kh-c-dob" type="date" /></div>
      <div class="field"><label for="kh-c-gender">Giới tính</label>
        <select id="kh-c-gender"><option value="">Chọn</option><option value="nam">Nam</option><option value="nu">Nữ</option><option value="khac">Khác</option></select></div>
      <div class="field"><label for="kh-c-address">Địa chỉ</label>
        <input id="kh-c-address" type="text" placeholder="Địa chỉ chi tiết" /></div>
      <div class="field"><label for="kh-c-tags">Nhãn</label>
        <input id="kh-c-tags" type="text" placeholder="VD: VIP, Khách quen (cách nhau bằng dấu phẩy)" /></div>
      <div class="field"><label for="kh-c-notes">Ghi chú</label>
        <input id="kh-c-notes" type="text" placeholder="Ví dụ: khách quen, không ăn cay" /></div>
      <div class="modal-close-row">
        <button class="btn" data-action="close">Hủy</button>
        <button class="btn btn-primary" id="kh-c-save">Xác nhận</button>
      </div>
    `);
    modal.overlay.querySelector('[data-action="close"]').addEventListener('click', modal.close);
    modal.overlay.querySelector('#kh-c-save').addEventListener('click', async () => {
      const btn = modal.overlay.querySelector('#kh-c-save');
      const name = modal.overlay.querySelector('#kh-c-name').value.trim();
      if (!name) { toast('Nhập tên khách hàng', 'error'); return; }
      const tagsStr = modal.overlay.querySelector('#kh-c-tags').value.trim();
      btn.disabled = true;
      try {
        await api.post('/api/mgr/customers', {
          name,
          phone: modal.overlay.querySelector('#kh-c-phone').value.trim(),
          group_id: modal.overlay.querySelector('#kh-c-group').value || null,
          is_supplier: modal.overlay.querySelector('#kh-c-issup').checked,
          email: modal.overlay.querySelector('#kh-c-email').value.trim(),
          dob: modal.overlay.querySelector('#kh-c-dob').value,
          gender: modal.overlay.querySelector('#kh-c-gender').value,
          address: modal.overlay.querySelector('#kh-c-address').value.trim(),
          tags: tagsStr ? tagsStr.split(',').map((t) => t.trim()).filter(Boolean) : [],
          notes: modal.overlay.querySelector('#kh-c-notes').value.trim(),
        });
        toast('Đã tạo khách hàng mới');
        modal.close();
        await loadTags();
        await load();
      } catch (err) {
        toast(err?.body?.message || 'Không tạo được khách hàng', 'error');
      } finally {
        btn.disabled = false;
      }
    });
  }

  // ── Task 2 — SỬA THÔNG TIN KHÁCH + ẢNH ĐẠI DIỆN (+ Giới tính/Nhãn, Đợt 7) ───────────────────────
  function openEdit(c) {
    const modal = openModal(`
      <h3>Sửa thông tin khách</h3>
      <div class="kh-edit-ava">
        <span id="kh-ava-box">${avatarHtml(c)}</span>
        <div>
          <button type="button" class="btn" id="kh-ava-pick">Đổi ảnh đại diện</button>
          ${c.avatar_url ? '<button type="button" class="btn btn-danger" id="kh-ava-del">Bỏ ảnh</button>' : ''}
          <p class="kh-hint">Ảnh PNG/JPG. Ảnh sẽ tự thu về 256×256.</p>
        </div>
        <input type="file" id="kh-ava-file" accept="image/png,image/jpeg" hidden />
      </div>
      <div class="field"><label for="kh-e-name">Tên khách</label>
        <input id="kh-e-name" type="text" value="${escapeHtml(c.name || '')}" /></div>
      <div class="field"><label for="kh-e-phone">Số điện thoại</label>
        <input id="kh-e-phone" type="tel" value="${escapeHtml(c.phone || '')}" /></div>
      <div class="pform-switches">
        <div class="pform-row"><span>Đồng thời là nhà cung cấp</span>
          <label class="sw"><input id="kh-e-issup" type="checkbox" ${c.is_supplier ? 'checked' : ''} /><i></i></label></div>
      </div>
      <div class="field"><label for="kh-e-gender">Giới tính</label>
        <select id="kh-e-gender">
          <option value="">Chọn</option>
          <option value="nam" ${c.gender === 'nam' ? 'selected' : ''}>Nam</option>
          <option value="nu" ${c.gender === 'nu' ? 'selected' : ''}>Nữ</option>
          <option value="khac" ${c.gender === 'khac' ? 'selected' : ''}>Khác</option>
        </select></div>
      <div class="field"><label for="kh-e-address">Địa chỉ</label>
        <input id="kh-e-address" type="text" value="${escapeHtml(c.address || '')}" /></div>
      <div class="field"><label for="kh-e-email">Email</label>
        <input id="kh-e-email" type="email" value="${escapeHtml(c.email || '')}" /></div>
      <div class="field"><label for="kh-e-dob">Ngày sinh</label>
        <input id="kh-e-dob" type="date" value="${escapeHtml(String(c.dob || '').slice(0, 10))}" /></div>
      <div class="field"><label for="kh-e-tags">Nhãn</label>
        <input id="kh-e-tags" type="text" value="${escapeHtml((c.tags || []).join(', '))}" placeholder="VD: VIP, Khách quen" /></div>
      <div class="field"><label for="kh-e-notes">Ghi chú</label>
        <input id="kh-e-notes" type="text" value="${escapeHtml(c.notes || '')}" placeholder="Ví dụ: khách quen, không ăn cay" /></div>
      <div class="modal-close-row">
        <button class="btn" data-action="close">Đóng</button>
        <button class="btn btn-primary" id="kh-e-save">Lưu</button>
      </div>
    `);
    modal.overlay.querySelector('[data-action="close"]').addEventListener('click', modal.close);

    const fileInput = modal.overlay.querySelector('#kh-ava-file');
    modal.overlay.querySelector('#kh-ava-pick').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        // Gửi THẲNG tệp làm thân yêu cầu (Content-Type: image/...) — cùng cách với ảnh sản phẩm,
        // máy chủ đọc bằng express.raw nên không cần multipart/multer.
        const res = await fetch(`${getApiBase()}/api/mgr/customers/${c.id}/avatar`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': file.type }, body: file,
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.message || 'Không tải được ảnh lên');
        c.avatar_url = body.avatar_url;
        modal.overlay.querySelector('#kh-ava-box').innerHTML = avatarHtml(c);
        toast('Đã cập nhật ảnh đại diện');
        load();
      } catch (err) {
        toast(err.message || 'Không tải được ảnh lên', 'error');
      } finally {
        fileInput.value = '';
      }
    });
    const avaDel = modal.overlay.querySelector('#kh-ava-del');
    if (avaDel) {
      avaDel.addEventListener('click', async () => {
        if (!(await confirmDialog('Bỏ ảnh đại diện của khách này?', { danger: true }))) return;
        try {
          await api.patch(`/api/mgr/customers/${c.id}`, { avatar_url: null });
          c.avatar_url = null;
          modal.overlay.querySelector('#kh-ava-box').innerHTML = avatarHtml(c);
          avaDel.remove();
          toast('Đã bỏ ảnh đại diện');
          load();
        } catch (err) { toast(err?.body?.message || 'Không bỏ được ảnh', 'error'); }
      });
    }

    modal.overlay.querySelector('#kh-e-save').addEventListener('click', async () => {
      const btn = modal.overlay.querySelector('#kh-e-save');
      btn.disabled = true;
      const tagsStr = modal.overlay.querySelector('#kh-e-tags').value.trim();
      try {
        await api.patch(`/api/mgr/customers/${c.id}`, {
          name: modal.overlay.querySelector('#kh-e-name').value,
          phone: modal.overlay.querySelector('#kh-e-phone').value,
          is_supplier: modal.overlay.querySelector('#kh-e-issup').checked,
          gender: modal.overlay.querySelector('#kh-e-gender').value,
          address: modal.overlay.querySelector('#kh-e-address').value,
          email: modal.overlay.querySelector('#kh-e-email').value,
          dob: modal.overlay.querySelector('#kh-e-dob').value,
          tags: tagsStr ? tagsStr.split(',').map((t) => t.trim()).filter(Boolean) : [],
          notes: modal.overlay.querySelector('#kh-e-notes').value,
        });
        toast('Đã lưu thông tin khách');
        modal.close();
        await loadTags();
        await load();
      } catch (err) {
        toast(err?.body?.message || 'Không lưu được', 'error');
      } finally {
        btn.disabled = false;
      }
    });
  }

  function openDetail(c) {
    const modal = openModal(`
      <h3>${escapeHtml(c.name || c.phone)}</h3>
      <p style="margin:4px 0">SĐT: <b>${escapeHtml(c.phone)}</b></p>
      <p style="margin:4px 0">Điểm hiện tại: <b>${c.points ?? 0}</b></p>
      <div class="field"><label>Gán nhóm khách</label>
        <select id="kh-grp-sel">${groupOptionsHtml(c.group_id)}</select>
      </div>
      <button id="kh-save-grp" class="btn btn-primary" style="width:100%">Lưu nhóm</button>
      <button id="kh-view-loyalty" class="btn" style="width:100%;margin-top:8px">Xem lịch sử điểm →</button>
    `);
    modal.overlay.querySelector('#kh-save-grp').addEventListener('click', async () => {
      const group_id = modal.overlay.querySelector('#kh-grp-sel').value || null;
      try {
        await api.patch(`/api/mgr/customers/${c.id}/group`, { group_id });
        toast('Đã cập nhật nhóm');
        modal.close();
        await load();
      } catch (err) { toast(err?.body?.message || 'Không lưu được', 'error'); }
    });
    modal.overlay.querySelector('#kh-view-loyalty').addEventListener('click', () => {
      modal.close();
      location.hash = `#/tich-diem?customer_id=${c.id}`;
    });
  }

  async function load() {
    const params = new URLSearchParams({ limit: '300' });
    if (state.q) params.set('q', state.q);
    if (state.group_id) params.set('group_id', state.group_id);
    if (state.tag) params.set('tag', state.tag);
    if (state.from) params.set('from', state.from);
    if (state.to) params.set('to', state.to);
    try {
      data = await api.get(`/api/mgr/customers?${params}`);
      renderList();
      renderPaginator();
    } catch {
      container.querySelector('#kh-tbody').innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px">Không tải được danh sách khách hàng.</td></tr>';
    }
  }

  renderTableHead();
  await loadGroups();
  await loadTags();
  await load();
  // Thẻ chỉ số tải SAU danh sách và không chặn: câu tổng hợp chạy trên toàn bộ đơn hàng, chậm hơn
  // hẳn — chờ nó xong mới vẽ danh sách là màn hình trắng lâu vô ích.
  loadSummary();
}
