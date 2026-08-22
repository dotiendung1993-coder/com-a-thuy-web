// GĐ7 — Danh mục tính năng + tuỳ chỉnh thanh dưới / lưới lối tắt trang chủ.
// Mô phỏng 2 tính năng của app Sổ Bán Hàng: `edit_bottom_tab` và `edit_home_feature`.
// Lưu bằng localStorage (đây là sở thích của TỪNG MÁY, không phải cài đặt của cả quán)
// nên không cần bảng DB mới.

// Mỗi tính năng: route (trùng key trong ROUTES của app.js), tên hiển thị, quyền cần có, nhóm.
// perm = null nghĩa là ai đăng nhập cũng vào được.
export const FEATURES = [
  { route: 'ban-hang',          label: 'Bán hàng',          perm: null,           group: 'Bán hàng' },
  { route: 'ban-nhanh',         label: 'Bán nhanh',         perm: null,           group: 'Bán hàng' },
  { route: 'quan-ly-ban',       label: 'Quản lý bàn',       perm: null,           group: 'Bán hàng' },
  { route: 'don-hang',          label: 'Đơn hàng',          perm: null,           group: 'Bán hàng' },
  { route: 'bep',               label: 'Quản lý bếp',       perm: 'kitchen',      group: 'Bán hàng' },

  // Đợt 5 (16/08/2026) — giao diện SoBanHang v2: nhóm "Hàng hoá" tách RIÊNG khỏi "Kho" (khảo sát
  // ảnh mẫu Website v2\Hàng hoá\*, sidebar thật của app.sobanhang.com/goods/*). 6 màn khai báo
  // hàng hoá (Sản phẩm, Bán kèm, In tem mã vạch, Danh mục, Nguyên vật liệu, Công thức) gom một chỗ;
  // các màn TỒN/NHẬP-XUẤT/KIỂM KHO (việc vận hành kho, không phải khai báo) chuyển sang nhóm "Kho"
  // — sẽ làm giao diện mới riêng ở Đợt 6. "nhom-tuy-chon" đổi NHÃN thành "Bán kèm" (route giữ
  // nguyên để không vỡ dữ liệu/link cũ) vì đây chính là tính năng "Bán kèm" của Sổ Bán Hàng — file
  // nhom-tuy-chon.js vốn đã sao chép đúng cấu trúc addon group đó (xem chú thích trong file).
  { route: 'san-pham',          label: 'Sản phẩm',          perm: 'stock',        group: 'Hàng hoá' },
  { route: 'nhom-tuy-chon',     label: 'Bán kèm',           perm: 'stock',        group: 'Hàng hoá' },
  { route: 'in-tem-ma-vach',    label: 'In tem mã vạch',    perm: 'stock',        group: 'Hàng hoá' },
  { route: 'danh-muc',          label: 'Danh mục',          perm: 'stock',        group: 'Hàng hoá' },
  { route: 'nvl',               label: 'Nguyên vật liệu',   perm: 'ingredient',   group: 'Hàng hoá' },
  { route: 'cong-thuc',         label: 'Công thức',         perm: 'ingredient',   group: 'Hàng hoá' },

  // Đợt 6 (17/08/2026) — giao diện SoBanHang v2 nhóm "Quản lý kho" (ảnh mẫu Website v2\Quản lý
  // kho\*): 5 màn ĐÚNG THỨ TỰ sidebar trong ảnh — Tồn kho, Sổ kho, Sổ nhập hàng, Sổ xuất kho, Kiểm
  // kho. "Nhập / Xuất kho" (1 màn, 2 tab) TÁCH thành 2 màn riêng theo ảnh: nhap-hang.js/xuat-kho.js
  // (phiếu đầy đủ — chọn NCC, giảm giá, thanh toán/ghi nợ — xem stock-document-service.js). Nhà
  // cung cấp/Nhập-Xuất NVL/Tồn NVL không có trong ảnh mẫu đợt này, giữ nguyên vị trí sau cùng.
  { route: 'ton-kho',           label: 'Tồn kho',           perm: 'stock',        group: 'Kho' },
  { route: 'so-kho',            label: 'Sổ kho',            perm: 'stock',        group: 'Kho' },
  { route: 'nhap-hang',         label: 'Sổ nhập hàng',      perm: 'stock',        group: 'Kho' },
  { route: 'xuat-kho',          label: 'Sổ xuất kho',       perm: 'stock',        group: 'Kho' },
  { route: 'kiem-kho',          label: 'Kiểm kho',          perm: 'stock',        group: 'Kho' },
  { route: 'nhap-nvl',          label: 'Nhập / Xuất NVL',   perm: 'ingredient',   group: 'Kho' },
  { route: 'ton-nvl',           label: 'Tồn NVL',           perm: 'ingredient',   group: 'Kho' },

  // Việc 1 (18/08/2026) — nhóm "Kênh bán hàng" (ảnh mẫu Website v2\Kênh bán hàng\*, 4 mục sidebar
  // ĐÚNG THỨ TỰ: Sàn TMĐT, Đơn hàng TMĐT, Sản phẩm TMĐT, Hoá đơn TMĐT). "Đơn hàng TMĐT"/"Sản phẩm
  // TMĐT" có khoá (icon ổ khoá) NGAY TRONG ảnh gốc (tính năng trả phí của Sổ Bán Hàng) — quán chưa bán qua
  // sàn TMĐT nên chỉ làm GIAO DIỆN, không nối API thật Shopee/Lazada/TikTok Shop hay hoá đơn điện
  // tử (không có sẵn API key/tài khoản nhà cung cấp hoá đơn điện tử — đã hỏi & xác nhận với chủ
  // quán trước khi làm). perm 'report' — cùng nhóm quyền với Quản lý hoá đơn (chủ/quản lý xem).
  { route: 'san-tmdt',          label: 'Sàn TMĐT',          perm: 'report',       group: 'Kênh bán hàng' },
  { route: 'don-hang-tmdt',     label: 'Đơn hàng TMĐT',     perm: 'report',       group: 'Kênh bán hàng' },
  { route: 'san-pham-tmdt',     label: 'Sản phẩm TMĐT',     perm: 'report',       group: 'Kênh bán hàng' },
  { route: 'hoa-don-tmdt',      label: 'Hoá đơn TMĐT',      perm: 'report',       group: 'Kênh bán hàng' },

  // Việc 2 (13/08/2026) — đổi thứ tự khớp thanh tab "Tài chính" của app Sổ Bán Hàng (ảnh mẫu
  // tai-chinh (38).png): Thu chi · Sổ nợ · Sổ quỹ · Nguồn tiền. Trước đây Nguồn tiền đứng đầu vì
  // là màn khai báo gốc, nhưng nguyên tắc cũ "thứ tự tab PHẢI trùng cột trái" (09/08 đợt 3) đòi
  // đổi cả hai cùng lúc để không lệch nhau.
  { route: 'thu-chi',           label: 'Thu chi',           perm: 'cash',         group: 'Sổ tiền' },
  { route: 'so-no',             label: 'Sổ nợ',             perm: 'debt',         group: 'Sổ tiền' },
  { route: 'so-quy',            label: 'Sổ quỹ',            perm: 'cash',         group: 'Sổ tiền' },
  { route: 'nguon-tien',        label: 'Nguồn tiền',        perm: 'cash',         group: 'Sổ tiền' },

  // Đợt 7 (18/08/2026) — giao diện SoBanHang v2 nhóm "Đối tác" (ảnh mẫu Website v2\Đối tác\*,
  // 4 mục sidebar ĐÚNG THỨ TỰ trong ảnh: Khách hàng, Nhóm khách hàng, Nhà cung cấp, Hội thoại).
  // khach-hang/nhom-khach tách khỏi nhóm 'Khách hàng' cũ; nha-cung-cap tách khỏi 'Kho' — cả 3 route
  // giữ nguyên (không vỡ link/quyền cũ), chỉ đổi field group. tich-diem/khuyen-mai KHÔNG có trong
  // ảnh mẫu đợt này nên giữ nguyên ở nhóm 'Khách hàng' cũ (ngoài phạm vi task).
  { route: 'khach-hang',        label: 'Khách hàng',        perm: 'customer',     group: 'Đối tác' },
  { route: 'nhom-khach',        label: 'Nhóm khách hàng',   perm: 'customer',     group: 'Đối tác' },
  { route: 'nha-cung-cap',      label: 'Nhà cung cấp',      perm: 'ingredient',   group: 'Đối tác' },
  { route: 'hoi-thoai',         label: 'Hội thoại',         perm: null,           group: 'Đối tác' },
  { route: 'tich-diem',         label: 'Tích điểm',         perm: 'customer',     group: 'Khách hàng' },
  { route: 'khuyen-mai',        label: 'Khuyến mãi',        perm: 'promo',        group: 'Khách hàng' },

  // Việc "Thuế" (19/08/2026) — nhóm mới "Thuế" (ảnh Website v2\Thuế\Screenshot 2026-08-12 225118.png,
  // sidebar thật app.sobanhang.com hiện Thuế NGAY TRƯỚC Quản lý hoá đơn — đặt ở đây trong mảng để
  // GROUP_ORDER khớp). 3 mục ĐÚNG THỨ TỰ sidebar trong ảnh: Nhật ký kê khai, Kê khai thuế, Ước tính
  // thuế. "uoc-tinh-thue" CHUYỂN từ nhóm 'Báo cáo' sang đây (route/perm giữ nguyên, không vỡ link
  // cũ) — ảnh mẫu cho thấy nó thuộc Thuế chứ không phải Báo cáo. "thiet-lap-so-ke-toan" (wizard,
  // ảnh đang mở) là trang CON vào từ nút trong Kê khai thuế, không phải mục sidebar riêng — ẩn khỏi
  // cột trái giống cách 'thong-bao' đã làm.
  { route: 'nhat-ky-ke-khai',      label: 'Nhật ký kê khai',      perm: 'report',  group: 'Thuế' },
  { route: 'ke-khai-thue',         label: 'Kê khai thuế',         perm: 'report',  group: 'Thuế' },
  { route: 'uoc-tinh-thue',        label: 'Ước tính thuế',        perm: 'report',  group: 'Thuế' },
  { route: 'thiet-lap-so-ke-toan', label: 'Thiết lập sổ kế toán', perm: 'report',  group: 'Thuế', sidebarHidden: true },

  // Task 3 (13/08/2026) — nhóm "QUẢN LÝ HOÁ ĐƠN" của app.sobanhang.com (ảnh HD-01 → HD-06).
  // Đặt NGAY TRÊN Báo cáo đúng như app: hoá đơn là chứng từ đầu vào của báo cáo thuế.
  // Quyền 'report' — hoá đơn là số liệu tài chính, nhân viên bán hàng không cần thấy.
  { route: 'hoa-don-vao',       label: 'Hoá đơn đầu vào',   perm: 'report',       group: 'Quản lý hoá đơn' },
  { route: 'hoa-don-ra',        label: 'Hoá đơn đầu ra',    perm: 'report',       group: 'Quản lý hoá đơn' },

  // Việc "Báo cáo" (18/08/2026) — giao diện SoBanHang v2 (ảnh mẫu Website v2\Báo cáo\*, sidebar
  // ĐÚNG THỨ TỰ trong ảnh: Lãi lỗ, Bán hàng, Kho hàng). Đổi nhãn 'bao-cao-ban-hang' thành 'Bán
  // hàng' để khớp breadcrumb "Báo cáo > Bán hàng" trong ảnh (route/quyền giữ nguyên, không vỡ
  // link cũ). Giá vốn/Báo cáo thu chi/Ước tính thuế KHÔNG có trong ảnh mẫu đợt này — giữ nguyên,
  // xếp sau 3 mục khớp ảnh (ngoài phạm vi task).
  { route: 'lai-lo',            label: 'Lãi lỗ',            perm: 'report',       group: 'Báo cáo' },
  { route: 'bao-cao-ban-hang',  label: 'Bán hàng',          perm: 'report',       group: 'Báo cáo' },
  { route: 'gia-von',           label: 'Giá vốn',           perm: 'report',       group: 'Báo cáo' },
  { route: 'bao-cao-thu-chi',   label: 'Báo cáo thu chi',   perm: 'report',       group: 'Báo cáo' },
  { route: 'bao-cao-kho',       label: 'Kho hàng',          perm: 'report',       group: 'Báo cáo' },

  { route: 'nhan-vien',         label: 'Nhân viên',         perm: 'manage_staff', group: 'Quản lý' },
  { route: 'vai-tro',           label: 'Vai trò',           perm: 'manage_staff', group: 'Quản lý' },
  { route: 'quan-ly-ca',        label: 'Quản lý ca',        perm: 'shift',        group: 'Quản lý' },
  // Task 1 (09/08/2026 đợt 3) — chủ quán: "trong Cài đặt đã có Thông báo rồi, nhóm Quản lý bỏ đi".
  // Vẫn giữ trong FEATURES vì tuyến #/thong-bao còn dùng thật (chuông ở thanh trên, lối tắt trong
  // Cài đặt > Trung tâm thông báo, ô "Thêm" trên điện thoại) — chỉ ẩn khỏi cột trái.
  { route: 'thong-bao',         label: 'Thông báo',         perm: null,           group: 'Quản lý', sidebarHidden: true },
  { route: 'cai-dat',           label: 'Cài đặt',           perm: null,           group: 'Quản lý' },
];

// Thứ tự nhóm khi hiển thị ở màn "Thêm".
export const GROUP_ORDER = [
  'Bán hàng', 'Hàng hoá', 'Kho', 'Kênh bán hàng', 'Sổ tiền', 'Đối tác', 'Khách hàng',
  // Việc "Thuế" (19/08/2026) — ảnh mẫu cho thấy Thuế đứng NGAY TRƯỚC Quản lý hoá đơn. Không đụng vị
  // trí 'Quản lý' (Nhân viên/Vai trò/Ca) — ảnh chỉ xác nhận rõ Thuế-trước-Quản lý-hoá-đơn, phần còn
  // lại ngoài phạm vi việc này.
  'Thuế',
  'Quản lý hoá đơn', 'Báo cáo', 'Quản lý',
];

// Thanh dưới: ô đầu (Trang chủ) và ô cuối (Thêm) cố định, 3 ô giữa cho chủ quán tự chọn.
export const TAB_HOME = { route: 'trang-chu', label: 'Trang chủ' };
export const TAB_MORE = { route: 'them', label: 'Thêm' };
export const TAB_SLOTS = 3;

const DEFAULT_TABS = ['ban-hang', 'quan-ly-ban', 'don-hang'];
const DEFAULT_SHORTCUTS = ['ban-hang', 'ban-nhanh', 'quan-ly-ban', 'don-hang'];
export const MAX_SHORTCUTS = 8;

const KEY_TABS = 'posmgr.tabs.v1';
const KEY_SHORTCUTS = 'posmgr.shortcuts.v1';

function readList(key, fallback) {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || 'null');
    if (!Array.isArray(raw)) return [...fallback];
    const known = raw.filter((r) => typeof r === 'string' && FEATURES.some((f) => f.route === r));
    return known.length ? known : [...fallback];
  } catch {
    return [...fallback];
  }
}

function writeList(key, list) {
  try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* chế độ riêng tư: bỏ qua */ }
}

/** Nhân viên này được thấy tính năng nào (theo quyền). */
export function allowedFeatures(staff) {
  const perms = staff?.perms || {};
  return FEATURES.filter((f) => !f.perm || perms[f.perm]);
}

export function featureByRoute(route) {
  return FEATURES.find((f) => f.route === route) || null;
}

/** 3 ô giữa của thanh dưới, đã lọc theo quyền và bù mặc định nếu thiếu. */
export function getTabRoutes(staff) {
  const allowed = allowedFeatures(staff).map((f) => f.route);
  const saved = readList(KEY_TABS, DEFAULT_TABS).filter((r) => allowed.includes(r));
  const filler = [...DEFAULT_TABS, ...allowed].filter((r) => allowed.includes(r) && !saved.includes(r));
  return [...saved, ...filler].slice(0, TAB_SLOTS);
}

export function setTabRoutes(routes) {
  writeList(KEY_TABS, routes.slice(0, TAB_SLOTS));
}

/** Lưới "Dành cho bạn" ở trang chủ. */
export function getShortcutRoutes(staff) {
  const allowed = allowedFeatures(staff).map((f) => f.route);
  const saved = readList(KEY_SHORTCUTS, DEFAULT_SHORTCUTS).filter((r) => allowed.includes(r));
  if (saved.length) return saved.slice(0, MAX_SHORTCUTS);
  return DEFAULT_SHORTCUTS.filter((r) => allowed.includes(r)).slice(0, MAX_SHORTCUTS);
}

export function setShortcutRoutes(routes) {
  writeList(KEY_SHORTCUTS, routes.slice(0, MAX_SHORTCUTS));
}

export function resetNavPrefs() {
  writeList(KEY_TABS, DEFAULT_TABS);
  writeList(KEY_SHORTCUTS, DEFAULT_SHORTCUTS);
}

// ── Task 2 (13/08/2026) — "Sắp xếp vị trí" (ảnh CD-01 / CD-04) ────────────────────────────────
// Chủ quán tự đổi thứ tự và ẩn bớt mục ở cột trái. Khác 2 thứ trên: đây là cài đặt của CẢ QUÁN
// (lưu ở máy chủ, khoá `nav_order`), nhưng cột trái phải vẽ được NGAY lúc mở app — chờ gọi API
// xong mới vẽ thì menu nhấp nháy mỗi lần đổi màn. Vì vậy giữ thêm một bản sao trong localStorage:
// máy chủ là bản gốc, localStorage chỉ là bộ nhớ đệm để vẽ ngay.
const KEY_NAV_ORDER = 'posmgr.navorder.v1';

export function getNavOrder() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY_NAV_ORDER) || 'null');
    if (!raw || typeof raw !== 'object') return { order: [], hidden: [] };
    const clean = (v) => (Array.isArray(v) ? v.filter((r) => typeof r === 'string') : []);
    return { order: clean(raw.order), hidden: clean(raw.hidden) };
  } catch {
    return { order: [], hidden: [] };
  }
}

export function setNavOrder(pref) {
  try {
    localStorage.setItem(KEY_NAV_ORDER, JSON.stringify({
      order: pref?.order || [], hidden: pref?.hidden || [],
    }));
  } catch { /* chế độ riêng tư: bỏ qua, vẫn còn bản trên máy chủ */ }
}

/**
 * Áp thứ tự + danh sách ẩn lên một dãy tính năng.
 * Mục CÓ trong `order` xếp theo đúng thứ tự đó; mục KHÔNG có (tính năng mới thêm sau lần chủ quán
 * sắp xếp) rơi xuống cuối theo thứ tự gốc — nếu bỏ hẳn thì mỗi lần ra tính năng mới là nó vô hình,
 * chủ quán không bao giờ biết mà bật lên.
 */
export function applyNavOrder(features, pref = getNavOrder()) {
  const hidden = new Set(pref.hidden || []);
  const rank = new Map((pref.order || []).map((r, i) => [r, i]));
  return features
    .filter((f) => !hidden.has(f.route))
    .map((f, i) => ({ f, key: rank.has(f.route) ? rank.get(f.route) : rank.size + i }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.f);
}

export const _defaults = { DEFAULT_TABS, DEFAULT_SHORTCUTS, KEY_TABS, KEY_SHORTCUTS };

// ── Đợt 1 (15/08/2026) — Giao diện mới kiểu SoBanHang v2 ───────────────────────────────────────
// Cờ chuyển đổi cũ/mới lưu theo TỪNG MÁY (localStorage), giống mọi sở thích khác trong file này —
// không cần bảng CSDL mới, mỗi nhân viên/thiết bị tự chọn, không ảnh hưởng quán/máy khác.
export const THEME_KEY = 'posmgr.theme';

/** Giá trị lạ hoặc chưa set gì đều coi là 'v1' (giao diện cũ) — an toàn mặc định. */
export function getTheme() {
  try {
    return localStorage.getItem(THEME_KEY) === 'v2' ? 'v2' : 'v1';
  } catch {
    return 'v1';
  }
}

export function setTheme(theme) {
  try { localStorage.setItem(THEME_KEY, theme === 'v2' ? 'v2' : 'v1'); } catch { /* chế độ riêng tư: bỏ qua */ }
}

// Ô tìm kiếm trên thanh trên (đợt 1: so khớp chuỗi con trong nhãn, không phân biệt hoa/thường,
// KHÔNG tìm sâu vào màn con — xem giới hạn phạm vi ở spec mục 4.3). Trả mục khớp đầu tiên theo
// đúng thứ tự FEATURES, hoặc null nếu không khớp gì / ô trống.
export function matchFeatureLabel(query, features = FEATURES) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return null;
  return features.find((f) => f.label.toLowerCase().includes(q)) || null;
}

// Nhãn nhóm CẤP CAO bọc quanh các nhóm chi tiết hiện có — CHỈ để hiển thị ở sidebar v2, không đổi
// GROUP_ORDER/quyền. Nhóm không có trong bảng này đứng trực tiếp dưới "Trang chủ" (giống Hàng
// hoá/Kênh bán hàng không có nhãn cấp cao trong ảnh mẫu SoBanHang v2).
const SUPER_GROUP_OF = {
  'Bán hàng': 'BÁN HÀNG',   // Đợt 2 15/08 — ảnh SoBanHang v2 Đơn hàng hiện rõ nhãn BÁN HÀNG
  'Sổ tiền': 'QUẢN LÝ',
  'Đối tác': 'QUẢN LÝ',     // Đợt 7 18/08 — ảnh mẫu: nhóm Đối tác nằm ngay dưới Tài chính, cùng khối QUẢN LÝ
  'Khách hàng': 'QUẢN LÝ',
  'Thuế': 'QUẢN LÝ',        // Việc "Thuế" 19/08 — ảnh mẫu: Thuế cũng nằm trong khối QUẢN LÝ
  'Quản lý hoá đơn': 'QUẢN LÝ',
  'Báo cáo': 'QUẢN LÝ',
  'Quản lý': 'QUẢN LÝ',
};

export function superGroupOf(groupName) {
  return SUPER_GROUP_OF[groupName] || null;
}

// Đợt 3 (16/08/2026) — nhãn hiển thị nhóm cho sidebar v2 + breadcrumb. CHỈ hiển thị, KHÔNG đổi
// GROUP_ORDER/quyền/khoá localStorage collapse (posmgr.sidebar.cg vẫn dùng key gốc 'Sổ tiền') —
// giữ mọi test/logic cũ nguyên vẹn, giống cách SUPER_GROUP_OF đã làm ở Đợt 1.
const GROUP_LABEL_V2 = {
  'Sổ tiền': 'Tài chính',
};
export function groupLabelV2(groupName) {
  return GROUP_LABEL_V2[groupName] || groupName;
}
