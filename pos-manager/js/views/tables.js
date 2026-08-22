// T11 — Quản lý bàn.
import { api, getApiBase } from '../api.js';
import { formatVND, escapeHtml, toast, openModal, zoneLabel, confirmDialog, promptDialog } from '../ui.js';
import { icon } from '../icons.js';
import { presetCartAndGo } from './sell.js';
import { openPaymentModal } from './payment-modal.js';
// GĐ8 mục G — Chuyển bàn / Tách bàn / Gộp bàn / Tách hoá đơn
import { openTableOpsModal } from './table-ops-modal.js';
import { openYeuCauPanel } from '../yeu-cau-panel.js';

function seatedMinutes(seatedSince) {
  if (!seatedSince) return 0;
  return Math.max(0, Math.round((Date.now() - new Date(seatedSince).getTime()) / 60000));
}

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  const canManage = staff?.role === 'owner' || !!perms.manage_staff;
  let tables = [];
  // Task 2 (09/08/2026) — khu vực nay là danh sách CÓ THẬT lấy từ máy chủ, không còn suy ra từ
  // danh sách bàn nữa: khu vực vừa tạo mà chưa xếp bàn nào vào vẫn phải hiện ra, nếu không chủ
  // quán bấm "Thêm khu vực" xong chẳng thấy gì và tưởng là hỏng.
  let zones = [];              // [{ zone, table_count }]
  let statusFilter = 'tat-ca'; // tat-ca | dang-dung | trong
  let zoneFilter = 'tat-ca';   // 'tat-ca' hoặc tên khu vực thật (ví dụ 'Trong nhà')

  // Task 2 (09/08/2026 đợt 5) — "Mang về" và "Giao hàng" KHÔNG còn là 2 nút nhỏ trên đầu màn:
  // chủ quán xin chúng to bằng ô bàn, có mã QR riêng, và đứng NGAY TRƯỚC Bàn 1 (đúng bố cục
  // app.sobanhang.com/mission-control). Chúng được vẽ ngay trong lưới bàn ở renderGrid().
  container.innerHTML = `
    <div class="page-head"><h2>Quản lý bàn</h2></div>
    <div class="tables-top-actions">
      ${canManage ? `<button id="tbl-manage" class="btn"><span class="inline-ico">${icon('cai-dat')}</span> Quản lý bàn</button>` : ''}
      <!-- Task 1 (10/08/2026) — chủ quán xin nút in mã QR: in nhanh TẤT CẢ, hoặc tích chọn đúng
           mấy bàn cần in lại (QR dán bàn bị rách/mờ thì in bù từng cái, không phải in lại cả quán). -->
      <button id="tbl-print-qr" class="btn"><span class="inline-ico">${icon('in')}</span> In mã QR bàn</button>
      <!-- Task 4 (13/08/2026) — màn Quản lý bàn chưa từng có nút "Yêu cầu" (chuông) như màn Bán
           hàng; thêm vào đây, dùng chung panel với sell.js (js/yeu-cau-panel.js). -->
      <button id="tbl-req" class="btn" type="button" title="Yêu Cầu" aria-label="Yêu Cầu"><span class="inline-ico">${icon('chuong')}</span> Yêu cầu</button>
    </div>
    <div class="tab-row tables-status-tabs" id="tbl-status-tabs"></div>
    <div class="sell-chips" id="tbl-zone-chips"></div>
    <div class="tables-grid" id="tbl-grid"><p>Đang tải danh sách bàn…</p></div>
  `;

  if (canManage) {
    container.querySelector('#tbl-manage').addEventListener('click', () => openManageTablesModal());
  }
  container.querySelector('#tbl-print-qr').addEventListener('click', () => openPrintQrModal());
  container.querySelector('#tbl-req').addEventListener('click', () => openYeuCauPanel());

  function counts() {
    return {
      'tat-ca': tables.length,
      'dang-dung': tables.filter((t) => t.status === 'dang-dung').length,
      'trong': tables.filter((t) => t.status === 'trong').length,
    };
  }

  function renderStatusTabs() {
    const c = counts();
    const tabs = [
      ['tat-ca', 'Tất cả'],
      ['dang-dung', 'Đang dùng'],
      ['trong', 'Còn trống'],
    ];
    const el = container.querySelector('#tbl-status-tabs');
    el.innerHTML = tabs.map(([key, label]) =>
      `<button class="tab ${key === statusFilter ? 'active' : ''}" data-status="${key}">${label} <span class="tab-count">(${c[key]})</span></button>`
    ).join('');
    el.querySelectorAll('[data-status]').forEach((b) => {
      b.addEventListener('click', () => { statusFilter = b.dataset.status; renderStatusTabs(); renderGrid(); });
    });
  }

  function renderZoneChips() {
    // Khu vực lấy từ máy chủ (đã gộp khu vực có bàn + khu vực rỗng mới tạo); nếu chưa tải kịp
    // thì tạm suy ra từ danh sách bàn để màn hình không trống trơn.
    const names = zones.length
      ? zones.map((z) => z.zone)
      : [...new Set(tables.map((t) => t.zone).filter(Boolean))].sort();
    const el = container.querySelector('#tbl-zone-chips');
    el.innerHTML = [
      `<button class="chip ${zoneFilter === 'tat-ca' ? 'active' : ''}" data-zone="tat-ca">Tất cả</button>`,
      // data-zone giữ NGUYÊN giá trị lưu trong CSDL để lọc đúng, chỉ phần chữ hiện ra là tên có dấu.
      ...names.map((z) => `<button class="chip ${zoneFilter === z ? 'active' : ''}" data-zone="${escapeHtml(z)}">${escapeHtml(zoneLabel(z))}</button>`),
    ].join('');
    el.querySelectorAll('[data-zone]').forEach((b) => {
      b.addEventListener('click', () => { zoneFilter = b.dataset.zone; renderZoneChips(); renderGrid(); });
    });
  }

  // Link ảnh QR dựng từ ĐỊA CHỈ API HIỆN HÀNH (api.js tự làm mới từ api-url.json), không dùng
  // trường qr_url của máy chủ nữa: qr_url ghim cứng POS_PUBLIC_URL đọc lúc khởi động — địa chỉ
  // tunnel đó đổi tên là mọi ảnh QR chết, đúng lỗi "ấn vào mã QR không có ảnh".
  function tableQrSrc(t) {
    if (!t.qr_token) return t.qr_url || '';
    return `${getApiBase()}/api/mgr/tables/qr/${encodeURIComponent(t.qr_token)}`;
  }
  function modeQrSrc(mode) {
    return `${getApiBase()}/api/mgr/tables/qr/mode/${mode}`;
  }

  // 2 ô dịch vụ (Mang về / Giao hàng) — cùng khuôn .table-card nên TO BẰNG ô bàn, mỗi ô có nút QR
  // riêng trỏ vào đúng trang đặt món của hình thức đó.
  function serviceCardHtml(id, mode, label) {
    return `
      <button class="table-card table-card-service" id="${id}" data-mode="${mode}">
        <span class="tc-service-ico">${icon(mode)}</span>
        <span class="tc-service-label">${label}</span>
        <span class="table-qr-btn" data-qr-mode="${mode}" data-qr-label="${label}"><span class="inline-ico">${icon('ma-qr')}</span> QR</span>
      </button>`;
  }

  function renderGrid() {
    const el = container.querySelector('#tbl-grid');
    const filtered = tables.filter((t) =>
      (statusFilter === 'tat-ca' || t.status === statusFilter) &&
      (zoneFilter === 'tat-ca' || t.zone === zoneFilter)
    );
    // 2 ô dịch vụ chỉ hiện ở tab "Tất cả": chúng không phải cái bàn nên không có trạng thái
    // đang dùng / còn trống, để lọt vào 2 tab kia là đếm sai và gây hiểu nhầm.
    const showService = statusFilter === 'tat-ca';
    const head = showService
      ? serviceCardHtml('tbl-mang-ve', 'mang-ve', 'Mang về') + serviceCardHtml('tbl-giao-hang', 'giao-hang', 'Giao hàng')
      : '';
    // Ô cuối cùng "+ Thêm bàn mới" — bấm là tạo ngay bàn kế tiếp (giống app Sổ Bán Hàng), không
    // phải mở hộp thoại Quản lý bàn rồi gõ số.
    const tail = canManage
      ? `<button class="table-card table-card-add" id="tbl-quick-add">
           <span class="tc-add-plus">+</span><span class="tc-add-label">Thêm bàn mới</span>
         </button>`
      : '';

    if (!filtered.length && !head && !tail) {
      el.innerHTML = tables.length
        ? '<p>Không có bàn phù hợp.</p>'
        : '<p style="text-align:center;color:#888;padding:20px">Chưa có bàn nào. Bấm <b>Quản lý bàn</b> để tạo bàn mới.</p>';
      return;
    }

    el.innerHTML = head + filtered.map((t) => `
      <button class="table-card ${t.status}" data-table="${t.table_no}">
        <div class="table-no">Bàn ${t.table_no}</div>
        <div class="table-zone">${escapeHtml(zoneLabel(t.zone))}</div>
        <div class="table-status-badge">${t.status === 'dang-dung' ? 'Đang dùng' : 'Còn trống'}</div>
        ${t.status === 'dang-dung' ? `
          <div class="table-total">${formatVND(t.open_total)}</div>
          <div class="table-seated">${seatedMinutes(t.seated_since)} phút</div>
        ` : ''}
        <span class="table-qr-btn" data-qr="${escapeHtml(tableQrSrc(t))}" data-qr-label="Bàn ${t.table_no}"><span class="inline-ico">${icon('ma-qr')}</span> QR</span>
      </button>
    `).join('') + tail;

    const mangVe = el.querySelector('#tbl-mang-ve');
    const giaoHang = el.querySelector('#tbl-giao-hang');
    for (const [card, mode] of [[mangVe, 'mang-ve'], [giaoHang, 'giao-hang']]) {
      if (!card) continue;
      card.addEventListener('click', (e) => {
        const qrBtn = e.target.closest('[data-qr-mode]');
        if (qrBtn) { showQr(modeQrSrc(qrBtn.dataset.qrMode), qrBtn.dataset.qrLabel); return; }
        presetCartAndGo({ deliveryType: mode });
      });
    }

    const addCard = el.querySelector('#tbl-quick-add');
    if (addCard) addCard.addEventListener('click', quickAddTable);

    el.querySelectorAll('.table-card[data-table]').forEach((card) => {
      card.addEventListener('click', (e) => {
        const qrBtn = e.target.closest('[data-qr]');
        if (qrBtn) { showQr(qrBtn.dataset.qr, qrBtn.dataset.qrLabel); return; }
        const t = filtered.find((x) => String(x.table_no) === card.dataset.table);
        if (t.status === 'trong') {
          presetCartAndGo({ deliveryType: 'tai-ban', tableNo: t.table_no });
        } else {
          openTableOrderModal(t);
        }
      });
    });
  }

  // Tạo bàn NHANH: tự lấy số bàn kế tiếp (max + 1) và khu vực đang lọc; không hỏi gì thêm.
  // Trùng số (ai đó vừa tạo ở máy khác) thì máy chủ trả 409 và ta báo lại bằng lời người thường.
  async function quickAddTable() {
    const nextNo = tables.reduce((m, t) => Math.max(m, Number(t.table_no) || 0), 0) + 1;
    const zone = zoneFilter !== 'tat-ca' ? zoneFilter : (zones[0]?.zone || 'Trong nhà');
    try {
      await api.post('/api/mgr/tables/manage', { table_no: nextNo, zone });
      toast(`Đã tạo bàn ${nextNo} (${zoneLabel(zone)}) kèm mã QR gọi món`);
      await loadTables();
    } catch (err) {
      toast(err?.body?.error || 'Không tạo được bàn', 'error');
    }
  }

  // Ảnh QR có thể vẽ lỗi / mất mạng — phải báo bằng chữ chứ không để ô ảnh vỡ trơ ra như trước.
  function showQr(url, label) {
    const modal = openModal(`
      <h3>Mã QR ${escapeHtml(label)}</h3>
      <p class="qr-hint">Khách quét mã này là vào thẳng trang gọi món (POS web order) của ${escapeHtml(label)}.</p>
      <img id="qr-img" src="${escapeHtml(url)}" alt="Mã QR ${escapeHtml(label)}" class="qr-img" />
      <p id="qr-err" class="qr-err hidden">Không tải được ảnh mã QR. Kiểm tra máy chủ quán rồi thử lại.</p>
      <div class="modal-close-row"><button class="btn" data-action="close">Đóng</button></div>
    `);
    const img = modal.overlay.querySelector('#qr-img');
    img.addEventListener('error', () => {
      img.classList.add('hidden');
      modal.overlay.querySelector('#qr-err').classList.remove('hidden');
    });
    modal.overlay.querySelector('[data-action="close"]').addEventListener('click', modal.close);
  }

  // ── Task 1 (10/08/2026) — IN MÃ QR BÀN ──────────────────────────────────────────────────────
  // Hộp thoại tích chọn: mặc định tích SẴN tất cả (việc hay làm nhất là in cả quán lúc mới khai
  // trương), bỏ tích những bàn không cần khi chỉ in bù vài cái.
  function openPrintQrModal() {
    const targets = () => [
      { key: 'mode:mang-ve', label: 'Mang về', zone: 'Hình thức bán', src: modeQrSrc('mang-ve') },
      { key: 'mode:giao-hang', label: 'Giao hàng', zone: 'Hình thức bán', src: modeQrSrc('giao-hang') },
      ...tables.map((t) => ({
        key: `tbl:${t.table_no}`,
        label: `Bàn ${t.table_no}`,
        zone: zoneLabel(t.zone) || '',
        src: tableQrSrc(t),
      })),
    ];
    const all = targets();
    const selected = new Set(all.map((x) => x.key));

    const modal = openModal(`
      <h3>In mã QR bàn</h3>
      <p class="qr-hint">Chọn những mã cần in rồi bấm <b>In</b>. Mỗi mã in ra một ô có sẵn tên bàn,
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
      modal.overlay.querySelector('#qrp-list').innerHTML = all.map((x) => `
        <label class="qrp-item">
          <input type="checkbox" value="${escapeHtml(x.key)}" ${selected.has(x.key) ? 'checked' : ''} />
          <span>
            <span class="qrp-item-label">${escapeHtml(x.label)}</span>
            ${x.zone ? `<span class="qrp-item-zone"><br>${escapeHtml(x.zone)}</span>` : ''}
          </span>
        </label>`).join('') || '<p>Chưa có bàn nào để in.</p>';
      modal.overlay.querySelector('#qrp-count').textContent = `Đã chọn ${selected.size}/${all.length} mã`;
      modal.overlay.querySelector('#qrp-print').disabled = selected.size === 0;
    }

    modal.overlay.querySelector('#qrp-list').addEventListener('change', (e) => {
      const box = e.target.closest('input[type="checkbox"]');
      if (!box) return;
      if (box.checked) selected.add(box.value); else selected.delete(box.value);
      renderPicker();
    });
    modal.overlay.querySelector('#qrp-all').addEventListener('click', () => {
      all.forEach((x) => selected.add(x.key)); renderPicker();
    });
    modal.overlay.querySelector('#qrp-none').addEventListener('click', () => { selected.clear(); renderPicker(); });
    modal.overlay.querySelector('[data-action="close"]').addEventListener('click', modal.close);
    modal.overlay.querySelector('#qrp-print').addEventListener('click', () => {
      printQrSheet(all.filter((x) => selected.has(x.key)));
    });

    renderPicker();
  }

  /**
   * Mở một cửa sổ chỉ chứa lưới mã QR rồi gọi hộp thoại in của trình duyệt.
   * PHẢI chờ MỌI ảnh tải xong mới print(): gọi print() ngay thì trình duyệt chụp trang lúc ảnh
   * còn trống và máy in nhả ra một xấp giấy có khung mà không có mã — lỗi rất tốn giấy vì chỉ lộ
   * ra sau khi đã in. Ảnh hỏng cũng phải đếm là "xong" (dùng cả onload lẫn onerror), nếu không
   * một bàn mất mạng là treo luôn cả lệnh in.
   */
  function printQrSheet(list) {
    if (!list.length) return;
    const win = window.open('', '_blank');
    if (!win) { toast('Trình duyệt đang chặn cửa sổ in. Hãy cho phép cửa sổ bật lên rồi thử lại.', 'error'); return; }
    const cards = list.map((x) => `
      <div class="c">
        <img src="${escapeHtml(x.src)}" alt="Mã QR ${escapeHtml(x.label)}" />
        <div class="n">${escapeHtml(x.label)}</div>
        ${x.zone ? `<div class="z">${escapeHtml(x.zone)}</div>` : ''}
        <div class="h">Quét mã để gọi món</div>
      </div>`).join('');
    win.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8">
      <title>Mã QR bàn — Cơm A Thúy</title>
      <style>
        @page { margin: 10mm; }
        body { font-family: Inter, Arial, sans-serif; margin: 0; }
        h1 { font-size: 16px; margin: 0 0 10px; }
        .g { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
        .c { border: 1px dashed #999; border-radius: 8px; padding: 10px; text-align: center; break-inside: avoid; }
        .c img { width: 100%; max-width: 190px; height: auto; display: block; margin: 0 auto; }
        .n { font-size: 16px; font-weight: 700; margin-top: 6px; }
        .z { font-size: 11px; color: #666; }
        .h { font-size: 11px; color: #666; margin-top: 2px; }
        @media print { h1 { display: none; } }
      </style></head><body>
      <h1>Mã QR gọi món — ${list.length} mã</h1>
      <div class="g">${cards}</div>
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

  async function loadZones() {
    try {
      const res = await api.get('/api/mgr/tables/zones');
      zones = Array.isArray(res.zones) ? res.zones : [];
    } catch { /* giữ danh sách cũ, chip khu vực tự lùi về cách suy ra từ bàn */ }
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

  // ── Xem đơn đang mở của 1 bàn: thêm món / thanh toán ──
  function openTableOrderModal(table) {
    const modal = openModal(`
      <h3>Bàn ${table.table_no} — đơn đang mở</h3>
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
    // GĐ8-G — 4 thao tác bàn. Đóng hộp thoại đơn trước để không chồng 2 lớp modal lên nhau.
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
      openPaymentModal(
        currentOrder,
        { packaging_fee: 0, ship_fee: 0, ship_pending: false },
        { onDone: loadTables }
      );
    });

    refresh();
  }

  // ── Thêm món vào đơn đang mở — lưới thực đơn rút gọn, bấm là thêm ngay 1 phần ──
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

  // ── Modal quản lý bàn (tạo / sửa / xoá) — chỉ owner và manager ──────────
  function openManageTablesModal() {
    // Task 1 (09/08/2026) — chủ quán xin BẢNG có tiêu đề cột (Tên bàn · Khu vực · Trạng thái ·
    // Chỉnh sửa) thay cho danh sách một dòng gộp hết mọi thứ: nhìn dọc theo cột dễ soát hơn, và
    // 2 nút Sửa/Xoá dồn hẳn về cột cuối bên phải nên không còn so le giữa các dòng.
    function renderList(overlay) {
      const listEl = overlay.querySelector('#mgr-list');
      if (!listEl) return;
      if (!tables.length) {
        listEl.innerHTML = '<tr><td colspan="4" class="mgr-empty">Chưa có bàn nào.</td></tr>';
        return;
      }
      listEl.innerHTML = tables.map((t) => `
        <tr class="mgr-row" data-id="${t.id}">
          <!-- LỖI cũ: chỗ này in thẳng t.zone nên chủ quán nhìn thấy mã "trong-nha"/"ngoai-san"
               ngay giữa màn quản lý bàn. Mọi nơi hiển thị khu vực đều phải qua zoneLabel(). -->
          <td><b>Bàn ${t.table_no}</b></td>
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
      <p class="mgr-hint">Bàn tạo mới được cấp mã QR gọi món tự động — bấm nút QR trên ô bàn để xem và in.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <div class="field" style="flex:1;min-width:90px">
          <label>Số bàn</label>
          <input id="mgr-no" type="number" min="1" placeholder="Ví dụ: 5" />
        </div>
        <div class="field" style="flex:2;min-width:130px">
          <label>Khu vực</label>
          <!-- Ô GÕ TỰ DO cũ mặc định "Trong nhà" trong khi CSDL lưu "trong-nha" — tạo bàn là sinh
               ra khu vực thứ hai trùng tên, danh sách khu vực nhân đôi. Nay chọn từ danh sách thật. -->
          <select id="mgr-zone"></select>
        </div>
      </div>
      <!-- Task 1 (09/08/2026): nút "+ Thêm bàn" chuyển từ chân hộp thoại lên NGAY DƯỚI 2 ô vừa
           điền (đúng chỗ chủ quán khoanh vàng) — điền xong bấm luôn, không phải kéo xuống cuối.
           Cùng class .mgr-add-btn với "+ Thêm khu vực" nên hai nút rộng bằng nhau. -->
      <div class="mgr-add-row">
        <button class="btn btn-primary mgr-add-btn" id="mgr-add">+ Thêm bàn</button>
      </div>

      <hr style="margin:14px 0;border-color:#eee">
      <!-- Task 2 mục 3 (2026-08-08): chủ quán cần đổi/xoá KHU VỰC để dùng được cho quán khác,
           trước đây khu vực chỉ sửa được lẻ tẻ trên từng bàn nên quán nào cũng dính "Trong nhà".
           Task 2 (2026-08-09): thêm nút TẠO khu vực mới — quán mở thêm tầng 2 thì tạo "Tầng 2"
           trước, rồi mới xếp bàn vào. -->
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 8px">
        <h4 style="margin:0">Khu vực</h4>
        <button class="btn btn-primary mgr-add-btn" id="mgr-zone-add">+ Thêm khu vực</button>
      </div>
      <p class="mgr-hint">Tạo khu vực trước (ví dụ “Tầng 2”), sau đó chọn khu vực đó khi thêm bàn. Đổi tên khu vực sẽ áp dụng cho mọi bàn thuộc khu vực đó.</p>
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

    // Danh sách khu vực + số bàn, kèm nút đổi tên / xoá cho từng khu vực.
    // Nguồn là `zones` từ máy chủ (đã gồm cả khu vực chưa có bàn nào) — bản cũ đếm từ mảng
    // `tables` nên khu vực rỗng biến mất ngay sau khi tạo.
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

    // Ô chọn khu vực khi thêm bàn — giữ nguyên lựa chọn cũ nếu khu vực đó còn tồn tại.
    function renderZoneSelect(ov) {
      const sel = ov.querySelector('#mgr-zone');
      if (!sel) return;
      const keep = sel.value;
      const names = zones.length ? zones.map((z) => z.zone) : ['Trong nhà'];
      sel.innerHTML = names
        .map((z) => `<option value="${escapeHtml(z)}">${escapeHtml(zoneLabel(z))}</option>`)
        .join('');
      if (keep && names.includes(keep)) sel.value = keep;
    }

    // Tạo khu vực RỖNG. Refresh cả 3 chỗ: danh sách khu vực, ô chọn khi thêm bàn, và chip lọc
    // ngoài màn chính — nếu quên chỗ nào chủ quán sẽ tưởng tạo không thành công.
    async function refreshZoneUI() {
      await loadZones();
      renderZones(overlay);
      renderZoneSelect(overlay);
      renderZoneChips();
    }

    overlay.querySelector('#mgr-zone-add').addEventListener('click', async () => {
      const name = await promptDialog('Tên khu vực mới:', {
        title: 'Thêm khu vực', placeholder: 'Ví dụ: Tầng 2', required: true,
      });
      if (!name) return;
      try {
        await api.post('/api/mgr/tables/zones', { name: name.trim() });
        toast(`Đã tạo khu vực "${name.trim()}"`);
        await refreshZoneUI();
        overlay.querySelector('#mgr-zone').value = name.trim();
      } catch (err) {
        toast(err?.body?.error || 'Không tạo được khu vực', 'error');
      }
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
        } catch (err) {
          toast(err?.body?.error || 'Không đổi được tên khu vực', 'error');
        }
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
        } catch (err) {
          // Server chặn xoá khu vực còn bàn và trả kèm câu hướng dẫn cụ thể — hiện nguyên văn.
          toast(err?.body?.error || 'Không xoá được khu vực', 'error');
        }
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
      } catch (err) {
        toast(err?.body?.error || 'Không tạo được bàn', 'error');
      }
    });

    overlay.querySelector('#mgr-list').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const id = Number(btn.dataset.id);
      const tbl = tables.find((t) => t.id === id);
      if (!tbl) return;

      if (btn.dataset.action === 'del') {
        if (!(await confirmDialog(`Xoá bàn ${tbl.table_no}? Thao tác này không thể hoàn tác.`, { danger: true }))) return;
        try {
          await api.del(`/api/mgr/tables/manage/${id}`);
          toast(`Đã xoá bàn ${tbl.table_no}`);
          await loadTables();
          renderList(overlay);
        } catch (err) {
          toast(err?.body?.error || 'Không xoá được bàn', 'error');
        }
        return;
      }

      if (btn.dataset.action === 'edit') {
        const newNo = await promptDialog(`Đổi số bàn ${tbl.table_no} thành:`, { value: String(tbl.table_no), required: true, type: 'number' });
        if (!newNo) return;
        // Hiện TÊN có dấu, không phải mã trong CSDL; gợi ý sẵn các khu vực đang có để chủ quán
        // gõ đúng thay vì tự đẻ ra khu vực mới do sai một chữ.
        const newZone = await promptDialog(`Khu vực của bàn ${tbl.table_no}:`, {
          value: zoneLabel(tbl.zone) || 'Trong nhà',
          hint: zones.length ? 'Khu vực đang có: ' + zones.map((z) => zoneLabel(z.zone)).join(' · ') : '',
        });
        if (newZone === null) return;
        const no = parseInt(newNo, 10);
        if (!no || no < 1) { toast('Số bàn không hợp lệ', 'error'); return; }
        try {
          await api.put(`/api/mgr/tables/manage/${id}`, { table_no: no, zone: newZone.trim() || 'Trong nhà' });
          toast(`Đã cập nhật bàn ${no}`);
          await loadTables();
          renderList(overlay);
        } catch (err) {
          toast(err?.body?.error || 'Không cập nhật được bàn', 'error');
        }
      }
    });
  }

  await loadTables();
}
