// T11 — Quản lý bàn (cập nhật 03/09/2026 — filterbar + toolbar + MỘT lưới phẳng xếp theo số bàn)
import { api, getApiBase } from '../api.js';
import { formatVND, escapeHtml, toast, openModal, openDrawer, zoneLabel, tableName, confirmDialog, promptDialog } from '../ui.js';
import { icon } from '../icons.js';
import { presetCartAndGo } from './sell.js';
import { openPaymentModal } from './payment-modal.js';
import { openTableOpsModal } from './table-ops-modal.js';
import { openYeuCauPanel } from '../yeu-cau-panel.js';
import { isKdsMuted, setKdsMuted } from './kitchen.js';

function seatedMinutes(seatedSince) {
  if (!seatedSince) return 0;
  return Math.max(0, Math.round((Date.now() - new Date(seatedSince).getTime()) / 60000));
}

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  const canManage = staff?.role === 'owner' || !!perms.manage_staff;
  let tables = [];
  let zones = [];
  let showBusy = true;
  let showFree = true;
  let zoneFilter = 'tat-ca';
  let searchQuery = '';
  let editMode = false;
  const selectedIds = new Set();

  // ── Khung chính ──────────────────────────────────────────────────────────────────────────────
  container.innerHTML = `
    <div class="tbl-filterbar">
      <div class="sell-chips tbl-zone-tabs" id="tbl-zone-chips"></div>
      <div class="tbl-filter-right">
        <label class="tbl-search">
          <span class="inline-ico">${icon('tim-kiem')}</span>
          <input id="tbl-search" type="search" placeholder="Tìm kiếm tên bàn" autocomplete="off" />
        </label>
        <div class="tables-status-tabs" id="tbl-status-tabs"></div>
      </div>
    </div>
    <div class="tables-top-actions">
      ${canManage ? `<button id="tbl-create" class="btn tbl-tool"><span class="tbl-plus">+</span> Tạo bàn</button>` : ''}
      ${canManage ? `<button id="tbl-zones" class="btn tbl-tool"><span class="inline-ico">${icon('cai-dat')}</span> Khu vực</button>` : ''}
      <button id="tbl-print-qr" class="btn tbl-tool"><span class="inline-ico">${icon('in')}</span> Tải QR bàn</button>
      ${canManage ? `<button id="tbl-edit-toggle" class="btn tbl-tool"><span class="inline-ico">${icon('chinh-sua')}</span> Chỉnh sửa</button>` : ''}
      <span class="tbl-tool-spacer"></span>
      <button id="tbl-mute" class="btn tbl-tool tbl-tool-ico" title="Tiếng chuông bếp"></button>
      <button id="tbl-req" class="btn tbl-tool" type="button" title="Yêu Cầu">
        <span class="inline-ico">${icon('chuong')}</span> Yêu cầu
      </button>
    </div>
    <div class="tbl-editbar hidden" id="tbl-editbar">
      <span class="tbl-editbar-text" id="tbl-editbar-text">Bấm vào bàn để chọn</span>
      <div class="tbl-editbar-actions">
        <button class="btn btn-danger tbl-editbar-btn" id="tbl-editbar-del">Xoá đã chọn</button>
        <button class="btn tbl-editbar-btn" id="tbl-editbar-done">Xong</button>
      </div>
    </div>
    <div class="tables-grid" id="tbl-grid"><p class="tbl-empty">Đang tải danh sách bàn…</p></div>
  `;

  // ── Event handlers ────────────────────────────────────────────────────────────────────────────
  if (canManage) {
    container.querySelector('#tbl-create').addEventListener('click', openCreateTableDrawer);
    container.querySelector('#tbl-zones').addEventListener('click', openZoneDrawer);
    container.querySelector('#tbl-edit-toggle').addEventListener('click', () => setEditMode(!editMode));
    container.querySelector('#tbl-editbar-done').addEventListener('click', () => setEditMode(false));
    container.querySelector('#tbl-editbar-del').addEventListener('click', deleteSelectedTables);
  }
  container.querySelector('#tbl-print-qr').addEventListener('click', openPrintQrModal);
  container.querySelector('#tbl-req').addEventListener('click', openYeuCauPanel);
  container.querySelector('#tbl-search').addEventListener('input', (e) => {
    searchQuery = e.target.value.trim().toLowerCase();
    renderGrid();
  });

  renderMuteBtn();
  container.querySelector('#tbl-mute').addEventListener('click', () => {
    setKdsMuted(!isKdsMuted());
    renderMuteBtn();
  });

  // ── Helpers ───────────────────────────────────────────────────────────────────────────────────
  function renderMuteBtn() {
    const btn = container.querySelector('#tbl-mute');
    if (!btn) return;
    const muted = isKdsMuted();
    btn.innerHTML = muted
      ? `${icon('tat-tieng')} Tắt tiếng`
      : `${icon('chuong')} Tiếng`;
    btn.title = muted ? 'Đang tắt tiếng — bấm để bật lại' : 'Đang bật tiếng — bấm để tắt';
  }

  function setEditMode(on) {
    editMode = on;
    const bar = container.querySelector('#tbl-editbar');
    const btn = container.querySelector('#tbl-edit-toggle');
    if (bar) bar.classList.toggle('hidden', !on);
    if (btn) btn.classList.toggle('active', on);
    if (!on) selectedIds.clear();
    renderGrid();
  }

  async function deleteSelectedTables() {
    if (!selectedIds.size) { toast('Chưa chọn bàn nào', 'error'); return; }
    const list = [...selectedIds].map((id) => {
      const t = tables.find((x) => x.id === id);
      return t ? tableName(t) : `#${id}`;
    });
    if (!(await confirmDialog(`Xoá ${list.join(', ')}? Thao tác này không thể hoàn tác.`, { danger: true }))) return;
    let ok = 0, fail = 0;
    for (const id of selectedIds) {
      try { await api.del(`/api/mgr/tables/manage/${id}`); ok++; }
      catch { fail++; }
    }
    if (ok) toast(`Đã xoá ${ok} bàn${fail ? `, ${fail} bàn lỗi` : ''}`);
    else toast('Không xoá được bàn nào', 'error');
    selectedIds.clear();
    setEditMode(false);
    await loadTables();
  }

  function counts() {
    return {
      'tat-ca': tables.length,
      'dang-dung': tables.filter((t) => t.status === 'dang-dung').length,
      'trong': tables.filter((t) => t.status === 'trong').length,
    };
  }

  // ── Render status checkboxes (thay tab-row) ───────────────────────────────────────────────────
  function renderStatusTabs() {
    const c = counts();
    const el = container.querySelector('#tbl-status-tabs');
    el.innerHTML = `
      <label class="tbl-statbox${showBusy ? ' active' : ''}">
        <input type="checkbox" data-stat="dang-dung"${showBusy ? ' checked' : ''} />
        Đang dùng <span class="tab-count">(${c['dang-dung']})</span>
      </label>
      <label class="tbl-statbox${showFree ? ' active' : ''}">
        <input type="checkbox" data-stat="trong"${showFree ? ' checked' : ''} />
        Còn trống <span class="tab-count">(${c['trong']})</span>
      </label>`;
    el.querySelectorAll('input[data-stat]').forEach((cb) => {
      cb.addEventListener('change', () => {
        if (cb.dataset.stat === 'dang-dung') showBusy = cb.checked;
        else showFree = cb.checked;
        el.querySelectorAll('.tbl-statbox').forEach((lbl) => {
          const inp = lbl.querySelector('input');
          lbl.classList.toggle('active', inp?.checked ?? false);
        });
        renderGrid();
      });
    });
  }

  // ── Zone chips ───────────────────────────────────────────────────────────────────────────────
  function renderZoneChips() {
    const names = zones.length
      ? zones.map((z) => z.zone)
      : [...new Set(tables.map((t) => t.zone).filter(Boolean))].sort();
    const el = container.querySelector('#tbl-zone-chips');
    el.innerHTML = [
      `<button class="chip ${zoneFilter === 'tat-ca' ? 'active' : ''}" data-zone="tat-ca">Tất cả</button>`,
      ...names.map((z) => `<button class="chip ${zoneFilter === z ? 'active' : ''}" data-zone="${escapeHtml(z)}">${escapeHtml(zoneLabel(z))}</button>`),
    ].join('');
    el.querySelectorAll('[data-zone]').forEach((b) => {
      b.addEventListener('click', () => { zoneFilter = b.dataset.zone; renderZoneChips(); renderGrid(); });
    });
  }

  // ── QR URL helpers ───────────────────────────────────────────────────────────────────────────
  function tableQrSrc(t) {
    if (!t.qr_token) return t.qr_url || '';
    return `${getApiBase()}/api/mgr/tables/qr/${encodeURIComponent(t.qr_token)}`;
  }
  function modeQrSrc(mode) {
    return `${getApiBase()}/api/mgr/tables/qr/mode/${mode}`;
  }

  // 2 ô dịch vụ — giữ nguyên cho backward compat với tests t89/t90
  function serviceCardHtml(id, mode, label) {
    return `
      <button class="table-card table-card-service" id="${id}" data-mode="${mode}">
        <span class="tc-service-ico">${icon(mode)}</span>
        <span class="tc-service-label">${label}</span>
        <span class="table-qr-btn" data-qr-mode="${mode}" data-qr-label="${label}"><span class="inline-ico">${icon('ma-qr')}</span> QR</span>
      </button>`;
  }

  // Khi xem "Tất cả" mà quán có nhiều khu vực thì ghi tên khu vực ngay trên ô bàn — trước đây
  // thông tin này nằm ở tiêu đề từng khối khu vực, nay lưới phẳng nên chuyển vào ô.
  function showZoneOnCard() {
    return zoneFilter === 'tat-ca'
      && new Set(tables.map((t) => t.zone).filter(Boolean)).size > 1;
  }

  // HTML của một ô bàn
  function tableCardHtml(t) {
    const busy = t.status === 'dang-dung';
    const selected = selectedIds.has(t.id);
    const zoneLine = showZoneOnCard() && t.zone
      ? `<div class="table-zone">${escapeHtml(zoneLabel(t.zone))}</div>`
      : '';
    return `
      <button class="table-card ${t.status}${editMode ? ' tc-editable' : ''}${selected ? ' tc-selected' : ''}"
        data-table="${t.table_no}" data-id="${t.id}">
        <div class="tc-top">
          <span class="tc-state">${escapeHtml(tableName(t))}</span>
          <!-- Việc "Website v2" (03/09/2026) — ảnh mẫu Website v2\\Bán hàng\\Quản lý bàn\\*: ngay
               sau tên bàn có chữ nghiêng xám "(Bàn trống)". Chỉ ghi cho bàn TRỐNG vì ảnh mẫu không
               có bàn nào đang dùng để biết chữ tương ứng. -->
          ${busy ? '' : '<span class="tc-state-note">(Bàn trống)</span>'}
          ${editMode
            ? `<span class="tc-edit-flag">${selected ? '&#9745;' : '&#9744;'}</span>`
            : `<span class="tc-kebab" data-kebab="${t.id}">${icon('them')}</span>`}
        </div>
        ${zoneLine}
        <div class="tc-body">
          ${busy
            ? `<div class="tc-money">${formatVND(t.open_total)}</div>
               <div class="tc-mins">${seatedMinutes(t.seated_since)} phút</div>`
            : `<div class="tc-empty-hint">Sẵn sàng đón khách</div>`}
        </div>
        <span class="table-qr-btn" data-qr="${escapeHtml(tableQrSrc(t))}" data-qr-label="${escapeHtml(tableName(t))}">
          <span class="inline-ico">${icon('ma-qr')}</span> QR
        </span>
      </button>`;
  }

  // ── Lưới bàn — MỘT lưới phẳng, xếp theo SỐ BÀN tăng dần ──────────────────────────────────────
  // Chủ quán 03/09/2026: "nếu ko chọn theo khu vực thì sẽ sắp xếp theo thứ tự" — Sổ Bán Hàng
  // KHÔNG gom bàn thành từng khối khu vực; chip khu vực chỉ để LỌC. Bản 02/09 gom khối làm
  // Bàn 1 nằm tận khối thứ hai (sau 8 bàn "Ngoài sân"), và vì đổi vùng chứa từ .tables-grid sang
  // .tz-group nên MỌI luật cỡ ô (kể cả bản máy tính và theme-v2) mất tác dụng → ô bàn dẹt và
  // 2 ô Mang về / Giao hàng rớt thành 2 dòng riêng.
  function renderGrid() {
    const el = container.querySelector('#tbl-grid');

    const filtered = tables.filter((t) => {
      if (t.status === 'dang-dung' && !showBusy) return false;
      if (t.status === 'trong' && !showFree) return false;
      if (zoneFilter !== 'tat-ca' && t.zone !== zoneFilter) return false;
      if (searchQuery) {
        // Tìm được cả theo TÊN RIÊNG lẫn theo số bàn: chủ quán gõ "vip" phải ra "Bàn VIP", mà gõ
        // "12" vẫn phải ra bàn số 12 kể cả khi bàn đó đã đổi tên thành "Phòng lạnh".
        const hay = `${tableName(t)} bàn ${t.table_no} ${t.table_no}`.toLowerCase();
        if (!hay.includes(searchQuery)) return false;
      }
      return true;
    });

    const showService = !searchQuery && (showBusy || showFree);
    const head = showService
      ? serviceCardHtml('tbl-mang-ve', 'mang-ve', 'Mang về') + serviceCardHtml('tbl-giao-hang', 'giao-hang', 'Giao hàng')
      : '';

    const tail = canManage && !editMode && !searchQuery
      ? `<button class="table-card table-card-add" id="tbl-quick-add">
           <span class="tc-add-plus">+</span><span class="tc-add-label">Thêm bàn mới</span>
         </button>`
      : '';

    // Xếp theo số bàn tăng dần: 1, 2, 3… 10, 11 (numeric:true để "Bàn 10" không đứng trước "Bàn 2").
    const ordered = [...filtered].sort((a, b) =>
      String(a.table_no).localeCompare(String(b.table_no), 'vi', { numeric: true }));
    const cardsHtml = ordered.map((t) => tableCardHtml(t)).join('');

    if (!head && !cardsHtml && !tail) {
      el.innerHTML = tables.length
        ? '<p class="tbl-empty">Không có bàn phù hợp với bộ lọc hiện tại.</p>'
        : '<p class="tbl-empty">Chưa có bàn nào. Bấm <b>Tạo bàn</b> để bắt đầu.</p>';
      return;
    }

    el.innerHTML = head + cardsHtml + tail;

    // Service card events
    for (const [id, mode] of [['#tbl-mang-ve', 'mang-ve'], ['#tbl-giao-hang', 'giao-hang']]) {
      const card = el.querySelector(id);
      if (!card) continue;
      card.addEventListener('click', (e) => {
        const qrBtn = e.target.closest('[data-qr-mode]');
        if (qrBtn) { showQr(modeQrSrc(qrBtn.dataset.qrMode), qrBtn.dataset.qrLabel); return; }
        presetCartAndGo({ deliveryType: mode });
      });
    }

    el.querySelector('#tbl-quick-add')?.addEventListener('click', openCreateTableDrawer);

    el.querySelectorAll('.table-card[data-table]').forEach((card) => {
      card.addEventListener('click', (e) => {
        const kebab = e.target.closest('[data-kebab]');
        if (kebab) { e.stopPropagation(); openTableMenu(kebab.dataset.kebab, kebab); return; }
        const qrBtn = e.target.closest('[data-qr]');
        if (qrBtn) { e.stopPropagation(); showQr(qrBtn.dataset.qr, qrBtn.dataset.qrLabel); return; }

        const id = Number(card.dataset.id);
        if (editMode) {
          if (selectedIds.has(id)) selectedIds.delete(id); else selectedIds.add(id);
          const count = selectedIds.size;
          const txt = container.querySelector('#tbl-editbar-text');
          if (txt) txt.textContent = count ? `Đã chọn ${count} bàn` : 'Bấm vào bàn để chọn';
          card.classList.toggle('tc-selected', selectedIds.has(id));
          const flag = card.querySelector('.tc-edit-flag');
          if (flag) flag.innerHTML = selectedIds.has(id) ? '&#9745;' : '&#9744;';
          return;
        }

        const t = tables.find((x) => String(x.table_no) === card.dataset.table);
        if (!t) return;
        if (t.status === 'trong') {
          presetCartAndGo({ deliveryType: 'tai-ban', tableNo: t.table_no });
        } else {
          openTableOrderModal(t);
        }
      });
    });
  }

  // ── 3-dot kebab menu ─────────────────────────────────────────────────────────────────────────
  function openTableMenu(tableId, anchor) {
    const t = tables.find((x) => x.id === Number(tableId));
    if (!t) return;
    document.querySelector('.tc-menu')?.remove();
    const menu = document.createElement('div');
    menu.className = 'tc-menu row-menu';
    menu.innerHTML = `
      <button data-action="edit">Đổi tên / số / khu vực</button>
      <button data-action="qr">Xem mã QR</button>
      <button data-action="del" class="danger">Xoá bàn</button>`;
    document.body.appendChild(menu);
    const rect = anchor.getBoundingClientRect();
    menu.style.top = `${rect.bottom + window.scrollY + 4}px`;
    menu.style.left = `${rect.left + window.scrollX}px`;
    const close = () => { menu.remove(); document.removeEventListener('click', close); };
    setTimeout(() => document.addEventListener('click', close), 0);
    menu.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      close();
      if (btn.dataset.action === 'qr') { showQr(tableQrSrc(t), tableName(t)); return; }
      if (btn.dataset.action === 'edit') { openTableDrawer(t); return; }
      if (btn.dataset.action === 'del') {
        if (!(await confirmDialog(`Xoá ${tableName(t)}? Thao tác này không thể hoàn tác.`, { danger: true }))) return;
        try {
          await api.del(`/api/mgr/tables/manage/${t.id}`);
          toast(`Đã xoá ${tableName(t)}`);
          await loadTables();
        } catch (err) {
          toast(err?.body?.error || 'Không xoá được bàn', 'error');
        }
      }
    });
  }

  // ── Drawer: Tạo bàn mới / Sửa bàn ────────────────────────────────────────────────────────────
  // Task 3 (03/09/2026) — chủ quán: "Tạo bàn mới phải xuất hiện cửa sổ để chọn giống SoBanHang
  // để có thể tùy chọn tên bàn hoặc khu vực". Trước đây ô "+ Thêm bàn mới" ở cuối lưới TẠO NGAY
  // một bàn (số kế tiếp + khu vực đoán theo chip đang lọc), không hỏi gì — đặt nhầm khu vực là
  // phải mở menu 3 chấm sửa lại. Nay CẢ nút "Tạo bàn" trên thanh công cụ LẪN ô "+ Thêm bàn mới"
  // đều mở cùng cửa sổ này: xem trước tên bàn, chọn khu vực có sẵn, hoặc tạo khu vực mới tại chỗ.
  //
  // Task 1 (03/09/2026, đợt sau) — thêm ô TÊN BÀN (migration 091). Cùng cửa sổ này dùng cho cả
  // "Tạo bàn mới" lẫn "Đổi tên / số / khu vực" ở menu 3 chấm: trước đây sửa bàn là 2 hộp thoại
  // promptDialog nối nhau (số bàn → khu vực), không sửa được tên và không thấy được kết quả trước
  // khi lưu. Một cửa sổ có đủ 3 ô thì chủ quán nhìn một lượt là xong.
  function openCreateTableDrawer() { openTableDrawer(null); }

  function openTableDrawer(editing) {
    const isEdit = !!editing;
    const nextNo = isEdit
      ? Number(editing.table_no)
      : tables.reduce((m, t) => Math.max(m, Number(t.table_no) || 0), 0) + 1;
    const curName = isEdit ? tableName(editing) : '';
    const zoneNames = zones.length ? zones.map((z) => z.zone) : ['Trong nhà'];
    const preferZone = isEdit
      ? (zoneNames.includes(editing.zone) ? editing.zone : (editing.zone || zoneNames[0]))
      : (zoneFilter !== 'tat-ca' && zoneNames.includes(zoneFilter) ? zoneFilter : zoneNames[0]);
    // Bàn đang ở một khu vực đã bị gỡ khỏi danh sách thì vẫn phải có dòng để chọn, không thì mở
    // cửa sổ Sửa là khu vực của bàn âm thầm nhảy sang khu khác khi bấm Lưu.
    const optionZones = zoneNames.includes(preferZone) ? zoneNames : [preferZone, ...zoneNames];
    const zoneOpts = optionZones
      .map((z) => `<option value="${escapeHtml(z)}"${z === preferZone ? ' selected' : ''}>${escapeHtml(zoneLabel(z))}</option>`)
      .join('') + '<option value="__new__">+ Thêm khu vực mới…</option>';

    const { overlay, close } = openDrawer({
      title: isEdit ? 'Sửa bàn' : 'Tạo bàn mới',
      bodyHTML: `
        <div class="ct-row">
          <label for="ct-name">Tên bàn</label>
          <input id="ct-name" type="text" class="field-input" maxlength="60"
            value="${escapeHtml(curName)}" placeholder="Bàn ${nextNo}" />
          <p class="ct-hint">Để trống thì lấy tên mặc định theo số bàn. Đặt tên riêng như
            <b>Bàn VIP</b>, <b>Phòng lạnh 1</b> cũng được.</p>
        </div>
        <div class="ct-row">
          <label for="ct-no">Số bàn <span class="req">*</span></label>
          <input id="ct-no" type="number" min="1" value="${nextNo}" class="field-input" />
          <p class="ct-hint">Tên hiển thị trên lưới bàn và trên mã QR: <b id="ct-preview">${escapeHtml(curName || `Bàn ${nextNo}`)}</b></p>
        </div>
        <div class="ct-row">
          <label for="ct-zone">Khu vực</label>
          <select id="ct-zone" class="field-input">${zoneOpts}</select>
          <input id="ct-zone-new" type="text" class="field-input ct-zone-new hidden"
            placeholder="Tên khu vực mới, ví dụ: Tầng 2" maxlength="40" />
        </div>
        <p class="ct-hint">${isEdit
          ? 'Đổi tên KHÔNG ảnh hưởng tới đơn hàng cũ: đơn vẫn gắn theo số bàn.'
          : 'Bàn tạo mới sẽ được cấp mã QR gọi món tự động.'}</p>`,
      footerHTML: `
        <button class="btn" id="ct-cancel">Huỷ</button>
        <button class="btn btn-primary" id="ct-save">${isEdit ? 'Lưu' : 'Tạo bàn'}</button>`,
    });

    const nameInput = overlay.querySelector('#ct-name');
    const noInput = overlay.querySelector('#ct-no');
    const zoneSel = overlay.querySelector('#ct-zone');
    const zoneNew = overlay.querySelector('#ct-zone-new');

    // Xem trước = tên đã gõ, hoặc "Bàn <số>" khi để trống — đúng cái sẽ hiện trên ô bàn và thẻ QR.
    function syncPreview() {
      const v = noInput.value.trim();
      const nm = nameInput.value.trim();
      nameInput.placeholder = v ? `Bàn ${v}` : 'Bàn';
      overlay.querySelector('#ct-preview').textContent = nm || (v ? `Bàn ${v}` : '—');
    }
    noInput.addEventListener('input', syncPreview);
    nameInput.addEventListener('input', syncPreview);
    zoneSel.addEventListener('change', () => {
      const isNew = zoneSel.value === '__new__';
      zoneNew.classList.toggle('hidden', !isNew);
      if (isNew) zoneNew.focus();
    });
    setTimeout(() => {
      const first = isEdit ? nameInput : noInput;
      first.focus(); first.select();
    }, 0);

    overlay.querySelector('#ct-cancel').addEventListener('click', close);
    overlay.querySelector('#ct-save').addEventListener('click', async () => {
      const no = parseInt(noInput.value, 10);
      if (!no || no < 1) { toast('Vui lòng nhập số bàn hợp lệ', 'error'); noInput.focus(); return; }
      // Chặn ngay ở giao diện: máy chủ trả 409 "Số bàn đã tồn tại" nhưng báo trước thì chủ quán
      // sửa được luôn mà không mất cửa sổ.
      if (tables.some((t) => Number(t.table_no) === no && t.id !== editing?.id)) {
        toast(`Bàn ${no} đã có rồi, hãy chọn số khác`, 'error'); noInput.focus(); return;
      }
      let zone = zoneSel.value;
      if (zone === '__new__') {
        zone = zoneNew.value.trim();
        if (!zone) { toast('Nhập tên khu vực mới', 'error'); zoneNew.focus(); return; }
      }
      zone = zone.trim() || 'Trong nhà';
      // '' = "bỏ tên riêng, quay về Bàn <số>" — máy chủ hiểu đúng như vậy (routes/tables.js).
      const name = nameInput.value.trim();
      try {
        if (isEdit) {
          await api.put(`/api/mgr/tables/manage/${editing.id}`, { table_no: no, zone, name });
          toast(`Đã cập nhật ${name || 'Bàn ' + no}`);
        } else {
          await api.post('/api/mgr/tables/manage', { table_no: no, zone, name });
          toast(`Đã tạo ${name || 'bàn ' + no} (${zoneLabel(zone)}) kèm mã QR gọi món`);
        }
        close();
        await loadTables();
      } catch (err) {
        toast(err?.body?.error || (isEdit ? 'Không cập nhật được bàn' : 'Không tạo được bàn'), 'error');
      }
    });
  }

  // ── Drawer: Quản lý khu vực ──────────────────────────────────────────────────────────────────
  // Task 4 (03/09/2026) — chủ quán: "nút quản lý khu vực cho thêm nút để di chuyển lên xuống các
  // tên khu vực nhanh hơn và thêm icon cho nút sửa và nút xóa khu vực giống trên SoBanHang".
  // Thứ tự khu vực trước đây do MÁY CHỦ xếp theo bảng chữ cái, nên chip lọc luôn hiện "Ngoài sân"
  // trước "Trong nhà" dù quán bán chủ yếu trong nhà, và không có cách nào đổi. Nay thứ tự do chủ
  // quán tự sắp, lưu ở máy chủ (PUT /api/mgr/tables/zones/order) và áp dụng cho MỌI nơi đọc danh
  // sách khu vực: chip lọc, ô chọn khu vực khi tạo bàn, và các khối khu vực ở cửa sổ in QR.
  function openZoneDrawer() {
    function zoneRowHtml({ zone: z, table_count: n }, i, last) {
      const name = escapeHtml(zoneLabel(z));
      return `
        <div class="zd-row" data-zone-row="${escapeHtml(z)}">
          <span class="zd-move">
            <button type="button" class="zd-move-btn" data-zone-action="up" data-zone="${escapeHtml(z)}"
              title="Đưa lên trên" aria-label="Đưa khu vực ${name} lên trên"${i === 0 ? ' disabled' : ''}>${icon('mui-ten-len')}</button>
            <button type="button" class="zd-move-btn" data-zone-action="down" data-zone="${escapeHtml(z)}"
              title="Đưa xuống dưới" aria-label="Đưa khu vực ${name} xuống dưới"${i === last ? ' disabled' : ''}>${icon('mui-ten-xuong')}</button>
          </span>
          <span class="zd-row-name">${name}</span>
          <span class="zd-row-count">${n} bàn</span>
          <button type="button" class="btn zd-row-btn" data-zone-action="rename" data-zone="${escapeHtml(z)}" title="Đổi tên khu vực">
            <span class="inline-ico">${icon('chinh-sua')}</span> Đổi tên
          </button>
          <button type="button" class="btn btn-danger zd-row-btn" data-zone-action="del" data-zone="${escapeHtml(z)}" title="Xoá khu vực">
            <span class="inline-ico">${icon('xoa')}</span> Xoá
          </button>
        </div>`;
    }

    function zonesListHtml() {
      if (!zones.length) return '<p class="ct-hint">Chưa có khu vực nào.</p>';
      const last = zones.length - 1;
      return zones.map((z, i) => zoneRowHtml(z, i, last)).join('');
    }

    const { overlay, close } = openDrawer({
      title: 'Quản lý khu vực',
      bodyHTML: `
        <button class="btn btn-primary zd-create" id="zd-add">+ Thêm khu vực</button>
        <p class="ct-hint zd-hint">Dùng mũi tên lên/xuống để đổi thứ tự khu vực — thứ tự này áp dụng
          cho thanh lọc ở màn Quản lý bàn và cho cửa sổ in mã QR.</p>
        <div class="zd-list" id="zd-list">${zonesListHtml()}</div>`,
    });

    function refreshList() {
      overlay.querySelector('#zd-list').innerHTML = zonesListHtml();
    }

    // Đổi chỗ NGAY trên màn (mượt tay, không chờ mạng) rồi mới lưu; lưu hỏng thì trả lại y như cũ
    // để chủ quán không tưởng đã lưu xong.
    async function moveZone(z, dir) {
      const i = zones.findIndex((x) => x.zone === z);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= zones.length) return;
      const before = zones.slice();
      const next = zones.slice();
      [next[i], next[j]] = [next[j], next[i]];
      zones = next;
      renderZoneChips();
      refreshList();
      try {
        await api.put('/api/mgr/tables/zones/order', { zones: zones.map((x) => x.zone) });
      } catch (err) {
        zones = before;
        renderZoneChips();
        refreshList();
        toast(err?.body?.error || 'Không lưu được thứ tự khu vực', 'error');
      }
    }

    overlay.querySelector('#zd-add').addEventListener('click', async () => {
      const name = await promptDialog('Tên khu vực mới:', { title: 'Thêm khu vực', placeholder: 'Ví dụ: Tầng 2', required: true });
      if (!name) return;
      try {
        await api.post('/api/mgr/tables/zones', { name: name.trim() });
        toast(`Đã tạo khu vực "${name.trim()}"`);
        await loadZones();
        renderZoneChips();
        refreshList();
      } catch (err) { toast(err?.body?.error || 'Không tạo được khu vực', 'error'); }
    });

    overlay.querySelector('#zd-list').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-zone-action]');
      if (!btn || btn.disabled) return;
      const z = btn.dataset.zone;
      const action = btn.dataset.zoneAction;

      if (action === 'up' || action === 'down') {
        await moveZone(z, action === 'up' ? -1 : 1);
        return;
      }
      if (action === 'rename') {
        const name = await promptDialog(`Đổi tên khu vực "${zoneLabel(z)}" thành:`, { value: zoneLabel(z), required: true });
        if (!name) return;
        try {
          const res = await api.put(`/api/mgr/tables/zones/${encodeURIComponent(z)}`, { name: name.trim() });
          toast(`Đã đổi tên khu vực cho ${res.updated} bàn`);
          await loadTables();
          renderZoneChips();
          refreshList();
        } catch (err) { toast(err?.body?.error || 'Không đổi được tên khu vực', 'error'); }
        return;
      }
      if (action === 'del') {
        if (!(await confirmDialog(`Xoá khu vực "${zoneLabel(z)}"?`, { danger: true }))) return;
        try {
          await api.del(`/api/mgr/tables/zones/${encodeURIComponent(z)}`);
          toast('Đã xoá khu vực');
          await loadTables();
          renderZoneChips();
          refreshList();
        } catch (err) { toast(err?.body?.error || 'Không xoá được khu vực', 'error'); }
      }
    });
  }

  // ── Modal hiển thị QR ────────────────────────────────────────────────────────────────────────
  function showQr(url, label) {
    const modal = openModal(`
      <h3>Mã QR ${escapeHtml(label)}</h3>
      <p class="qr-hint">Khách quét mã này là vào thẳng trang gọi món của ${escapeHtml(label)}.</p>
      <img id="qr-img" src="${escapeHtml(url)}" alt="Mã QR ${escapeHtml(label)}" class="qr-img" />
      <p id="qr-err" class="qr-err hidden">Không tải được ảnh mã QR. Kiểm tra máy chủ quán rồi thử lại.</p>
      <div class="modal-close-row"><button class="btn" data-action="close">Đóng</button></div>
    `);
    modal.overlay.querySelector('#qr-img').addEventListener('error', () => {
      modal.overlay.querySelector('#qr-img').classList.add('hidden');
      modal.overlay.querySelector('#qr-err').classList.remove('hidden');
    });
    modal.overlay.querySelector('[data-action="close"]').addEventListener('click', modal.close);
  }

  // ── Modal In mã QR bàn ───────────────────────────────────────────────────────────────────────
  // Task 2 (03/09/2026) — chủ quán: "Tải QR bàn cũng phải phân chia theo khu vực giống trên
  // SoBanHang để quản lý đúng khu vực". Bản cũ là MỘT lưới phẳng 18 ô, tên khu vực chỉ là dòng
  // chữ nhỏ dưới tên bàn → muốn in lại đúng một tầng phải dò tay từng ô và rất dễ tích sót.
  // Nay mỗi khu vực là một KHỐI riêng, có ô tích ở tiêu đề để chọn/bỏ cả khu vực một nhát, và
  // trang in cũng tách theo khu vực để cắt xong dán đúng chỗ.
  function qrPrintGroups() {
    const groups = [];
    const push = (zone, item) => {
      let g = groups.find((x) => x.zone === zone);
      if (!g) { g = { zone, items: [] }; groups.push(g); }
      g.items.push(item);
    };
    push('Hình thức bán', { key: 'mode:mang-ve', label: 'Mang về', zone: 'Hình thức bán', src: modeQrSrc('mang-ve') });
    push('Hình thức bán', { key: 'mode:giao-hang', label: 'Giao hàng', zone: 'Hình thức bán', src: modeQrSrc('giao-hang') });

    // Khu vực xếp theo đúng thứ tự chủ quán đã sắp ở "Khu vực" (Task 4); khu vực nào chỉ có trên
    // bàn mà chưa nằm trong danh sách thì xếp sau cùng theo bảng chữ cái.
    const byZone = new Map();
    for (const t of tables) {
      const z = t.zone || '';
      if (!byZone.has(z)) byZone.set(z, []);
      byZone.get(z).push(t);
    }
    const order = zones.map((z) => z.zone);
    const zoneNames = [
      ...order.filter((z) => byZone.has(z)),
      ...[...byZone.keys()].filter((z) => !order.includes(z)).sort((a, b) => String(a).localeCompare(String(b), 'vi')),
    ];
    for (const z of zoneNames) {
      const label = zoneLabel(z) || 'Chưa xếp khu vực';
      const list = [...byZone.get(z)].sort((a, b) =>
        String(a.table_no).localeCompare(String(b.table_no), 'vi', { numeric: true }));
      for (const t of list) {
        // Dòng chữ trên thẻ QR in ra = TÊN BÀN (migration 091). Chữ ở giữa ảnh QR vẫn là số bàn:
        // chỗ đó là ô trống giữa mã, nhét tên dài vào là mã không quét được.
        push(label, { key: `tbl:${t.table_no}`, label: tableName(t), zone: label, src: tableQrSrc(t) });
      }
    }
    return groups;
  }

  function openPrintQrModal() {
    const groups = qrPrintGroups();
    const all = groups.flatMap((g) => g.items);
    const selected = new Set(all.map((x) => x.key));

    const modal = openModal(`
      <h3>In mã QR bàn</h3>
      <p class="qr-hint">Chọn những mã cần in rồi bấm <b>In</b>. Mã được chia theo <b>khu vực</b> —
        tích ở tên khu vực là chọn/bỏ cả khu đó. Mỗi mã in ra một ô có sẵn tên bàn và tên khu vực,
        cắt rời dán lên bàn là khách quét gọi món được ngay.</p>
      <div class="qrp-tools">
        <button type="button" class="btn" id="qrp-all">Chọn tất cả</button>
        <button type="button" class="btn" id="qrp-none">Bỏ chọn hết</button>
        <span class="qrp-count" id="qrp-count"></span>
      </div>
      <div class="qrp-list" id="qrp-list"></div>
      <div class="modal-close-row">
        <button class="btn" data-action="close">Đóng</button>
        <button class="btn btn-primary" id="qrp-print"><span class="inline-ico">${icon('in')}</span> In mã đã chọn</button>
      </div>
    `);

    function renderPicker() {
      const list = modal.overlay.querySelector('#qrp-list');
      list.innerHTML = groups.map((g) => {
        const on = g.items.filter((x) => selected.has(x.key)).length;
        const full = on === g.items.length;
        return `
        <section class="qrp-group">
          <label class="qrp-group-head">
            <input type="checkbox" data-qrp-zone="${escapeHtml(g.zone)}"${full ? ' checked' : ''}${on && !full ? ' data-partial="1"' : ''} />
            <span class="qrp-group-name">${escapeHtml(g.zone)}</span>
            <span class="qrp-group-count">${on}/${g.items.length}</span>
          </label>
          <div class="qrp-group-items">
            ${g.items.map((x) => `
              <label class="qrp-item">
                <input type="checkbox" value="${escapeHtml(x.key)}"${selected.has(x.key) ? ' checked' : ''} />
                <span class="qrp-item-label">${escapeHtml(x.label)}</span>
              </label>`).join('')}
          </div>
        </section>`;
      }).join('') || '<p>Chưa có bàn nào để in.</p>';
      // Khu vực chọn một phần: ô tích ở tiêu đề để trạng thái "lửng" cho dễ nhìn.
      list.querySelectorAll('input[data-partial]').forEach((b) => { b.indeterminate = true; });
      modal.overlay.querySelector('#qrp-count').textContent = `Đã chọn ${selected.size}/${all.length} mã`;
      modal.overlay.querySelector('#qrp-print').disabled = selected.size === 0;
    }

    modal.overlay.querySelector('#qrp-list').addEventListener('change', (e) => {
      const box = e.target.closest('input[type="checkbox"]');
      if (!box) return;
      if (box.dataset.qrpZone != null) {
        const g = groups.find((x) => x.zone === box.dataset.qrpZone);
        if (g) g.items.forEach((x) => { if (box.checked) selected.add(x.key); else selected.delete(x.key); });
      } else if (box.checked) selected.add(box.value);
      else selected.delete(box.value);
      renderPicker();
    });
    modal.overlay.querySelector('#qrp-all').addEventListener('click', () => { all.forEach((x) => selected.add(x.key)); renderPicker(); });
    modal.overlay.querySelector('#qrp-none').addEventListener('click', () => { selected.clear(); renderPicker(); });
    modal.overlay.querySelector('[data-action="close"]').addEventListener('click', modal.close);
    modal.overlay.querySelector('#qrp-print').addEventListener('click', () => {
      printQrSheet(all.filter((x) => selected.has(x.key)));
    });

    renderPicker();
  }

  function printQrSheet(list) {
    if (!list.length) return;
    const win = window.open('', '_blank');
    if (!win) { toast('Trình duyệt đang chặn cửa sổ in. Hãy cho phép cửa sổ bật lên rồi thử lại.', 'error'); return; }

    // Trang in cũng tách theo khu vực (Task 2) — giữ nguyên thứ tự khu vực của cửa sổ chọn.
    const byZone = [];
    for (const x of list) {
      let g = byZone.find((b) => b.zone === (x.zone || ''));
      if (!g) { g = { zone: x.zone || '', items: [] }; byZone.push(g); }
      g.items.push(x);
    }
    const blocks = byZone.map((g) => `
      <h2>${escapeHtml(g.zone || 'Chưa xếp khu vực')} — ${g.items.length} mã</h2>
      <div class="g">${g.items.map((x) => `
        <div class="c">
          <img src="${escapeHtml(x.src)}" alt="Mã QR ${escapeHtml(x.label)}" />
          <div class="n">${escapeHtml(x.label)}</div>
          ${x.zone ? `<div class="z">${escapeHtml(x.zone)}</div>` : ''}
          <div class="h">Quét mã để gọi món</div>
        </div>`).join('')}</div>`).join('');

    win.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8">
      <title>Mã QR bàn — Cơm A Thúy</title>
      <style>
        @page { margin: 10mm; }
        body { font-family: Inter, Arial, sans-serif; margin: 0; }
        h1 { font-size: 16px; margin: 0 0 10px; }
        h2 { font-size: 13px; margin: 14px 0 6px; padding-bottom: 4px; border-bottom: 1px solid #ddd;
             break-after: avoid; page-break-after: avoid; }
        h2:first-of-type { margin-top: 0; }
        .g { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
        .c { border: 1px dashed #999; border-radius: 8px; padding: 10px; text-align: center; break-inside: avoid; }
        .c img { width: 100%; max-width: 190px; height: auto; display: block; margin: 0 auto; }
        .n { font-size: 16px; font-weight: 700; margin-top: 6px; }
        .z { font-size: 11px; color: #666; }
        .h { font-size: 11px; color: #666; margin-top: 2px; }
        @media print { h1 { display: none; } }
      </style></head><body>
      <h1>Mã QR gọi món — ${list.length} mã</h1>
      ${blocks}
      </body></html>`);
    win.document.close();
    const imgs = [...win.document.images];
    let left = imgs.length;
    const go = () => { win.focus(); win.print(); };
    if (!left) { go(); return; }
    const oneDone = () => { if (--left === 0) go(); };
    imgs.forEach((im) => {
      if (im.complete) oneDone();
      else { im.addEventListener('load', oneDone); im.addEventListener('error', oneDone); }
    });
  }

  // ── Load dữ liệu ────────────────────────────────────────────────────────────────────────────
  async function loadZones() {
    try {
      const res = await api.get('/api/mgr/tables/zones');
      zones = Array.isArray(res.zones) ? res.zones : [];
    } catch { /* giữ danh sách cũ */ }
  }

  async function loadTables() {
    try {
      const res = await api.get('/api/mgr/tables');
      tables = res.tables;
      await loadZones();
      renderStatusTabs();
      renderZoneChips();
      renderGrid();
    } catch (err) {
      if (err?.status !== 401) container.querySelector('#tbl-grid').innerHTML = '<p>Không tải được danh sách bàn.</p>';
    }
  }

  // ── Xem đơn đang mở của 1 bàn ───────────────────────────────────────────────────────────────
  function openTableOrderModal(table) {
    const modal = openModal(`
      <h3>${escapeHtml(tableName(table))} — đơn đang mở</h3>
      <div id="to-items"><p>Đang tải…</p></div>
      ${perms.table_ops || perms.split_bill ? `
      <div class="modal-close-row" style="flex-wrap:wrap">
        ${perms.table_ops ? '<button id="to-move">Chuyển bàn</button>' : ''}
        ${perms.table_ops ? '<button id="to-split-table">Tách bàn</button>' : ''}
        ${perms.table_ops ? '<button id="to-merge">Gộp bàn</button>' : ''}
        ${perms.split_bill ? '<button id="to-split-bill">Tách hoá đơn</button>' : ''}
      </div>` : ''}
      <div class="modal-close-row">
        <button id="to-add" class="btn">+ Thêm món</button>
        <button id="to-pay" class="btn btn-primary">Thanh toán</button>
      </div>
    `);
    let currentOrder = null;

    function renderItems() {
      const el = modal.overlay.querySelector('#to-items');
      if (!currentOrder) { el.innerHTML = '<p>Bàn này vừa được thanh toán/đóng — đóng màn này rồi thử lại.</p>'; return; }
      el.innerHTML = `
        <div class="cart-panel" style="margin-top:0">
          ${currentOrder.items.map((it) => `
            <div class="cart-item-top" style="border-bottom:1px solid #eee;padding:6px 0">
              <div>
                <div class="cart-item-name">${it.qty}× ${escapeHtml(it.name)}</div>
                ${it.note ? `<div class="cart-item-size">${escapeHtml(it.note)}</div>` : ''}
              </div>
              <span>${formatVND(it.qty * it.price)}</span>
            </div>
          `).join('')}
          <div class="cart-total-row"><span>Tổng</span><span>${formatVND(currentOrder.total)}</span></div>
        </div>
      `;
    }

    async function refresh() {
      const res = await api.get(`/api/mgr/tables/${table.table_no}/order`);
      currentOrder = res.order;
      renderItems();
    }

    modal.overlay.querySelector('#to-add').addEventListener('click', () => {
      if (!currentOrder) { toast('Bàn không còn đơn đang mở', 'error'); return; }
      openAddItemModal(currentOrder.order_code, refresh);
    });
    for (const [id, op] of [
      ['#to-move', 'move'], ['#to-split-table', 'split-table'],
      ['#to-merge', 'merge-table'], ['#to-split-bill', 'split-bill'],
    ]) {
      const btn = modal.overlay.querySelector(id);
      if (!btn) continue;
      btn.addEventListener('click', () => {
        if (!currentOrder) { toast('Bàn không còn đơn đang mở', 'error'); return; }
        modal.close();
        openTableOpsModal(currentOrder, table.table_no, op, { onDone: loadTables });
      });
    }
    modal.overlay.querySelector('#to-pay').addEventListener('click', () => {
      if (!currentOrder) { toast('Bàn không còn đơn đang mở', 'error'); return; }
      modal.close();
      openPaymentModal(currentOrder, { packaging_fee: 0, ship_fee: 0, ship_pending: false }, { onDone: loadTables });
    });
    refresh();
  }

  // ── Thêm món vào đơn đang mở ─────────────────────────────────────────────────────────────────
  async function openAddItemModal(orderCode, onAdded) {
    const modal = openModal(`
      <h3>Thêm món</h3>
      <div class="sell-chips" id="ai-chips"></div>
      <div class="sell-grid" id="ai-grid"><p>Đang tải thực đơn…</p></div>
      <div class="modal-close-row"><button data-action="done">Xong</button></div>
    `);
    modal.overlay.addEventListener('click', (e) => {
      if (e.target.dataset.action === 'done') { modal.close(); onAdded(); }
    });

    let menuData = { items: [], categories: [] };
    let activeCategory = 'Tất cả';

    function renderGridInner() {
      const el = modal.overlay.querySelector('#ai-grid');
      const filtered = menuData.items.filter((it) => activeCategory === 'Tất cả' || (it.category || 'Khác') === activeCategory);
      el.innerHTML = filtered.map((it) => `
        <button class="item-card ${it.availability === 'unavailable' ? 'unavailable' : ''}" data-id="${escapeHtml(it.id)}">
          <div class="thumb">${it.image_path ? `<img src="${escapeHtml(it.image_path)}" alt="" style="width:100%;height:100%;object-fit:cover" />` : `<span class="thumb-ico">${icon('mon-an')}</span>`}</div>
          <div class="info"><div class="name">${escapeHtml(it.name)}</div><div class="price">${formatVND(it.price)}</div></div>
        </button>
      `).join('');
      el.querySelectorAll('.item-card').forEach((card) => {
        card.addEventListener('click', async () => {
          const item = menuData.items.find((it) => it.id === card.dataset.id);
          if (item.availability === 'unavailable') { toast('Món này tạm hết hàng', 'error'); return; }
          try {
            await api.patch(`/api/mgr/orders/${orderCode}/items`, { items: [{ id: item.id, qty: 1 }] });
            toast(`Đã thêm ${item.name}`);
            onAdded();
          } catch (err) {
            toast(err?.body?.message || 'Không thêm được món', 'error');
          }
        });
      });
    }

    function renderChipsInner() {
      const cats = ['Tất cả', ...menuData.categories.map((c) => c.category)];
      const el = modal.overlay.querySelector('#ai-chips');
      el.innerHTML = cats.map((c) => `<button class="chip ${c === activeCategory ? 'active' : ''}" data-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join('');
      el.querySelectorAll('.chip').forEach((chip) => {
        chip.addEventListener('click', () => { activeCategory = chip.dataset.cat; renderChipsInner(); renderGridInner(); });
      });
    }

    try {
      menuData = await api.get('/api/mgr/menu');
      renderChipsInner();
      renderGridInner();
    } catch {
      modal.overlay.querySelector('#ai-grid').innerHTML = '<p>Không tải được thực đơn.</p>';
    }
  }

  // ── Modal quản lý bàn tổng hợp (giữ lại cho backward compat với tests) ───────────────────────
  function openManageTablesModal() {
    function renderList(overlay) {
      const listEl = overlay.querySelector('#mgr-list');
      if (!listEl) return;
      if (!tables.length) {
        listEl.innerHTML = '<tr><td colspan="4" class="mgr-empty">Chưa có bàn nào.</td></tr>';
        return;
      }
      listEl.innerHTML = tables.map((t) => `
        <tr class="mgr-row" data-id="${t.id}">
          <td><b>${escapeHtml(tableName(t))}</b></td>
          <td>${escapeHtml(zoneLabel(t.zone) || '')}</td>
          <td>${t.status === 'dang-dung'
            ? '<span class="mgr-badge busy">Đang dùng</span>'
            : '<span class="mgr-badge free">Còn trống</span>'}</td>
          <td class="mgr-act">
            <button class="btn mgr-btn-sm" data-action="edit" data-id="${t.id}">Sửa</button>
            <button class="btn btn-danger mgr-btn-sm" data-action="del" data-id="${t.id}">Xoá</button>
          </td>
        </tr>
      `).join('');
    }

    const { overlay, close } = openModal(`
      <h3>Quản lý bàn</h3>
      <div class="mgr-tablewrap">
        <table class="mgr-table">
          <thead><tr><th>Tên bàn</th><th>Khu vực</th><th>Trạng thái</th><th class="mgr-act">Chỉnh sửa</th></tr></thead>
          <tbody id="mgr-list"></tbody>
        </table>
      </div>
      <hr style="margin:12px 0;border-color:#eee">
      <h4 style="margin:0 0 8px">Thêm bàn mới</h4>
      <p class="mgr-hint">Bàn tạo mới được cấp mã QR gọi món tự động.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <div class="field" style="flex:1;min-width:90px">
          <label>Số bàn</label>
          <input id="mgr-no" type="number" min="1" placeholder="Ví dụ: 5" />
        </div>
        <div class="field" style="flex:2;min-width:130px">
          <label>Khu vực</label>
          <select id="mgr-zone"></select>
        </div>
      </div>
      <div class="mgr-add-row">
        <button class="btn btn-primary mgr-add-btn" id="mgr-add">+ Thêm bàn</button>
      </div>
      <hr style="margin:14px 0;border-color:#eee">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 8px">
        <h4 style="margin:0">Khu vực</h4>
        <button class="btn btn-primary mgr-add-btn" id="mgr-zone-add">+ Thêm khu vực</button>
      </div>
      <p class="mgr-hint">Tạo khu vực trước, sau đó chọn khu vực đó khi thêm bàn.</p>
      <div class="mgr-tablewrap">
        <table class="mgr-table">
          <thead><tr><th>Khu vực</th><th>Số lượng bàn</th><th class="mgr-act">Chỉnh sửa</th></tr></thead>
          <tbody id="mgr-zones"></tbody>
        </table>
      </div>
      <div class="modal-close-row">
        <button class="btn" id="mgr-cancel">Đóng</button>
      </div>
    `);

    function renderZones(ov) {
      const el = ov.querySelector('#mgr-zones');
      if (!el) return;
      if (!zones.length) { el.innerHTML = '<tr><td colspan="3" class="mgr-empty">Chưa có khu vực nào.</td></tr>'; return; }
      el.innerHTML = zones.map(({ zone: z, table_count: n }) => `
        <tr class="mgr-row" data-zone="${escapeHtml(z)}">
          <td><b>${escapeHtml(zoneLabel(z))}</b></td>
          <td>${n} bàn</td>
          <td class="mgr-act">
            <button class="btn mgr-btn-sm" data-zone-action="rename" data-zone="${escapeHtml(z)}">Đổi tên</button>
            <button class="btn btn-danger mgr-btn-sm" data-zone-action="del" data-zone="${escapeHtml(z)}">Xoá</button>
          </td>
        </tr>
      `).join('');
    }

    function renderZoneSelect(ov) {
      const sel = ov.querySelector('#mgr-zone');
      if (!sel) return;
      const keep = sel.value;
      const names = zones.length ? zones.map((z) => z.zone) : ['Trong nhà'];
      sel.innerHTML = names.map((z) => `<option value="${escapeHtml(z)}">${escapeHtml(zoneLabel(z))}</option>`).join('');
      if (keep && names.includes(keep)) sel.value = keep;
    }

    async function refreshZoneUI() {
      await loadZones();
      renderZones(overlay);
      renderZoneSelect(overlay);
      renderZoneChips();
    }

    overlay.querySelector('#mgr-zone-add').addEventListener('click', async () => {
      const name = await promptDialog('Tên khu vực mới:', { title: 'Thêm khu vực', placeholder: 'Ví dụ: Tầng 2', required: true });
      if (!name) return;
      try {
        await api.post('/api/mgr/tables/zones', { name: name.trim() });
        toast(`Đã tạo khu vực "${name.trim()}"`);
        await refreshZoneUI();
        overlay.querySelector('#mgr-zone').value = name.trim();
      } catch (err) { toast(err?.body?.error || 'Không tạo được khu vực', 'error'); }
    });

    overlay.querySelector('#mgr-zones').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-zone-action]');
      if (!btn) return;
      const zone = btn.dataset.zone;
      if (btn.dataset.zoneAction === 'rename') {
        const name = await promptDialog(`Đổi tên khu vực "${zoneLabel(zone)}" thành:`, { value: zoneLabel(zone), required: true });
        if (!name) return;
        try {
          const res = await api.put(`/api/mgr/tables/zones/${encodeURIComponent(zone)}`, { name: name.trim() });
          toast(`Đã đổi tên khu vực cho ${res.updated} bàn`);
          await loadTables();
          renderList(overlay);
          renderZones(overlay);
          renderZoneSelect(overlay);
        } catch (err) { toast(err?.body?.error || 'Không đổi được tên khu vực', 'error'); }
        return;
      }
      if (btn.dataset.zoneAction === 'del') {
        if (!(await confirmDialog(`Xoá khu vực "${zoneLabel(zone)}"?`, { danger: true }))) return;
        try {
          await api.del(`/api/mgr/tables/zones/${encodeURIComponent(zone)}`);
          toast('Đã xoá khu vực');
          await loadTables();
          renderList(overlay);
          renderZones(overlay);
          renderZoneSelect(overlay);
        } catch (err) { toast(err?.body?.error || 'Không xoá được khu vực', 'error'); }
      }
    });

    renderList(overlay);
    renderZones(overlay);
    renderZoneSelect(overlay);

    overlay.querySelector('#mgr-cancel').addEventListener('click', close);

    overlay.querySelector('#mgr-add').addEventListener('click', async () => {
      const no = parseInt(overlay.querySelector('#mgr-no').value, 10);
      const zone = overlay.querySelector('#mgr-zone').value.trim() || 'Trong nhà';
      if (!no || no < 1) { toast('Vui lòng nhập số bàn hợp lệ', 'error'); return; }
      try {
        await api.post('/api/mgr/tables/manage', { table_no: no, zone });
        toast(`Đã tạo bàn ${no}`);
        overlay.querySelector('#mgr-no').value = '';
        await loadTables();
        renderList(overlay);
        renderZones(overlay);
        renderZoneSelect(overlay);
      } catch (err) { toast(err?.body?.error || 'Không tạo được bàn', 'error'); }
    });

    overlay.querySelector('#mgr-list').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const id = Number(btn.dataset.id);
      const tbl = tables.find((t) => t.id === id);
      if (!tbl) return;
      if (btn.dataset.action === 'del') {
        if (!(await confirmDialog(`Xoá ${tableName(tbl)}? Thao tác này không thể hoàn tác.`, { danger: true }))) return;
        try {
          await api.del(`/api/mgr/tables/manage/${id}`);
          toast(`Đã xoá ${tableName(tbl)}`);
          await loadTables();
          renderList(overlay);
        } catch (err) { toast(err?.body?.error || 'Không xoá được bàn', 'error'); }
        return;
      }
      if (btn.dataset.action === 'edit') {
        const newName = await promptDialog(`Tên của ${tableName(tbl)}:`, {
          value: tableName(tbl), hint: 'Để trống thì lấy tên mặc định theo số bàn.',
        });
        if (newName === null) return;
        const newNo = await promptDialog(`Đổi số bàn ${tbl.table_no} thành:`, { value: String(tbl.table_no), required: true, type: 'number' });
        if (!newNo) return;
        const newZone = await promptDialog(`Khu vực của bàn ${tbl.table_no}:`, {
          value: zoneLabel(tbl.zone) || 'Trong nhà',
          hint: zones.length ? 'Khu vực đang có: ' + zones.map((z) => zoneLabel(z.zone)).join(' · ') : '',
        });
        if (newZone === null) return;
        const no = parseInt(newNo, 10);
        if (!no || no < 1) { toast('Số bàn không hợp lệ', 'error'); return; }
        try {
          await api.put(`/api/mgr/tables/manage/${id}`, { table_no: no, zone: newZone.trim() || 'Trong nhà', name: newName.trim() });
          toast(`Đã cập nhật ${newName.trim() || 'bàn ' + no}`);
          await loadTables();
          renderList(overlay);
        } catch (err) { toast(err?.body?.error || 'Không cập nhật được bàn', 'error'); }
      }
    });
  }

  await loadTables();
}
