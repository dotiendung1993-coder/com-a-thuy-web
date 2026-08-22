import { api } from '../api.js';
import { formatVND, escapeHtml, toast, openModal, zoneLabel, confirmDialog, resolveImg } from '../ui.js';
import { icon } from '../icons.js';
import { openPaymentModal } from './payment-modal.js';
import { openYeuCauPanel } from '../yeu-cau-panel.js';

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
const AVAIL_KEY = 'posmgr_sell_avail'; // xem AVAILS bên dưới
const SOLD_DAYS_KEY = 'posmgr_sell_sold_days'; // Task 4 — khoảng tính "Bán chạy nhất": 7/30/90 ngày

// Task 4 (09/08/2026) — chủ quán chọn khoảng thời gian tính "Bán chạy nhất" ngay trong bảng sắp xếp
// thay vì cố định 30 ngày. Ba mức này phải KHỚP danh sách trắng SOLD_WINDOW_CHOICES ở
// src/pos-manager/routes/menu.js — máy chủ bỏ qua giá trị lạ và lặng lẽ dùng lại 30 ngày.
export const SOLD_DAYS = [7, 30, 90];
const DEFAULT_SOLD_DAYS = 30;

// Task 1 (09/08/2026) — chủ quán xin thêm 3 kiểu sắp xếp Mới nhất / Cũ nhất / Bán chạy nhất.
// `created_at` và `sold_count` do /api/mgr/menu trả về (sold_count = số bán 30 ngày gần nhất).
// Món chưa bán lần nào có sold_count = 0 nên vẫn so sánh được, không cần lọc riêng.
const ts = (it) => Date.parse(it.created_at || '') || 0;

export const SORTS = {
  'ten-az': { label: 'Tên A→Z', cmp: (a, b) => a.name.localeCompare(b.name, 'vi') },
  'ten-za': { label: 'Tên Z→A', cmp: (a, b) => b.name.localeCompare(a.name, 'vi') },
  'gia-tang': { label: 'Giá thấp → cao', cmp: (a, b) => (a.price || 0) - (b.price || 0) },
  'gia-giam': { label: 'Giá cao → thấp', cmp: (a, b) => (b.price || 0) - (a.price || 0) },
  'moi-nhat': { label: 'Mới nhất', cmp: (a, b) => ts(b) - ts(a) || a.name.localeCompare(b.name, 'vi') },
  'cu-nhat': { label: 'Cũ nhất', cmp: (a, b) => ts(a) - ts(b) || a.name.localeCompare(b.name, 'vi') },
  'ban-chay-nhat': { label: 'Bán chạy nhất', cmp: (a, b) => (b.sold_count || 0) - (a.sold_count || 0) || a.name.localeCompare(b.name, 'vi') },
  'ban-chay': { label: 'Món nổi bật trước', cmp: (a, b) => (b.is_bestseller ? 1 : 0) - (a.is_bestseller ? 1 : 0) || a.name.localeCompare(b.name, 'vi') },
};
const DEFAULT_SORT = 'ten-az';

// Tình trạng còn/hết hàng. Trước chỉ có 2 mức (tất cả / còn hàng); chủ quán xin thêm "Hết hàng"
// để soát nhanh những món đang tạm ngừng bán mà không phải cuộn cả thực đơn.
export const AVAILS = {
  'tat-ca': { label: 'Tất cả món', match: () => true },
  'con-hang': { label: 'Còn hàng', match: (it) => it.availability !== 'unavailable' },
  'het-hang': { label: 'Hết hàng', match: (it) => it.availability === 'unavailable' },
};
const DEFAULT_AVAIL = 'tat-ca';

function readPref(key, allowed, fallback) {
  try {
    const v = localStorage.getItem(key);
    return allowed.includes(v) ? v : fallback;
  } catch { return fallback; }
}
function writePref(key, value) {
  try { localStorage.setItem(key, value); } catch { /* chế độ riêng tư chặn localStorage — bỏ qua */ }
}

// resolveImg() đã chuyển sang ui.js (Task 2, 09/08/2026) để màn Sản phẩm dùng chung; xuất lại ở đây
// để mọi chỗ đang `import { resolveImg } from './sell.js'` vẫn chạy.
export { resolveImg };

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
    // Task 3 (10/08/2026) — mốc HẸN GIAO chủ quán hẹn với khách, dạng '2026-08-12T18:30'
    // (đúng giá trị của <input type="datetime-local">, hiểu là giờ VN). Rỗng = giao ngay.
    scheduledAt: '',
    // Task 3 đợt 6 (10/08/2026) — ảnh POS Sổ Bán Hàng có ô "Chiết khấu" (VND | %) và ô ghi chú
    // ngay trên nút Thanh toán. Giữ theo TỪNG THẺ ĐƠN: bàn 1 giảm 10% không được lây sang bàn 2.
    discountType: 'vnd',
    discountValue: 0,
    note: '',
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
  c.scheduledAt = typeof raw.scheduledAt === 'string' ? raw.scheduledAt : '';
  c.discountType = raw.discountType === 'percent' ? 'percent' : 'vnd';
  c.discountValue = Number.isFinite(Number(raw.discountValue)) ? Math.max(0, Number(raw.discountValue)) : 0;
  c.note = typeof raw.note === 'string' ? raw.note : '';
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

// ── "Sao chép đơn" (10/08/2026) — nút trong hộp thoại Chi tiết đơn hàng ─────────────────────────
// Màn Đơn hàng ghi giỏ vào sessionStorage rồi nhảy sang đây; đọc XONG là XOÁ ngay, nếu không thì
// mỗi lần tải lại trang Bán hàng sẽ dựng lại đúng cái đơn cũ ấy thêm một lần nữa.
const COPY_KEY = 'posmgr.copyOrder';

export function takeCopiedOrder() {
  let raw = null;
  try {
    raw = JSON.parse(sessionStorage.getItem(COPY_KEY) || 'null');
    sessionStorage.removeItem(COPY_KEY);
  } catch { return null; }
  if (!raw || !Array.isArray(raw.items) || !raw.items.length) return null;
  return raw;
}

/** Đổ đơn vừa sao chép vào một THẺ ĐƠN MỚI (không đè lên đơn đang gọi dở của thu ngân). */
export function applyCopiedOrder(state, copied) {
  const id = Math.max(0, ...state.carts.map((c) => c.id)) + 1;
  const fresh = blankCart(id);
  fresh.items = copied.items;
  fresh.customerName = copied.customerName || '';
  fresh.customerPhone = copied.customerPhone || '';
  if (DELIVERY_LABEL[copied.deliveryType]) fresh.deliveryType = copied.deliveryType;
  state.carts.push(fresh);
  state.activeId = id;
  saveCarts(state);
  return fresh;
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

// ── Task 1 (09/08/2026): khung BÁN NHANH ngay trong màn Bán hàng ───────────────────────────────
// Chủ quán: "nút bán nhanh khi ấn không truy cập vào màn hình POS manager nữa mà chỉ khung menu
// chọn các món chia thành 2 màn hình — trên là menu món, dưới là màn hình bán nhanh".
// Nên dòng bán nhanh ở đây CHÈN THẲNG vào thẻ đơn đang mở (một hoá đơn gồm cả món trong thực đơn
// lẫn món tự gõ), khác với màn #/ban-nhanh cũ vốn tạo riêng một đơn 1 dòng rồi thanh toán ngay.
// Màn cũ giữ nguyên cho ai quen dùng — xem js/views/quick-sell.js.
const QS_MAX_DIGITS = 9;
const QS_MAX_QTY = 99;
const QS_AMOUNTS = [5000, 10000, 15000, 20000, 25000, 50000];
// Task 6 (09/08/2026) — 5 tên này giờ chỉ là DỰ PHÒNG cho quán mới chưa từng bán nhanh lần nào.
// Bình thường khung Bán nhanh hiện 5 món tự gõ gần nhất của quán, lấy từ /api/mgr/menu/quick-names.
const QS_NAMES = ['Trà đá', 'Nước ngọt', 'Bia', 'Thuốc lá', 'Mua hộ'];
export const QS_NAME_LIMIT = 5;

/** Trộn tên mới vừa gõ lên đầu danh sách gợi ý (không trùng, không phân biệt hoa/thường). */
export function mergeQuickNames(list, name, limit = QS_NAME_LIMIT) {
  const v = String(name || '').trim();
  const rest = (Array.isArray(list) ? list : [])
    .map((s) => String(s || '').trim())
    .filter((s) => s && s.toLowerCase() !== v.toLowerCase());
  return (v ? [v, ...rest] : rest).slice(0, limit);
}
const QS_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'];

function quickSellMarkup() {
  return `
      <section class="qs-dock hidden" id="qs-dock" aria-label="Bán nhanh">
        <header class="qs-dock-head">
          <b>Bán nhanh</b>
          <span class="qs-dock-hint">Món KHÔNG có trong thực đơn — nước khách gửi, đồ mua hộ… Thêm thẳng vào đơn đang mở.</span>
          <button type="button" class="qs-dock-close" id="qs-dock-close" aria-label="Đóng khung Bán nhanh">×</button>
        </header>
        <div class="qs-dock-body">
          <div class="qs-col">
            <label class="qs-lbl" for="qs-name">Tên sản phẩm</label>
            <input id="qs-name" type="text" placeholder="VD: Trà đá" autocomplete="off" />
            <!-- Task 6 — nội dung do renderQuickNames() ghi lại sau khi hỏi máy chủ; dựng sẵn 5 tên
                 dự phòng để khung không trống trong lúc chờ mạng. -->
            <div class="qs-chips" id="qs-name-chips">
              ${QS_NAMES.map((n) => `<button type="button" class="chip" data-name="${escapeHtml(n)}">${escapeHtml(n)}</button>`).join('')}
            </div>
            <div class="qs-qty-row">
              <span class="qs-lbl">Số lượng</span>
              <div class="qs-stepper">
                <button type="button" id="qs-minus" aria-label="Bớt 1">−</button>
                <span id="qs-qty">1</span>
                <button type="button" id="qs-plus" aria-label="Thêm 1">+</button>
              </div>
            </div>
          </div>
          <div class="qs-col">
            <label class="qs-lbl" for="qs-price-display">Giá bán</label>
            <div class="qs-price-display" id="qs-price-display">${formatVND(0)}</div>
            <div class="qs-chips" id="qs-amount-chips">
              ${QS_AMOUNTS.map((a) => `<button type="button" class="chip" data-amount="${a}">${formatVND(a)}</button>`).join('')}
            </div>
          </div>
          <div class="qs-col qs-col-pad">
            <div class="qs-keypad">
              ${QS_KEYS.map((k) => `<button type="button" class="qs-key ${k === 'clear' || k === 'back' ? 'fn' : ''}" data-k="${k}">${k === 'back' ? '⌫' : k === 'clear' ? 'Xoá' : k}</button>`).join('')}
            </div>
            <div class="qs-total-row"><span>Thành tiền</span><b id="qs-total">${formatVND(0)}</b></div>
            <button id="qs-add" class="btn btn-primary qs-confirm" type="button">Thêm vào đơn</button>
          </div>
        </div>
      </section>`;
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
  // Vừa bấm "Sao chép" ở màn Đơn hàng thì mở sẵn một thẻ đơn mới y hệt đơn cũ.
  const copied = takeCopiedOrder();
  if (copied) applyCopiedOrder(state, copied);
  const cartOf = () => state.carts.find((c) => c.id === state.activeId) || state.carts[0];
  let cart = cartOf();

  let menuData = { items: [], categories: [] };
  let tables = [];
  let searchTerm = '';
  let activeCategory = 'Tất cả';
  let viewMode = readPref(VIEW_KEY, ['luoi', 'danh-sach'], 'luoi');
  let sortKey = readPref(SORT_KEY, Object.keys(SORTS), DEFAULT_SORT);
  let availFilter = readPref(AVAIL_KEY, Object.keys(AVAILS), DEFAULT_AVAIL);
  // Task 4 — localStorage chỉ giữ chữ, phải ép về số rồi đối chiếu danh sách cho phép.
  let soldDays = Number(readPref(SOLD_DAYS_KEY, SOLD_DAYS.map(String), String(DEFAULT_SOLD_DAYS)));
  let quickSellOpen = false; // Task 1 — khung Bán nhanh chia đôi khu vực món (không rời màn nữa)
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
      <div class="pos-sf-wrap" id="pos-sf-wrap">
        <button class="pos-bar-ico pos-sf-btn" id="sell-sf-btn" title="Sắp xếp &amp; Lọc" aria-label="Sắp xếp và Lọc">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="21" height="21"><path d="M4 6h16M7 12h10M10 18h4"/></svg>
        </button>
        <div class="pos-sf-drop hidden" id="sell-sf-drop">
          <p class="pos-sf-section">Sắp xếp</p>
          ${Object.entries(SORTS).map(([k, v]) => `<button type="button" class="pos-sf-opt" data-sort="${k}">${escapeHtml(v.label)}</button>`).join('')}
          <!-- Task 4 — khoảng tính "Bán chạy nhất". Nằm ngay dưới danh sách sắp xếp để đổi xong là
               thấy kết quả liền, không phải sang màn Cài đặt. -->
          <hr class="pos-sf-hr"/>
          <p class="pos-sf-section">Bán chạy tính trong</p>
          <div class="pos-sf-days" id="sell-sold-days">
            ${SOLD_DAYS.map((d) => `<button type="button" class="chip" data-days="${d}">${d} ngày</button>`).join('')}
          </div>
          <hr class="pos-sf-hr"/>
          <p class="pos-sf-section">Tình trạng</p>
          ${Object.entries(AVAILS).map(([k, v]) => `<button type="button" class="pos-sf-opt" data-avail="${k}">${escapeHtml(v.label)}</button>`).join('')}
        </div>
      </div>
      <button class="pos-bar-ico" id="sell-view-ico" title="Đổi kiểu hiển thị" aria-label="Đổi kiểu hiển thị">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="21" height="21" id="sell-view-svg"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
      </button>
      <a class="pos-bar-btn" href="#/quan-ly-ban">${icon('quan-ly-ban')}<span>Quản lý bàn</span></a>
      <div class="pos-tabs" id="pos-tabs"></div>
      <button class="pos-tab-add" id="pos-tab-add" type="button" title="Mở thêm một đơn nữa"
        aria-label="Mở thêm một đơn nữa">+</button>
      <div class="pos-bar-right">
        <a class="pos-bar-ico" href="#/don-hang" title="Quản lý đơn hàng" aria-label="Quản lý đơn hàng">${icon('don-hang')}</a>
        <button class="pos-bar-ico" id="sell-print-btn" type="button" title="Cài đặt tự động in" aria-label="Cài đặt tự động in">${icon('in')}</button>
        <button class="pos-bar-ico" id="sell-req-btn" type="button" title="Yêu Cầu" aria-label="Yêu Cầu">${icon('chuong')}</button>
        <button class="pos-bar-ico" id="sell-sync-btn" type="button" title="Đồng bộ dữ liệu" aria-label="Đồng bộ dữ liệu">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="21" height="21"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
        </button>
        <button class="pos-bar-ico" id="sell-shortcut-btn" type="button" title="Phím tắt" aria-label="Phím tắt">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="21" height="21"><rect x="2" y="6" width="20" height="13" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h.01M12 14h.01M16 14h.01M6 14h.01M18 14h.01"/></svg>
        </button>
        <button class="pos-bar-ico pos-exit" id="pos-exit" type="button"
          title="Thoát màn Bán hàng" aria-label="Thoát màn Bán hàng">${icon('dong')}</button>
      </div>
    </div>

    <aside class="pos-cats" aria-label="Danh mục món">
      <p class="pos-cats-count" id="sell-count"></p>
      <div id="sell-chips"></div>
      <button type="button" class="pos-cat-quick" id="sell-quick-toggle" aria-pressed="false"
        title="Bán nhanh (món không có trong thực đơn)" aria-label="Bán nhanh">
        ${icon('ban-nhanh')}<span>Bán nhanh</span>
      </button>
    </aside>

    <div class="sell-main" id="sell-main">
      <div class="sell-grid" id="sell-grid"><p>Đang tải thực đơn…</p></div>
      ${quickSellMarkup()}
    </div>

    <div class="cart-panel">
      <div class="cart-head">
        <div class="customer-panel">
          <div class="customer-tabs">
            <button type="button" class="customer-tab active" data-ctab="all">Tất cả</button>
            <button type="button" class="customer-tab" data-ctab="groups">Nhóm khách hàng</button>
          </div>
          <div class="field customer-suggestions" id="customer-search-area">
            <input id="customer-phone" type="tel" value="${escapeHtml(cart.customerPhone)}"
              placeholder="Tìm tên / số điện thoại khách (ALT+C)" />
            <div class="suggestion-list hidden" id="customer-suggest-list"></div>
          </div>
          <div class="customer-groups-area hidden" id="customer-groups-area">
            <div id="customer-group-chips">Đang tải nhóm khách…</div>
          </div>
        </div>
        <button class="cart-type-btn" id="cart-type-btn" type="button"></button>
      </div>
      <div id="delivery-extra"></div>
      <!-- Task 3 (10/08/2026) — ô "Hẹn giao" đứng NGOÀI #delivery-extra: khối đó bị vẽ lại mỗi
           lần đổi hình thức nhận, mà hẹn giao áp dụng cho cả 3 hình thức (khách đặt cỗ ăn tại
           bàn lúc 18h cũng là hẹn giao). Để trong đó là đổi hình thức một cái là mất giờ đã hẹn. -->
      <div class="field cart-sched">
        <label for="sched-input">Hẹn giao <span class="cart-sched-opt">(để trống = giao ngay)</span></label>
        <div class="cart-sched-row">
          <input id="sched-input" type="datetime-local" value="${escapeHtml(cart.scheduledAt || '')}" />
          <button type="button" class="btn cart-sched-clear" id="sched-clear" title="Bỏ hẹn giao">${icon('dong')}</button>
        </div>
      </div>
      <div class="cart-lines" id="cart-items"></div>
      <div class="cart-foot">
        <div id="cart-surcharges"></div>
        <!-- Task 3 đợt 6 (10/08/2026) — ô Chiết khấu + Ghi chú đơn, đúng chỗ như ảnh POS Sổ Bán Hàng. -->
        <div class="cart-disc-row">
          <span class="cart-disc-label">Chiết khấu <small>(F4)</small></span>
          <div class="cart-disc-ctl">
            <button type="button" class="disc-unit" id="disc-vnd" data-unit="vnd">VND</button>
            <button type="button" class="disc-unit" id="disc-pct" data-unit="percent">%</button>
            <input id="disc-value" type="number" min="0" inputmode="numeric"
              value="${Number(cart.discountValue) || 0}" aria-label="Số tiền chiết khấu" />
          </div>
          <span class="cart-disc-amount" id="disc-amount">0đ</span>
        </div>
        <div class="field cart-note-field">
          <input id="order-note" type="text" value="${escapeHtml(cart.note || '')}"
            placeholder="Ghi chú cho đơn (ALT+N)" aria-label="Ghi chú cho đơn" />
        </div>
        <div class="cart-total-row"><span id="cart-count">Tổng 0 sản phẩm</span><span id="cart-total">${formatVND(0)}</span></div>
        <div class="cart-pay-row">
          <button id="cart-save" class="btn cart-save-btn" type="button">
            <span class="inline-ico">${icon('phieu')}</span> Lưu đơn (F2)
          </button>
          <button id="cart-checkout" class="btn btn-primary cart-pay-btn">
            <b>Thanh toán (F1)</b><span id="cart-pay-amount">${formatVND(0)}</span>
          </button>
        </div>
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

  // Chiết khấu tay: % thì tính trên TIỀN MÓN (không tính trên phụ thu — giảm giá 10% mà giảm cả
  // phí đóng gói là quán tự bù tiền hộp cho khách). Không bao giờ vượt quá tiền món.
  function manualDiscount() {
    const base = itemsSubtotal();
    const v = Math.max(0, Number(cart.discountValue) || 0);
    if (!v || !base) return 0;
    const raw = cart.discountType === 'percent' ? Math.floor((base * Math.min(v, 100)) / 100) : Math.round(v);
    return Math.min(raw, base);
  }

  function cartTotal() {
    return itemsSubtotal() + surchargeEstimate() - manualDiscount();
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
    renderSched();
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

  async function closeTab(id) {
    if (state.carts.length <= 1) return; // luôn còn ít nhất 1 thẻ
    const target = state.carts.find((c) => c.id === id);
    if (target && target.items.length && !(await confirmDialog(`Đóng "${cartTabLabel(target, state.carts)}"? Món đã chọn trong đơn này sẽ mất.`))) return;
    state.carts = state.carts.filter((c) => c.id !== id);
    if (state.activeId === id) state.activeId = state.carts[0].id;
    cart = cartOf();
    persist();
    switchTab(state.activeId);
  }

  container.querySelector('#pos-tabs').addEventListener('click', async (e) => {
    const closeEl = e.target.closest('[data-close]');
    if (closeEl) { e.stopPropagation(); await closeTab(Number(closeEl.dataset.close)); return; }
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

  // Task 3 — ô Hẹn giao. Đổ lại giá trị mỗi khi chuyển thẻ đơn (mỗi thẻ giữ mốc hẹn riêng).
  const schedInput = container.querySelector('#sched-input');
  schedInput.addEventListener('change', (e) => { cart.scheduledAt = e.target.value; persist(); });
  container.querySelector('#sched-clear').addEventListener('click', () => {
    cart.scheduledAt = '';
    schedInput.value = '';
    persist();
  });
  function renderSched() { schedInput.value = cart.scheduledAt || ''; }

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
    renderDiscountUI();
    const total = cartTotal();
    const count = cart.items.reduce((n, it) => n + it.qty, 0);
    container.querySelector('#cart-count').textContent = `Tổng ${count} sản phẩm`;
    container.querySelector('#cart-total').textContent = formatVND(total);
    container.querySelector('#cart-pay-amount').textContent = formatVND(total);
    renderTabs();
  }

  // Vẽ lại ô chiết khấu theo thẻ đơn đang mở (đổi thẻ là số phải đổi theo).
  function renderDiscountUI() {
    const valEl = container.querySelector('#disc-value');
    if (!valEl) return;
    if (document.activeElement !== valEl) valEl.value = Number(cart.discountValue) || 0;
    container.querySelector('#disc-vnd').classList.toggle('active', cart.discountType !== 'percent');
    container.querySelector('#disc-pct').classList.toggle('active', cart.discountType === 'percent');
    const amount = manualDiscount();
    container.querySelector('#disc-amount').textContent = amount ? '-' + formatVND(amount) : formatVND(0);
    const noteEl = container.querySelector('#order-note');
    if (noteEl && document.activeElement !== noteEl) noteEl.value = cart.note || '';
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
  // Bỏ điều kiện danh mục ra riêng để đếm được số món của TỪNG danh mục cho cột trái.
  function matchesFilters(it) {
    const term = searchTerm.trim().toLowerCase();
    const matchTerm = !term || it.name.toLowerCase().includes(term) || (it.code || '').toLowerCase().includes(term);
    return matchTerm && (AVAILS[availFilter] || AVAILS[DEFAULT_AVAIL]).match(it);
  }

  function inCategory(it, cat) {
    return cat === 'Tất cả' || (it.category || 'Khác') === cat;
  }

  function countInCategory(cat) {
    return menuData.items.filter((it) => inCategory(it, cat) && matchesFilters(it)).length;
  }

  // Cập nhật riêng con số trên từng danh mục (không dựng lại cả cột) — gõ tìm kiếm mỗi ký tự đều
  // gọi, dựng lại cả cột sẽ nháy và mất trạng thái cuộn.
  function updateChipCounts() {
    container.querySelectorAll('#sell-chips .chip').forEach((chip) => {
      const el = chip.querySelector('.chip-count');
      if (el) el.textContent = String(countInCategory(chip.dataset.cat));
    });
  }

  function visibleItems() {
    const list = menuData.items.filter((it) => inCategory(it, activeCategory) && matchesFilters(it));
    // slice() vì sort() sửa mảng tại chỗ — không được đụng vào menuData.items gốc.
    return list.slice().sort((SORTS[sortKey] || SORTS[DEFAULT_SORT]).cmp);
  }

  function renderGrid() {
    const el = container.querySelector('#sell-grid');
    const filtered = visibleItems();

    // Task 1 — số món KHÔNG còn nằm trên thanh xanh nữa mà ở đầu cột danh mục bên trái.
    const countEl = container.querySelector('#sell-count');
    if (countEl) countEl.textContent = `${filtered.length}/${menuData.items.length} món`;
    updateChipCounts();
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

    // Task 5 (09/08/2026) — đang sắp xếp "Bán chạy nhất" thì hiện luôn SỐ ĐÃ BÁN trên từng món, để
    // thu ngân biết vì sao món này đứng trước món kia (trước đây chỉ thấy thứ tự, không thấy số).
    // Chỉ hiện ở kiểu sắp xếp này — các kiểu khác con số không liên quan, thêm vào chỉ rối mắt.
    const showSold = sortKey === 'ban-chay-nhat';
    const soldBadge = (it) => (showSold
      ? `<span class="item-sold" title="Đã bán trong ${soldDays} ngày">Đã bán ${Number(it.sold_count) || 0}</span>`
      : '');

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
            <span class="row-sub">${escapeHtml(it.category || 'Khác')}${out ? ' · tạm hết' : ''}${showSold ? ` · đã bán ${Number(it.sold_count) || 0} (${soldDays} ngày)` : ''}</span>
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
          ${soldBadge(it)}
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

  // Thanh công cụ: kiểu hiển thị / sắp xếp / lọc trong pos-bar. Ghi nhớ mỗi lựa chọn vào localStorage.
  const GRID_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="21" height="21"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`;
  const LIST_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="21" height="21"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>`;

  function renderToolbar() {
    // Nút đổi kiểu hiển thị: icon hiện tại = kiểu ĐANG dùng; click → đổi sang kiểu kia.
    const viewIco = container.querySelector('#sell-view-ico');
    if (viewIco) {
      viewIco.innerHTML = viewMode === 'luoi' ? GRID_SVG : LIST_SVG;
      viewIco.title = viewMode === 'luoi' ? 'Chuyển sang danh sách' : 'Chuyển sang lưới ảnh';
    }
    // Sort/filter options: đánh dấu lựa chọn đang chọn
    container.querySelectorAll('.pos-sf-opt[data-sort]').forEach((b) => {
      b.classList.toggle('active', b.dataset.sort === sortKey);
    });
    container.querySelectorAll('.pos-sf-opt[data-avail]').forEach((b) => {
      b.classList.toggle('active', b.dataset.avail === availFilter);
    });
    // Task 4 — tô đậm mức ngày đang chọn.
    container.querySelectorAll('#sell-sold-days .chip').forEach((b) => {
      b.classList.toggle('active', Number(b.dataset.days) === soldDays);
    });
    // Nút sort/filter: highlight nếu đang lọc hoặc sắp xếp không phải mặc định
    const sfBtn = container.querySelector('#sell-sf-btn');
    if (sfBtn) sfBtn.classList.toggle('active', sortKey !== DEFAULT_SORT || availFilter !== DEFAULT_AVAIL);
  }

  // View toggle
  container.querySelector('#sell-view-ico').addEventListener('click', () => {
    viewMode = viewMode === 'luoi' ? 'danh-sach' : 'luoi';
    writePref(VIEW_KEY, viewMode);
    renderToolbar();
    renderGrid();
  });

  // Sort/filter dropdown
  const sfWrap = container.querySelector('#pos-sf-wrap');
  const sfDrop = container.querySelector('#sell-sf-drop');
  container.querySelector('#sell-sf-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    sfDrop.classList.toggle('hidden');
  });
  document.addEventListener('click', (e) => {
    if (!sfWrap.contains(e.target)) sfDrop.classList.add('hidden');
  }, { capture: true });
  container.querySelectorAll('.pos-sf-opt[data-sort]').forEach((b) => {
    b.addEventListener('click', () => {
      sortKey = SORTS[b.dataset.sort] ? b.dataset.sort : DEFAULT_SORT;
      writePref(SORT_KEY, sortKey);
      renderToolbar();
      renderGrid();
      sfDrop.classList.add('hidden');
    });
  });
  // Task 4 — đổi khoảng "Bán chạy nhất": phải TẢI LẠI thực đơn vì sold_count do máy chủ tính, đổi số
  // ngày mà chỉ sắp xếp lại tại chỗ thì thứ tự y như cũ (kiểu lỗi âm thầm đã gặp ở bug-569).
  // Bảng chọn KHÔNG đóng lại sau khi bấm: chủ quán hay so 7 rồi 30 rồi 90 ngay tại chỗ.
  container.querySelectorAll('#sell-sold-days .chip').forEach((b) => {
    b.addEventListener('click', async () => {
      const d = Number(b.dataset.days);
      if (!SOLD_DAYS.includes(d) || d === soldDays) return;
      soldDays = d;
      writePref(SOLD_DAYS_KEY, String(soldDays));
      renderToolbar();
      try { await loadMenu(); } catch { toast('Không tải lại được thực đơn', 'error'); }
    });
  });
  container.querySelectorAll('.pos-sf-opt[data-avail]').forEach((b) => {
    b.addEventListener('click', () => {
      availFilter = AVAILS[b.dataset.avail] ? b.dataset.avail : DEFAULT_AVAIL;
      writePref(AVAIL_KEY, availFilter);
      renderToolbar();
      renderGrid();
      sfDrop.classList.add('hidden');
    });
  });

  // Action icons bên phải
  container.querySelector('#sell-print-btn').addEventListener('click', () => {
    toast('Cài đặt tự động in: vào Cài đặt › Máy in để điều chỉnh', 'info');
  });
  // Task 4 (13/08/2026) — trước đây bấm chuông chỉ nhảy sang màn "Thông báo" chung (đơn bị huỷ,
  // hàng sắp hết…), không phải panel "Yêu cầu" quản lý món chờ chế biến như ảnh mẫu Sổ Bán Hàng.
  container.querySelector('#sell-req-btn').addEventListener('click', () => openYeuCauPanel());
  container.querySelector('#sell-sync-btn').addEventListener('click', async () => {
    toast('Đang đồng bộ…');
    try { await loadMenu(); toast('Đồng bộ xong'); }
    catch { toast('Không kết nối được máy chủ', 'error'); }
  });
  // Bảng "Chú thích phím tắt" dựng theo ảnh Sổ Bán Hàng: lưới 2 cột, mỗi phím là một ô vuông.
  // CHỈ liệt kê phím thật sự chạy — bảng ghi phím không có là thu ngân bấm rồi tưởng máy hỏng.
  const SHORTCUTS = [
    ['F1', 'Thanh toán đơn'], ['F2', 'Lưu đơn (thu tiền sau)'],
    ['F3', 'Tìm kiếm sản phẩm'], ['F4', 'Nhập chiết khấu đơn hàng'],
    ['ALT+C', 'Thêm khách hàng'], ['ALT+N', 'Nhập ghi chú đơn'],
    ['+', 'Mở thêm thẻ đơn'], ['Esc', 'Đóng hộp thoại / thoát màn'],
  ];
  container.querySelector('#sell-shortcut-btn').addEventListener('click', () => {
    openModal(`
      <h3>Chú thích phím tắt</h3>
      <div class="shortcut-grid">
        ${SHORTCUTS.map(([k, label]) => `<div class="shortcut-row">
          <kbd class="shortcut-key">${escapeHtml(k)}</kbd>
          <span class="shortcut-label">${escapeHtml(label)}</span>
        </div>`).join('')}
      </div>
    `);
  });

  renderToolbar();

  // Danh mục: cột dọc bên trái trên máy tính (giống app), hàng ngang cuộn trên điện thoại.
  function renderChips() {
    const cats = ['Tất cả', ...menuData.categories.map((c) => c.category)];
    const el = container.querySelector('#sell-chips');
    // Mỗi danh mục kèm số món ĐANG HỢP BỘ LỌC — nhìn là biết danh mục nào còn hàng để bán,
    // không phải bấm vào từng cái mới thấy trống.
    el.innerHTML = cats.map((c) => `<button class="chip ${c === activeCategory ? 'active' : ''}" data-cat="${escapeHtml(c)}">
        <span class="chip-label">${escapeHtml(c)}</span><span class="chip-count">${countInCategory(c)}</span>
      </button>`).join('');
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

  // ── Tab "Nhóm khách hàng" trong cart panel (Đợt 2 15/08 — v2 feature) ─────
  let customerGroupFilter = null; // group_id string khi đã lọc theo nhóm, null = tất cả

  const tabAll = container.querySelector('[data-ctab="all"]');
  const tabGroups = container.querySelector('[data-ctab="groups"]');
  const searchArea = container.querySelector('#customer-search-area');
  const groupsArea = container.querySelector('#customer-groups-area');

  function switchCustomerTab(which) {
    tabAll.classList.toggle('active', which === 'all');
    tabGroups.classList.toggle('active', which === 'groups');
    searchArea.classList.toggle('hidden', which === 'groups');
    groupsArea.classList.toggle('hidden', which === 'all');
    if (which === 'groups') loadCustomerGroups();
  }
  tabAll.addEventListener('click', () => switchCustomerTab('all'));
  tabGroups.addEventListener('click', () => switchCustomerTab('groups'));

  async function loadCustomerGroups() {
    const el = container.querySelector('#customer-group-chips');
    if (!el || el.dataset.loaded) return;
    try {
      const { groups } = await api.get('/api/mgr/customers/groups');
      el.dataset.loaded = '1';
      if (!groups || !groups.length) {
        el.innerHTML = '<p class="no-groups">Chưa có nhóm khách nào.</p>';
        return;
      }
      el.innerHTML = groups.map((g) =>
        `<button type="button" class="chip customer-group-chip" data-gid="${g.id}">${escapeHtml(g.name)}</button>`
      ).join('');
      el.querySelectorAll('.customer-group-chip').forEach((btn) => {
        btn.addEventListener('click', () => {
          const gid = btn.dataset.gid;
          customerGroupFilter = customerGroupFilter === gid ? null : gid;
          el.querySelectorAll('.customer-group-chip').forEach((b) =>
            b.classList.toggle('active', b.dataset.gid === customerGroupFilter)
          );
          switchCustomerTab('all');
          const phoneEl = container.querySelector('#customer-phone');
          if (phoneEl) phoneEl.placeholder = customerGroupFilter
            ? `Tìm trong nhóm: ${escapeHtml(btn.textContent)}`
            : 'Tìm tên / số điện thoại khách (ALT+C)';
        });
      });
    } catch {
      const el2 = container.querySelector('#customer-group-chips');
      if (el2 && !el2.dataset.loaded) el2.innerHTML = '<p class="no-groups">Không tải được nhóm khách.</p>';
    }
  }
  // ──────────────────────────────────────────────────────────────────────────

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
        const searchUrl = customerGroupFilter
          ? `/api/mgr/customers/search?phone=${encodeURIComponent(cart.customerPhone.trim())}&group_id=${customerGroupFilter}`
          : `/api/mgr/customers/search?phone=${encodeURIComponent(cart.customerPhone.trim())}`;
        const { customers } = await api.get(searchUrl);
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

  // ── Task 1 — khung Bán nhanh chia đôi khu vực món ─────────────────────────
  let qsDigits = '';
  let qsQty = 1;
  const qsDock = container.querySelector('#qs-dock');
  const qsToggle = container.querySelector('#sell-quick-toggle');
  const qsName = container.querySelector('#qs-name');
  const qsAddBtn = container.querySelector('#qs-add');

  const qsPrice = () => (qsDigits ? parseInt(qsDigits, 10) : 0);

  function qsRender() {
    container.querySelector('#qs-price-display').textContent = formatVND(qsPrice());
    container.querySelector('#qs-qty').textContent = String(qsQty);
    container.querySelector('#qs-total').textContent = formatVND(qsPrice() * qsQty);
    qsAddBtn.disabled = !qsName.value.trim() || qsPrice() <= 0;
  }

  function qsReset() {
    qsDigits = '';
    qsQty = 1;
    qsName.value = '';
    qsRender();
  }

  function setQuickSell(open) {
    quickSellOpen = open;
    qsDock.classList.toggle('hidden', !open);
    container.querySelector('#sell-main').classList.toggle('qs-open', open);
    qsToggle.classList.toggle('active', open);
    qsToggle.setAttribute('aria-pressed', String(open));
    if (open) qsName.focus();
  }

  qsToggle.addEventListener('click', () => setQuickSell(!quickSellOpen));
  container.querySelector('#qs-dock-close').addEventListener('click', () => setQuickSell(false));

  qsName.addEventListener('input', qsRender);
  container.querySelector('#qs-name-chips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-name]');
    if (!b) return;
    qsName.value = b.dataset.name;
    qsRender();
  });
  container.querySelector('#qs-amount-chips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-amount]');
    if (!b) return;
    qsDigits = b.dataset.amount;
    qsRender();
  });
  container.querySelector('#qs-minus').addEventListener('click', () => { qsQty = Math.max(1, qsQty - 1); qsRender(); });
  container.querySelector('#qs-plus').addEventListener('click', () => { qsQty = Math.min(QS_MAX_QTY, qsQty + 1); qsRender(); });
  container.querySelector('#qs-dock .qs-keypad').addEventListener('click', (e) => {
    const b = e.target.closest('.qs-key');
    if (!b) return;
    const k = b.dataset.k;
    if (k === 'clear') qsDigits = '';
    else if (k === 'back') qsDigits = qsDigits.slice(0, -1);
    // Bỏ số 0 dư ở đầu (vd "0" + "5" phải ra "5", không phải "05").
    else if (qsDigits.length < QS_MAX_DIGITS) qsDigits = qsDigits === '0' ? k : qsDigits + k;
    qsRender();
  });

  // ── Task 6 — 5 món tự gõ gần nhất CỦA QUÁN thay 5 tên viết cứng ───────────
  let quickNames = [...QS_NAMES];

  function renderQuickNames() {
    const box = container.querySelector('#qs-name-chips');
    if (!box) return;
    box.innerHTML = quickNames
      .map((n) => `<button type="button" class="chip" data-name="${escapeHtml(n)}">${escapeHtml(n)}</button>`)
      .join('');
  }

  // Quán chưa bán nhanh lần nào thì máy chủ trả mảng rỗng — GIỮ 5 tên dự phòng, đừng để khung trống.
  async function loadQuickNames() {
    try {
      const res = await api.get('/api/mgr/menu/quick-names');
      const names = (res.names || []).filter((n) => String(n || '').trim());
      if (names.length) { quickNames = names.slice(0, QS_NAME_LIMIT); renderQuickNames(); }
    } catch { /* lỗi mạng: vẫn dùng 5 tên dự phòng, không chặn bán hàng */ }
  }

  qsAddBtn.addEventListener('click', () => {
    const name = qsName.value.trim();
    const price = qsPrice();
    if (!name) { toast('Vui lòng nhập tên sản phẩm', 'error'); return; }
    if (price <= 0) { toast('Vui lòng nhập giá bán', 'error'); return; }
    // Hiện ngay tên vừa gõ lên đầu danh sách gợi ý: món này thường được gọi vài lần liền nhau, chờ
    // tới lúc đơn được lưu xong mới thấy thì gợi ý tới muộn.
    quickNames = mergeQuickNames(quickNames, name);
    renderQuickNames();
    // Dòng tự do KHÔNG gộp với dòng khác dù trùng tên/giá: mỗi lần bấm là một khoản riêng, thu ngân
    // có thể sửa ghi chú từng dòng. Khoá dùng mốc thời gian nên chắc chắn không đụng khoá món thật.
    cart.items.push({
      key: `custom|${Date.now()}|${cart.items.length}`,
      menuId: null, custom: true, name, price, size: null, qty: qsQty, note: '', addons: [],
      variantId: null, unitId: null,
    });
    persist();
    renderCartItems();
    toast(`Đã thêm ${name} x${qsQty}`);
    qsReset();
    qsName.focus();
  });

  qsRender();
  loadQuickNames();

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
    cart.scheduledAt = '';
    persist();
    renderCartItems();
    renderDeliveryExtra();
    renderSched();
    renderGrid();
    const phoneEl = container.querySelector('#customer-phone');
    if (phoneEl) phoneEl.value = '';
  }

  const checkoutBtn = container.querySelector('#cart-checkout');
  const saveBtn = container.querySelector('#cart-save');

  // payNow=false ⇒ "Lưu đơn (F2)": vẫn tạo đơn thật (bếp nhận món ngay) nhưng KHÔNG mở màn thanh
  // toán — đơn nằm ở tab "Đang xử lý" chờ khách về trả tiền, đúng nút "Lưu đơn" của Sổ Bán Hàng.
  async function doCheckout({ payNow = true } = {}) {
    if (cart.items.length === 0) { toast('Giỏ hàng đang trống', 'error'); return; }
    if (cart.deliveryType === 'tai-ban' && !cart.tableNo) { toast('Vui lòng chọn bàn', 'error'); return; }
    if (cart.deliveryType === 'giao-hang' && !cart.address.trim()) { toast('Vui lòng nhập địa chỉ giao hàng', 'error'); return; }

    checkoutBtn.disabled = true; // chặn bấm 2 lần -> 2 đơn trùng nội dung
    if (saveBtn) saveBtn.disabled = true;
    const oldHtml = checkoutBtn.innerHTML;
    checkoutBtn.innerHTML = '<b>Đang tạo đơn…</b>';
    try {
      const res = await api.post('/api/mgr/orders', {
        delivery_type: cart.deliveryType,
        table_no: cart.tableNo,
        address: cart.address,
        customer_phone: cart.customerPhone,
        customer_name: cart.customerName,
        // Task 3 — mốc hẹn giao (rỗng thì máy chủ lưu NULL = giao ngay).
        scheduled_at: cart.scheduledAt || '',
        items: cart.items.map((it) => (
          // Task 1 — dòng Bán nhanh không có trong thực đơn: phải gửi cờ custom + tên + giá, nếu
          // gửi như món thường thì máy chủ không tra được menu_id và BỎ QUA cả dòng (mất tiền).
          it.custom
            ? { custom: true, name: it.name, price: it.price, qty: it.qty, note: it.note }
            : {
              id: it.menuId, qty: it.qty, size: it.size, note: it.note,
              addons: (it.addons || []).map((a) => ({ option_id: a.option_id, qty: a.qty })),
              // GĐ8-E/H — chỉ gửi mã, máy chủ tự tra giá thật (không tin giá trình duyệt gửi lên).
              variant_id: it.variantId || undefined,
              unit_id: it.unitId || undefined,
            })),
        surcharge_ids: cart.surchargeIds,
        // Task 3 đợt 6 — chiết khấu tay + ghi chú đơn. Chỉ gửi KIỂU và SỐ NHẬP, máy chủ tự tính
        // thành tiền: tin số tiền do trình duyệt gửi lên là mở đường sửa giá ngay trên máy khách.
        manual_discount: cart.discountValue > 0
          ? { type: cart.discountType, value: Number(cart.discountValue) } : undefined,
        note: cart.note || '',
      });
      if (payNow) {
        openPaymentModal(res.order, res.fees, { onDone: clearCart });
      } else {
        toast(`Đã lưu đơn ${res.order.order_code} — thu tiền sau ở màn Đơn hàng`);
        clearCart();
      }
      // Task 6 — đơn vừa lưu có thể chứa dòng bán nhanh mới; hỏi lại danh sách để máy khác cũng
      // thấy (không chặn luồng thanh toán nên không await).
      loadQuickNames();
    } catch (err) {
      toast(err?.body?.message || 'Không tạo được đơn', 'error');
    } finally {
      checkoutBtn.disabled = false;
      if (saveBtn) saveBtn.disabled = false;
      checkoutBtn.innerHTML = oldHtml;
      renderCartItems();
    }
  }
  checkoutBtn.addEventListener('click', () => doCheckout({ payNow: true }));
  if (saveBtn) saveBtn.addEventListener('click', () => doCheckout({ payNow: false }));

  // ── Ô chiết khấu + ghi chú đơn (Task 3 đợt 6) ──────────────────────────────────────────────
  const discValueEl = container.querySelector('#disc-value');
  const orderNoteEl = container.querySelector('#order-note');
  container.querySelectorAll('.disc-unit').forEach((btn) => {
    btn.addEventListener('click', () => {
      cart.discountType = btn.dataset.unit === 'percent' ? 'percent' : 'vnd';
      // Đổi VND ⇄ % mà giữ nguyên con số là "giảm 50.000đ" thành "giảm 50.000%": chặn trần 100
      // ngay lúc đổi để không bao giờ hiện ra một con số vô lý.
      if (cart.discountType === 'percent') cart.discountValue = Math.min(100, Number(cart.discountValue) || 0);
      persist();
      renderCartItems();
    });
  });
  discValueEl.addEventListener('input', () => {
    const max = cart.discountType === 'percent' ? 100 : Number.MAX_SAFE_INTEGER;
    cart.discountValue = Math.max(0, Math.min(max, Number(discValueEl.value) || 0));
    persist();
    renderCartItems();
  });
  orderNoteEl.addEventListener('input', () => { cart.note = orderNoteEl.value; persist(); });

  // Phím tắt giống app Sổ Bán Hàng (ảnh "Chú thích phím tắt").
  keyHandler = (e) => {
    if (!document.body.contains(container)) return;
    if (e.key === 'F3') { e.preventDefault(); searchInput.focus(); searchInput.select(); }
    else if (e.key === 'F1') { e.preventDefault(); doCheckout({ payNow: true }); }
    else if (e.key === 'F2') { e.preventDefault(); doCheckout({ payNow: false }); }
    else if (e.key === 'F4') { e.preventDefault(); discValueEl.focus(); discValueEl.select(); }
    else if (e.altKey && (e.key === 'c' || e.key === 'C')) { e.preventDefault(); phoneInput.focus(); }
    else if (e.altKey && (e.key === 'n' || e.key === 'N')) { e.preventDefault(); orderNoteEl.focus(); }
    // Esc: đóng khung Bán nhanh trước, bấm lần nữa mới thoát màn — tránh lỡ tay văng khỏi POS.
    else if (e.key === 'Escape' && !document.querySelector('.modal-overlay')) {
      if (quickSellOpen) { e.preventDefault(); setQuickSell(false); }
      else location.hash = '#/trang-chu';
    }
  };
  document.addEventListener('keydown', keyHandler);

  renderTabs();
  renderTypeBtn();
  renderDeliveryExtra();
  renderCartItems();

  async function loadMenu() {
    [menuData, { tables }] = await Promise.all([
      // Task 4 — sold_count do máy chủ tính, nên khoảng ngày phải gửi kèm ở đây.
      api.get(`/api/mgr/menu?sold_days=${soldDays}`),
      api.get('/api/mgr/tables'),
    ]);
    // Máy chủ trả lại khoảng nó thực sự dùng — theo đó để nhãn "Đã bán … / N ngày" không nói sai.
    if (SOLD_DAYS.includes(Number(menuData.sold_days))) soldDays = Number(menuData.sold_days);
    renderChips();
    renderToolbar();
    renderGrid();
    renderDeliveryExtra();
  }

  try {
    await loadMenu();
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
