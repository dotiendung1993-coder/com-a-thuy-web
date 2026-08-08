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
  { route: 'bep',               label: 'Bếp',               perm: 'kitchen',      group: 'Bán hàng' },

  { route: 'san-pham',          label: 'Sản phẩm',          perm: 'stock',        group: 'Hàng hoá & Kho' },
  { route: 'ton-kho',           label: 'Tồn kho',           perm: 'stock',        group: 'Hàng hoá & Kho' },
  { route: 'nhap-xuat-kho',     label: 'Nhập / Xuất kho',   perm: 'stock_manage', group: 'Hàng hoá & Kho' },
  { route: 'so-kho',            label: 'Sổ kho',            perm: 'stock',        group: 'Hàng hoá & Kho' },
  { route: 'kiem-kho',          label: 'Kiểm kho',          perm: 'stock',        group: 'Hàng hoá & Kho' },
  { route: 'nha-cung-cap',      label: 'Nhà cung cấp',      perm: 'ingredient',   group: 'Hàng hoá & Kho' },
  { route: 'nhom-tuy-chon',     label: 'Nhóm tuỳ chọn món', perm: 'stock',        group: 'Hàng hoá & Kho' },
  { route: 'danh-muc',          label: 'Danh mục sản phẩm', perm: 'stock',        group: 'Hàng hoá & Kho' },

  { route: 'nvl',               label: 'Nguyên liệu',       perm: 'ingredient',   group: 'Nguyên liệu' },
  { route: 'cong-thuc',         label: 'Công thức',         perm: 'ingredient',   group: 'Nguyên liệu' },
  { route: 'nhap-nvl',          label: 'Nhập / Xuất NVL',   perm: 'ingredient',   group: 'Nguyên liệu' },
  { route: 'ton-nvl',           label: 'Tồn NVL',           perm: 'ingredient',   group: 'Nguyên liệu' },

  { route: 'nguon-tien',        label: 'Nguồn tiền',        perm: 'cash',         group: 'Sổ tiền' },
  { route: 'thu-chi',           label: 'Thu chi',           perm: 'cash',         group: 'Sổ tiền' },
  { route: 'so-quy',            label: 'Sổ quỹ',            perm: 'cash',         group: 'Sổ tiền' },
  { route: 'so-no',             label: 'Sổ nợ',             perm: 'debt',         group: 'Sổ tiền' },

  { route: 'khach-hang',        label: 'Khách hàng',        perm: 'customer',     group: 'Khách hàng' },
  { route: 'nhom-khach',        label: 'Nhóm khách',        perm: 'customer',     group: 'Khách hàng' },
  { route: 'tich-diem',         label: 'Tích điểm',         perm: 'customer',     group: 'Khách hàng' },
  { route: 'khuyen-mai',        label: 'Khuyến mãi',        perm: 'promo',        group: 'Khách hàng' },

  { route: 'bao-cao-ban-hang',  label: 'Báo cáo bán hàng',  perm: 'report',       group: 'Báo cáo' },
  { route: 'lai-lo',            label: 'Lãi lỗ',            perm: 'report',       group: 'Báo cáo' },
  { route: 'bao-cao-thu-chi',   label: 'Báo cáo thu chi',   perm: 'report',       group: 'Báo cáo' },
  { route: 'uoc-tinh-thue',     label: 'Ước tính thuế',     perm: 'report',       group: 'Báo cáo' },
  { route: 'gia-von',           label: 'Giá vốn',           perm: 'report',       group: 'Báo cáo' },
  { route: 'bao-cao-kho',       label: 'Báo cáo kho',       perm: 'report',       group: 'Báo cáo' },

  { route: 'nhan-vien',         label: 'Nhân viên',         perm: 'manage_staff', group: 'Quản lý' },
  { route: 'vai-tro',           label: 'Vai trò',           perm: 'manage_staff', group: 'Quản lý' },
  { route: 'quan-ly-ca',        label: 'Quản lý ca',        perm: 'shift',        group: 'Quản lý' },
  { route: 'thong-bao',         label: 'Thông báo',         perm: null,           group: 'Quản lý' },
  { route: 'cai-dat',           label: 'Cài đặt',           perm: null,           group: 'Quản lý' },
];

// Thứ tự nhóm khi hiển thị ở màn "Thêm".
export const GROUP_ORDER = [
  'Bán hàng', 'Hàng hoá & Kho', 'Nguyên liệu', 'Sổ tiền', 'Khách hàng', 'Báo cáo', 'Quản lý',
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

export const _defaults = { DEFAULT_TABS, DEFAULT_SHORTCUTS, KEY_TABS, KEY_SHORTCUTS };
