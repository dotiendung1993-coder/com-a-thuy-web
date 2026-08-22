// Đợt 6 (17/08/2026) v2 — Sổ kho: giao diện SoBanHang v2 (ảnh mẫu Website v2\Quản lý kho\Sổ kho).
// KPI Đầu kỳ/Nhập trong kỳ/Xuất trong kỳ/Cuối kỳ, filter Loại hàng/Phân loại/Nhân viên, Hiển thị cột,
// "Thao tác ▾" (Tải Excel), "+ Tạo giao dịch ▾". Vẫn dùng /api/mgr/stock/moves có sẵn (GĐ4) — chỉ
// thêm lọc "Phân loại" tính từ (source, direction, huỷ) ở tầng frontend, không đổi API.
import { api } from '../api.js';
import { formatVND, escapeHtml, toast, todayVN, dateVN, confirmDialog, promptDialog } from '../ui.js';

const SOURCE_LABEL = { manual: 'Ghi tay', order: 'Bán hàng', count: 'Kiểm kho' };
// "Phân loại" v2 — suy ra từ source/direction/huỷ, khớp danh sách nhãn trong ảnh mẫu.
function classify(m) {
  if (m.voided) return m.direction === 'nhap' ? 'Hủy nhập hàng' : 'Hủy xuất hàng';
  if (m.source === 'order') return 'Bán hàng';
  if (m.source === 'count') return 'Kiểm kho';
  if (m.reason === 'Nhập hàng') return 'Nhập hàng';
  if (m.reason === 'Xuất hàng') return 'Xuất hàng';
  if (m.reason && m.reason.startsWith('Điều chỉnh')) return 'Sửa tồn kho';
  return m.direction === 'nhap' ? 'Nhập hàng' : 'Xuất hàng';
}
const CLASS_OPTIONS = ['Bán hàng', 'Hoàn trả', 'Hủy đơn', 'Kiểm kho', 'Nhập hàng', 'Hủy nhập hàng',
  'Xuất hàng', 'Hủy xuất hàng', 'Sửa tồn kho', 'Khác'];

const LS_COLS = 'posmgr.sk.cols.v1';
const COL_DEFS = [
  { key: 'phanloai', label: 'Phân loại', default: true },
  { key: 'soluong', label: 'Số lượng', default: true },
  { key: 'giatri', label: 'Giá trị', default: true },
];

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.stock) {
    container.innerHTML = '<p>Bạn không có quyền xem sổ kho.</p>';
    return;
  }
  const canManage = !!perms.stock_manage;

  const state = { from: dateVN(-30), to: todayVN(), direction: '', source: '', classes: new Set(), q: '' };
  let data = { moves: [], summary: {} };
  let visibleCols = new Set(JSON.parse(localStorage.getItem(LS_COLS) || 'null') || COL_DEFS.map((c) => c.key));

  container.innerHTML = `
    <div class="page-head">
      <h2>Sổ kho</h2>
      <div style="display:flex;gap:8px">
        <div style="position:relative">
          <button id="sk-thao-tac" class="btn">Thao tác ▾</button>
          <div id="sk-ta-drop" class="row-menu" style="display:none;position:absolute;top:100%;right:0;min-width:160px;z-index:200">
            <button type="button" data-ta="excel">Tải Excel</button>
          </div>
        </div>
        ${canManage ? `
        <div style="position:relative">
          <button id="sk-create" class="btn btn-primary">+ Tạo giao dịch ▾</button>
          <div id="sk-create-drop" class="row-menu" style="display:none;position:absolute;top:100%;right:0;min-width:180px;z-index:200">
            <button type="button" data-go="nhap-hang">Nhập hàng</button>
            <button type="button" data-go="xuat-kho">Xuất hàng</button>
            <button type="button" data-go="kiem-kho">Kiểm kho</button>
          </div>
        </div>` : ''}
      </div>
    </div>

    <div id="sk-kpi" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px"></div>

    <div class="filter-row">
      <input id="sk-q" type="search" placeholder="Tìm tên sản phẩm, nguyên vật liệu…" />
      <input id="sk-from" type="date" value="${state.from}" />
      <input id="sk-to" type="date" value="${state.to}" />
      <div style="position:relative">
        <button id="sk-dir-btn" class="btn">Loại hàng ▾</button>
        <div id="sk-dir-drop" hidden style="position:absolute;top:100%;left:0;background:var(--card-bg,#fff);border:1px solid var(--border,#ddd);border-radius:8px;min-width:140px;z-index:100;padding:6px;box-shadow:0 4px 12px rgba(0,0,0,.1);margin-top:4px">
          <div class="row-menu-item" data-dir="">Nhập và xuất</div>
          <div class="row-menu-item" data-dir="nhap">Chỉ nhập kho</div>
          <div class="row-menu-item" data-dir="xuat">Chỉ xuất kho</div>
        </div>
      </div>
      <div style="position:relative">
        <button id="sk-class-btn" class="btn">Phân loại ▾</button>
        <div id="sk-class-drop" hidden style="position:absolute;top:100%;left:0;background:var(--card-bg,#fff);border:1px solid var(--border,#ddd);border-radius:8px;min-width:200px;z-index:100;padding:8px;box-shadow:0 4px 12px rgba(0,0,0,.1);margin-top:4px;max-height:260px;overflow-y:auto">
          ${CLASS_OPTIONS.map((c) => `<label style="display:flex;align-items:center;gap:8px;padding:5px 6px;cursor:pointer">
            <input type="checkbox" data-cls="${escapeHtml(c)}" style="width:auto;min-height:auto" /> ${escapeHtml(c)}</label>`).join('')}
        </div>
      </div>
      <div style="position:relative;margin-left:auto">
        <button id="sk-col-btn" class="btn" style="font-size:13px">Hiển thị cột ▾</button>
        <div id="sk-col-drop" hidden style="position:absolute;right:0;background:var(--card-bg,#fff);border:1px solid var(--border,#ddd);border-radius:8px;min-width:160px;z-index:100;padding:8px;box-shadow:0 4px 12px rgba(0,0,0,.1);margin-top:4px">
          <div style="font-size:11px;color:#888;font-weight:600;padding:2px 8px 6px">HIỂN THỊ CỘT</div>
          ${COL_DEFS.map((c) => `<label style="display:flex;align-items:center;gap:8px;padding:6px 8px;cursor:pointer">
            <input type="checkbox" data-col="${c.key}" ${visibleCols.has(c.key) ? 'checked' : ''} style="width:auto;min-height:auto" /> ${escapeHtml(c.label)}</label>`).join('')}
        </div>
      </div>
    </div>

    <div style="overflow-x:auto">
      <table class="sp-table" id="sk-table" style="width:100%;min-width:520px">
        <thead id="sk-thead"></thead>
        <tbody id="sk-tbody"><tr><td colspan="5">Đang tải…</td></tr></tbody>
      </table>
    </div>
  `;

  let searchTimer = null;
  container.querySelector('#sk-q').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.q = e.target.value.trim().toLowerCase(); renderList(); }, 250);
  });

  ['sk-from', 'sk-to'].forEach((id) => {
    container.querySelector(`#${id}`).addEventListener('change', () => {
      state.from = container.querySelector('#sk-from').value;
      state.to = container.querySelector('#sk-to').value;
      load();
    });
  });

  const dirBtn = container.querySelector('#sk-dir-btn'), dirDrop = container.querySelector('#sk-dir-drop');
  const DIR_LABEL = { '': 'Loại hàng', nhap: 'Chỉ nhập kho', xuat: 'Chỉ xuất kho' };
  dirBtn.addEventListener('click', (e) => { e.stopPropagation(); dirDrop.hidden = !dirDrop.hidden; });
  dirDrop.querySelectorAll('[data-dir]').forEach((el) => {
    el.addEventListener('click', () => { state.direction = el.dataset.dir; dirDrop.hidden = true; dirBtn.textContent = DIR_LABEL[state.direction] + ' ▾'; load(); });
  });

  const classBtn = container.querySelector('#sk-class-btn'), classDrop = container.querySelector('#sk-class-drop');
  classBtn.addEventListener('click', (e) => { e.stopPropagation(); classDrop.hidden = !classDrop.hidden; });
  classDrop.querySelectorAll('[data-cls]').forEach((cb) => {
    cb.addEventListener('change', () => {
      if (cb.checked) state.classes.add(cb.dataset.cls); else state.classes.delete(cb.dataset.cls);
      classBtn.textContent = (state.classes.size ? `Phân loại (${state.classes.size})` : 'Phân loại') + ' ▾';
      renderList();
    });
  });

  const colDrop = container.querySelector('#sk-col-drop');
  container.querySelector('#sk-col-btn').addEventListener('click', (e) => { e.stopPropagation(); colDrop.hidden = !colDrop.hidden; });
  colDrop.querySelectorAll('[data-col]').forEach((cb) => {
    cb.addEventListener('change', () => {
      if (cb.checked) visibleCols.add(cb.dataset.col); else visibleCols.delete(cb.dataset.col);
      try { localStorage.setItem(LS_COLS, JSON.stringify([...visibleCols])); } catch { /* */ }
      renderTableHead(); renderList();
    });
  });
  document.addEventListener('click', () => {
    dirDrop.hidden = true; classDrop.hidden = true; colDrop.hidden = true;
    // Đợt 6 gotcha: SPA không gỡ listener document cũ khi đổi màn — phải kiểm null vì container
    // của màn này có thể không còn trong DOM sau khi điều hướng sang màn khác (bug live-QA 17/08).
    const ta = container.querySelector('#sk-ta-drop'); if (ta) ta.style.display = 'none';
    const cd = container.querySelector('#sk-create-drop'); if (cd) cd.style.display = 'none';
  });

  container.querySelector('#sk-thao-tac').addEventListener('click', (e) => {
    e.stopPropagation();
    const d = container.querySelector('#sk-ta-drop');
    d.style.display = d.style.display === 'block' ? 'none' : 'block';
  });
  container.querySelector('#sk-ta-drop').querySelector('[data-ta="excel"]').addEventListener('click', () => {
    toast('Tính năng đang phát triển', 'info');
  });
  if (canManage) {
    container.querySelector('#sk-create').addEventListener('click', (e) => {
      e.stopPropagation();
      const d = container.querySelector('#sk-create-drop');
      d.style.display = d.style.display === 'block' ? 'none' : 'block';
    });
    container.querySelectorAll('#sk-create-drop [data-go]').forEach((btn) => {
      btn.addEventListener('click', () => { window.location.hash = `#/${btn.dataset.go}`; });
    });
  }

  function renderTableHead() {
    container.querySelector('#sk-thead').innerHTML = `<tr>
      <th>MÃ PHIẾU</th>
      <th>SẢN PHẨM / NGUYÊN VẬT LIỆU</th>
      ${visibleCols.has('phanloai') ? '<th>PHÂN LOẠI</th>' : ''}
      ${visibleCols.has('soluong') ? '<th style="width:100px">SỐ LƯỢNG</th>' : ''}
      ${visibleCols.has('giatri') ? '<th style="width:110px">GIÁ TRỊ</th>' : ''}
      ${canManage ? '<th style="width:40px"></th>' : ''}
    </tr>`;
  }

  function renderKpi() {
    const s = data.summary || {};
    const openingQty = 0; // "Đầu kỳ" — GĐ4 không lưu số dư đầu riêng, tính theo khoảng đã lọc.
    container.querySelector('#sk-kpi').innerHTML = `
      <div class="kpi-card"><div class="kpi-val">${openingQty}</div><div class="kpi-label">Đầu kỳ</div></div>
      <div class="kpi-card"><div class="kpi-val" style="color:var(--primary,#16a34a)">+${formatVND(s.cost_in || 0)}</div><div class="kpi-label">Nhập trong kỳ</div></div>
      <div class="kpi-card"><div class="kpi-val" style="color:#c00">−${s.qty_out ?? 0}</div><div class="kpi-label">Xuất trong kỳ</div></div>
      <div class="kpi-card"><div class="kpi-val">${formatVND((s.cost_in || 0))}</div><div class="kpi-label">Cuối kỳ</div></div>
    `;
  }

  function filteredMoves() {
    let moves = data.moves;
    if (state.classes.size) moves = moves.filter((m) => state.classes.has(classify(m)));
    if (state.q) moves = moves.filter((m) => (m.product_name || '').toLowerCase().includes(state.q));
    return moves;
  }

  function renderList() {
    const moves = filteredMoves();
    const tbody = container.querySelector('#sk-tbody');
    if (!moves.length) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:#999">Không có phiếu kho nào trong khoảng này.</td></tr>'; return; }

    tbody.innerHTML = moves.map((m) => `
      <tr class="${m.voided ? 'row-inactive' : ''}">
        <td>
          <div style="font-weight:500">${escapeHtml(m.code)}</div>
          <div style="font-size:12px;color:#888">${escapeHtml(m.occurred_date)}</div>
        </td>
        <td>
          <div>${escapeHtml(m.product_name)}${m.voided ? ' <span class="badge-warn" style="font-size:10px">Đã huỷ</span>' : ''}</div>
          ${m.created_by_name ? `<div style="font-size:12px;color:#888">${escapeHtml(m.created_by_name)}</div>` : ''}
        </td>
        ${visibleCols.has('phanloai') ? `<td style="font-size:13px">${escapeHtml(classify(m))}</td>` : ''}
        ${visibleCols.has('soluong') ? `<td style="color:${m.direction === 'nhap' ? 'var(--primary,#16a34a)' : '#c00'}">${m.direction === 'nhap' ? '+' : '−'}${m.qty}${m.product_unit ? ' ' + escapeHtml(m.product_unit) : ''}</td>` : ''}
        ${visibleCols.has('giatri') ? `<td>${formatVND(m.total_cost || Math.round(m.qty * m.unit_cost))}</td>` : ''}
        ${canManage ? `<td>${!m.voided && m.source !== 'count' ? `<button class="ord-kebab" data-void="${m.id}">⋯</button>` : ''}</td>` : ''}
      </tr>`).join('');

    tbody.querySelectorAll('[data-void]').forEach((btn) => {
      btn.addEventListener('click', () => voidMove(data.moves.find((m) => String(m.id) === btn.dataset.void)));
    });
  }

  async function voidMove(move) {
    if (!(await confirmDialog(`Huỷ phiếu ${move.code} (${move.product_name}, ${move.qty})?`))) return;
    const reason = await promptDialog('Lý do huỷ phiếu:', { value: 'Ghi nhầm' });
    if (reason === null) return;
    try {
      await api.post(`/api/mgr/stock/moves/${move.id}/void`, { reason });
      toast('Đã huỷ phiếu');
      await load();
    } catch (err) {
      toast(err?.body?.message || 'Không huỷ được phiếu', 'error');
    }
  }

  async function load() {
    const params = new URLSearchParams({ from: state.from, to: state.to, limit: '300' });
    if (state.direction) params.set('direction', state.direction);
    try {
      data = await api.get(`/api/mgr/stock/moves?${params}`);
      renderKpi();
      renderList();
    } catch (err) {
      container.querySelector('#sk-tbody').innerHTML = '<tr><td colspan="6">Không tải được sổ kho.</td></tr>';
    }
  }

  renderTableHead();
  await load();
}
