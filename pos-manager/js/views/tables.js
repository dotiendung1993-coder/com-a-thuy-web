// T11 — Quản lý bàn.
import { api } from '../api.js';
import { formatVND, escapeHtml, toast, openModal, zoneLabel } from '../ui.js';
import { icon } from '../icons.js';
import { presetCartAndGo } from './sell.js';
import { openPaymentModal } from './payment-modal.js';
// GĐ8 mục G — Chuyển bàn / Tách bàn / Gộp bàn / Tách hoá đơn
import { openTableOpsModal } from './table-ops-modal.js';

function seatedMinutes(seatedSince) {
  if (!seatedSince) return 0;
  return Math.max(0, Math.round((Date.now() - new Date(seatedSince).getTime()) / 60000));
}

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  const canManage = staff?.role === 'owner' || !!perms.manage_staff;
  let tables = [];
  let statusFilter = 'tat-ca'; // tat-ca | dang-dung | trong
  let zoneFilter = 'tat-ca';   // 'tat-ca' hoặc tên khu vực thật (ví dụ 'Trong nhà')

  container.innerHTML = `
    <div class="page-head"><h2>Quản lý bàn</h2></div>
    <div class="tables-top-actions">
      <button id="tbl-mang-ve" class="btn btn-primary"><span class="inline-ico">${icon('mang-ve')}</span> Mang về</button>
      <button id="tbl-giao-hang" class="btn btn-primary"><span class="inline-ico">${icon('giao-hang')}</span> Giao hàng</button>
      ${canManage ? `<button id="tbl-manage" class="btn"><span class="inline-ico">${icon('cai-dat')}</span> Quản lý bàn</button>` : ''}
    </div>
    <div class="tab-row tables-status-tabs" id="tbl-status-tabs"></div>
    <div class="sell-chips" id="tbl-zone-chips"></div>
    <div class="tables-grid" id="tbl-grid"><p>Đang tải danh sách bàn…</p></div>
  `;

  container.querySelector('#tbl-mang-ve').addEventListener('click', () => presetCartAndGo({ deliveryType: 'mang-ve' }));
  container.querySelector('#tbl-giao-hang').addEventListener('click', () => presetCartAndGo({ deliveryType: 'giao-hang' }));
  if (canManage) {
    container.querySelector('#tbl-manage').addEventListener('click', () => openManageTablesModal());
  }

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
    // Lấy danh sách khu vực thật từ dữ liệu, không hard-code
    const zones = [...new Set(tables.map((t) => t.zone).filter(Boolean))].sort();
    const el = container.querySelector('#tbl-zone-chips');
    el.innerHTML = [
      `<button class="chip ${zoneFilter === 'tat-ca' ? 'active' : ''}" data-zone="tat-ca">Tất cả</button>`,
      // data-zone giữ NGUYÊN giá trị lưu trong CSDL để lọc đúng, chỉ phần chữ hiện ra là tên có dấu.
      ...zones.map((z) => `<button class="chip ${zoneFilter === z ? 'active' : ''}" data-zone="${escapeHtml(z)}">${escapeHtml(zoneLabel(z))}</button>`),
    ].join('');
    el.querySelectorAll('[data-zone]').forEach((b) => {
      b.addEventListener('click', () => { zoneFilter = b.dataset.zone; renderZoneChips(); renderGrid(); });
    });
  }

  function renderGrid() {
    const el = container.querySelector('#tbl-grid');
    const filtered = tables.filter((t) =>
      (statusFilter === 'tat-ca' || t.status === statusFilter) &&
      (zoneFilter === 'tat-ca' || t.zone === zoneFilter)
    );
    if (!filtered.length) {
      el.innerHTML = tables.length
        ? '<p>Không có bàn phù hợp.</p>'
        : '<p style="text-align:center;color:#888;padding:20px">Chưa có bàn nào. Bấm <b>Quản lý bàn</b> để tạo bàn mới.</p>';
      return;
    }
    el.innerHTML = filtered.map((t) => `
      <button class="table-card ${t.status}" data-table="${t.table_no}">
        <div class="table-no">Bàn ${t.table_no}</div>
        <div class="table-zone">${escapeHtml(zoneLabel(t.zone))}</div>
        <div class="table-status-badge">${t.status === 'dang-dung' ? 'Đang dùng' : 'Còn trống'}</div>
        ${t.status === 'dang-dung' ? `
          <div class="table-total">${formatVND(t.open_total)}</div>
          <div class="table-seated">${seatedMinutes(t.seated_since)} phút</div>
        ` : ''}
        ${t.qr_url ? `<span class="table-qr-btn" data-qr="${escapeHtml(t.qr_url)}"><span class="inline-ico">${icon('ma-qr')}</span> QR</span>` : ''}
      </button>
    `).join('');

    el.querySelectorAll('.table-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        const qrBtn = e.target.closest('[data-qr]');
        if (qrBtn) { showQr(qrBtn.dataset.qr, card.querySelector('.table-no').textContent); return; }
        const t = filtered.find((x) => String(x.table_no) === card.dataset.table);
        if (t.status === 'trong') {
          presetCartAndGo({ deliveryType: 'tai-ban', tableNo: t.table_no });
        } else {
          openTableOrderModal(t);
        }
      });
    });
  }

  function showQr(url, label) {
    openModal(`<h3>QR ${escapeHtml(label)}</h3><img src="${escapeHtml(url)}" alt="QR bàn" style="width:100%;border-radius:12px" />`);
  }

  async function loadTables() {
    try {
      const res = await api.get('/api/mgr/tables');
      tables = res.tables;
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
    // Lấy danh sách zone từ bàn hiện có
    const existingZones = [...new Set(tables.map((t) => t.zone).filter(Boolean))];
    if (!existingZones.includes('Trong nhà')) existingZones.unshift('Trong nhà');

    function renderList(overlay) {
      const listEl = overlay.querySelector('#mgr-list');
      if (!listEl) return;
      if (!tables.length) {
        listEl.innerHTML = '<p style="color:#888">Chưa có bàn nào.</p>';
        return;
      }
      listEl.innerHTML = tables.map((t) => `
        <div class="mgr-table-row" data-id="${t.id}">
          <span><b>Bàn ${t.table_no}</b> · <span style="color:#888">${escapeHtml(t.zone || '')}</span></span>
          <span>
            <button class="btn" data-action="edit" data-id="${t.id}" style="font-size:12px;min-height:32px;padding:0 10px">Sửa</button>
            <button class="btn btn-danger" data-action="del" data-id="${t.id}" style="font-size:12px;min-height:32px;padding:0 10px">Xoá</button>
          </span>
        </div>
      `).join('');
    }

    const zoneOptions = existingZones.map((z) => `<option value="${escapeHtml(z)}">${escapeHtml(z)}</option>`).join('');

    const { overlay, close } = openModal(`
      <h3>Quản lý bàn</h3>
      <div id="mgr-list" style="margin-bottom:14px;max-height:240px;overflow-y:auto"></div>
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
          <input id="mgr-zone" list="mgr-zone-list" value="Trong nhà" placeholder="Tên khu vực" />
          <datalist id="mgr-zone-list">${zoneOptions}</datalist>
        </div>
      </div>

      <hr style="margin:14px 0;border-color:#eee">
      <!-- Task 2 mục 3 (2026-08-08): chủ quán cần đổi/xoá KHU VỰC để dùng được cho quán khác,
           trước đây khu vực chỉ sửa được lẻ tẻ trên từng bàn nên quán nào cũng dính "Trong nhà". -->
      <h4 style="margin:0 0 8px">Khu vực</h4>
      <p class="mgr-hint">Đổi tên khu vực sẽ áp dụng cho mọi bàn thuộc khu vực đó.</p>
      <div id="mgr-zones"></div>

      <div class="modal-close-row">
        <button class="btn" id="mgr-cancel">Đóng</button>
        <button class="btn btn-primary" id="mgr-add">+ Thêm bàn</button>
      </div>
    `);

    // Danh sách khu vực + số bàn, kèm nút đổi tên / xoá cho từng khu vực.
    function renderZones(ov) {
      const el = ov.querySelector('#mgr-zones');
      if (!el) return;
      const byZone = new Map();
      for (const t of tables) {
        const z = t.zone || 'Chưa xếp khu vực';
        byZone.set(z, (byZone.get(z) || 0) + 1);
      }
      if (!byZone.size) { el.innerHTML = '<p style="color:#888">Chưa có khu vực nào.</p>'; return; }
      el.innerHTML = [...byZone.entries()].sort((a, b) => a[0].localeCompare(b[0], 'vi')).map(([z, n]) => `
        <div class="mgr-table-row" data-zone="${escapeHtml(z)}">
          <span><b>${escapeHtml(zoneLabel(z))}</b> · <span style="color:#888">${n} bàn</span></span>
          <span>
            <button class="btn" data-zone-action="rename" data-zone="${escapeHtml(z)}" style="font-size:12px;min-height:32px;padding:0 10px">Đổi tên</button>
            <button class="btn btn-danger" data-zone-action="del" data-zone="${escapeHtml(z)}" style="font-size:12px;min-height:32px;padding:0 10px">Xoá</button>
          </span>
        </div>
      `).join('');
    }

    overlay.querySelector('#mgr-zones').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-zone-action]');
      if (!btn) return;
      const zone = btn.dataset.zone;

      if (btn.dataset.zoneAction === 'rename') {
        const name = prompt(`Đổi tên khu vực "${zoneLabel(zone)}" thành:`, zoneLabel(zone));
        if (name === null || !name.trim()) return;
        try {
          const res = await api.put(`/api/mgr/tables/zones/${encodeURIComponent(zone)}`, { name: name.trim() });
          toast(`Đã đổi tên khu vực cho ${res.updated} bàn`);
          await loadTables();
          renderList(overlay);
          renderZones(overlay);
        } catch (err) {
          toast(err?.body?.error || 'Không đổi được tên khu vực', 'error');
        }
        return;
      }

      if (btn.dataset.zoneAction === 'del') {
        if (!confirm(`Xoá khu vực "${zoneLabel(zone)}"?`)) return;
        try {
          await api.del(`/api/mgr/tables/zones/${encodeURIComponent(zone)}`);
          toast('Đã xoá khu vực');
          await loadTables();
          renderList(overlay);
          renderZones(overlay);
        } catch (err) {
          // Server chặn xoá khu vực còn bàn và trả kèm câu hướng dẫn cụ thể — hiện nguyên văn.
          toast(err?.body?.error || 'Không xoá được khu vực', 'error');
        }
      }
    });

    renderList(overlay);
    renderZones(overlay);

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
        if (!confirm(`Xoá bàn ${tbl.table_no}? Thao tác này không thể hoàn tác.`)) return;
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
        const newNo = prompt(`Đổi số bàn ${tbl.table_no} thành:`, tbl.table_no);
        if (newNo === null) return;
        const newZone = prompt(`Khu vực của bàn ${tbl.table_no}:`, tbl.zone || 'Trong nhà');
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
