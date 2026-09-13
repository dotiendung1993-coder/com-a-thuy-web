// T13 — Màn hình Bếp (KDS). Giao diện theo phong cách Sổ Bán Hàng.
//
// Task 5 (10/08/2026) — dựng lại bố cục bám sát 3 ảnh app.sobanhang.com/mission-control chủ quán
// gửi: thanh tiêu đề XANH LÁ ở trên, bên dưới chia ĐÔI màn hình —
//   • Nửa TRÁI  : "Đang xử lý"  (món vừa gọi, chưa ai bắt tay vào làm)
//   • Nửa PHẢI  : 2 tab "Đang chế biến (n)" / "Đã xong (n)"
// Mỗi nửa có khoảng ngày, nút đảo thứ tự và ô "Tìm món, bàn…" riêng. Thẻ món là thẻ trắng viền
// xanh bên trái, có ô tích chọn, chấm trạng thái, huy hiệu, và nút hành động bên phải
// ("Chế biến" · "Đã xong" · "Đã phục vụ"). Nửa nào không có món thì hiện hình minh hoạ + câu
// hướng dẫn, không để trống trơn.
//
// Bản trước là 3 CỘT ngang nhau (Chờ làm → Đang làm → Xong): cùng dữ liệu nhưng chia 3 nên trên
// màn 14" mỗi cột chỉ còn ~300px, tên món dài bị xuống 3 dòng. Bố cục 2 nửa của Sổ Bán Hàng rộng
// gấp rưỡi cho mỗi thẻ và gom 2 trạng thái ít dùng vào tab.
//
// Polling mỗi 3 giây, không dùng WebSocket (mạng WSL2 + tunnel hay chập chờn).
import { api } from '../api.js';
import { toast, todayVN, tableName } from '../ui.js';
import { icon } from '../icons.js';
import { addDays } from '../date-utils.js';
import { createRangePicker, rangePickerHtml } from '../date-range-picker.js';

// Escape HTML để tránh XSS khi chèn dữ liệu từ DB vào innerHTML
function esc(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Âm thanh chuông báo món mới (Web Audio API) ──────────────────────────────
function playBell() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine'; osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    osc.start(); osc.stop(ctx.currentTime + 0.8);
  } catch { /* ignore nếu browser chặn */ }
}

// ── State ─────────────────────────────────────────────────────────────────────
let items = {};           // id -> item object
let lastSince = null;     // ISO string — updated_at lớn nhất đã nhận
let pollTimer = null;
let tickTimer = null;     // cập nhật đồng hồ mỗi giây
const KDS_MUTE_KEY = 'pm_kds_mute';
export function isKdsMuted() {
  try { return localStorage.getItem(KDS_MUTE_KEY) === '1'; } catch { return false; }
}
export function setKdsMuted(on) {
  try { localStorage.setItem(KDS_MUTE_KEY, on ? '1' : '0'); } catch { /* browser blocks */ }
}
let stationFilter = '';   // '' | 'bep' | 'bar'
let lastPollOk = Date.now();
let container = null;

// Task 5 — trạng thái riêng của 2 nửa màn hình.
let rightTab = 'cooking';                       // 'cooking' | 'done'
let search = { pending: '', right: '' };        // ô "Tìm món, bàn…" của từng nửa
const collapsed = new Set();                    // khoá thẻ đang thu gọn (bấm mũi tên ˅)
const picked = new Set();                       // id phiếu đang được tích chọn

// ── Task 4 (12/08/2026) — 3 bộ lọc mới cho MỖI nửa màn hình ──────────────────
// Chủ quán: "giao diện bếp không chọn được thời gian để xem ở tất cả các giao diện; đang xử lý,
// đang chế biến, đã xong chưa có filter sắp xếp theo thời gian, trạng thái".
//   • dateRange — khoảng ngày, mở bảng lịch đôi y như màn Đơn hàng (ảnh 2 chủ quán gửi)
//   • waitMin   — chỉ hiện phiếu đã chờ ≥ N phút (ảnh 6: Tất cả · ≥5 · ≥10 · ≥15 · ≥20 · ≥25)
//   • sortMode  — Chờ lâu nhất · Ngày tạo cũ nhất · Ngày tạo mới nhất (ảnh 7)
// Hai nửa để khoảng ngày KHÁC NHAU được (đúng như ảnh: trái 09/08–10/08, phải 11/07–10/08). Máy
// chủ chỉ gọi MỘT lượt với khoảng HỢP của hai bên, rồi lọc lại theo từng nửa ở máy khách — hai
// vòng poll song song sẽ đá nhau vì cùng ghi vào `items`.
const SORT_MODES = {
  'cho-lau': 'Chờ lâu nhất',
  'cu-nhat': 'Ngày tạo cũ nhất',
  'moi-nhat': 'Ngày tạo mới nhất',
};
const WAIT_STEPS = [0, 5, 10, 15, 20, 25];
/** Khoảng mặc định = hôm qua → hôm nay, đúng bằng cửa sổ 24 giờ mà máy chủ vẫn dùng từ trước. */
function defaultRange() { const t = todayVN(); return { from: addDays(t, -1), to: t }; }
let dateRange = { pending: defaultRange(), right: defaultRange() };
let waitMin = { pending: 0, right: 0 };
let sortMode = { pending: 'cho-lau', right: 'cho-lau' };
const pickers = {};  // side → bản dựng bảng lịch

// Task 2 mục 5 (2026-08-08) — trước đây chỉ có 2 kiểu (bật/tắt gom theo đơn). Chủ quán muốn thêm
// "sắp xếp theo bàn theo món giống trên SoBanHang".
const GROUP_MODES = {
  don: 'Theo đơn',
  ban: 'Theo bàn',
  mon: 'Theo món',
  'tung-mon': 'Từng món lẻ',
};
const KDS_MODE_KEY = 'posmgr_kds_group';
function readKdsMode() {
  try {
    const v = localStorage.getItem(KDS_MODE_KEY);
    return GROUP_MODES[v] ? v : 'don';
  } catch { return 'don'; }
}
let groupMode = readKdsMode();

const POLL_MS = 3000;
const CONN_TIMEOUT_MS = 30000;

const ACTIVE_STATUSES = ['pending', 'cooking', 'done'];
// Nhãn huy hiệu trạng thái trên từng dòng món (ảnh Sổ Bán Hàng: "Mới" · "Đang chế biến").
const ROW_BADGE = { pending: 'Mới', cooking: 'Đang chế biến', done: '' };

// ── Định dạng thời gian ───────────────────────────────────────────────────────
function elapsedMin(isoTs) {
  return Math.floor((Date.now() - new Date(isoTs).getTime()) / 60000);
}

/** "32 giây" / "7 phút" / "1 giờ 5 phút" — đọc tự nhiên như app Sổ Bán Hàng. */
function humanGap(fromIso, toIso) {
  const a = new Date(fromIso).getTime();
  const b = toIso ? new Date(toIso).getTime() : Date.now();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return '';
  const sec = Math.max(0, Math.round((b - a) / 1000));
  if (sec < 60) return `${sec} giây`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} phút`;
  return `${Math.floor(min / 60)} giờ ${min % 60} phút`;
}

/** '22:02 - 09/08/2026' theo GIỜ VN (máy chủ trả mốc UTC). */
function stampVN(iso) {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '';
  const opt = { timeZone: 'Asia/Ho_Chi_Minh' };
  const t = dt.toLocaleTimeString('vi-VN', { ...opt, hour: '2-digit', minute: '2-digit', hour12: false });
  const d = dt.toLocaleDateString('vi-VN', { ...opt, day: '2-digit', month: '2-digit', year: 'numeric' });
  return `${t} - ${d}`;
}

function timerColor(minutes) {
  if (minutes < 10) return 'green';
  if (minutes < 20) return 'yellow';
  return 'red';
}

/** Huy hiệu "Lâu nhất N phút" ở đầu thẻ (ảnh Sổ Bán Hàng). */
function oldestChip(minutes) {
  const color = timerColor(minutes);
  const blink = color === 'red' ? ' kds-blink' : '';
  return `<span class="kds-chip kds-chip-${color}${blink}">Lâu nhất ${minutes} phút</span>`;
}

// Task 6 (14/08/2026) — bug xác nhận qua ảnh chủ quán gửi: đơn TẠI BÀN hiện nhãn "Mang về" thay vì
// "Bàn N". Nguyên nhân: sales_orders.delivery_type dùng giá trị 'tai-quan' (xác nhận qua DB thật
// 14/08/2026), nhưng hàm này lại so sánh với 'tai-ban' — không bao giờ khớp, luôn rơi xuống nhánh
// mặc định "Mang về" cho MỌI đơn tại bàn.
// bug-613 (03/09/2026, phát hiện khi bấm tay kiểm tên bàn): đơn ĂN TẠI QUÁN nằm trong CSDL dưới
// HAI giá trị khác nhau — 'tai-quan' (đơn khách tự quét QR gọi món, do pos-server ghi) và 'tai-ban'
// (đơn nhân viên lên ở màn Bán hàng của POS Manager). Bản vá 14/08 đổi từ 'tai-ban' sang 'tai-quan'
// nên chữa được nhóm này thì làm hỏng nhóm kia: đơn tại bàn lên từ POS Manager hiện nhãn "Mang về"
// trên màn Bếp. Máy chủ đã có bảng quy đổi ('tai-quan' -> 'tai-ban', pos-manager/config.js) nhưng
// cột delivery_type lưu nguyên giá trị gốc, nên màn Bếp phải chấp nhận CẢ HAI.
const DINE_IN_TYPES = ['tai-quan', 'tai-ban'];
function placeOf(it) {
  // Tên riêng của bàn (migration 091) do routes/kitchen.js JOIN restaurant_tables trả về; bàn chưa
  // đặt tên (hoặc đã bị xoá sau khi đơn lên) thì tableName() lùi về "Bàn <số>" như cũ.
  if (DINE_IN_TYPES.includes(it.delivery_type) && it.table_no) return esc(tableName(it));
  return it.delivery_type === 'giao-hang' ? 'Giao hàng' : 'Mang về';
}
// Task 6 (14/08/2026): tên khách + SĐT cho tiêu đề thẻ (kiểu gom mặc định "Theo đơn") — bếp cần liên
// hệ nhanh khi cần. Lùi về placeOf() (Bàn N / Giao hàng / Mang về) nếu đơn chưa có tên/SĐT khách
// (khách vãng lai chưa đăng nhập) — dữ liệu lấy từ JOIN sales_orders ở routes/kitchen.js.
function customerLabel(it) {
  const name = String(it.customer_name || '').trim();
  const phone = String(it.customer_phone || '').trim();
  if (name && phone) return `${esc(name)} · ${esc(phone)}`;
  if (name) return esc(name);
  if (phone) return esc(phone);
  return placeOf(it);
}

// ── Nút hành động của một dòng món ────────────────────────────────────────────
// Nhãn và màu đúng như ảnh: "Chế biến" viền xanh dương, "Đã xong" / "Đã phục vụ" xanh lá đặc.
function rowActions(it) {
  if (it.status === 'pending') {
    return `<button class="kds-btn kds-btn-start" data-item="${it.id}" data-action="item-cooking">${icon('bep')} Chế biến</button>
            <button class="kds-btn kds-btn-done" data-item="${it.id}" data-action="item-done">${icon('quay-lai')} Đã xong</button>`;
  }
  if (it.status === 'cooking') {
    return `<button class="kds-btn kds-btn-done" data-item="${it.id}" data-action="item-done">${icon('quay-lai')} Đã xong</button>`;
  }
  // "Gọi PV" giữ lại từ bản cũ (bắn Telegram cho nhóm phục vụ ra lấy món). Ảnh Sổ Bán Hàng không
  // có nút này vì app của họ không nối Telegram — bỏ đi là quán mất một việc đang dùng thật.
  return `<button class="kds-btn kds-btn-served" data-item="${it.id}" data-action="item-served">${icon('ok')} Đã phục vụ</button>
          <button class="kds-btn kds-btn-call" data-order="${it.order_id}" data-action="call-staff">${icon('chuong')} Gọi PV</button>`;
}

/** Dòng chữ thời gian dưới tên món — mỗi trạng thái quan tâm một khoảng khác nhau. */
function rowWaitText(it) {
  if (it.status === 'pending') return `Đã đợi trong ${humanGap(it.created_at)}`;
  if (it.status === 'cooking') return `Đang chế biến ${humanGap(it.started_at || it.created_at)}`;
  if (it.started_at && it.done_at) return `Chế biến ${humanGap(it.started_at, it.done_at)}`;
  return `Xong lúc ${stampVN(it.done_at || it.updated_at)}`;
}

function rowHtml(it) {
  const size = it.size ? ` (${esc(it.size)})` : '';
  const badge = ROW_BADGE[it.status]
    ? `<span class="kds-chip kds-chip-${it.status === 'pending' ? 'grey' : 'blue'}">${ROW_BADGE[it.status]}</span>`
    : '';
  const note = it.note ? `<div class="kds-note"><span class="kds-note-icon inline-ico">${icon('canh-bao')}</span> ${esc(it.note)}</div>` : '';
  // Task 5 (2026-08-14): mốc giờ của từng dòng món giờ có thêm nơi nhận ("Bàn N" / "Mang về" /
  // "Giao hàng") đứng trước — trước đây chỉ có giờ, khó biết dòng nào của bàn/khách nào khi nhìn
  // nhanh (đặc biệt hữu ích ở kiểu gom "Theo món": nhiều bàn khác nhau gộp chung 1 thẻ).
  const rowTime = `${placeOf(it)} - ${stampVN(it.created_at)}`;
  // Task 5 (2026-08-14): bỏ dòng "Đã đợi trong xx phút" ở TỪNG món — đầu thẻ đã có huy hiệu
  // "Lâu nhất N phút" rồi, lặp lại 2 lần/thẻ chỉ tổ rối mắt. CHỈ giữ dòng này khi đang gom "Theo
  // món" (groupMode 'mon'): lúc đó 1 thẻ gộp NHIỀU bàn/đơn khác giờ khác nhau, huy hiệu đầu thẻ chỉ
  // nói được thời gian của MÓN LÂU NHẤT, còn timing riêng từng dòng vẫn cần để biết dòng nào đang gấp.
  const waitLine = groupMode === 'mon' ? `<div class="kds-row-wait">${rowWaitText(it)}</div>` : '';
  return `
    <div class="kds-row" data-row="${it.id}">
      <input type="checkbox" class="kds-check" data-pick="${it.id}" ${picked.has(String(it.id)) ? 'checked' : ''}
        aria-label="Chọn ${esc(it.name)}" />
      <span class="kds-qty">×${esc(it.qty)}</span>
      <div class="kds-row-main">
        <div class="kds-item-row">${esc(it.name)}${size} ${badge}</div>
        <div class="kds-row-time">${rowTime}</div>
        ${waitLine}
        ${note}
      </div>
      <div class="kds-row-act">${rowActions(it)}</div>
    </div>`;
}

// ── Một thẻ (một nhóm món) ────────────────────────────────────────────────────
function cardHtml(key, group, mode) {
  const first = group[0];
  const oldestTs = group.reduce((min, i) => Math.min(min, new Date(i.created_at).getTime()), Infinity);
  const mins = elapsedMin(new Date(oldestTs).toISOString());
  const totalQty = group.reduce((n, i) => n + Number(i.qty || 0), 0);

  let heading;
  if (mode === 'ban') heading = placeOf(first);
  else if (mode === 'mon') heading = esc(first.name);
  else if (mode === 'tung-mon') heading = `${esc(first.name)} · ${placeOf(first)}`;
  // Task 6 (14/08/2026): tiêu đề thẻ (kiểu gom mặc định "Theo đơn") trước đây hiện tên MÓN ĐẦU TIÊN —
  // chủ quán muốn hiện tên khách + SĐT để bếp liên hệ nhanh khi cần. Lùi về vị trí (placeOf) nếu đơn
  // chưa có tên/SĐT khách (khách vãng lai chưa đăng nhập).
  // Đợt 15 (24/08/2026, Task 5): CHỈ còn tên khách ở đây (in đậm) — SĐT dời xuống dòng phụ, mã đơn
  // ra ngay cạnh tên (không đậm) — xem headingCode/subline bên dưới. customerLabel() cũ gộp cả SĐT
  // vào cùng chuỗi này nên toàn bộ bị in đậm theo — không đúng ý chủ quán.
  else heading = esc(String(first.customer_name || '').trim()) || placeOf(first);
  // Task 5: mã đơn đứng ngay cạnh tên khách, KHÔNG đậm — ví dụ "ĐỖ TIẾN DŨNG (MV6911978)".
  const headingCode = mode === 'don' && first.order_code ? ` <span class="kds-card-code">(${esc(first.order_code)})</span>` : '';

  // Thẻ gộp nhiều phiếu vẫn phải nói rõ đang gộp mấy phiếu, nếu không bếp tưởng chỉ có một đơn.
  const orderIds = [...new Set(group.map((i) => i.order_id))];
  const sub = mode === 'don' || mode === 'tung-mon' ? placeOf(first)
    : orderIds.length > 1 ? `${orderIds.length} phiếu` : placeOf(first);

  const isCollapsed = collapsed.has(key);
  const statusBadge = first.status === 'cooking'
    ? '<span class="kds-chip kds-chip-blue">Đang chế biến</span>' : '';

  // Đợt 14 (24/08/2026): kiểu gom "Theo đơn" hiện tên khách làm tiêu đề — 2 đơn KHÁC NHAU có thể
  // trùng tên khách, bếp dễ nhầm giao/gọi sai đơn. Thêm dòng phụ để chắc chắn phân biệt được, chỉ
  // hiện ở kiểu gom này (các kiểu gom khác không lấy tên khách làm tiêu đề).
  // Đợt 15 (24/08/2026, Task 5): đổi dòng phụ từ "Đơn <mã> · <địa chỉ>" (mã đơn giờ đã dời lên dòng
  // 1 cạnh tên khách — xem headingCode) sang "SĐT · địa chỉ", đúng ý chủ quán muốn dòng 2 là liên hệ.
  const sublineParts = [];
  if (mode === 'don') {
    if (first.customer_phone) sublineParts.push(esc(first.customer_phone));
    if (first.address) sublineParts.push(esc(first.address));
  }
  const subline = sublineParts.join(' · ');

  return `
    <div class="kds-card kds-card-${first.status}" data-card="${esc(key)}">
      <div class="kds-card-head">
        <!-- Task 10 (2026-08-14): data-pick-status ghim ĐÚNG trạng thái của thẻ này — cùng đơn/bàn có
             thể có món đã sang "Đang chế biến" trong khi món khác vẫn "Đang xử lý", nên groupKeyOf()
             (VD "don-123") có thể trùng giữa 1 thẻ bên trái và 1 thẻ bên phải. Không ghim thêm trạng
             thái thì tích "chọn cả thẻ" ở BÊN TRÁI vô tình tích luôn món CÙNG ĐƠN đang nằm bên PHẢI. -->
        <input type="checkbox" class="kds-check" data-pick-group="${esc(key)}" data-pick-status="${first.status}"
          ${group.every((i) => picked.has(String(i.id))) ? 'checked' : ''} aria-label="Chọn cả thẻ ${heading}" />
        <div class="kds-card-title-wrap">
          <div class="kds-card-title-line"><span class="kds-dot-status"></span><span class="kds-card-title">${heading}</span>${headingCode}</div>
          ${subline ? `<div class="kds-card-subline">${subline}</div>` : ''}
        </div>
        ${statusBadge}
        ${oldestChip(mins)}
        <span class="kds-card-sub">${sub}</span>
        <span class="kds-card-count">${totalQty} món</span>
        <!-- Task 3 (2026-08-14): thay mũi tên ký tự "˅" thô/không chuyên nghiệp bằng SVG chevron
             CHUẨN đang dùng chung toàn app (sidebar-group, dropdown Đơn hàng — xem .chevron ở
             app.css) để nút thu gọn/mở thẻ đồng bộ phong cách với phần còn lại của POS Manager. -->
        <button type="button" class="kds-caret${isCollapsed ? ' up' : ''}" data-toggle="${esc(key)}"
          aria-label="${isCollapsed ? 'Mở' : 'Thu gọn'} thẻ" aria-expanded="${isCollapsed ? 'false' : 'true'}">
          <svg class="chevron" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
        </button>
      </div>
      <div class="kds-card-body${isCollapsed ? ' hidden' : ''}">${group.map(rowHtml).join('')}</div>
    </div>`;
}

// Hình minh hoạ khi một nửa màn hình không có món nào (đúng chỗ ảnh Sổ Bán Hàng đặt tấm bảng ghi
// chú có 3 dấu tích). Vẽ thẳng bằng SVG để không phải tải thêm tệp ảnh.
const EMPTY_ART = `
  <svg class="kds-empty-art" viewBox="0 0 120 120" fill="none" aria-hidden="true">
    <rect x="26" y="16" width="68" height="88" rx="8" fill="#EDEFF1"/>
    <rect x="34" y="24" width="52" height="72" rx="5" fill="#fff"/>
    <rect x="48" y="10" width="24" height="12" rx="4" fill="#8FCFA3"/>
    <circle cx="46" cy="42" r="7" fill="#57BB7B"/><rect x="58" y="39" width="22" height="5" rx="2.5" fill="#D5D9DD"/>
    <circle cx="46" cy="58" r="7" fill="#57BB7B"/><rect x="58" y="55" width="22" height="5" rx="2.5" fill="#D5D9DD"/>
    <circle cx="46" cy="74" r="7" fill="#57BB7B"/><rect x="58" y="71" width="22" height="5" rx="2.5" fill="#D5D9DD"/>
    <circle cx="46" cy="88" r="5" fill="#D5D9DD"/><rect x="58" y="86" width="16" height="5" rx="2.5" fill="#E6E9EC"/>
  </svg>`;

const EMPTY_TEXT = {
  pending: ['Không có món chờ chế biến', 'Các món mới gọi sẽ hiện ở đây'],
  cooking: ['Không có món đang chế biến', 'Các món đang chế biến sẽ hiện ở đây'],
  done: ['Không có món đã xong', 'Các món làm xong sẽ hiện ở đây'],
};

function emptyHtml(status) {
  const [a, b] = EMPTY_TEXT[status];
  return `<div class="kds-empty">${EMPTY_ART}<p>${a}<br>${b}</p></div>`;
}

// ── Gom nhóm + lọc ────────────────────────────────────────────────────────────
function groupKeyOf(it) {
  if (groupMode === 'tung-mon') return `it-${it.id}`;
  if (groupMode === 'ban') return it.table_no ? `ban-${it.table_no}` : `don-${it.order_id}`;
  if (groupMode === 'mon') return `mon-${it.name}`;
  return `don-${it.order_id}`;
}

function matchesSearch(it, q) {
  if (!q) return true;
  const hay = `${it.name} ${it.table_no || ''} ${it.order_code || ''} ${placeOf(it)}`.toLowerCase();
  return hay.includes(q.toLowerCase());
}

/** Ngày dương lịch 'YYYY-MM-DD' theo GIỜ VN của một mốc ISO — để so với khoảng ngày đã chọn. */
export function vnDateOf(iso) {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '';
  // en-CA cho ra sẵn 'YYYY-MM-DD'; KHÔNG dùng toISOString() vì nó trả ngày UTC, từ 0h–7h sáng giờ
  // VN sẽ lùi về hôm trước (bug-062).
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(dt);
}

/**
 * Số phút "đã chờ" của một phiếu — mỗi trạng thái đo một khoảng khác nhau, đúng như dòng chữ hiện
 * dưới tên món: món mới đo từ lúc gọi, món đang làm đo từ lúc bắt tay vào, món xong đo cả quãng
 * chế biến. Dùng cho cả bộ lọc "≥ N phút" và kiểu xếp "Chờ lâu nhất".
 */
export function waitMinutesOf(it, now = Date.now()) {
  const ms = (v) => new Date(v).getTime();
  if (it.status === 'pending') return Math.floor((now - ms(it.created_at)) / 60000);
  if (it.status === 'cooking') return Math.floor((now - ms(it.started_at || it.created_at)) / 60000);
  const end = ms(it.done_at || it.updated_at);
  const start = ms(it.started_at || it.created_at);
  return Number.isFinite(end - start) ? Math.floor((end - start) / 60000) : 0;
}

/** HTML của một nửa màn hình cho đúng một trạng thái. */
function paneHtml(status, side) {
  const q = search[side];
  const { from, to } = dateRange[side];
  const now = Date.now();
  const visible = Object.values(items).filter((it) => {
    if (it.status !== status) return false;
    if (stationFilter && it.station !== stationFilter) return false;
    if (!matchesSearch(it, q)) return false;
    // Khoảng ngày của NỬA NÀY (máy chủ đã trả khoảng hợp của cả hai nửa).
    if (from && to) { const d = vnDateOf(it.created_at); if (d < from || d > to) return false; }
    if (waitMin[side] && waitMinutesOf(it, now) < waitMin[side]) return false;
    return true;
  });

  const byKey = {};
  for (const it of visible) (byKey[groupKeyOf(it)] ||= []).push(it);

  const oldest = (g) => Math.min(...g.map((i) => new Date(i.created_at).getTime()));
  const newest = (g) => Math.max(...g.map((i) => new Date(i.created_at).getTime()));
  const longestWait = (g) => Math.max(...g.map((i) => waitMinutesOf(i, now)));
  const mode = sortMode[side];
  const groups = Object.entries(byKey).sort((a, b) => {
    if (mode === 'cu-nhat') return oldest(a[1]) - oldest(b[1]);
    if (mode === 'moi-nhat') return newest(b[1]) - newest(a[1]);
    // 'cho-lau': chờ lâu nhất lên đầu; hoà thì phiếu gọi trước đứng trước.
    return longestWait(b[1]) - longestWait(a[1]) || oldest(a[1]) - oldest(b[1]);
  });

  // Đợt 17 (25/08/2026, Task báo lại): số trong "Đang xử lý (N)"/"Đang chế biến (N)"/"Đã xong (N)"
  // phải đếm THEO ĐÚNG KIỂU GOM đang chọn (đơn/bàn/món/từng món lẻ) — trước đây luôn đếm SỐ MÓN
  // (visible.length), sai với kiểu gom "Theo đơn"/"Theo bàn"/"Theo món" (phải đếm số THẺ, tức số
  // đơn/bàn/tên món khác nhau). byKey ở trên đã gom đúng theo groupMode rồi — đếm số khoá (số thẻ)
  // thay vì số dòng món. Ở kiểu "Từng món lẻ", mỗi món tự là 1 thẻ riêng nên số thẻ == số món ==
  // số suất, vẫn đúng như trước (không đổi hành vi ở kiểu gom đó).
  return {
    count: Object.keys(byKey).length,
    html: groups.length
      ? groups.map(([key, g]) => cardHtml(key, g, groupMode)).join('')
      : emptyHtml(status),
  };
}

// ── Render toàn bộ bảng ───────────────────────────────────────────────────────
function renderBoard() {
  if (!container) return;
  const board = container.querySelector('#kds-board');
  if (!board) return;

  const left = paneHtml('pending', 'pending');
  const right = paneHtml(rightTab, 'right');
  // Số đếm trên 2 tab phải KHÔNG phụ thuộc tab đang mở, nếu không bếp bấm sang tab kia mới biết
  // bên đó có món — đúng thứ ảnh Sổ Bán Hàng hiện sẵn "Đang chế biến (1) / Đã xong (0)".
  const cookingCount = paneHtml('cooking', 'right').count;
  const doneCount = paneHtml('done', 'right').count;

  board.querySelector('#kds-pane-left .kds-col-body').innerHTML = left.html;
  board.querySelector('#kds-pane-right .kds-col-body').innerHTML = right.html;
  // Task 5 (24/08/2026, đợt 15): thêm số lượng vào tiêu đề "Đang xử lý", giống "Đang chế biến (N)"
  // / "Đã xong (N)" bên cột phải — trước đây tiêu đề cột trái không có số.
  board.querySelector('#kds-pending-title').textContent = `Đang xử lý (${left.count})`;
  board.querySelector('#kds-tab-cooking').textContent = `Đang chế biến (${cookingCount})`;
  board.querySelector('#kds-tab-done').textContent = `Đã xong (${doneCount})`;
  board.querySelectorAll('.kds-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === rightTab));

  // Thanh hành động hàng loạt — TÁCH riêng theo cột (Task 10, 2026-08-14): cột trái chỉ tính món
  // "pending" (Đang xử lý), cột phải chỉ tính món đang ở tab đang mở bên phải (Đang chế biến/Đã
  // xong). Mỗi cột tự ẩn/hiện + tự cảnh báo "khác trạng thái" ĐỘC LẬP — tích 1 món mỗi bên không
  // còn báo nhầm "khác trạng thái" nữa vì giờ 2 cột không dùng chung 1 danh sách hiển thị.
  const pickedItems = [...picked].map((id) => items[id]).filter(Boolean);
  const renderBulkSide = (side, matchStatus) => {
    const bar = container.querySelector(`#kds-bulk-${side}`);
    if (!bar) return;
    const list = pickedItems.filter((it) => matchStatus(it.status));
    bar.classList.toggle('hidden', list.length === 0);
    if (!list.length) return;
    container.querySelector(`#kds-bulk-count-${side}`).textContent = `Đã chọn ${list.length} món`;
    // Chỉ mời làm việc mà MỌI món đã chọn đều làm được: trộn món "Mới" với món "Đã xong" rồi bấm
    // "Đã xong" thì nửa số món bị máy chủ từ chối và bếp không hiểu vì sao.
    const allSame = list.every((it) => it.status === list[0].status);
    // Đổi data-item / data-order của thẻ mẫu thành data-bulk-status=<trạng thái nguồn> để
    // handleAction() biết vừa làm hàng loạt VÀ chỉ áp cho món cùng trạng thái này (Task 10,
    // 2026-08-14: trước đây dùng data-bulk="1" chung nên bấm nút hàng loạt ở 1 cột lại vô tình áp
    // cho CẢ món đang tích ở cột kia — 2 cột giờ tách bạch, action mỗi cột chỉ được đụng đúng cột đó).
    container.querySelector(`#kds-bulk-actions-${side}`).innerHTML = allSame
      ? rowActions(list[0]).replace(/data-(item|order)="\d+"/g, `data-bulk-status="${list[0].status}"`)
      : '<span class="kds-bulk-warn">Các món đang ở trạng thái khác nhau — chọn cùng loại để làm hàng loạt.</span>';
  };
  renderBulkSide('pending', (st) => st === 'pending');
  renderBulkSide('right', (st) => st === 'cooking' || st === 'done');

  // Chấm kết nối
  const elapsed = Date.now() - lastPollOk;
  const dot = container.querySelector('#kds-conn-dot');
  const label = container.querySelector('#kds-conn-label');
  if (dot && label) {
    if (elapsed > CONN_TIMEOUT_MS) {
      dot.className = 'kds-dot kds-dot-red';
      label.textContent = 'MẤT KẾT NỐI';
    } else {
      dot.className = 'kds-dot kds-dot-green';
      label.textContent = 'Đang kết nối';
    }
  }
}

// ── Polling ───────────────────────────────────────────────────────────────────
/** Khoảng ngày HỢP của hai nửa — một lượt gọi máy chủ phủ được cả hai bên. */
export function unionRange(a, b) {
  const from = [a.from, b.from].filter(Boolean).sort()[0] || '';
  const to = [a.to, b.to].filter(Boolean).sort().slice(-1)[0] || '';
  return { from, to };
}

async function poll() {
  try {
    const params = new URLSearchParams();
    if (lastSince) params.set('since', lastSince);
    if (stationFilter) params.set('station', stationFilter);
    const u = unionRange(dateRange.pending, dateRange.right);
    if (u.from && u.to) { params.set('from', u.from); params.set('to', u.to); }
    const res = await api.get(`/api/mgr/kitchen/items?${params.toString()}`);
    const newItems = res.items || [];

    let hasNew = false;
    for (const it of newItems) {
      const isNew = !items[it.id];
      items[it.id] = it;
      if (isNew && ACTIVE_STATUSES.includes(it.status)) hasNew = true;
      // Xoá khỏi local khi served/cancelled để bảng gọn
      if (it.status === 'served' || it.status === 'cancelled') {
        delete items[it.id];
        picked.delete(String(it.id));
      }
      // Cập nhật lastSince
      if (!lastSince || it.updated_at > lastSince) lastSince = it.updated_at;
    }
    if (hasNew && !isKdsMuted()) playBell();
    lastPollOk = Date.now();
    renderBoard();
  } catch (err) {
    console.error('[kitchen poll]', err);
    renderBoard(); // cập nhật chấm đỏ
  }
}

// ── Action handlers ───────────────────────────────────────────────────────────
async function handleAction(btn) {
  const action = btn.dataset.action;
  // Nút trên thanh hàng loạt áp cho món đang tích CÙNG TRẠNG THÁI với thanh đó (data-bulk-status) —
  // Task 10 (2026-08-14): thanh hàng loạt nay tách 2 cột, không được đụng vào món cột kia dù đang
  // tích chung 1 Set `picked` toàn cục. Nút trên từng dòng vẫn chỉ áp cho đúng món đó như cũ.
  const bulkStatus = btn.dataset.bulkStatus;
  const ids = bulkStatus
    ? [...picked].filter((id) => items[id]?.status === bulkStatus)
    : [btn.dataset.item];

  if (action === 'call-staff') {
    // Bấm hàng loạt thì gọi cho từng ĐƠN, và bỏ trùng — 5 món cùng một bàn chỉ nên bắn MỘT tin
    // Telegram, không phải 5 tin liên tiếp vào nhóm phục vụ.
    const orderIds = bulkStatus
      ? [...new Set(ids.map((id) => items[id]?.order_id).filter(Boolean))]
      : [btn.dataset.order];
    try {
      await Promise.all(orderIds.map((id) => api.post('/api/mgr/kitchen/call-staff', { orderId: parseInt(id, 10) })));
      toast('Đã gọi phục vụ ra lấy món');
    } catch (err) {
      toast('Lỗi: ' + (err.message || 'Không gọi được phục vụ'), 'error');
    }
    return;
  }

  const status = { 'item-cooking': 'cooking', 'item-done': 'done', 'item-served': 'served' }[action];
  if (!status || !ids.length) return;

  try {
    await Promise.all(ids.map((id) => api.patch(`/api/mgr/kitchen/items/${id}`, { status })));
    // Task 10 (2026-08-14): chỉ bỏ tích ĐÚNG các món vừa xử lý (ids) — không picked.clear() toàn bộ,
    // nếu không món đang tích ở CỘT KIA (chưa xử lý) cũng bị bỏ tích oan theo.
    if (bulkStatus) ids.forEach((id) => picked.delete(id));
    // Lấy lại toàn bộ ngay (không chờ vòng poll 3 giây)
    lastSince = null;
    items = {};
    await poll();
  } catch (err) {
    toast('Lỗi: ' + (err.message || 'Không thể thực hiện'), 'error');
  }
}

// ── CSS nội tuyến — PHONG CÁCH SỔ BÁN HÀNG ───────────────────────────────────────────────────
// Màn Bếp KHÔNG dùng bảng đen kiểu KiotViet: nó phải cùng tông với 40 màn còn lại của POS Manager
// (nền xám rất nhạt, thẻ trắng bo góc, xanh lá #169939, viền #EAEBEC). Dùng thẳng biến màu :root
// của app.css; chỉ giữ riêng 3 màu TRẠNG THÁI (chờ = hổ phách, đang làm = lam, xong = lá) vì bếp
// cần phân biệt từ xa — đó cũng là cách Sổ Bán Hàng tô nhãn trạng thái.
const KDS_CSS = `
<style id="kds-style">
.kds-wrap { display:flex; flex-direction:column; height:100%; background:var(--bg); color:var(--text);
  font-family: Inter, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Arial, sans-serif; }
/* Toàn màn hình: trình duyệt tô nền ĐEN mặc định cho phần tử :fullscreen. Nền tối cũ vô tình che
   được, nền sáng thì lộ viền đen quanh bảng — phải tô lại đúng nền xám của app. */
:fullscreen .kds-wrap, .kds-wrap:fullscreen { background:var(--bg); }
.hidden { display:none !important; }

/* ── Thanh tiêu đề XANH LÁ (ảnh Sổ Bán Hàng) ── */
.kds-topbar {
  display:flex; align-items:center; gap:10px; padding:10px 16px; flex-wrap:wrap;
  background:var(--primary); color:#fff;
}
.kds-title { font-size:1.05rem; font-weight:800; letter-spacing:.01em; display:inline-flex; align-items:center; gap:6px; }
.kds-top-btn {
  display:inline-flex; align-items:center; gap:6px; padding:7px 14px; border-radius:20px;
  border:1px solid rgba(255,255,255,.5); background:rgba(255,255,255,.14); color:#fff;
  font-size:0.85rem; font-weight:600; text-decoration:none; cursor:pointer;
}
.kds-top-btn:hover { background:rgba(255,255,255,.26); }
.kds-top-right { margin-left:auto; display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.kds-topbar svg { width:18px; height:18px; }

/* ── Thanh công cụ trắng: lọc trạm + kiểu gom + chấm kết nối ── */
.kds-toolbar {
  display:flex; align-items:center; gap:8px; padding:10px 16px;
  background:var(--surface); border-bottom:1px solid var(--line); flex-wrap:wrap;
  box-shadow:var(--shadow-sm);
}
.kds-toolbar-sep { width:1px; height:24px; background:var(--line); margin:0 4px; flex-shrink:0; }
.kds-filter-btn {
  padding:7px 14px; border-radius:20px; border:1px solid var(--line); background:var(--surface);
  color:var(--text-2); cursor:pointer; font-size:0.85rem; font-weight:600; transition:all .15s;
}
.kds-filter-btn:hover { background:var(--primary-soft); color:var(--primary-dark); border-color:var(--primary-soft); }
.kds-filter-btn.active { background:var(--primary); border-color:var(--primary); color:#fff; }
/* Task 5 (2026-08-14): nhóm nút "Xếp theo" — thay <select>, dùng lại đúng .kds-filter-btn (viên
   thuốc bo tròn, tô đậm xanh lá khi .active) cho khỏi lệch tông với 3 nút lọc trạm bên trái. */
.kds-mode-group { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
.kds-mode-btn { white-space:nowrap; }
.kds-conn { display:flex; align-items:center; gap:5px; font-size:0.75rem; color:var(--text-2); margin-left:auto; }
.kds-dot { width:9px; height:9px; border-radius:50%; flex-shrink:0; }
.kds-dot-green { background:var(--primary); }
.kds-dot-red { background:var(--danger); animation:kds-blink-anim 1s ease infinite; }

/* ── Bảng chia ĐÔI: mỗi nửa là một thẻ trắng ── */
.kds-board { display:flex; flex:1; gap:12px; padding:12px; overflow:hidden; }
.kds-col { display:flex; flex-direction:column; flex:1; min-width:0; background:var(--surface);
  border:1px solid var(--line); border-radius:var(--radius-lg); overflow:hidden; box-shadow:var(--shadow-sm); }
.kds-col-header { padding:12px 14px 10px; border-bottom:1px solid var(--line); }
/* Đợt 15 (24/08/2026, Task 5): 800 (rất đậm) không khớp độ đậm 600 của 2 tab "Đang chế biến/Đã
   xong" bên cột phải — đổi về 600 cho thống nhất 3 trạng thái cùng 1 kiểu chữ. */
.kds-pane-title { font-size:1rem; font-weight:600; color:var(--text); margin:0 0 10px; }
/* 2 tab của nửa phải — viên thuốc xám, tab đang mở nền trắng nổi lên (ảnh Sổ Bán Hàng). */
.kds-tabs { display:inline-flex; background:#F2F3F4; border-radius:10px; padding:3px; gap:3px; margin-bottom:10px; }
.kds-tab {
  border:none; background:none; border-radius:8px; padding:7px 14px; cursor:pointer;
  font-size:0.9rem; font-weight:600; color:var(--text-3); min-height:0;
}
.kds-tab.active { background:var(--surface); color:var(--primary); box-shadow:var(--shadow-sm); }
.kds-pane-tools { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
/* Task 4 (12/08/2026) — ô ngày nay là NÚT thật mở bảng lịch đôi (dùng chung .ord-date-btn /
   .ord-date-pop của app.css). position:relative để bảng lịch bung ra bám đúng nút này. */
.kds-range-wrap { position:relative; }
.kds-range-wrap .kds-date-btn {
  width:auto; min-height:32px; padding:6px 10px; font-size:0.8rem; white-space:nowrap;
}
.kds-tool-ico {
  width:32px; min-width:32px; height:32px; min-height:32px; padding:0; border:1px solid var(--line);
  background:var(--surface); border-radius:8px; cursor:pointer; color:var(--text-2); font-size:0.9rem;
}
.kds-tool-ico:hover { border-color:var(--primary); color:var(--primary); }
.kds-tool-ico.active { border-color:var(--primary); color:var(--primary); background:var(--primary-soft); font-weight:700; }

/* Menu thả xuống của 2 nút ⧗ (lọc phút chờ) và ⇅ (kiểu sắp xếp) — ảnh 6 và 7 chủ quán gửi. */
.kds-menu-wrap { position:relative; }
.kds-menu {
  position:absolute; z-index:60; top:calc(100% + 6px); left:0; min-width:172px;
  background:var(--surface); border:1px solid var(--line); border-radius:10px;
  box-shadow:0 12px 28px rgba(16,24,32,.18); padding:6px; display:flex; flex-direction:column;
}
.kds-menu button {
  display:flex; align-items:center; justify-content:space-between; gap:12px;
  border:none; background:none; text-align:left; padding:9px 12px; border-radius:7px;
  font-size:0.88rem; color:var(--text); cursor:pointer; min-height:0; white-space:nowrap;
}
.kds-menu button:hover { background:var(--primary-soft); }
/* Mục đang chọn: chữ xanh đậm + dấu tích bên phải, giống menu của Sổ Bán Hàng. Dấu tích lấy từ
   BỘ ICON SVG chung (icon('ok')), không chèn ký tự dấu tích vào chuỗi — mọi màn của POS Manager
   đều theo quy ước này, bài kiểm T60 quét ký tự biểu tượng trong js/views/ sẽ báo lỗi. */
.kds-menu-tick { display:none; color:var(--primary); line-height:0; }
.kds-menu-tick svg { width:16px; height:16px; }
.kds-menu button.sel { color:var(--primary); font-weight:700; }
.kds-menu button.sel .kds-menu-tick { display:inline-flex; }
/* Task 1 (13/08/2026) — KHÔNG còn quy tắc ghim mép phải cho bảng lịch nửa PHẢI ở đây nữa.
   Bảng lịch nay tự tính toạ độ màn hình trong date-range-picker.js (position:fixed + kẹp trong
   khung nhìn) nên nó tự tránh mép phải; ghim thêm bằng CSS chỉ đá nhau với toạ độ tính sẵn. */
.kds-search { flex:1; min-width:120px; }
.kds-search input {
  width:100%; border:1px solid var(--line); border-radius:8px; padding:7px 10px;
  font-size:0.86rem; color:var(--text); background:var(--surface); min-height:0;
}
.kds-col-body { flex:1; overflow-y:auto; padding:12px; padding-bottom:88px; display:flex; flex-direction:column; gap:10px; background:#FAFBFB; }

/* ── Thẻ món: trắng, viền mảnh, dải màu trạng thái bên trái ── */
.kds-card { background:var(--surface); border:1px solid var(--line); border-left:5px solid var(--line);
  border-radius:var(--radius-lg); box-shadow:var(--shadow-sm); overflow:hidden; }
.kds-card-pending { border-left-color:#F59E0B; }
.kds-card-cooking { border-left-color:#3B82F6; }
.kds-card-done    { border-left-color:var(--primary); }
.kds-card-head { display:flex; align-items:center; gap:8px; padding:12px 14px; flex-wrap:wrap; }
.kds-dot-status { width:9px; height:9px; border-radius:50%; background:var(--primary); flex:none; }
.kds-card-pending .kds-dot-status { background:#F59E0B; }
.kds-card-cooking .kds-dot-status { background:#3B82F6; }
.kds-card-title { font-size:1.05rem; font-weight:800; color:var(--text); }
/* Đợt 15 (24/08/2026, Task 5): mã đơn cạnh tên khách — KHÔNG đậm, để chỉ tên khách nổi bật. */
.kds-card-code { font-size:.9rem; font-weight:500; color:var(--text-3); }
.kds-card-sub { font-size:0.8rem; color:var(--text-3); }
/* Đợt 14 (24/08/2026) — kiểu gom "Theo đơn": dòng phụ mã đơn + địa chỉ dưới tên khách, tránh nhầm
   khi 2 đơn khác nhau trùng tên khách (xem cardHtml()). */
.kds-card-title-wrap { display:flex; flex-direction:column; gap:2px; min-width:0; }
.kds-card-title-line { display:flex; align-items:center; gap:8px; }
.kds-card-subline { font-size:0.78rem; color:var(--text-3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.kds-card-count { margin-left:auto; font-size:0.85rem; color:var(--text-2); white-space:nowrap; }
/* Task 3 (2026-08-14): nút thu gọn/mở thẻ — trước là vòng tròn viền + ký tự "˅" thô, giờ dùng chung
   SVG chevron chuẩn của app (xem .chevron ở app.css) + hover/active mượt như .kds-tool-ico. */
.kds-caret {
  display:flex; align-items:center; justify-content:center;
  width:28px; min-width:28px; height:28px; min-height:28px; padding:0; border:1px solid var(--line);
  background:var(--surface); border-radius:50%; cursor:pointer; color:var(--text-2);
  transition:background .12s, border-color .12s, color .12s;
}
.kds-caret:hover { border-color:var(--primary); color:var(--primary); background:var(--primary-soft); }
.kds-caret .chevron { width:16px; height:16px; transition:transform .18s; }
.kds-caret.up .chevron { transform:rotate(180deg); }
/* Đợt 15 (24/08/2026, Task 6, sửa lại lần 2): margin:0 (bản trước) KHÔNG đủ — chủ quán test thật
   trên Windows Chrome vẫn lệch. Root cause thật: ô tích NATIVE (accent-color) của Windows vẽ hình
   checkbox có khoảng đệm nội bộ không đối xứng bên trong khung 17×17 (nằm trong lúc trình duyệt tự
   vẽ, CSS margin/width/height không sửa được phần vẽ bên trong này). Windows và máy tôi test (Linux)
   vẽ khác nhau nên trước đó tôi không thấy lệch. Fix triệt để: tự vẽ ô tích bằng CSS
   (appearance:none + ::after vẽ dấu tích) thay vì dùng khung ô tích mặc định của hệ điều hành —
   khung 17×17 lúc này do CHÍNH mình vẽ nên chắc chắn thẳng hàng trên MỌI trình duyệt/hệ điều hành.
   Đợt 16 (25/08/2026, sửa lại lần 3): appearance:none làm ô tích bị luật chung "input, select,
   textarea { min-height:44px; width:100%; padding:0 12px }" (app.css dòng 98) ĐÈ THÀNH HÌNH CHỮ
   NHẬT to — lúc còn là checkbox NATIVE, trình duyệt tự bỏ qua min-height/width:100% đó (control gốc
   có kích thước riêng, không theo min-height thường), nhưng bỏ appearance thì input hoá ra CHỈ CÒN
   LÀ 1 input bình thường, bị luật chung đó áp y hệt input chữ/ô chọn khác. Phải tự chặn LẠI từng
   thuộc tính (min-width/min-height/max-width/max-height) — không chỉ width/height — mới thắng
   được luật chung. */
.kds-check {
  appearance: none; -webkit-appearance: none;
  width: 17px; height: 17px; min-width: 17px; min-height: 17px; max-width: 17px; max-height: 17px;
  flex: none; margin: 0; padding: 0; box-sizing: border-box;
  border: 1.5px solid var(--line); border-radius: 4px; background: #fff;
  cursor: pointer; position: relative; display: inline-flex; align-items: center; justify-content: center;
}
.kds-check:checked { background: var(--primary); border-color: var(--primary); }
.kds-check:checked::after {
  content: ''; position: absolute; left: 5px; top: 2px; width: 4px; height: 8px;
  border: solid #fff; border-width: 0 2px 2px 0; transform: rotate(45deg);
}

.kds-card-body { border-top:1px solid var(--line); }
/* Đợt 17 (25/08/2026): kiểu gom "Theo món" hiện thêm dòng "Xong lúc..."/"Đã đợi trong..." (waitLine)
   khiến .kds-row-main cao tới 3 dòng — align-items:flex-start (bản cũ) ghim ô tích/×N/nút hành động
   dính sát mép TRÊN của dòng đầu, nhìn lệch hẳn lên trên so với khối chữ nhiều dòng bên cạnh. Đổi
   sang center: mọi phần tử trong hàng (ô tích, ×N, khối chữ, nút hành động) tự canh giữa theo chiều
   cao thật của hàng — kể cả khi khối chữ dài/ngắn khác nhau giữa các dòng. */
.kds-row { display:flex; align-items:center; gap:8px; padding:12px 14px; border-bottom:1px solid var(--line); }
.kds-card-body .kds-row:last-child { border-bottom:none; }
/* Đợt 14 (24/08/2026): ép cao đúng bằng ô tích (17px) để không lệch với ×N khi hàng thấp (1 dòng). */
.kds-qty {
  background:var(--primary-soft); color:var(--primary-dark); border-radius:6px; padding:0 7px;
  font-size:0.85rem; font-weight:700; flex:none; height:17px; display:inline-flex; align-items:center;
}
.kds-row-main { flex:1; min-width:0; }
.kds-item-row { font-size:1.05rem; line-height:1.5; color:var(--text); font-weight:600; }
.kds-row-time { font-size:0.8rem; color:var(--text-3); margin-top:2px; }
.kds-row-wait { font-size:0.8rem; color:var(--primary-dark); font-weight:600; margin-top:2px; }
.kds-row-act { display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; flex:none; }
.kds-note { margin-top:4px; font-size:0.9rem; color:#B45309; display:flex; gap:4px; align-items:flex-start; }
.kds-note-icon { flex-shrink:0; }

/* Huy hiệu nhỏ */
.kds-chip { font-size:0.78rem; padding:3px 9px; border-radius:999px; font-weight:700; white-space:nowrap; flex:none; }
.kds-chip-green  { background:var(--primary-soft); color:var(--primary-dark); }
.kds-chip-yellow { background:#FFF3DC; color:#B45309; }
.kds-chip-red    { background:#FDECEC; color:var(--danger); }
.kds-chip-blue   { background:#E7F0FF; color:#1D4ED8; }
.kds-chip-grey   { background:#F2F3F4; color:var(--text-2); }
@keyframes kds-blink-anim { 0%,100%{opacity:1} 50%{opacity:.35} }
.kds-blink { animation:kds-blink-anim 1s ease infinite; }

/* ── Nút hành động — to để tay dính mỡ bấm trúng, màu theo kiểu Sổ Bán Hàng ── */
.kds-btn {
  display:inline-flex; align-items:center; justify-content:center; gap:6px;
  padding:10px 16px; border:1px solid transparent; border-radius:var(--radius);
  font-size:0.95rem; font-weight:700; cursor:pointer; min-height:44px; min-width:110px;
  transition:background .12s;
}
.kds-btn svg { width:18px; height:18px; }
.kds-btn:active { opacity:.85; }
.kds-btn-start  { background:var(--surface); color:#2563EB; border-color:#93B4F5; }
.kds-btn-start:hover { background:#EFF4FF; }
.kds-btn-done   { background:var(--primary); color:#fff; }
.kds-btn-done:hover { background:var(--primary-dark); }
.kds-btn-served { background:var(--primary); color:#fff; }
.kds-btn-served:hover { background:var(--primary-dark); }
.kds-btn-call   { background:var(--surface); color:var(--text-2); border-color:var(--line); min-width:96px; }
.kds-btn-call:hover { background:var(--primary-soft); color:var(--primary-dark); }

/* ── Thanh làm hàng loạt (hiện khi tích chọn) ── */
/* Task 6 (14/08/2026): trước đây nằm cuối luồng tài liệu — nhiều đơn phải cuộn hết xuống mới bấm
   được. Ghim cố định đáy màn hình như .tabbar/.fab của app.css — bù độ rộng sidebar trên màn rộng
   (biến --sidebar-full/--sidebar-slim) và bù --tabbar-h trên điện thoại để không đè lên tab dưới. */
/* Task 10 (2026-08-14): TÁCH làm 2 cột riêng (trái = Đang xử lý, phải = Đang chế biến/Đã xong) —
   .kds-bulk-wrap là khung cố định đáy màn hình (thay .kds-bulk cũ giữ vai trò đó), mỗi .kds-bulk
   bên trong giờ chỉ là 1 nửa, tự ẩn/hiện theo đúng cột có món đang được tích. */
.kds-bulk-wrap {
  display:flex; position:fixed; left:0; right:0; bottom:var(--tabbar-h, 0); z-index:25;
  box-shadow:0 -6px 16px rgba(16,24,32,.12);
}
@media (min-width: 1024px) {
  .kds-bulk-wrap { bottom:0; left:var(--sidebar-full); }
  body.sidebar-slim .kds-bulk-wrap { left:var(--sidebar-slim); }
}
.kds-bulk {
  display:flex; align-items:center; gap:10px; flex-wrap:wrap; flex:1; min-width:0;
  padding:10px 16px; background:var(--surface); border-top:1px solid var(--line);
}
.kds-bulk:first-child:not(.hidden) { border-right:1px solid var(--line); }
@media (max-width: 900px) {
  .kds-bulk-wrap { flex-direction:column; }
  .kds-bulk:first-child:not(.hidden) { border-right:none; }
}
.kds-bulk-count { font-weight:700; color:var(--text); }
.kds-bulk-warn { font-size:0.85rem; color:#B45309; }
[id^="kds-bulk-actions-"] { display:flex; gap:8px; flex-wrap:wrap; margin-left:auto; }

/* ── Trạng thái rỗng: hình minh hoạ + 2 dòng hướng dẫn ── */
.kds-empty { color:var(--text-2); text-align:center; padding:36px 16px; font-size:0.95rem; margin:auto; }
.kds-empty-art { width:120px; height:120px; display:block; margin:0 auto 12px; }
.kds-empty p { margin:0; line-height:1.6; }

@media (max-width: 900px) {
  /* Điện thoại: 2 nửa xếp dọc, nếu để cạnh nhau thì mỗi nửa còn ~160px, không đọc nổi tên món. */
  .kds-board { flex-direction:column; overflow-y:auto; }
  .kds-row-act { width:100%; justify-content:stretch; }
  .kds-btn { flex:1; }
}
</style>`;

// ── render() — entry point gọi từ app.js ──────────────────────────────────────
export function render(el) {
  container = el;
  // Khởi tạo state
  items = {}; lastSince = null; stationFilter = ''; groupMode = readKdsMode(); lastPollOk = Date.now();
  rightTab = 'cooking';
  search = { pending: '', right: '' };
  // Task 4 — 3 bộ lọc mới cũng phải trở về mặc định mỗi lần vào lại màn, nếu không ca sau mở ra
  // vẫn dính khoảng ngày của ca trước và tưởng bếp không có đơn nào.
  dateRange = { pending: defaultRange(), right: defaultRange() };
  waitMin = { pending: 0, right: 0 };
  sortMode = { pending: 'cho-lau', right: 'cho-lau' };
  collapsed.clear();
  picked.clear();

  // Task 4 (12/08/2026) — 3 nút công cụ THẬT cho mỗi nửa: khoảng ngày (bảng lịch đôi), lọc theo
  // số phút đã chờ, và kiểu sắp xếp. Bản trước ô ngày chỉ là một dòng chữ chết ghi cứng
  // "hôm qua - hôm nay", còn nút ⇅ chỉ đảo xuôi/ngược chứ không chọn được kiểu xếp.
  const pickerIds = (side) => ({
    btn: `kds-date-btn-${side}`, label: `kds-date-label-${side}`, pop: `kds-date-pop-${side}`,
    calLeft: `kds-cal-left-${side}`, calRight: `kds-cal-right-${side}`,
    quick: `kds-quick-${side}`, yearBtn: `kds-year-btn-${side}`, yearPop: `kds-year-pop-${side}`,
    sel: `kds-sel-${side}`, clear: `kds-clear-${side}`, apply: `kds-apply-${side}`,
  });

  const menuHtml = (kind, side, items_) => `
      <div class="kds-menu-wrap">
        <button type="button" class="kds-tool-ico" data-menu="${kind}-${side}"
          title="${kind === 'wait' ? 'Lọc theo thời gian đã chờ' : 'Sắp xếp'}"
          aria-haspopup="menu" aria-expanded="false">${kind === 'wait' ? '⧗' : '⇅'}</button>
        <div class="kds-menu hidden" id="kds-menu-${kind}-${side}" role="menu">
          ${items_.map(([val, label]) => `<button type="button" role="menuitem" data-${kind}="${val}" data-side="${side}">
            <span>${label}</span><span class="kds-menu-tick">${icon('ok')}</span>
          </button>`).join('')}
        </div>
      </div>`;

  const toolsHtml = (side) => `
    <div class="kds-pane-tools">
      <div class="kds-range-wrap" id="kds-range-${side}">
        ${rangePickerHtml(pickerIds(side), 'Mọi thời gian', 'Chọn khoảng ngày', 'kds-date-btn')}
      </div>
      ${menuHtml('wait', side, WAIT_STEPS.map((n) => [String(n), n ? `≥ ${n} phút` : 'Tất cả']))}
      ${menuHtml('sort', side, Object.entries(SORT_MODES))}
      <label class="kds-search">
        <input type="search" data-search="${side}" placeholder="Tìm món, bàn…" aria-label="Tìm món, bàn" />
      </label>
    </div>`;

  el.innerHTML = KDS_CSS + `
    <div class="kds-wrap">
      <div class="kds-topbar">
        <span class="kds-title">${icon('bep')} Quản lý bếp</span>
        <a class="kds-top-btn" href="#/quan-ly-ban">${icon('quan-ly-ban')} Quản lý bàn</a>
        <span class="kds-top-right">
          <button class="kds-top-btn" id="kds-mute-btn">${icon('chuong')} Tiếng</button>
          <button class="kds-top-btn" id="kds-fs-btn" aria-label="Toàn màn hình">${icon('toan-man-hinh')}</button>
        </span>
      </div>

      <div class="kds-toolbar">
        <button class="kds-filter-btn active" data-station="">Tất cả</button>
        <button class="kds-filter-btn" data-station="bep">Bếp</button>
        <button class="kds-filter-btn" data-station="bar">Pha chế</button>
        <span class="kds-toolbar-sep"></span>
        <!-- Task 5 (2026-08-14): đổi <select> "Xếp theo" thành 1 nhóm nút to kiểu Sổ Bán Hàng (ảnh
             chủ quán gửi) — nút của kiểu đang chọn tô đậm liền, bấm 1 phát đổi ngay. <select> phải mở
             ra rồi mới chọn được, chậm hơn hẳn khi bếp đang thao tác tay dính đồ ăn/đứng xa màn hình. -->
        <div class="kds-mode-group" role="group" aria-label="Xếp theo">
          ${Object.entries(GROUP_MODES).map(([k, v]) => `<button type="button" class="kds-filter-btn kds-mode-btn${k === groupMode ? ' active' : ''}" data-mode="${k}">${v}</button>`).join('')}
        </div>
        <span class="kds-conn">
          <span id="kds-conn-dot" class="kds-dot kds-dot-green"></span>
          <span id="kds-conn-label">Đang kết nối</span>
        </span>
      </div>

      <div id="kds-board" class="kds-board">
        <div class="kds-col" id="kds-pane-left">
          <div class="kds-col-header">
            <h3 class="kds-pane-title" id="kds-pending-title">Đang xử lý</h3>
            ${toolsHtml('pending')}
          </div>
          <div class="kds-col-body"></div>
        </div>
        <div class="kds-col" id="kds-pane-right">
          <div class="kds-col-header">
            <div class="kds-tabs" role="tablist">
              <button class="kds-tab active" id="kds-tab-cooking" data-tab="cooking" role="tab">Đang chế biến (0)</button>
              <button class="kds-tab" id="kds-tab-done" data-tab="done" role="tab">Đã xong (0)</button>
            </div>
            ${toolsHtml('right')}
          </div>
          <div class="kds-col-body"></div>
        </div>
      </div>

      <!-- Task 10 (2026-08-14): TÁCH thanh hàng loạt làm 2 cột riêng — khớp bố cục 2 nửa bên trên và
           ảnh Sổ Bán Hàng chủ quán gửi (mỗi cột có thanh hàng loạt của RIÊNG cột đó). Trước đây 1
           thanh dùng chung: tích 1 món "Đang xử lý" + 1 món "Đang chế biến" (2 thẻ khác nhau, lỡ tay
           chung mã đơn) sẽ báo "khác trạng thái" dù đứng ở 2 khối tách bạch rõ ràng trên màn hình. -->
      <div class="kds-bulk-wrap">
        <div class="kds-bulk hidden" id="kds-bulk-pending">
          <span class="kds-bulk-count" id="kds-bulk-count-pending"></span>
          <button type="button" class="kds-filter-btn" data-clear="pending">Bỏ chọn</button>
          <span id="kds-bulk-actions-pending"></span>
        </div>
        <div class="kds-bulk hidden" id="kds-bulk-right">
          <span class="kds-bulk-count" id="kds-bulk-count-right"></span>
          <button type="button" class="kds-filter-btn" data-clear="right">Bỏ chọn</button>
          <span id="kds-bulk-actions-right"></span>
        </div>
      </div>
    </div>`;

  // Lọc theo trạm bếp
  el.querySelectorAll('.kds-filter-btn[data-station]').forEach((btn) => {
    btn.addEventListener('click', () => {
      stationFilter = btn.dataset.station;
      el.querySelectorAll('.kds-filter-btn[data-station]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      items = {}; lastSince = null; // reset để lấy lại toàn bộ
      poll();
    });
  });

  // Kiểu xếp thẻ — ghi nhớ để ca sau bếp không phải chọn lại. Task 5 (2026-08-14): nhóm nút thay
  // <select>, mỗi nút tự tô đậm .active đúng kiểu đang chọn.
  el.querySelectorAll('.kds-mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      groupMode = GROUP_MODES[btn.dataset.mode] ? btn.dataset.mode : 'don';
      try { localStorage.setItem(KDS_MODE_KEY, groupMode); } catch { /* chế độ riêng tư */ }
      el.querySelectorAll('.kds-mode-btn').forEach((b) => b.classList.toggle('active', b.dataset.mode === groupMode));
      collapsed.clear(); // khoá thẻ đổi theo kiểu gom, giữ lại là thu gọn nhầm thẻ khác
      renderBoard();
    });
  });

  // 2 tab của nửa phải
  el.querySelectorAll('.kds-tab').forEach((tab) => {
    tab.addEventListener('click', () => { rightTab = tab.dataset.tab; renderBoard(); });
  });

  // Ô tìm kiếm của từng nửa
  el.querySelectorAll('[data-search]').forEach((inp) => {
    inp.addEventListener('input', (e) => { search[inp.dataset.search] = e.target.value.trim(); renderBoard(); });
  });

  // ── Task 4 — bảng lịch đôi cho từng nửa ─────────────────────────────────────
  // Đổi khoảng ngày là phải XOÁ SẠCH `items` và `lastSince`: bộ nhớ đang giữ phiếu của khoảng cũ,
  // còn `since` khiến máy chủ chỉ trả phiếu MỚI THAY ĐỔI — không nạp lại thì chọn ngày khác xong
  // bảng vẫn y nguyên và bếp tưởng hôm đó không bán được gì.
  for (const side of ['pending', 'right']) {
    pickers[side] = createRangePicker(el.querySelector(`#kds-range-${side}`), pickerIds(side), {
      emptyLabel: 'Mọi thời gian',
      getFrom: () => dateRange[side].from,
      getTo: () => dateRange[side].to,
      set: (from, to) => { dateRange[side] = { from, to }; },
      onCommit: () => { items = {}; lastSince = null; picked.clear(); poll(); },
      onWarn: (m) => toast(m, 'error'),
    });
    pickers[side].syncQuick();
  }

  // ── Task 4 — menu "đã chờ ≥ N phút" và menu kiểu sắp xếp ────────────────────
  function closeMenus(except) {
    el.querySelectorAll('.kds-menu').forEach((m) => {
      if (m.id !== except) m.classList.add('hidden');
    });
    el.querySelectorAll('[data-menu]').forEach((b) => {
      b.setAttribute('aria-expanded', `kds-menu-${b.dataset.menu}` === except ? 'true' : 'false');
    });
  }
  el.querySelectorAll('[data-menu]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = `kds-menu-${btn.dataset.menu}`;
      const willOpen = el.querySelector(`#${id}`).classList.contains('hidden');
      closeMenus(willOpen ? id : null);
      if (willOpen) el.querySelector(`#${id}`).classList.remove('hidden');
    });
  });
  el.querySelectorAll('.kds-menu').forEach((menu) => {
    menu.addEventListener('click', (e) => {
      e.stopPropagation();
      const w = e.target.closest('[data-wait]');
      if (w) { waitMin[w.dataset.side] = Number(w.dataset.wait); }
      const s = e.target.closest('[data-sort]');
      if (s) { sortMode[s.dataset.side] = SORT_MODES[s.dataset.sort] ? s.dataset.sort : 'cho-lau'; }
      if (w || s) { closeMenus(null); syncToolButtons(); renderBoard(); }
    });
  });
  // Bấm ra ngoài thì đóng mọi menu (bảng lịch tự lo phần của nó trong date-range-picker.js).
  document.addEventListener('click', () => { if (container === el) closeMenus(null); });

  /** Tô đậm nút công cụ khi nửa đó đang bật bộ lọc — nhìn là biết vì sao danh sách ngắn đi. */
  function syncToolButtons() {
    for (const side of ['pending', 'right']) {
      const wb = el.querySelector(`[data-menu="wait-${side}"]`);
      if (wb) {
        wb.classList.toggle('active', waitMin[side] > 0);
        wb.title = waitMin[side] ? `Đang lọc: đã chờ ≥ ${waitMin[side]} phút` : 'Lọc theo thời gian đã chờ';
      }
      const sb = el.querySelector(`[data-menu="sort-${side}"]`);
      if (sb) {
        sb.classList.toggle('active', sortMode[side] !== 'cho-lau');
        sb.title = `Đang xếp: ${SORT_MODES[sortMode[side]]}`;
      }
      el.querySelectorAll(`#kds-menu-wait-${side} [data-wait]`).forEach((b) => {
        b.classList.toggle('sel', Number(b.dataset.wait) === waitMin[side]);
      });
      el.querySelectorAll(`#kds-menu-sort-${side} [data-sort]`).forEach((b) => {
        b.classList.toggle('sel', b.dataset.sort === sortMode[side]);
      });
    }
  }
  syncToolButtons();

  // Tắt/bật tiếng chuông.
  // currentTarget chứ không phải target: bấm trúng chữ hay trúng icon SVG bên trong đều phải
  // cập nhật đúng cái nút, không phải cái <span> con.
  const muteBtn = el.querySelector('#kds-mute-btn');
  const paintMute = () => {
    muteBtn.innerHTML = isKdsMuted()
      ? `${icon('tat-tieng')} Tắt tiếng`
      : `${icon('chuong')} Tiếng`;
  };
  paintMute();
  muteBtn.addEventListener('click', () => { setKdsMuted(!isKdsMuted()); paintMute(); });

  // Toàn màn hình
  el.querySelector('#kds-fs-btn').addEventListener('click', () => {
    if (!document.fullscreenElement) {
      el.requestFullscreen().catch(() => {});
      // Giữ màn hình luôn sáng (Wake Lock API)
      if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });

  // Bấm trong bảng: nút hành động · ô tích chọn · mũi tên thu gọn
  el.querySelector('#kds-board').addEventListener('click', (e) => {
    const btn = e.target.closest('.kds-btn');
    if (btn) { handleAction(btn); return; }
    const caret = e.target.closest('[data-toggle]');
    if (caret) {
      const key = caret.dataset.toggle;
      if (collapsed.has(key)) collapsed.delete(key); else collapsed.add(key);
      renderBoard();
    }
  });
  el.querySelector('#kds-board').addEventListener('change', (e) => {
    const one = e.target.closest('[data-pick]');
    if (one) {
      if (one.checked) picked.add(one.dataset.pick); else picked.delete(one.dataset.pick);
      renderBoard();
      return;
    }
    const grp = e.target.closest('[data-pick-group]');
    if (grp) {
      // Tích ô đầu thẻ = tích/bỏ tích MỌI món trong thẻ đó — nhưng CHỈ món cùng trạng thái với thẻ
      // đang bấm (data-pick-status). Task 10 (2026-08-14): thiếu điều kiện trạng thái khiến tích thẻ
      // bên trái (Đang xử lý) vô tình tích luôn món CÙNG group key đang nằm bên phải (Đang chế biến/
      // Đã xong) — 2 thẻ khác pane nhưng chung mã đơn/bàn/tên món vẫn trùng key nhóm.
      const key = grp.dataset.pickGroup;
      const st = grp.dataset.pickStatus;
      for (const it of Object.values(items)) {
        if (groupKeyOf(it) !== key || it.status !== st) continue;
        if (grp.checked) picked.add(String(it.id)); else picked.delete(String(it.id));
      }
      renderBoard();
    }
  });

  // Thanh hàng loạt — Task 10 (2026-08-14): 2 thanh riêng (trái/phải), nút "Bỏ chọn" của bên nào chỉ
  // bỏ tích món của ĐÚNG bên đó (không xoá sạch cả 2 cột cùng lúc).
  el.querySelectorAll('.kds-bulk [data-clear]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const isRight = btn.dataset.clear === 'right';
      for (const id of [...picked]) {
        const it = items[id];
        const matches = isRight ? (it && (it.status === 'cooking' || it.status === 'done')) : (it && it.status === 'pending');
        if (matches) picked.delete(id);
      }
      renderBoard();
    });
  });
  el.querySelector('.kds-bulk-wrap').addEventListener('click', (e) => {
    const btn = e.target.closest('.kds-btn');
    if (btn) handleAction(btn);
  });

  // Cập nhật đồng hồ mỗi giây (không cần gọi API)
  tickTimer = setInterval(renderBoard, 1000);

  // Polling
  poll();
  pollTimer = setInterval(poll, POLL_MS);
}

// Dọn dẹp khi rời màn hình
export function destroy() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  container = null;
}
