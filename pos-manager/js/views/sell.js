import { api } from '../api.js';
import { formatVND, escapeHtml, toast, openModal, zoneLabel } from '../ui.js';
import { icon } from '../icons.js';
import { openPaymentModal } from './payment-modal.js';

// ═══════════════════════════════════════════════════════════════════════════
// GĐ12 (07/08/2026) — màn Bán hàng dựng lại theo ảnh khảo sát app.sobanhang.com/pos
// (output/sobanhang-survey/screens/20-pos-with-products.jpeg · 21-pos-cart.jpeg ·
//  22-pos-multitab.jpeg — chụp trên cửa hàng ĐÃ CÓ sản phẩm).
// 3 điểm khác biệt đã sao chép:
//   1. Chiếm trọn màn hình: thanh xanh riêng ở trên, ẩn hẳn cột trái, có nút đóng để thoát.
//   2. Nhiều thẻ đơn song song ("Mang về 1", "Mang về 2"…), mỗi thẻ là một giỏ RIÊNG.
//   3. Danh mục món nằm ở cột dọc bên trái (trước đây xếp ngang phía trên).
// ═══════════════════════════════════════════════════════════════════════════

const CART_KEY = 'posmgr_cart';        // giỏ đơn lẻ của bản cũ — chỉ còn dùng để chuyển dữ liệu sang
const CARTS_KEY = 'posmgr_carts_v1';   // nhiều giỏ: { activeId, carts: [...] }

// ── Task 2 mục 1 (2026-08-08): kiểu hiển thị + sắp xếp + lọc ───────────────────────────────────
// Chủ quán: "thêm cho tôi kiểu hiển thị là danh sách thay vì tập trung vào hình ảnh như hiện tại,
// thêm filter sắp xếp, bộ lọc để khi cần có thể hiển thị và sắp xếp nhanh". Lưu vào localStorage
// để thu ngân chọn 1 lần là giữ nguyên cho các ca sau, không phải chọn lại mỗi lần vào màn.
const VIEW_KEY = 'posmgr_sell_view';   // 'luoi' | 'danh-sach'
const SORT_KEY = 'posmgr_sell_sort';   // xem SORTS bên dưới
const AVAIL_KEY = 'posmgr_sell_avail'; // 'tat-ca' | 'con-hang'

const SORTS = {
  'ten-az': { label: 'Tên A→Z', cmp: (a, b) => a.name.localeCompare(b.name, 'vi') },
  'ten-za': { label: 'Tên Z→A', cmp: (a, b) => b.name.localeCompare(a.name, 'vi') },
  'gia-tang': { label: 'Giá thấp → cao', cmp: (a, b) => (a.price || 0) - (b.price || 0) },
  'gia-giam': { label: 'Giá cao → thấp', cmp: (a, b) => (b.price || 0) - (a.price || 0) },
  'ban-chay': { label: 'Món nổi bật trước', cmp: (a, b) => (b.is_bestseller ? 1 : 0) - (a.is_bestseller ? 1 : 0) || a.name.localeCompare(b.name, 'vi') },
};
const DEFAULT_SORT = 'ten-az';

function readPref(key, allowed, fallback) {
  try {
    const v = localStorage.getItem(key);
    return allowed.includes(v) ? v : fallback;
  } catch { return fallback; }
}
function writePref(key, value) {
  try { localStorage.setItem(key, value); } catch { /* chế độ riêng tư chặn localStorage — bỏ qua */ }
}

// Ảnh món lưu trong DB dạng tương đối theo GỐC TRANG LANDING ('assets/img/dishes/x.png') vì trang
// deploy lên GitHub Pages theo đường dẫn con, dùng '/assets/...' sẽ trỏ sai gốc tên miền. POS
// Manager nằm trong thư mục con pos-manager/ nên phải lùi 1 cấp. Đường dẫn http(s) hoặc đã có '../'
// thì giữ nguyên. Xem scripts/sync-menu-images.js.
export function resolveImg(p) {
  const s = String(p || '').trim();
  if (!s) return '';
  if (/^(https?:)?\/\//i.test(s) || s.startsWith('data:') || s.startsWith('../') || s.startsWith('/')) return s;
  return `../${s}`;
}

const DELIVERY_LABEL = {
  'tai-ban': 'Tại bàn',
  'mang-ve': 'Mang về',
  'giao-hang': 'Giao hàng',
};

function blankCart(id) {
  return {
    id,
    deliveryType: 'tai-ban', tableNo: null, address: '',
    customerPhone: '', customerName: '', items: [], surchargeIds: [],
  };
}

function normalizeCart(raw, id) {
  const c = blankCart(id);
  if (!raw || typeof raw !== 'object') return c;
  if (DELIVERY_LABEL[raw.deliveryType]) c.deliveryType = raw.deliveryType;
  c.tableNo = raw.tableNo ?? null;
  c.address = typeof raw.address === 'string' ? raw.address : '';
  c.customerPhone = typeof raw.customerPhone === 'string' ? raw.customerPhone : '';
  c.customerName = typeof raw.customerName === 'string' ? raw.customerName : '';
  c.items = Array.isArray(raw.items) ? raw.items : [];
  c.surchargeIds = Array.isArray(raw.surchargeIds) ? raw.surchargeIds : [];
  return c;
}

/** Đọc toàn bộ các thẻ đơn đang mở. Máy nào còn giỏ của bản cũ thì tự chuyển sang thẻ số 1. */
export function loadCarts() {
  try {
    const raw = JSON.parse(localStorage.getItem(CARTS_KEY) || 'null');
    if (raw && Array.isArray(raw.carts) && raw.carts.length) {
      const carts = raw.carts.map((c, i) => normalizeCart(c, c?.id || i + 1));
      const activeId = carts.some((c) => c.id === raw.activeId) ? raw.activeId : carts[0].id;
      return { activeId, carts };
    }
  } catch { /* dữ liệu hỏng thì coi như chưa có */ }

  // Chuyển giỏ đơn lẻ của bản cũ (posmgr_cart) sang thẻ đơn đầu tiên — không để mất món đang gọi.
  let legacy = null;
  try { legacy = JSON.parse(localStorage.getItem(CART_KEY) || 'null'); } catch { /* bỏ qua */ }
  const first = normalizeCart(legacy, 1);
  return { activeId: 1, carts: [first] };
}

export function saveCarts(state) {
  try {
    localStorage.setItem(CARTS_KEY, JSON.stringify(state));
    // Vẫn ghi giỏ đang mở ra khoá cũ để bản cũ (nếu máy nào chưa cập nhật) không bị trắng giỏ.
    const active = state.carts.find((c) => c.id === state.activeId) || state.carts[0];
    localStorage.setItem(CART_KEY, JSON.stringify(active));
  } catch { /* chế độ riêng tư: bỏ qua */ }
}

/** Giỏ ĐANG MỞ — giữ tên cũ vì các màn khác vẫn gọi. */
export function loadCart() {
  const state = loadCarts();
  return state.carts.find((c) => c.id === state.activeId) || state.carts[0];
}

// T11 — 2 nút "Mang về"/"Giao hàng" ở màn Quản lý bàn nhảy thẳng vào Bán hàng với hình thức nhận
// đã chọn sẵn; bấm bàn trống thì kèm luôn table_no. Không đụng giỏ hàng hiện có (giữ nguyên món).
// GĐ12 — nếu thẻ đơn đang mở đã có món của bàn khác thì MỞ THẺ MỚI, không đè lên đơn dở dang.
export function presetCartAndGo(patch) {
  const state = loadCarts();
  let active = state.carts.find((c) => c.id === state.activeId) || state.carts[0];
  const conflict = active.items.length > 0
    && (active.deliveryType !== patch.deliveryType || (patch.tableNo != null && active.tableNo !== patch.tableNo));
  if (conflict) {
    const id = Math.max(0, ...state.carts.map((c) => c.id)) + 1;
    active = blankCart(id);
    state.carts.push(active);
    state.activeId = id;
  }
  Object.assign(active, patch);
  saveCarts(state);
  location.hash = '#/ban-hang';
}

// GĐ8 mục D — 2 dòng cùng món+size nhưng khác tuỳ chọn (topping) PHẢI là 2 dòng riêng trong giỏ,
// không được cộng dồn qty vào nhau (khách A "thêm trứng", khách B "không hành" trên cùng bàn).
function addonSignature(addons) {
  return (addons || [])
    .map((a) => `${a.option_id}:${a.qty}`)
    .sort()
    .join(',');
}

// GĐ8 mục E/H — phân loại (Lớn/Nhỏ) và đơn vị quy đổi (Lốc/Thùng) cũng phải nằm trong "chữ ký"
// của dòng giỏ hàng, nếu không bán 1 lon rồi bán 1 thùng sẽ bị cộng dồn thành 2 lon.
function choiceSignature(choice) {
  if (!choice) return '';
  return choice.variant_id ? `v${choice.variant_id}` : choice.unit_id ? `u${choice.unit_id}` : '';
}

function itemKey(menuId, size, addons, choice) {
  return `${menuId}|${size || ''}|${addonSignature(addons)}|${choiceSignature(choice)}`;
}

function priceFor(menuItem, size, choice) {
  // Giá của phân loại / đơn vị quy đổi là GIÁ TRỌN GÓI, đè lên giá gốc (không cộng dồn).
  // Máy chủ vẫn tra lại giá thật lúc tạo đơn — số ở đây chỉ để thu ngân nhìn cho khớp.
  if (choice && Number(choice.price) > 0) return Number(choice.price);
  if (size && menuItem.size_prices && menuItem.size_prices[size] != null) return menuItem.size_prices[size];
  return Number(menuItem.price) || 0;
}

/** Nhãn của thẻ đơn: "Bàn 3" khi đã chọn bàn, còn lại là "Mang về 1", "Tại bàn 2"… như app. */
export function cartTabLabel(cart, carts) {
  if (cart.deliveryType === 'tai-ban' && cart.tableNo) return `Bàn ${cart.tableNo}`;
  const same = carts.filter((c) => c.deliveryType === cart.deliveryType
    && !(c.deliveryType === 'tai-ban' && c.tableNo));
  const base = DELIVERY_LABEL[cart.deliveryType] || 'Đơn';
  if (same.length <= 1) return base;
  return `${base} ${same.findIndex((c) => c.id === cart.id) + 1}`;
}

// Phím tắt của app Sổ Bán Hàng (khảo sát GĐ9 ghi nhận POS Manager còn thiếu): F3 tìm món,
// ALT+C tìm khách, F1 thanh toán. Gỡ khi rời màn để không bắt phím ở màn khác.
let keyHandler = null;
export function destroy() {
  if (keyHandler) { document.removeEventListener('keydown', keyHandler); keyHandler = null; }
}

export async function render(container) {
  destroy(); // vào lại màn này lần nữa thì bỏ bộ bắt phím cũ đi

  let state = loadCarts();
  const cartOf = () => state.carts.find((c) => c.id === state.activeId) || state.carts[0];
  let cart = cartOf();

  let menuData = { items: [], categories: [] };
  let tables = [];
  let searchTerm = '';
  let activeCategory = 'Tất cả';
  let viewMode = readPref(VIEW_KEY, ['luoi', 'danh-sach'], 'luoi');
  let sortKey = readPref(SORT_KEY, Object.keys(SORTS), DEFAULT_SORT);
  let availFilter = readPref(AVAIL_KEY, ['tat-ca', 'con-hang'], 'tat-ca');
  let manualSurcharges = []; // GĐ8 mục F — phụ thu KHÔNG tự động, thu ngân tự chọn khi tạo đơn
  let autoSurcharges = [];   // phụ thu tự động — chỉ để xem trước, luôn cộng dù không hiện checkbox
  // GĐ12 — Cài đặt > Thông tin sản phẩm. Chưa tải xong thì dùng mặc định (có ảnh, có giá).
  let productInfo = { show_image: true, show_price: true, show_code: false };

  container.innerHTML = `
    <div class="pos-bar">
      <div class="pos-search">
        <span class="pos-search-ico">${icon('tim-kiem')}</span>
        <input id="sell-search" type="search" placeholder="Tìm tên món, mã món (F3)" />
      </div>
      <a class="pos-bar-btn" href="#/quan-ly-ban">${icon('quan-ly-ban')}<span>Quản lý bàn</span></a>
      <div class="pos-tabs" id="pos-tabs"></div>
      <button class="pos-tab-add" id="pos-tab-add" type="button" title="Mở thêm một đơn nữa"
        aria-label="Mở thêm một đơn nữa">+</button>
      <div class="pos-bar-right">
        <a class="pos-bar-ico" href="#/don-hang" title="Đơn hàng" aria-label="Đơn hàng">${icon('don-hang')}</a>
        <a class="pos-bar-ico" href="#/bep" title="Bếp" aria-label="Bếp">${icon('bep')}</a>
        <button class="pos-bar-ico pos-exit" id="pos-exit" type="button"
          title="Thoát màn Bán hàng" aria-label="Thoát màn Bán hàng">${icon('dong')}</button>
      </div>
    </div>

    <aside class="pos-cats" id="sell-chips" aria-label="Danh mục món"></aside>

    <div class="sell-toolbar" id="sell-toolbar">
      <div class="sell-view-switch" role="group" aria-label="Kiểu hiển thị món">
        <button type="button" class="sell-view-btn" data-view="luoi" title="Hiện dạng thẻ có ảnh"
          aria-label="Hiện dạng thẻ có ảnh">${icon('mon-an')}<span>Lưới</span></button>
        <button type="button" class="sell-view-btn" data-view="danh-sach" title="Hiện dạng danh sách gọn"
          aria-label="Hiện dạng danh sách gọn">${icon('don-hang')}<span>Danh sách</span></button>
      </div>
      <label class="sell-tool-field">
        <span class="sell-tool-label">Sắp xếp</span>
        <select id="sell-sort">
          ${Object.entries(SORTS).map(([k, v]) => `<option value="${k}">${escapeHtml(v.label)}</option>`).join('')}
        </select>
      </label>
      <label class="sell-tool-field">
        <span class="sell-tool-label">Lọc</span>
        <select id="sell-avail">
          <option value="tat-ca">Tất cả món</option>
          <option value="con-hang">Chỉ món còn hàng</option>
        </select>
      </label>
      <span class="sell-count" id="sell-count"></span>
    </div>

    <div class="sell-grid" id="sell-grid"><p>Đang tải thực đơn…</p></div>

    <div class="cart-panel">
      <div class="cart-head">
        <div class="field customer-suggestions">
          <input id="customer-phone" type="tel" value="${escapeHtml(cart.customerPhone)}"
            placeholder="Tìm tên / số điện thoại khách (ALT+C)" />
          <div class="suggestion-list hidden" id="customer-suggest-list"></div>
        </div>
        <button class="cart-type-btn" id="cart-type-btn" type="button"></button>
      </div>
      <div id="delivery-extra"></div>
      <div class="cart-lines" id="cart-items"></div>
      <div class="cart-foot">
        <div id="cart-surcharges"></div>
        <div class="cart-total-row"><span id="cart-count">Tổng 0 sản phẩm</span><span id="cart-total">${formatVND(0)}</span></div>
        <button id="cart-checkout" class="btn btn-primary cart-pay-btn">
          <b>Thanh toán (F1)</b><span id="cart-pay-amount">${formatVND(0)}</span>
        </button>
      </div>
    </div>
  `;

  function persist() { saveCarts(state); }

  function itemsSubtotal() {
    return cart.items.reduce((sum, it) => sum + it.price * it.qty, 0);
  }

  // Ước lượng để KHÁCH/THU NGÂN xem trước lúc còn ở giỏ hàng — số thật do server tính lúc tạo đơn
  // (cùng công thức calcSurcharge của order-service.js: % trên subtotal, cộng dồn tự động + đã chọn).
  function surchargeEstimate() {
    const subtotal = itemsSubtotal();
    const lineAmount = (s) => (s.value_type === 'percent' ? Math.round((subtotal * s.value) / 100) : Math.round(s.value));
    const selectedManual = manualSurcharges.filter((s) => cart.surchargeIds.includes(s.id));
    return [...autoSurcharges, ...selectedManual].reduce((sum, s) => sum + lineAmount(s), 0);
  }

  function cartTotal() {
    return itemsSubtotal() + surchargeEstimate();
  }

  // ── Thẻ đơn song song ────────────────────────────────────────────────────
  function renderTabs() {
    const el = container.querySelector('#pos-tabs');
    const many = state.carts.length > 1;
    el.innerHTML = state.carts.map((c) => `
      <button class="pos-tab ${c.id === state.activeId ? 'active' : ''}" type="button" data-tab="${c.id}">
        <span class="pos-tab-label">${escapeHtml(cartTabLabel(c, state.carts))}</span>
        ${c.items.length ? `<span class="pos-tab-count">${c.items.length}</span>` : ''}
        ${many ? `<span class="pos-tab-close" data-close="${c.id}" role="button" aria-label="Đóng đơn">×</span>` : ''}
      </button>`).join('');
  }

  function switchTab(id) {
    if (!state.carts.some((c) => c.id === id)) return;
    state.activeId = id;
    cart = cartOf();
    persist();
    renderTabs();
    renderTypeBtn();
    renderDeliveryExtra();
    renderCartItems();
    renderGrid();
    const phoneEl = container.querySelector('#customer-phone');
    if (phoneEl) phoneEl.value = cart.customerPhone || '';
  }

  function addTab() {
    const id = Math.max(0, ...state.carts.map((c) => c.id)) + 1;
    const fresh = blankCart(id);
    fresh.deliveryType = cart.deliveryType; // mở tiếp cùng hình thức nhận cho nhanh tay
    state.carts.push(fresh);
    switchTab(id);
  }

  function closeTab(id) {
    if (state.carts.length <= 1) return; // luôn còn ít nhất 1 thẻ
    const target = state.carts.find((c) => c.id === id);
    if (target && target.items.length && !window.confirm(`Đóng "${cartTabLabel(target, state.carts)}"? Món đã chọn trong đơn này sẽ mất.`)) return;
    state.carts = state.carts.filter((c) => c.id !== id);
    if (state.activeId === id) state.activeId = state.carts[0].id;
    cart = cartOf();
    persist();
    switchTab(state.activeId);
  }

  container.querySelector('#pos-tabs').addEventListener('click', (e) => {
    const closeEl = e.target.closest('[data-close]');
    if (closeEl) { e.stopPropagation(); closeTab(Number(closeEl.dataset.close)); return; }
    const tabEl = e.target.closest('[data-tab]');
    if (tabEl) switchTab(Number(tabEl.dataset.tab));
  });
  container.querySelector('#pos-tab-add').addEventListener('click', addTab);
  container.querySelector('#pos-exit').addEventListener('click', () => { location.hash = '#/trang-chu'; });

  // ── Hình thức nhận (nút trên đầu giỏ, mở bảng chọn giống app) ────────────
  function renderTypeBtn() {
    const btn = container.querySelector('#cart-type-btn');
    const name = DELIVERY_LABEL[cart.deliveryType] || 'Tại bàn';
    const key = cart.deliveryType === 'giao-hang' ? 'giao-hang' : cart.deliveryType === 'mang-ve' ? 'mang-ve' : 'quan-ly-ban';
    btn.innerHTML = `${icon(key)}<span>${escapeHtml(name)}</span>`;
  }

  container.querySelector('#cart-type-btn').addEventListener('click', () => {
    const modal = openModal(`
      <h3>Hình thức nhận</h3>
      <div class="size-options">
        ${Object.entries(DELIVERY_LABEL).map(([value, label]) =>
          `<button data-type="${value}"><span>${escapeHtml(label)}</span>${value === cart.deliveryType ? `<span class="inline-ico">${icon('ok')}</span>` : ''}</button>`).join('')}
      </div>
      <div class="modal-close-row"><button data-action="cancel">Đóng</button></div>
    `);
    modal.overlay.addEventListener('click', (e) => {
      const pick = e.target.closest('[data-type]');
      if (pick) {
        cart.deliveryType = pick.dataset.type;
        if (cart.deliveryType !== 'tai-ban') cart.tableNo = null;
        persist();
        modal.close();
        renderTypeBtn();
        renderDeliveryExtra();
        renderTabs();
      } else if (e.target.dataset.action === 'cancel') {
        modal.close();
      }
    });
  });

  function renderSurchargesUI() {
    const el = container.querySelector('#cart-surcharges');
    if (!autoSurcharges.length && !manualSurcharges.length) { el.innerHTML = ''; return; }
    const subtotal = itemsSubtotal();
    const lineText = (s) => s.value_type === 'percent' ? `${s.name} (+${s.value}%)` : `${s.name} (+${formatVND(s.value)})`;
    el.innerHTML = `
      ${autoSurcharges.map((s) => `<div class="cart-item-size">${escapeHtml(lineText(s))} — tự động</div>`).join('')}
      ${manualSurcharges.map((s) => `
        <label style="display:flex;align-items:center;gap:8px;margin:4px 0">
          <input type="checkbox" data-surcharge="${s.id}" style="width:auto;min-height:auto" ${cart.surchargeIds.includes(s.id) ? 'checked' : ''} ${subtotal ? '' : 'disabled'} />
          ${escapeHtml(lineText(s))}
        </label>`).join('')}
    `;
    el.querySelectorAll('[data-surcharge]').forEach((input) => {
      input.addEventListener('change', () => {
        const id = Number(input.dataset.surcharge);
        cart.surchargeIds = input.checked
          ? [...new Set([...cart.surchargeIds, id])]
          : cart.surchargeIds.filter((x) => x !== id);
        persist();
        renderCartItems();
      });
    });
  }

  function renderDeliveryExtra() {
    const el = container.querySelector('#delivery-extra');
    if (cart.deliveryType === 'tai-ban') {
      el.innerHTML = `
        <div class="field">
          <label for="table-select">Chọn bàn</label>
          <select id="table-select">
            <option value="">— Chọn bàn —</option>
            ${tables.map((t) => `<option value="${t.table_no}" ${Number(cart.tableNo) === t.table_no ? 'selected' : ''}>Bàn ${t.table_no} (${escapeHtml(zoneLabel(t.zone))})</option>`).join('')}
          </select>
        </div>`;
      el.querySelector('#table-select').addEventListener('change', (e) => {
        cart.tableNo = e.target.value ? Number(e.target.value) : null;
        persist();
        renderTabs();
      });
    } else if (cart.deliveryType === 'giao-hang') {
      el.innerHTML = `
        <div class="field">
          <label for="address-input">Địa chỉ giao hàng</label>
          <input id="address-input" type="text" value="${escapeHtml(cart.address)}" placeholder="Số nhà, đường, phường..." />
        </div>`;
      el.querySelector('#address-input').addEventListener('input', (e) => {
        cart.address = e.target.value;
        persist();
      });
    } else {
      el.innerHTML = '';
    }
  }

  function renderCartItems() {
    const el = container.querySelector('#cart-items');
    if (cart.items.length === 0) {
      el.innerHTML = `<div class="cart-empty">
        <span class="cart-empty-ico">${icon('ban-hang')}</span>
        Bắt đầu lên đơn với phần món ăn bên trái</div>`;
    } else {
      el.innerHTML = cart.items.map((it) => `
        <div class="cart-item" data-key="${escapeHtml(it.key)}">
          <div class="cart-item-top">
            <div class="cart-item-info">
              <div class="cart-item-name">${escapeHtml(it.name)}</div>
              ${it.size ? `<div class="cart-item-size">Size ${escapeHtml(it.size)}</div>` : ''}
              ${it.addons && it.addons.length ? `<div class="cart-item-size">${escapeHtml(it.addons.map((a) => a.qty > 1 ? `${a.name} x${a.qty}` : a.name).join(', '))}</div>` : ''}
              <div class="cart-item-size">Đơn giá: ${formatVND(it.price)}</div>
            </div>
            <div class="qty-row">
              <button class="qty-btn" data-action="dec" aria-label="Bớt 1">−</button>
              <span class="qty-num">${it.qty}</span>
              <button class="qty-btn" data-action="inc" aria-label="Thêm 1">+</button>
            </div>
            <div class="cart-item-money">${formatVND(it.price * it.qty)}</div>
            <button class="cart-item-remove" data-action="remove" aria-label="Xoá món">${icon('dong')}</button>
          </div>
          <input class="cart-item-note" data-action="note" name="note-${escapeHtml(it.key)}" type="text" placeholder="Ghi chú cho bếp (vd: ít cay, không hành)" value="${escapeHtml(it.note || '')}" />
        </div>
      `).join('');
    }
    renderSurchargesUI();
    const total = cartTotal();
    const count = cart.items.reduce((n, it) => n + it.qty, 0);
    container.querySelector('#cart-count').textContent = `Tổng ${count} sản phẩm`;
    container.querySelector('#cart-total').textContent = formatVND(total);
    container.querySelector('#cart-pay-amount').textContent = formatVND(total);
    renderTabs();
  }

  function findItem(key) { return cart.items.find((it) => it.key === key); }

  container.querySelector('#cart-items').addEventListener('click', (e) => {
    const itemEl = e.target.closest('.cart-item');
    if (!itemEl) return;
    const key = itemEl.dataset.key;
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'remove') {
      cart.items = cart.items.filter((it) => it.key !== key);
    } else if (action === 'inc') {
      findItem(key).qty += 1;
    } else if (action === 'dec') {
      const it = findItem(key);
      it.qty -= 1;
      if (it.qty <= 0) cart.items = cart.items.filter((x) => x.key !== key);
    } else {
      return;
    }
    persist();
    renderCartItems();
    renderGrid();
  });

  container.querySelector('#cart-items').addEventListener('input', (e) => {
    if (e.target.dataset.action !== 'note') return;
    const itemEl = e.target.closest('.cart-item');
    const it = findItem(itemEl.dataset.key);
    if (it) { it.note = e.target.value; persist(); }
  });

  function addToCart(menuItem, size, addons, choice) {
    const key = itemKey(menuItem.id, size, addons, choice);
    const existing = findItem(key);
    if (existing) {
      existing.qty += 1;
    } else {
      const addonTotal = (addons || []).reduce((s, a) => s + a.price * a.qty, 0);
      cart.items.push({
        key, menuId: menuItem.id,
        name: menuItem.name + (choice ? ` (${choice.label})` : ''),
        price: priceFor(menuItem, size, choice) + addonTotal,
        size: size || null, qty: 1, note: '', addons: addons || [],
        variantId: choice?.variant_id || null,
        unitId: choice?.unit_id || null,
      });
    }
    persist();
    renderCartItems();
    renderGrid();
    toast(`Đã thêm ${menuItem.name}${choice ? ' (' + choice.label + ')' : ''}${size ? ' (' + size + ')' : ''}`);
  }

  // GĐ8 mục D — nếu món có gắn nhóm tuỳ chọn (topping), mở màn chọn TRƯỚC khi cho vào giỏ.
  // Tra lỗi (mất mạng...) thì bỏ qua, cho vào giỏ không topping — không chặn bán hàng vì 1 lần
  // tra addon lỗi.
  async function pickAddonsThenAdd(menuItem, size, choice) {
    let groups = [];
    try {
      const res = await api.get(`/api/mgr/addons/for-menu/${menuItem.id}`);
      groups = res.groups || [];
    } catch { /* im lặng */ }
    if (!groups.length) { addToCart(menuItem, size, null, choice); return; }
    openAddonModal(menuItem, size, groups, choice);
  }

  function openAddonModal(menuItem, size, groups, choice) {
    const selected = {};
    groups.forEach((g) => { selected[g.id] = new Map(); });

    function optionRow(g, o) {
      const isSel = selected[g.id].has(o.id);
      const qty = selected[g.id].get(o.id) || 1;
      return `<label class="addon-opt-row" style="display:flex;align-items:center;gap:8px;margin:4px 0">
        <input type="${g.multi_select ? 'checkbox' : 'radio'}" name="addon-g${g.id}" data-g="${g.id}" data-o="${o.id}" ${isSel ? 'checked' : ''} ${o.in_stock ? '' : 'disabled'} />
        <span style="flex:1">${escapeHtml(o.name)}${!o.in_stock ? ' (Hết hàng)' : ''}</span>
        <span>${o.price ? '+' + formatVND(o.price) : ''}</span>
        ${g.allow_qty ? `<input type="number" min="1" value="${qty}" data-qty-g="${g.id}" data-qty-o="${o.id}" style="width:56px" ${isSel ? '' : 'disabled'} />` : ''}
      </label>`;
    }

    function bodyHtml() {
      return groups.map((g) => `
        <div class="addon-group-block" style="margin-bottom:12px">
          <h4>${escapeHtml(g.name)}${g.required ? ' <span style="color:#c00">*</span>' : ''}</h4>
          ${g.options.map((o) => optionRow(g, o)).join('')}
        </div>`).join('');
    }

    function bindInputs() {
      modal.overlay.querySelectorAll('[data-g][data-o]').forEach((input) => {
        input.addEventListener('change', () => {
          const gid = Number(input.dataset.g);
          const oid = Number(input.dataset.o);
          const group = groups.find((g) => g.id === gid);
          if (!group.multi_select) selected[gid].clear();
          if (input.checked) selected[gid].set(oid, selected[gid].get(oid) || 1);
          else selected[gid].delete(oid);
          modal.overlay.querySelector('#addon-groups-body').innerHTML = bodyHtml();
          bindInputs();
        });
      });
      modal.overlay.querySelectorAll('[data-qty-g]').forEach((input) => {
        input.addEventListener('input', () => {
          const gid = Number(input.dataset.qtyG);
          const oid = Number(input.dataset.qtyO);
          const n = Math.max(1, parseInt(input.value, 10) || 1);
          if (selected[gid].has(oid)) selected[gid].set(oid, n);
        });
      });
    }

    const modal = openModal(`
      <h3>${escapeHtml(menuItem.name)}${size ? ' (' + escapeHtml(size) + ')' : ''} — chọn tuỳ chọn</h3>
      <div id="addon-groups-body">${bodyHtml()}</div>
      <button id="addon-confirm" class="btn btn-primary" style="width:100%;margin-top:12px">Thêm vào giỏ</button>
    `);
    bindInputs();

    modal.overlay.querySelector('#addon-confirm').addEventListener('click', () => {
      const missingRequired = groups.find((g) => g.required && selected[g.id].size === 0);
      if (missingRequired) { toast(`Vui lòng chọn "${missingRequired.name}"`, 'error'); return; }
      const addons = [];
      for (const g of groups) {
        for (const [optId, qty] of selected[g.id]) {
          const opt = g.options.find((o) => o.id === optId);
          addons.push({ option_id: optId, qty, name: opt.name, price: opt.price });
        }
      }
      addToCart(menuItem, size, addons, choice);
      modal.close();
    });
  }

  // GĐ8-E/H — món có phân loại (Lớn/Nhỏ) hoặc đơn vị quy đổi (Lốc/Thùng) thì hỏi TRƯỚC, vì hai
  // thứ đó quyết định GIÁ TRỌN GÓI của dòng. Món không khai gì thì bỏ qua bước này như trước.
  function pickVariantThenAdd(menuItem, size) {
    const variants = menuItem.variants || [];
    const units = menuItem.units || [];
    if (!variants.length && !units.length) { pickAddonsThenAdd(menuItem, size, null); return; }

    const groups = [];
    // Phân loại gom theo nhóm thuộc tính (Kích cỡ, Màu sắc…) đúng như app hiển thị.
    const byAttr = new Map();
    for (const v of variants) {
      if (!byAttr.has(v.attr_name)) byAttr.set(v.attr_name, []);
      byAttr.get(v.attr_name).push(v);
    }
    for (const [attr, list] of byAttr) {
      groups.push({
        title: attr,
        options: list.map((v) => ({
          key: 'v' + v.id, label: v.name, price: v.price,
          choice: { variant_id: v.id, label: v.name, price: v.price },
        })),
      });
    }
    if (units.length) {
      groups.push({
        title: `Đơn vị bán (cơ bản: ${menuItem.unit || 'phần'})`,
        options: [
          { key: 'base', label: menuItem.unit || 'Đơn vị cơ bản', price: menuItem.price, choice: null },
          ...units.map((u) => ({
            key: 'u' + u.id, label: `${u.name} (${u.factor} ${menuItem.unit || 'đv'})`, price: u.price,
            choice: { unit_id: u.id, label: u.name, price: u.price },
          })),
        ],
      });
    }

    const modal = openModal(`
      <h3>${escapeHtml(menuItem.name)} — chọn loại bán</h3>
      ${groups.map((g) => `
        <div style="margin-bottom:12px">
          <h4>${escapeHtml(g.title)}</h4>
          <div class="size-options">
            ${g.options.map((o) => `<button data-pick="${escapeHtml(o.key)}"><span>${escapeHtml(o.label)}</span><span>${formatVND(o.price)}</span></button>`).join('')}
          </div>
        </div>`).join('')}
      <div class="modal-close-row"><button data-action="cancel">Đóng</button></div>
    `);
    const allOptions = groups.flatMap((g) => g.options);
    modal.overlay.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-pick]');
      if (btn) {
        const opt = allOptions.find((o) => o.key === btn.dataset.pick);
        modal.close();
        pickAddonsThenAdd(menuItem, size, opt?.choice || null);
      } else if (e.target.dataset.action === 'cancel') {
        modal.close();
      }
    });
  }

  function onItemClick(menuItem) {
    const sizeKeys = menuItem.size_prices ? Object.keys(menuItem.size_prices) : [];
    if (sizeKeys.length === 0) {
      pickVariantThenAdd(menuItem, null);
      return;
    }
    const modal = openModal(`
      <h3>${escapeHtml(menuItem.name)} — chọn size</h3>
      <div class="size-options">
        ${sizeKeys.map((s) => `<button data-size="${escapeHtml(s)}"><span>${escapeHtml(s)}</span><span>${formatVND(menuItem.size_prices[s])}</span></button>`).join('')}
      </div>
      <div class="modal-close-row"><button data-action="cancel">Đóng</button></div>
    `);
    modal.overlay.addEventListener('click', (e) => {
      const sizeBtn = e.target.closest('[data-size]');
      if (sizeBtn) {
        modal.close();
        pickVariantThenAdd(menuItem, sizeBtn.dataset.size);
      } else if (e.target.dataset.action === 'cancel') {
        modal.close();
      }
    });
  }

  /** Số lượng món này đang có trong thẻ đơn ĐANG MỞ — hiện thành chấm xanh trên ảnh như app. */
  function qtyInCart(menuId) {
    return cart.items.filter((it) => it.menuId === menuId).reduce((n, it) => n + it.qty, 0);
  }

  // Lọc theo danh mục + từ khoá + tình trạng còn hàng, rồi sắp xếp theo lựa chọn của thu ngân.
  function visibleItems() {
    const term = searchTerm.trim().toLowerCase();
    const list = menuData.items.filter((it) => {
      const matchCat = activeCategory === 'Tất cả' || (it.category || 'Khác') === activeCategory;
      const matchTerm = !term || it.name.toLowerCase().includes(term) || (it.code || '').toLowerCase().includes(term);
      const matchAvail = availFilter === 'tat-ca' || it.availability !== 'unavailable';
      return matchCat && matchTerm && matchAvail;
    });
    // slice() vì sort() sửa mảng tại chỗ — không được đụng vào menuData.items gốc.
    return list.slice().sort((SORTS[sortKey] || SORTS[DEFAULT_SORT]).cmp);
  }

  function renderGrid() {
    const el = container.querySelector('#sell-grid');
    const filtered = visibleItems();

    const countEl = container.querySelector('#sell-count');
    if (countEl) countEl.textContent = `${filtered.length}/${menuData.items.length} món`;
    el.classList.toggle('as-list', viewMode === 'danh-sach');

    if (filtered.length === 0) {
      el.innerHTML = '<p class="sell-empty">Không tìm thấy món phù hợp.</p>';
      return;
    }

    const showImg = productInfo.show_image !== false;
    const showPrice = productInfo.show_price !== false;
    const nameOf = (it) => (productInfo.show_code && it.code ? `${it.name} · ${it.code}` : it.name);
    const thumbOf = (it) => (showImg && it.image_path
      ? `<img src="${escapeHtml(resolveImg(it.image_path))}" alt="" loading="lazy" />`
      : `<span class="thumb-ico">${icon('mon-an')}</span>`);

    if (viewMode === 'danh-sach') {
      // Kiểu danh sách: một dòng một món, ảnh nhỏ bên trái, giá canh phải — đọc nhanh khi thực đơn
      // dài, không phải cuộn qua các thẻ ảnh to.
      el.innerHTML = filtered.map((it) => {
        const n = qtyInCart(it.id);
        const out = it.availability === 'unavailable';
        return `
        <button class="item-row ${out ? 'unavailable' : ''} ${n ? 'picked' : ''}" data-id="${escapeHtml(it.id)}">
          <span class="row-thumb">${thumbOf(it)}</span>
          <span class="row-main">
            <span class="row-name">${escapeHtml(nameOf(it))}</span>
            <span class="row-sub">${escapeHtml(it.category || 'Khác')}${out ? ' · tạm hết' : ''}</span>
          </span>
          ${n ? `<span class="row-qty">${n}</span>` : ''}
          ${showPrice ? `<span class="row-price">${formatVND(it.price)}</span>` : ''}
        </button>`;
      }).join('');
    } else {
      // Thẻ món giống ảnh khảo sát: ảnh phủ kín, giá ở góc trên phải, tên trên dải mờ dưới đáy.
      // Cài đặt > Thông tin sản phẩm quyết định hiện ảnh / giá / mã món.
      el.innerHTML = filtered.map((it) => {
        const n = qtyInCart(it.id);
        return `
        <button class="item-card ${it.availability === 'unavailable' ? 'unavailable' : ''} ${n ? 'picked' : ''}" data-id="${escapeHtml(it.id)}">
          <div class="thumb">${thumbOf(it)}</div>
          ${showPrice ? `<span class="item-price">${formatVND(it.price)}</span>` : ''}
          ${n ? `<span class="item-qty">${n}</span>` : ''}
          <span class="item-name">${escapeHtml(nameOf(it))}</span>
        </button>`;
      }).join('');
    }

    el.querySelectorAll('.item-card, .item-row').forEach((card) => {
      card.addEventListener('click', () => {
        const menuItem = menuData.items.find((it) => it.id === card.dataset.id);
        if (menuItem.availability === 'unavailable') { toast('Món này tạm hết hàng', 'error'); return; }
        onItemClick(menuItem);
      });
    });
  }

  // Thanh công cụ: kiểu hiển thị / sắp xếp / lọc. Mỗi thay đổi đều ghi nhớ để lần sau vào là như cũ.
  function renderToolbar() {
    container.querySelectorAll('.sell-view-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.view === viewMode);
      b.setAttribute('aria-pressed', String(b.dataset.view === viewMode));
    });
    const sortEl = container.querySelector('#sell-sort');
    if (sortEl) sortEl.value = sortKey;
    const availEl = container.querySelector('#sell-avail');
    if (availEl) availEl.value = availFilter;
  }

  container.querySelectorAll('.sell-view-btn').forEach((b) => {
    b.addEventListener('click', () => {
      viewMode = b.dataset.view;
      writePref(VIEW_KEY, viewMode);
      renderToolbar();
      renderGrid();
    });
  });
  container.querySelector('#sell-sort').addEventListener('change', (e) => {
    sortKey = SORTS[e.target.value] ? e.target.value : DEFAULT_SORT;
    writePref(SORT_KEY, sortKey);
    renderGrid();
  });
  container.querySelector('#sell-avail').addEventListener('change', (e) => {
    availFilter = e.target.value === 'con-hang' ? 'con-hang' : 'tat-ca';
    writePref(AVAIL_KEY, availFilter);
    renderGrid();
  });
  renderToolbar();

  // Danh mục: cột dọc bên trái trên máy tính (giống app), hàng ngang cuộn trên điện thoại.
  function renderChips() {
    const cats = ['Tất cả', ...menuData.categories.map((c) => c.category)];
    const el = container.querySelector('#sell-chips');
    el.innerHTML = cats.map((c) => `<button class="chip ${c === activeCategory ? 'active' : ''}" data-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join('');
    el.querySelectorAll('.chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        activeCategory = chip.dataset.cat;
        renderChips();
        renderGrid();
      });
    });
  }

  const searchInput = container.querySelector('#sell-search');
  searchInput.addEventListener('input', (e) => {
    searchTerm = e.target.value;
    renderGrid();
  });

  let suggestTimer = null;
  const phoneInput = container.querySelector('#customer-phone');
  phoneInput.addEventListener('input', (e) => {
    cart.customerPhone = e.target.value;
    persist();
    clearTimeout(suggestTimer);
    const list = container.querySelector('#customer-suggest-list');
    if (cart.customerPhone.trim().length < 3) { list.classList.add('hidden'); return; }
    suggestTimer = setTimeout(async () => {
      try {
        const { customers } = await api.get(`/api/mgr/customers/search?phone=${encodeURIComponent(cart.customerPhone.trim())}`);
        if (customers.length === 0) { list.classList.add('hidden'); return; }
        list.innerHTML = customers.map((c) => `<div data-phone="${escapeHtml(c.phone)}" data-name="${escapeHtml(c.name || '')}">${escapeHtml(c.phone)} — ${escapeHtml(c.name || 'Chưa có tên')}</div>`).join('');
        list.classList.remove('hidden');
      } catch { /* im lặng, không chặn bán hàng nếu gợi ý lỗi */ }
    }, 300);
  });
  container.querySelector('#customer-suggest-list').addEventListener('click', (e) => {
    const row = e.target.closest('[data-phone]');
    if (!row) return;
    cart.customerPhone = row.dataset.phone;
    cart.customerName = row.dataset.name;
    phoneInput.value = row.dataset.phone;
    persist();
    container.querySelector('#customer-suggest-list').classList.add('hidden');
  });

  // T8 — tạo đơn rồi mở màn thanh toán 3 cách: tiền mặt / chuyển khoản / ghi nợ.
  // GĐ12 — thanh toán xong thì THẺ ĐƠN đó đóng lại (còn 1 thẻ thì chỉ dọn sạch), đúng như app:
  // bán xong một đơn là thẻ biến mất, thu ngân quay về thẻ còn lại.
  function clearCart() {
    if (state.carts.length > 1) {
      const doneId = state.activeId;
      state.carts = state.carts.filter((c) => c.id !== doneId);
      state.activeId = state.carts[0].id;
      cart = cartOf();
      persist();
      switchTab(state.activeId);
      return;
    }
    cart.items = [];
    cart.tableNo = null;
    cart.address = '';
    cart.customerPhone = '';
    cart.customerName = '';
    cart.surchargeIds = [];
    persist();
    renderCartItems();
    renderDeliveryExtra();
    renderGrid();
    const phoneEl = container.querySelector('#customer-phone');
    if (phoneEl) phoneEl.value = '';
  }

  const checkoutBtn = container.querySelector('#cart-checkout');
  async function doCheckout() {
    if (cart.items.length === 0) { toast('Giỏ hàng đang trống', 'error'); return; }
    if (cart.deliveryType === 'tai-ban' && !cart.tableNo) { toast('Vui lòng chọn bàn', 'error'); return; }
    if (cart.deliveryType === 'giao-hang' && !cart.address.trim()) { toast('Vui lòng nhập địa chỉ giao hàng', 'error'); return; }

    checkoutBtn.disabled = true; // chặn bấm 2 lần -> 2 đơn trùng nội dung
    const oldHtml = checkoutBtn.innerHTML;
    checkoutBtn.innerHTML = '<b>Đang tạo đơn…</b>';
    try {
      const res = await api.post('/api/mgr/orders', {
        delivery_type: cart.deliveryType,
        table_no: cart.tableNo,
        address: cart.address,
        customer_phone: cart.customerPhone,
        customer_name: cart.customerName,
        items: cart.items.map((it) => ({
          id: it.menuId, qty: it.qty, size: it.size, note: it.note,
          addons: (it.addons || []).map((a) => ({ option_id: a.option_id, qty: a.qty })),
          // GĐ8-E/H — chỉ gửi mã, máy chủ tự tra giá thật (không tin giá trình duyệt gửi lên).
          variant_id: it.variantId || undefined,
          unit_id: it.unitId || undefined,
        })),
        surcharge_ids: cart.surchargeIds,
      });
      openPaymentModal(res.order, res.fees, { onDone: clearCart });
    } catch (err) {
      toast(err?.body?.message || 'Không tạo được đơn', 'error');
    } finally {
      checkoutBtn.disabled = false;
      checkoutBtn.innerHTML = oldHtml;
      renderCartItems();
    }
  }
  checkoutBtn.addEventListener('click', doCheckout);

  // Phím tắt giống app Sổ Bán Hàng.
  keyHandler = (e) => {
    if (!document.body.contains(container)) return;
    if (e.key === 'F3') { e.preventDefault(); searchInput.focus(); searchInput.select(); }
    else if (e.key === 'F1') { e.preventDefault(); doCheckout(); }
    else if (e.altKey && (e.key === 'c' || e.key === 'C')) { e.preventDefault(); phoneInput.focus(); }
    else if (e.key === 'Escape' && !document.querySelector('.modal-overlay')) { location.hash = '#/trang-chu'; }
  };
  document.addEventListener('keydown', keyHandler);

  renderTabs();
  renderTypeBtn();
  renderDeliveryExtra();
  renderCartItems();

  try {
    [menuData, { tables }] = await Promise.all([
      api.get('/api/mgr/menu'),
      api.get('/api/mgr/tables'),
    ]);
    renderChips();
    renderGrid();
    renderDeliveryExtra();
  } catch (err) {
    if (err?.status !== 401) {
      container.querySelector('#sell-grid').innerHTML = '<p class="sell-empty">Không tải được thực đơn.</p>';
    }
  }

  // GĐ12 — Cài đặt > Thông tin sản phẩm. Lỗi thì giữ mặc định, không chặn bán hàng.
  try {
    const res = await api.get('/api/mgr/settings');
    if (res.settings?.product_info) {
      productInfo = res.settings.product_info;
      renderGrid();
    }
  } catch { /* im lặng */ }

  // GĐ8 mục F — tra phụ thu đang bật để hiện ước lượng/tuỳ chọn ở giỏ hàng. Lỗi thì bỏ qua
  // (không chặn bán hàng), giỏ hàng vẫn hoạt động bình thường không có phụ thu.
  try {
    const { surcharges } = await api.get('/api/mgr/surcharges?active_only=1');
    autoSurcharges = (surcharges || []).filter((s) => s.auto_apply);
    manualSurcharges = (surcharges || []).filter((s) => !s.auto_apply);
    cart.surchargeIds = cart.surchargeIds.filter((id) => manualSurcharges.some((s) => s.id === id));
    renderCartItems();
  } catch { /* im lặng */ }
}
