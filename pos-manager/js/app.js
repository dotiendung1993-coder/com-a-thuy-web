import { api } from './api.js';
import { icon } from './icons.js';
import { escapeHtml, openModal } from './ui.js';
import {
  getTabRoutes, featureByRoute, allowedFeatures, applyNavOrder, TAB_HOME, TAB_MORE, GROUP_ORDER,
  getTheme, setTheme, superGroupOf, matchFeatureLabel, matchFeatureLabels, groupLabelV2,
} from './nav.js';
import * as loginView from './views/login.js';
import * as dangKyView from './views/dang-ky.js';
import * as quenMatKhauView from './views/quen-mat-khau.js';
import * as datLaiMatKhauView from './views/dat-lai-mat-khau.js';
import { ROLE_LABEL } from './views/staff.js';
import * as homeView from './views/home.js';
import * as sellView from './views/sell.js';
import * as quickSellView from './views/quick-sell.js';
import * as tablesView from './views/tables.js';
import * as ordersView from './views/orders.js';
import * as staffView from './views/staff.js';
import * as kitchenView from './views/kitchen.js';
import * as nguonTienView from './views/nguon-tien.js';
import * as thuChiView from './views/thu-chi.js';
import * as soQuyView from './views/so-quy.js';
import * as soNoView from './views/so-no.js';
import * as themView from './views/them.js';
import * as baoCaoBanHangView from './views/bao-cao-ban-hang.js';
import * as laiLoView from './views/lai-lo.js';
import * as baoCaoThuChiView from './views/bao-cao-thu-chi.js';
import * as uocTinhThueView from './views/uoc-tinh-thue.js';
// Việc "Thuế" (19/08/2026)
import * as nhatKyKeKhaiView from './views/nhat-ky-ke-khai.js';
import * as keKhaiThueView from './views/ke-khai-thue.js';
import * as thietLapSoKeToanView from './views/thiet-lap-so-ke-toan.js';
import * as giaVonView from './views/gia-von.js';
import * as sanPhamView from './views/san-pham.js';
import * as nhapHangView from './views/nhap-hang.js';
import * as xuatKhoView from './views/xuat-kho.js';
import * as soKhoView from './views/so-kho.js';
import * as kiemKhoView from './views/kiem-kho.js';
import * as tonKhoView from './views/ton-kho.js';
import * as nhaCungCapView from './views/nha-cung-cap.js';
// Giai đoạn 8 mục D — Nhóm tuỳ chọn món (topping)
import * as nhomTuyChonView from './views/nhom-tuy-chon.js';
import * as nvlView from './views/nvl.js';
import * as nhapNvlView from './views/nhap-nvl.js';
import * as congThucView from './views/cong-thuc.js';
import * as tonNvlView from './views/ton-nvl.js';
// Giai đoạn 6 — Khách & Vận hành
import * as khachHangView from './views/khach-hang.js';
import * as nhomKhachView from './views/nhom-khach.js';
import * as tichDiemView from './views/tich-diem.js';
import * as khuyenMaiView from './views/khuyen-mai.js';
// Đợt 7 (18/08/2026) — nhóm "Đối tác" giao diện v2: Hội thoại (màn mới)
import * as hoiThoaiView from './views/hoi-thoai.js';
import * as quanLyCaView from './views/quan-ly-ca.js';
import * as caiDatView from './views/cai-dat.js';
// Giai đoạn 8 mục K/L
import * as thongBaoView from './views/thong-bao.js';
import { loadAndApplyDisplay } from './display.js';
// Giai đoạn 9 đợt 2/3
import * as danhMucView from './views/danh-muc.js';
import * as baoCaoKhoView from './views/bao-cao-kho.js';
import * as vaiTroView from './views/vai-tro.js';
// Task 3 (13/08/2026) — Quản lý hoá đơn
import * as hoaDonVaoView from './views/hoa-don-vao.js';
import * as hoaDonRaView from './views/hoa-don-ra.js';
// Đợt 5 (17/08/2026) — In tem mã vạch tách thành màn riêng
import * as inTemMaVachView from './views/in-tem-ma-vach.js';
// Việc 1 (18/08/2026) — nhóm "Kênh bán hàng"
import * as sanTmdtView from './views/san-tmdt.js';
import * as donHangTmdtView from './views/don-hang-tmdt.js';
import * as sanPhamTmdtView from './views/san-pham-tmdt.js';
import * as hoaDonTmdtView from './views/hoa-don-tmdt.js';

// Đợt 1 (15/08/2026) — áp cờ giao diện NGAY khi module chạy, trước khi router() vẽ bất cứ gì,
// để không nháy giao diện cũ rồi mới chuyển sang mới.
document.body.dataset.theme = getTheme();

const ROUTES = {
  'dang-nhap': { title: 'Đăng nhập', requiresAuth: false, view: loginView },
  // Việc header (23/08/2026) — đăng ký tài khoản (chỉ mở khi CHƯA có chủ quán) + quên/đặt lại
  // mật khẩu qua email, thay cho tài khoản admin duy nhất tạo sẵn không tự khôi phục được.
  'dang-ky': { title: 'Đăng ký tài khoản', requiresAuth: false, view: dangKyView },
  'quen-mat-khau': { title: 'Quên mật khẩu', requiresAuth: false, view: quenMatKhauView },
  'dat-lai-mat-khau': { title: 'Đặt lại mật khẩu', requiresAuth: false, view: datLaiMatKhauView },
  'trang-chu': { title: 'Trang chủ', requiresAuth: true, view: homeView },
  'ban-hang': { title: 'Bán hàng', requiresAuth: true, view: sellView },
  'ban-nhanh': { title: 'Bán nhanh', requiresAuth: true, view: quickSellView },
  'quan-ly-ban': { title: 'Quản lý bàn', requiresAuth: true, view: tablesView },
  'don-hang': { title: 'Đơn hàng', requiresAuth: true, view: ordersView },
  'bep': { title: 'Quản lý bếp', requiresAuth: true, view: kitchenView },
  'nhan-vien': { title: 'Nhân viên', requiresAuth: true, view: staffView },
  'nguon-tien': { title: 'Nguồn tiền', requiresAuth: true, view: nguonTienView },
  'thu-chi': { title: 'Thu chi', requiresAuth: true, view: thuChiView },
  'so-quy': { title: 'Sổ quỹ', requiresAuth: true, view: soQuyView },
  'so-no': { title: 'Sổ nợ', requiresAuth: true, view: soNoView },
  'them': { title: 'Thêm', requiresAuth: true, view: themView },
  // Việc "Báo cáo" (18/08/2026) — title ngắn khớp breadcrumb ảnh mẫu SoBanHang v2 ("Báo cáo ›
  // Bán hàng" / "Báo cáo › Lãi lỗ" / "Báo cáo › Kho hàng"). Mỗi view tự vẽ H1 đầy đủ riêng
  // ("Báo cáo bán hàng"/"Báo cáo lãi lỗ"/"Báo cáo kho hàng") bên trong container.
  'bao-cao-ban-hang': { title: 'Bán hàng', requiresAuth: true, view: baoCaoBanHangView },
  'lai-lo': { title: 'Lãi lỗ', requiresAuth: true, view: laiLoView },
  'bao-cao-thu-chi': { title: 'Báo cáo thu chi', requiresAuth: true, view: baoCaoThuChiView },
  'uoc-tinh-thue': { title: 'Ước tính thuế', requiresAuth: true, view: uocTinhThueView },
  // Việc "Thuế" (19/08/2026)
  'nhat-ky-ke-khai': { title: 'Nhật ký kê khai', requiresAuth: true, view: nhatKyKeKhaiView },
  'ke-khai-thue': { title: 'Kê khai thuế', requiresAuth: true, view: keKhaiThueView },
  'thiet-lap-so-ke-toan': { title: 'Thiết lập sổ kế toán', requiresAuth: true, view: thietLapSoKeToanView },
  'gia-von': { title: 'Giá vốn món ăn', requiresAuth: true, view: giaVonView },
  'san-pham': { title: 'Sản phẩm', requiresAuth: true, view: sanPhamView },
  'nhap-hang': { title: 'Sổ nhập hàng', requiresAuth: true, view: nhapHangView },
  'xuat-kho': { title: 'Sổ xuất kho', requiresAuth: true, view: xuatKhoView },
  'so-kho': { title: 'Sổ kho', requiresAuth: true, view: soKhoView },
  'kiem-kho': { title: 'Kiểm kho', requiresAuth: true, view: kiemKhoView },
  'ton-kho': { title: 'Tồn kho', requiresAuth: true, view: tonKhoView },
  'nha-cung-cap': { title: 'Nhà cung cấp', requiresAuth: true, view: nhaCungCapView },
  'nhom-tuy-chon': { title: 'Nhóm tuỳ chọn món', requiresAuth: true, view: nhomTuyChonView },
  'nvl': { title: 'Nguyên liệu', requiresAuth: true, view: nvlView },
  'nhap-nvl': { title: 'Nhập / Xuất NVL', requiresAuth: true, view: nhapNvlView },
  'cong-thuc': { title: 'Công thức', requiresAuth: true, view: congThucView },
  'ton-nvl': { title: 'Tồn NVL', requiresAuth: true, view: tonNvlView },
  // Giai đoạn 6
  'khach-hang': { title: 'Khách hàng', requiresAuth: true, view: khachHangView },
  'nhom-khach': { title: 'Nhóm khách', requiresAuth: true, view: nhomKhachView },
  'tich-diem': { title: 'Tích điểm', requiresAuth: true, view: tichDiemView },
  'khuyen-mai': { title: 'Khuyến mãi', requiresAuth: true, view: khuyenMaiView },
  // Đợt 7 (18/08/2026) — nhóm Đối tác
  'hoi-thoai': { title: 'Hội thoại', requiresAuth: true, view: hoiThoaiView },
  'quan-ly-ca': { title: 'Quản lý ca', requiresAuth: true, view: quanLyCaView },
  'cai-dat': { title: 'Cài đặt', requiresAuth: true, view: caiDatView },
  // Giai đoạn 8 mục K
  'thong-bao': { title: 'Thông báo', requiresAuth: true, view: thongBaoView },
  // Giai đoạn 9 đợt 2
  'danh-muc':    { title: 'Danh mục sản phẩm', requiresAuth: true, view: danhMucView },
  'bao-cao-kho': { title: 'Kho hàng',           requiresAuth: true, view: baoCaoKhoView },
  // Giai đoạn 9 đợt 3
  'vai-tro': { title: 'Vai trò', requiresAuth: true, view: vaiTroView },
  // Task 3 (13/08/2026) — Quản lý hoá đơn
  'hoa-don-vao':    { title: 'Hoá đơn đầu vào', requiresAuth: true, view: hoaDonVaoView },
  'hoa-don-ra':     { title: 'Hoá đơn đầu ra',  requiresAuth: true, view: hoaDonRaView },
  'in-tem-ma-vach': { title: 'In tem mã vạch',   requiresAuth: true, view: inTemMaVachView },
  // Việc 1 (18/08/2026) — nhóm "Kênh bán hàng"
  'san-tmdt':      { title: 'Sàn TMĐT',        requiresAuth: true, view: sanTmdtView },
  'don-hang-tmdt': { title: 'Đơn hàng TMĐT',   requiresAuth: true, view: donHangTmdtView },
  'san-pham-tmdt': { title: 'Sản phẩm TMĐT',   requiresAuth: true, view: sanPhamTmdtView },
  'hoa-don-tmdt':  { title: 'Hoá đơn TMĐT',    requiresAuth: true, view: hoaDonTmdtView },
};
const DEFAULT_ROUTE = 'trang-chu';

// Icon đại diện mỗi nhóm — dùng route của mục đầu tiên trong nhóm
const GROUP_ICON_ROUTE = {
  'Bán hàng':        'ban-hang',
  'Hàng hoá':        'san-pham',
  'Kho':             'ton-kho',
  'Sổ tiền':         'nguon-tien',
  'Đối tác':         'khach-hang',
  'Khách hàng':      'khach-hang',
  'Quản lý hoá đơn': 'hoa-don-vao',
  'Báo cáo':         'bao-cao-ban-hang',
  'Quản lý':         'nhan-vien',
  'Thuế':            'nhat-ky-ke-khai', // Việc "Thuế" 19/08 — mượn icon mục đầu trong nhóm, giống mọi nhóm khác
};

let currentStaff = null;

// ─── Task 8 (09/08/2026): submenu nổi khi cột trái đang thu gọn ───────────────────────────────
// Đặt bằng position:fixed và tự tính toạ độ: khung .sidebar có overflow-x:hidden nên submenu
// absolute bên trong sẽ bị CẮT CỤT, còn bỏ overflow đi thì cột trái mất khả năng cuộn dọc.
export function closeSidebarFlyouts() {
  document.querySelectorAll('#sidebar .sidebar-group.flyout').forEach((g) => {
    g.classList.remove('flyout');
    const items = g.querySelector('.sidebar-group-items');
    if (items) { items.style.top = ''; items.style.left = ''; }
  });
}

function openSidebarFlyout(group, btn) {
  group.classList.add('flyout');
  const items = group.querySelector('.sidebar-group-items');
  if (!items) return;
  const r = btn.getBoundingClientRect();
  items.style.left = `${r.right}px`;
  items.style.top = `${r.top}px`;
  // Nhóm ở sát đáy màn hình thì đẩy submenu lên cho khỏi tràn ra ngoài khung nhìn.
  const h = items.getBoundingClientRect().height;
  if (r.top + h > window.innerHeight - 8) {
    items.style.top = `${Math.max(8, window.innerHeight - 8 - h)}px`;
  }
}

// Bấm ra chỗ khác thì đóng submenu. Gắn MỘT LẦN ở cấp tài liệu — buildNav() chạy lại mỗi lần đổi
// màn, gắn trong đó sẽ chồng thêm listener sau mỗi lần chuyển trang.
document.addEventListener('click', (e) => {
  if (e.target.closest('#sidebar .sidebar-group-btn')) return;
  closeSidebarFlyouts();
});
window.addEventListener('resize', closeSidebarFlyouts);

// GĐ12 — địa chỉ có thể kèm tham số sau dấu "?" (vd #/cai-dat?m=mau-hoa-don) để mở thẳng một
// màn con của Cài đặt. Phần trước dấu "?" mới là tên màn.
function currentRouteName() {
  const raw = (location.hash || '').replace(/^#\//, '').split('?')[0];
  return ROUTES[raw] ? raw : DEFAULT_ROUTE;
}

function currentRouteParams() {
  const q = (location.hash || '').split('?')[1] || '';
  return Object.fromEntries(new URLSearchParams(q).entries());
}

// Màn Bán hàng chiếm TRỌN màn hình (ẩn cột trái, thanh dưới, thanh tiêu đề) đúng như
// app.sobanhang.com/pos — thoát bằng nút ✕ trên thanh xanh.
const FULLSCREEN_ROUTES = new Set(['ban-hang']);

// Mục được kéo xuống đáy cột trái thành nút riêng (giống app Sổ Bán Hàng).
const SIDEBAR_FOOTER_ROUTE = 'cai-dat';

function setNavActive(routeName) {
  document.querySelectorAll('.tabbar a, .sidebar a').forEach((a) => {
    a.classList.toggle('active', a.dataset.route === routeName);
  });
  // Đánh dấu nhóm có mục đang active, tự mở nhóm đó ra
  document.querySelectorAll('#sidebar .sidebar-group').forEach((group) => {
    const hasActive = !!group.querySelector('a.active');
    group.classList.toggle('has-active', hasActive);
    if (hasActive && !group.classList.contains('open')) group.classList.add('open');
  });
}

// Thanh dưới (mobile) + sidebar nhóm (desktop).
// Sidebar nhóm theo GROUP_ORDER của nav.js, thu gọn/mở rộng riêng từng nhóm,
// có nút toggle để thu nhỏ thành icon-only (giống sidebar Sổ Bán Hàng).
function buildNav(staff) {
  const tabbar = document.getElementById('tabbar');
  const sidebar = document.getElementById('sidebar');
  if (!tabbar || !sidebar || !staff) return;

  // ── Thanh tab dưới (mobile) ──
  const tabItems = [
    TAB_HOME,
    ...getTabRoutes(staff).map((r) => featureByRoute(r)).filter(Boolean),
    TAB_MORE,
  ];
  tabbar.innerHTML = tabItems
    .map((t) => `<a href="#/${t.route}" data-route="${t.route}">${icon(t.route)}<span>${t.label}</span></a>`)
    .join('');

  // ── Sidebar nhóm (desktop) ──
  // GĐ12 — "Cài đặt" KHÔNG nằm trong nhóm nào: app Sổ Bán Hàng để nó thành một nút riêng ở
  // ĐÁY cột trái, tách hẳn bằng một đường kẻ (xem khảo sát 07/08/2026).
  // `sidebarHidden` — màn vẫn vào được bằng đường dẫn/lối tắt nhưng không chiếm chỗ ở cột trái
  // (Thông báo đã nằm trong Cài đặt > Trung tâm thông báo, xem nav.js).
  // Task 2 (13/08/2026) — applyNavOrder: áp thứ tự + danh sách ẩn chủ quán đặt ở
  // Cài đặt > Sắp xếp vị trí menu. Đọc từ localStorage nên cột trái vẽ được ngay, không nhấp nháy.
  const features = applyNavOrder(allowedFeatures(staff)
    .filter((f) => f.route !== SIDEBAR_FOOTER_ROUTE && !f.sidebarHidden));
  const hasSettings = allowedFeatures(staff).some((f) => f.route === SIDEBAR_FOOTER_ROUTE);
  const byGroup = new Map(GROUP_ORDER.map((g) => [g, []]));
  for (const f of features) {
    if (byGroup.has(f.group)) byGroup.get(f.group).push(f);
  }

  let collapsedGroups = new Set();
  try {
    const raw = JSON.parse(localStorage.getItem('posmgr.sidebar.cg') || '[]');
    if (Array.isArray(raw)) collapsedGroups = new Set(raw);
  } catch { /* ignore */ }

  const chevronSvg = `<svg class="chevron" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>`;

  // Đợt 1 (15/08/2026) — nhãn nhóm cấp cao (QUẢN LÝ...) chỉ hiện ở giao diện v2 (xem
  // .sidebar-super-label trong theme-v2.css), in MỘT LẦN trước nhóm đầu tiên thuộc nhãn đó.
  const isV2 = getTheme() === 'v2';
  let lastSuper;
  const menuHtml = [...byGroup.entries()]
    .filter(([, items]) => items.length)
    .map(([groupName, items]) => {
      const isOpen = !collapsedGroups.has(groupName);
      const groupRoute = GROUP_ICON_ROUTE[groupName] || items[0].route;
      const itemsHtml = items.map((t) =>
        `<a href="#/${t.route}" data-route="${t.route}" class="sidebar-child">${icon(t.route)}<span>${t.label}</span></a>`
      ).join('');
      const sup = superGroupOf(groupName);
      const supHtml = sup && sup !== lastSuper ? `<div class="sidebar-super-label">${sup}</div>` : '';
      lastSuper = sup;
      return `${supHtml}<div class="sidebar-group ${isOpen ? 'open' : ''}" data-g="${groupName}">
        <button class="sidebar-group-btn" type="button" data-g="${groupName}" title="${groupName}">
          <span class="sbh-icon">${icon(groupRoute)}</span>
          <span class="g-label">${isV2 ? groupLabelV2(groupName) : groupName}</span>${chevronSvg}
        </button>
        <div class="sidebar-group-items">${itemsHtml}</div>
      </div>`;
    }).join('');

  const isSlim = localStorage.getItem('posmgr.sidebar.slim') === '1';
  // Task 1 (09/08/2026 đợt 5) — đầu cột trái là KHỐI THƯƠNG HIỆU giống app Sổ Bán Hàng (ô vuông
  // bo góc màu trắng + tên quán), không phải một nút ≡ trơ trọi.
  // Task 1 (29/08/2026) — nút thu gọn nằm NGAY TRONG hàng thương hiệu, sát mép phải, đúng chỗ nút
  // « cạnh chữ "SoBanHang" trong ảnh mẫu chủ quán gửi. Trước đây nó là <button> ANH EM của
  // .sidebar-brand: dù CSS v2 đã đặt position:static + margin-left:auto, nó vẫn là một flex-item
  // riêng của cột trái nên chiếm HẲN MỘT DÒNG dưới chữ "POS Manager" (chủ quán: "tránh bị dài").
  // Đưa vào trong .sidebar-brand là cách duy nhất để nó dùng chung dòng — không thể sửa bằng CSS.
  sidebar.innerHTML = `
    <div class="sidebar-brand">
      <span class="sidebar-brand-logo">${icon('mon-an')}</span>
      <span class="sidebar-brand-name">POS Manager</span>
      <button class="sidebar-toggle" id="sidebar-toggle" type="button" title="Thu nhỏ / Mở rộng" aria-label="Thu nhỏ / Mở rộng menu">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
    </div>
    <!-- Việc "Website v2" (03/09/2026) — ảnh mẫu có nhãn cấp cao "TỔNG QUAN" ngay trên mục đầu
         tiên. Thẻ này ẩn sẵn ở giao diện cũ (.sidebar-super-label{display:none} trong theme-v2.css). -->
    <div class="sidebar-super-label">TỔNG QUAN</div>
    <a href="#/trang-chu" data-route="trang-chu">${icon('trang-chu')}<span>Trang chủ</span></a>
    ${menuHtml}
    <div class="sidebar-footer">
      <div class="sidebar-footer-row">
        ${hasSettings ? `<a href="#/cai-dat" data-route="cai-dat" title="Cài đặt" class="sidebar-footer-link">${icon('cai-dat')}<span>Cài đặt</span></a>` : ''}
        <!-- Việc "Website v2" (03/09/2026) — ảnh mẫu có HẲN MỘT DÒNG chữ dưới "Cài đặt" (không
             phải icon trơ như trước); giao diện cũ giữ nguyên nút icon nhỏ cùng dòng để không đổi
             bố cục đã quen. Đợt 05/09/2026: chủ quán chọn chữ TRUNG LẬP "Đổi giao diện" (không lộ
             khái niệm cũ/mới với nhân viên) thay cho câu mô tả đường về bản trước — xem bug-615/t104. -->
        <button type="button" class="sidebar-theme-toggle${isV2 ? ' sidebar-theme-row' : ''}" id="sidebar-theme-toggle"
                title="Đổi giao diện" aria-label="Đổi giao diện">
          ${icon('doi-giao-dien')}${isV2 ? '<span>Đổi giao diện</span>' : ''}
        </button>
      </div>
    </div>`;

  if (isSlim) {
    sidebar.classList.add('collapsed');
    document.body.classList.add('sidebar-slim');
  }

  sidebar.querySelector('#sidebar-toggle').addEventListener('click', () => {
    const slim = sidebar.classList.toggle('collapsed');
    document.body.classList.toggle('sidebar-slim', slim);
    localStorage.setItem('posmgr.sidebar.slim', slim ? '1' : '0');
    closeSidebarFlyouts();
  });

  sidebar.querySelector('#sidebar-theme-toggle').addEventListener('click', () => {
    setTheme(getTheme() === 'v2' ? 'v1' : 'v2');
    location.reload();
  });

  sidebar.querySelectorAll('.sidebar-group-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const group = btn.closest('.sidebar-group');
      // Task 8 (09/08/2026) — cột trái đang thu gọn: bấm vào icon nhóm phải MỞ SUBMENU nổi để
      // chọn màn, chứ không nhảy thẳng vào mục đầu tiên như trước. Bản cũ khiến muốn vào "Sổ nợ"
      // lại bị ném sang "Nguồn tiền", buộc phải mở rộng cột trái ra mới đi tiếp được.
      if (sidebar.classList.contains('collapsed')) {
        e.stopPropagation();
        const wasOpen = group.classList.contains('flyout');
        closeSidebarFlyouts();
        if (!wasOpen) openSidebarFlyout(group, btn);
        return;
      }
      const open = group.classList.toggle('open');
      const g = group.dataset.g;
      if (open) collapsedGroups.delete(g);
      else collapsedGroups.add(g);
      localStorage.setItem('posmgr.sidebar.cg', JSON.stringify([...collapsedGroups]));
    });
  });

  // Chọn xong một màn thì đóng submenu lại (địa chỉ đổi -> router vẽ lại cột trái, nhưng đóng ở
  // đây để không thấy submenu chớp lại một nhịp).
  sidebar.querySelectorAll('.sidebar-group-items a').forEach((a) => {
    a.addEventListener('click', () => closeSidebarFlyouts());
  });

  const fab = document.getElementById('fab');
  if (fab) fab.innerHTML = icon('ban-hang');
}

function applyLayout() {
  const isDesktop = window.matchMedia('(min-width: 1024px)').matches;
  const hasNav = !!currentStaff;
  document.getElementById('tabbar').classList.toggle('hidden', !hasNav || isDesktop);
  document.getElementById('sidebar').classList.toggle('hidden', !hasNav || !isDesktop);
  document.getElementById('fab').classList.toggle('hidden', !hasNav);
  document.getElementById('app-header').classList.toggle('hidden', !hasNav);
  document.body.classList.toggle('no-nav', !hasNav);
  // Màn Bán hàng: ẩn toàn bộ khung app, chỉ còn thanh xanh + 3 cột của chính màn đó.
  document.body.classList.toggle('pos-full', hasNav && FULLSCREEN_ROUTES.has(currentRouteName()));
}

async function refreshMe() {
  try {
    currentStaff = await api.get('/api/mgr/auth/me');
  } catch {
    currentStaff = null;
  }
  const userEl = document.getElementById('app-user');
  if (userEl) userEl.textContent = currentStaff ? `${currentStaff.name} (${currentStaff.role})` : '';
  const userV2 = document.getElementById('app-user-v2');
  const userRole = document.getElementById('app-user-role');
  const avatar = document.getElementById('app-user-avatar');
  if (userV2) userV2.textContent = currentStaff?.name || '';
  // Việc header (23/08/2026) — dòng vai trò dưới tên, kiểu "Chủ quán · Tên quán" (đúng bố cục ảnh
  // mẫu SoBanHang "Chủ cửa hàng · TIÊN DU..."). Thiếu tên quán thì chỉ hiện vai trò, vẫn không vỡ.
  if (userRole) {
    const roleLabel = currentStaff ? (ROLE_LABEL[currentStaff.role] || currentStaff.role) : '';
    userRole.textContent = currentStaff
      ? [roleLabel, currentStaff.store_name].filter(Boolean).join(' · ')
      : '';
  }
  // Task 3 (29/08/2026) — có ảnh đại diện (chủ quán đặt ở Quản lý > Nhân viên) thì hiện ảnh,
  // không có thì vẫn là chữ cái đầu như cũ. Ảnh hỏng/URL chết -> onerror trả về chữ cái đầu.
  if (avatar) {
    const letter = currentStaff?.name ? currentStaff.name.trim().charAt(0).toUpperCase() : '';
    avatar.textContent = letter;
    if (currentStaff?.avatar_url) {
      // Dựng bằng DOM API (không innerHTML): URL ảnh là dữ liệu người dùng nhập.
      const img = document.createElement('img');
      img.alt = '';
      img.addEventListener('error', () => { avatar.textContent = letter; });
      img.src = currentStaff.avatar_url;
      avatar.textContent = '';
      avatar.appendChild(img);
    }
  }
  // GĐ8-L — áp cỡ chữ / hướng màn hình ngay khi biết là ai đang đăng nhập.
  if (currentStaff) loadAndApplyDisplay();
  return currentStaff;
}

// GĐ8-K — chấm số thông báo chưa đọc trên đầu màn hình. Chỉ hỏi máy chủ số đếm (một câu nhẹ),
// không tải cả danh sách; hỏng thì im lặng ẩn chấm chứ không chặn màn hình.
let unreadTimer = null;
async function refreshUnreadBadge() {
  const badge = document.getElementById('app-notif-badge');
  const btn = document.getElementById('app-notif');
  if (!badge || !btn) return;
  if (!currentStaff) { btn.classList.add('hidden'); return; }
  btn.classList.remove('hidden');
  try {
    const res = await api.get('/api/mgr/notifications/unread-count');
    badge.textContent = res.unread > 99 ? '99+' : String(res.unread);
    badge.classList.toggle('hidden', !res.unread);
  } catch {
    badge.classList.add('hidden');
  }
}

async function router() {
  const routeName = currentRouteName();
  const route = ROUTES[routeName];

  if (route.requiresAuth && !currentStaff) {
    await refreshMe();
  }
  if (route.requiresAuth && !currentStaff) {
    location.hash = '#/dang-nhap';
    return;
  }
  if (!route.requiresAuth && currentStaff && (routeName === 'dang-nhap' || routeName === 'dang-ky')) {
    location.hash = `#/${DEFAULT_ROUTE}`;
    return;
  }

  applyLayout();
  buildNav(currentStaff);
  setNavActive(routeName);
  refreshUnreadBadge();
  // Trang chủ dùng nền gradient xanh nhạt giống app Sổ Bán Hàng, màn khác dùng nền xám.
  document.body.classList.toggle('home-bg', routeName === 'trang-chu');
  // GĐ10 — gắn tên màn lên <body> để CSS bố cục máy tính (bán hàng 2 cột, đơn hàng nhiều cột…)
  // biết đang ở màn nào mà không phải sửa HTML của từng màn.
  document.body.dataset.route = routeName;

  // Đợt 1 (15/08/2026) — breadcrumb thanh trên (chỉ hiện ở v2, xem .v2-header-only trong
  // theme-v2.css). #app-title cũ giữ nguyên cho giao diện cũ, không đụng tới.
  const crumb = document.getElementById('app-breadcrumb');
  if (crumb) {
    const feat = featureByRoute(routeName);
    const rawGroup = feat ? feat.group : null;
    const groupLabel = rawGroup ? (getTheme() === 'v2' ? groupLabelV2(rawGroup) : rawGroup) : null;
    crumb.innerHTML = groupLabel
      ? `${icon(routeName)}<span class="crumb-group">${groupLabel}</span><span class="crumb-sep">›</span><span>${route.title}</span>`
      : `${icon(routeName)}<span>${route.title}</span>`;
  }

  const container = document.getElementById('view');
  // Gọi destroy() của view cũ nếu có (để dọn timer, polling)
  if (container._currentView && typeof container._currentView.destroy === 'function') {
    container._currentView.destroy();
  }
  container._currentView = route.view || null;

  if (route.view && typeof route.view.render === 'function') {
    route.view.render(container, {
      staff: currentStaff,
      params: currentRouteParams(),
      onLoggedIn: async () => {
        await refreshMe();
        location.hash = `#/${DEFAULT_ROUTE}`;
      },
    });
  } else {
    container.innerHTML = '';
    const h2 = document.createElement('h2');
    h2.textContent = route.title;
    const p = document.createElement('p');
    p.textContent = 'Màn hình này đang được xây dựng.';
    container.append(h2, p);
  }
}

window.addEventListener('hashchange', router);
window.addEventListener('resize', applyLayout);
document.getElementById('offline-retry').addEventListener('click', () => location.reload());

// Việc header (23/08/2026) — 3 khối thanh trên đổi hẳn cách hoạt động theo ảnh mẫu SoBanHang:
//   • Tìm kiếm: gõ tới đâu hiện khung kết quả tới đó (không phải gõ đủ rồi bấm Enter mới nhảy
//     trang như trước), có phím tắt Ctrl/Cmd+K để focus từ bất cứ đâu, mũi tên lên/xuống + Enter
//     để chọn, Esc để đóng.
//   • Chuông thông báo: mở BẢNG THẢ XUỐNG xem nhanh tại chỗ, "Xem tất cả" mới sang trang đầy đủ.
//   • Tài khoản: bấm vào mở menu (Cài đặt / Đăng xuất) — trước đây không có lối đăng xuất nào
//     ngoài xoá sạch dữ liệu máy (cai-dat.js #cd-wipe-local), giờ mới có nút đăng xuất thật.
function closeAllHeaderPopups(except) {
  const searchResults = document.getElementById('app-search-results');
  const helpPanel = document.getElementById('app-help-panel');
  const notifPanel = document.getElementById('app-notif-panel');
  const userMenu = document.getElementById('app-user-menu');
  if (searchResults && except !== searchResults) searchResults.classList.add('hidden');
  if (helpPanel && except !== helpPanel) helpPanel.classList.add('hidden');
  if (notifPanel && except !== notifPanel) notifPanel.classList.add('hidden');
  if (userMenu && except !== userMenu) userMenu.classList.add('hidden');
}

// ── Tìm kiếm ────────────────────────────────────────────────────────────────
const notifBtn = document.getElementById('app-notif');
const notifPanel = document.getElementById('app-notif-panel');
const searchInput = document.getElementById('app-search');
const searchResults = document.getElementById('app-search-results');
let searchActiveIndex = -1;

function renderSearchResults(matches) {
  if (!searchResults) return;
  if (!matches.length) {
    searchResults.innerHTML = '<div class="app-search-empty">Không tìm thấy trang, chức năng phù hợp</div>';
  } else {
    searchResults.innerHTML = matches.map((f, i) => `
      <button type="button" class="app-search-item${i === searchActiveIndex ? ' active' : ''}" data-route="${f.route}">
        ${icon(f.route)}<span>${escapeHtml(f.label)}</span>
        ${f.group ? `<span class="app-search-item-group">${escapeHtml(f.group)}</span>` : ''}
      </button>`).join('');
    searchResults.querySelectorAll('.app-search-item').forEach((btn) => {
      btn.addEventListener('click', () => selectSearchRoute(btn.dataset.route));
    });
  }
  searchResults.classList.remove('hidden');
  closeAllHeaderPopups(searchResults);
}

function selectSearchRoute(route) {
  location.hash = `#/${route}`;
  searchInput.value = '';
  searchResults.classList.add('hidden');
  searchInput.blur();
}

// Đợt 2 (23/08/2026) — chưa gõ gì thì hiện LUÔN toàn bộ chức năng, nhóm theo đúng nhãn cột trái
// (giống ảnh mẫu SoBanHang: bấm vào ô tìm kiếm là thấy danh mục ngay, không phải gõ mới ra gì đó).
// Tái dùng GROUP_ORDER/groupLabelV2 — đúng cách sidebar đang nhóm, không tạo bảng nhóm riêng.
function renderSearchFullList() {
  if (!searchResults) return;
  const features = applyNavOrder(allowedFeatures(currentStaff).filter((f) => !f.sidebarHidden));
  const byGroup = new Map(GROUP_ORDER.map((g) => [g, []]));
  for (const f of features) { if (byGroup.has(f.group)) byGroup.get(f.group).push(f); }
  const html = [...byGroup.entries()]
    .filter(([, items]) => items.length)
    .map(([groupName, items]) => `
      <div class="app-search-group-label">${escapeHtml(groupLabelV2(groupName))}</div>
      ${items.map((f) => `
        <button type="button" class="app-search-item" data-route="${f.route}">
          ${icon(f.route)}<span>${escapeHtml(f.label)}</span>
        </button>`).join('')}`).join('');
  searchResults.innerHTML = html || '<div class="app-search-empty">Chưa có chức năng nào</div>';
  searchResults.querySelectorAll('.app-search-item').forEach((btn) => {
    btn.addEventListener('click', () => selectSearchRoute(btn.dataset.route));
  });
  searchActiveIndex = -1;
  searchResults.classList.remove('hidden');
  closeAllHeaderPopups(searchResults);
}

// Việc "Website v2" (03/09/2026) — bật/tắt dạng HỘP THOẠI cho ô tìm kiếm. Khung kết quả được
// bật/tắt .hidden ở 6 chỗ khác nhau (gõ, focus, chọn mục, Esc, bấm ra ngoài, closeAllHeaderPopups)
// nên thay vì sửa cả 6 chỗ, theo dõi chính thuộc tính class của nó rồi đồng bộ lớp .open.
const searchWrap = searchInput ? searchInput.closest('.app-search') : null;
const searchCloseBtn = document.getElementById('app-search-close');
function closeSearchModal() {
  if (!searchResults) return;
  searchResults.classList.add('hidden');
  if (searchInput) { searchInput.value = ''; searchInput.blur(); }
}
if (searchWrap && searchResults) {
  const syncSearchModal = () => {
    searchWrap.classList.toggle('open', !searchResults.classList.contains('hidden'));
  };
  new MutationObserver(syncSearchModal).observe(searchResults, { attributes: true, attributeFilter: ['class'] });
  syncSearchModal();
  // Bấm vào vùng nền mờ (chính thẻ .app-search, không phải hộp trắng bên trong) thì đóng.
  searchWrap.addEventListener('click', (e) => { if (e.target === searchWrap) closeSearchModal(); });
}
if (searchCloseBtn) searchCloseBtn.addEventListener('click', closeSearchModal);

if (searchInput && searchResults) {
  searchInput.addEventListener('input', () => {
    searchActiveIndex = -1;
    if (!searchInput.value.trim()) { renderSearchFullList(); return; }
    renderSearchResults(matchFeatureLabels(searchInput.value, allowedFeatures(currentStaff)));
  });
  searchInput.addEventListener('keydown', (e) => {
    const items = () => [...searchResults.querySelectorAll('.app-search-item')];
    if (e.key === 'Escape') { searchResults.classList.add('hidden'); searchInput.blur(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const list = items();
      if (!list.length) return;
      e.preventDefault();
      searchActiveIndex = e.key === 'ArrowDown'
        ? (searchActiveIndex + 1) % list.length
        : (searchActiveIndex - 1 + list.length) % list.length;
      list.forEach((el, i) => el.classList.toggle('active', i === searchActiveIndex));
      list[searchActiveIndex].scrollIntoView({ block: 'nearest' });
      return;
    }
    if (e.key !== 'Enter') return;
    const list = items();
    const chosen = searchActiveIndex >= 0 && list[searchActiveIndex]
      ? list[searchActiveIndex].dataset.route
      : matchFeatureLabel(searchInput.value, allowedFeatures(currentStaff))?.route;
    if (chosen) selectSearchRoute(chosen);
  });
  // Bấm/focus vào ô: còn trống thì hiện toàn bộ danh mục, đã gõ sẵn thì hiện lại đúng kết quả khớp.
  searchInput.addEventListener('focus', () => {
    if (searchInput.value.trim()) renderSearchResults(matchFeatureLabels(searchInput.value, allowedFeatures(currentStaff)));
    else renderSearchFullList();
  });
}

// Phím tắt Ctrl/Cmd+K — focus ô tìm kiếm từ bất cứ đâu (đúng gợi ý "Ctrl K" hiện trong ô, kiểu
// SoBanHang). Chỉ có tác dụng khi ô tìm kiếm đang thật sự hiện (giao diện v2, máy tính).
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && searchInput && searchInput.offsetParent !== null) {
    e.preventDefault();
    searchInput.focus();
    // Việc "Website v2" (03/09/2026) — ô đang được focus sẵn thì sự kiện 'focus' không bắn lại,
    // Ctrl K sẽ không mở được hộp thoại. Mở thẳng danh mục ở đây cho chắc.
    if (searchResults && searchResults.classList.contains('hidden')) renderSearchFullList();
  }
});

// ── Thông báo ───────────────────────────────────────────────────────────────
// Đợt 2 (23/08/2026) — bảng thả xuống có 5 tab giống ảnh mẫu SoBanHang: Hỗ trợ / Trợ lý / Thông
// báo / Đơn hàng / Tài chính. Đợt 3 cùng ngày: tab Tài chính đã có 2 loại thông báo thật (nợ sắp
// đến hạn + quỹ tiền mặt sắp hết, xem notification-service.js scanDebtsDueSoon/scanCashLow).
const NOTIF_TABS = [
  { key: 'ho-tro', label: 'Hỗ trợ' },
  { key: 'tro-ly', label: 'Trợ lý' },
  { key: 'thong-bao', label: 'Thông báo' },
  { key: 'don-hang', label: 'Đơn hàng' },
  { key: 'tai-chinh', label: 'Tài chính' },
];
// Loại thông báo thật của từng tab dữ liệu — 'thong-bao' không lọc (xem tất cả).
const NOTIF_TAB_TYPES = {
  'don-hang': ['don-moi', 'don-thu-tien', 'don-huy'],
  'tai-chinh': ['no-sap-den-han', 'quy-sap-het'],
};
let notifActiveTab = 'thong-bao';
let notifCache = null; // nạp 1 lần mỗi khi mở bảng, các tab dữ liệu lọc lại từ đây thay vì gọi API riêng
let supportStatusCache = null; // Đợt 3 — số liệu Chat Center/AI thật cho tab Hỗ trợ/Trợ lý, nạp 1 lần/lần mở

// Đợt 3 (23/08/2026) — tab Hỗ trợ/Trợ lý nối vào Chat Center thật (sales-bot) thay vì chữ tĩnh.
async function renderSupportTab(kind) {
  const body = notifPanel.querySelector('.app-notif-panel-body');
  if (!body) return;
  body.innerHTML = '<div class="app-notif-panel-empty">Đang tải…</div>';
  try {
    if (!supportStatusCache) {
      const data = await api.get('/api/mgr/notifications/support-status');
      supportStatusCache = data.support || { ok: false };
    }
    const s = supportStatusCache;
    if (!s.ok) {
      body.innerHTML = `<div class="app-notif-static">
        <p>Không kết nối được hệ thống trò chuyện (Chat Center) lúc này.</p>
        <p>Kiểm tra dịch vụ đang chạy rồi mở lại bảng thông báo.</p>
      </div>`;
      return;
    }
    if (kind === 'ho-tro') {
      body.innerHTML = `<div class="app-notif-static">
        <p>Kênh hỗ trợ khách hàng (Zalo / Facebook / Telegram / Web) đang hoạt động thật.</p>
        <p>Hôm nay có <b>${s.today_conversations}</b> hội thoại. Bấm để mở Chat Center trả lời trực tiếp.</p>
        <a class="btn btn-primary" style="display:block;margin-top:8px" href="${escapeHtml(s.chat_center_url)}" target="_blank" rel="noopener">Mở Chat Center ↗</a>
      </div>`;
    } else {
      const rateTxt = s.ai_reply_rate == null ? 'chưa có lượt trả lời hôm nay' : `${Math.round(s.ai_reply_rate * 100)}%`;
      const speedTxt = s.avg_response_seconds == null ? '—' : `${Math.round(s.avg_response_seconds)} giây`;
      body.innerHTML = `<div class="app-notif-static">
        <p>AI đang tự động trả lời khách thật (chat-brain), không phải giả lập.</p>
        <p>Hôm nay AI trả lời <b>${rateTxt}</b> số lượt nhắn, tốc độ trung bình ${speedTxt}.</p>
        <a class="btn btn-primary" style="display:block;margin-top:8px" href="${escapeHtml(s.chat_center_url)}" target="_blank" rel="noopener">Xem hội thoại AI đã trả lời ↗</a>
      </div>`;
    }
  } catch {
    body.innerHTML = '<div class="app-notif-panel-empty">Không tải được.</div>';
  }
}

function notifListHtml(items) {
  if (!items.length) return '<div class="app-notif-panel-empty">Chưa có thông báo nào.</div>';
  return `<div class="app-notif-panel-list">${items.map((n) => `
      <button type="button" class="app-notif-panel-item" data-id="${n.id}" data-go="${escapeHtml(n.link || '')}">
        <span class="app-notif-panel-item-ico">${icon('thong-bao')}</span>
        <span>
          <div class="app-notif-panel-item-title">${n.read ? '' : '● '}${escapeHtml(n.title)}</div>
          <div class="app-notif-panel-item-time">${escapeHtml(n.type_label || '')}</div>
        </span>
      </button>`).join('')}</div>`;
}

function wireNotifItems(container) {
  container.querySelectorAll('.app-notif-panel-item').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try { await api.post(`/api/mgr/notifications/${btn.dataset.id}/read`); } catch { /* bỏ qua */ }
      notifPanel.classList.add('hidden');
      if (btn.dataset.go) location.hash = btn.dataset.go;
      refreshUnreadBadge();
    });
  });
}

async function renderNotifTabBody() {
  const body = notifPanel.querySelector('.app-notif-panel-body');
  if (!body) return;
  // "Xem tất cả" chỉ có ý nghĩa với tab có DANH SÁCH thật (Thông báo/Đơn hàng/Tài chính) — 2 tab
  // tĩnh Hỗ trợ/Trợ lý không có gì để "xem tất cả" nên ẩn đi, tránh gây hiểu lầm.
  const moreBtn = notifPanel.querySelector('#app-notif-more');
  if (moreBtn) moreBtn.classList.toggle('hidden', notifActiveTab === 'ho-tro' || notifActiveTab === 'tro-ly');
  if (notifActiveTab === 'ho-tro' || notifActiveTab === 'tro-ly') {
    await renderSupportTab(notifActiveTab);
    return;
  }
  body.innerHTML = '<div class="app-notif-panel-empty">Đang tải…</div>';
  try {
    if (!notifCache) {
      const data = await api.get('/api/mgr/notifications');
      notifCache = data.notifications || [];
    }
    const types = NOTIF_TAB_TYPES[notifActiveTab];
    const items = (types ? notifCache.filter((n) => types.includes(n.type)) : notifCache).slice(0, 5);
    body.innerHTML = notifListHtml(items);
    wireNotifItems(body);
  } catch {
    body.innerHTML = '<div class="app-notif-panel-empty">Không tải được thông báo.</div>';
  }
}

function wireNotifTabs() {
  notifPanel.querySelectorAll('.app-notif-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.tab === notifActiveTab) return;
      notifActiveTab = btn.dataset.tab;
      notifPanel.querySelectorAll('.app-notif-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === notifActiveTab));
      renderNotifTabBody();
    });
  });
  notifPanel.querySelector('#app-notif-more')?.addEventListener('click', () => {
    notifPanel.classList.add('hidden');
    location.hash = '#/thong-bao';
  });
}

// Tab nào bị khoá vì thiếu quyền — hiện tại chỉ "Tài chính" cần quyền Sổ nợ HOẶC Sổ quỹ
// (perm 'debt'/'cash' trong nav.js FEATURES), không có cả 2 thì làm mờ giống SoBanHang.
function notifTabDisabled(key) {
  if (key !== 'tai-chinh') return false;
  const perms = currentStaff?.perms || {};
  return !perms.debt && !perms.cash;
}

async function renderNotifPanel() {
  if (!notifPanel) return;
  notifCache = null; // nạp lại dữ liệu mới mỗi lần mở bảng
  supportStatusCache = null;
  if (notifTabDisabled(notifActiveTab)) notifActiveTab = 'thong-bao'; // tab đang chọn vừa bị khoá thì về tab mặc định
  notifPanel.innerHTML = `<div class="app-notif-tabs">${NOTIF_TABS.map((t) => {
    const disabled = notifTabDisabled(t.key);
    return `<button type="button" class="app-notif-tab${t.key === notifActiveTab ? ' active' : ''}${disabled ? ' disabled' : ''}"
      data-tab="${t.key}" ${disabled ? 'disabled aria-disabled="true" title="Bạn không có quyền xem mục này"' : ''}>${escapeHtml(t.label)}</button>`;
  }).join('')}</div>
    <div class="app-notif-panel-body"></div>
    <button type="button" class="app-notif-panel-more" id="app-notif-more">Xem tất cả</button>`;
  wireNotifTabs();
  await renderNotifTabBody();
}

if (notifBtn && notifPanel) {
  notifBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = notifPanel.classList.contains('hidden');
    closeAllHeaderPopups();
    if (willOpen) {
      // Không lưu kích thước đã kéo to/nhỏ lần trước — mỗi lần mở lại phải về đúng cỡ mặc định.
      notifPanel.style.width = '';
      notifPanel.style.height = '';
      notifPanel.classList.remove('hidden');
      renderNotifPanel();
    }
  });
}

// ── Trợ giúp ("?") ─────────────────────────────────────────────────────────
// Nút Trợ giúp (đợt 2, 23/08/2026) — theo ảnh mẫu SoBanHang: mở bảng nhỏ có "Hướng dẫn sử dụng" +
// "Câu hỏi thường gặp". Bỏ 2 mục "Hỗ trợ khách hàng"/"Học viện Sổ Bán Hàng" trong ảnh gốc vì đó là
// tính năng CỦA APP SỔ BÁN HÀNG (tổng đài/khoá học riêng họ) — app này không có nên không bịa link chết.
const helpBtn = document.getElementById('app-help');
const helpPanel = document.getElementById('app-help-panel');

function guideModalHtml() {
  const sections = [
    ['ban-hang', 'Bán hàng', 'Tạo đơn tại quầy, chọn món, áp khuyến mãi/chiết khấu rồi thanh toán. Có thể giao/lưu đơn để thanh toán sau.'],
    ['quan-ly-ban', 'Quản lý bàn', 'Mở bàn khi khách vào, gọi thêm món, chuyển/gộp bàn, đóng bàn khi thanh toán xong.'],
    ['san-pham', 'Hàng hoá & Kho', 'Thêm sản phẩm, đặt giá, theo dõi tồn kho, nhập/xuất kho và kiểm kho định kỳ.'],
    ['so-quy', 'Sổ tiền', 'Xem thu chi, sổ quỹ, sổ nợ khách hàng — biết tiền vào/ra mỗi ngày.'],
    ['khach-hang', 'Đối tác & Khách hàng', 'Lưu thông tin khách quen, nhà cung cấp, tích điểm và nhóm khách hàng.'],
    ['nhan-vien', 'Nhân viên', 'Thêm nhân viên, phân vai trò, chấm ca làm việc.'],
    ['nhat-ky-ke-khai', 'Thuế', 'Ghi sổ kế toán, kê khai và ước tính thuế phải nộp.'],
    ['cai-dat', 'Cài đặt', 'Đổi thông tin quán, quy trình bán hàng, sắp xếp menu và các tuỳ chọn khác.'],
  ];
  return `
    <h3>Hướng dẫn sử dụng POS Manager</h3>
    <p class="picker-hint">Bấm vào một mục để đi thẳng đến màn tương ứng.</p>
    <div class="app-guide-list">
      ${sections.map(([route, title, desc]) => `
        <a href="#/${route}" class="app-guide-item">
          <span class="app-guide-item-ico">${icon(route)}</span>
          <span>
            <div class="app-guide-item-title">${escapeHtml(title)}</div>
            <div class="app-guide-item-desc">${escapeHtml(desc)}</div>
          </span>
        </a>`).join('')}
    </div>
    <div class="modal-close-row"><button class="btn" id="app-guide-close">Đóng</button></div>`;
}

function faqModalHtml() {
  const faqs = [
    ['Vì sao doanh thu hôm nay hiện 0đ dù đã bán hàng?', 'Kiểm tra lại đơn đã ở trạng thái "Đã thanh toán" chưa — đơn "Chờ xác nhận"/"Giao sau" chưa tính vào doanh thu.'],
    ['Quên mật khẩu đăng nhập thì làm sao?', 'Ở màn đăng nhập bấm "Quên mật khẩu" — cần tài khoản đã có email khôi phục (đặt trong Cài đặt).'],
    ['Làm sao thêm nhân viên mới?', 'Vào Nhân viên > Thêm nhân viên, đặt vai trò (thu ngân/quản lý...) để giới hạn quyền phù hợp.'],
    ['Sản phẩm báo hết hàng dù còn hàng thực tế?', 'Vào Tồn kho kiểm tra lại số liệu, hoặc dùng Kiểm kho để cập nhật đúng số lượng thực tế.'],
    ['Đổi được giao diện cũ/mới ở đâu?', 'Bấm "Đổi giao diện" ở cuối cột trái, cạnh mục Cài đặt.'],
  ];
  return `
    <h3>Câu hỏi thường gặp</h3>
    <div class="app-guide-list">
      ${faqs.map(([q, a]) => `
        <div class="app-faq-item">
          <div class="app-faq-q">${escapeHtml(q)}</div>
          <div class="app-faq-a">${escapeHtml(a)}</div>
        </div>`).join('')}
    </div>
    <div class="modal-close-row"><button class="btn" id="app-faq-close">Đóng</button></div>`;
}

function renderHelpPanel() {
  if (!helpPanel) return;
  helpPanel.innerHTML = `
    <button type="button" class="app-help-item" id="app-help-guide">${icon('phieu')}<span>Hướng dẫn sử dụng</span></button>
    <button type="button" class="app-help-item" id="app-help-faq">${icon('tro-giup')}<span>Câu hỏi thường gặp</span></button>`;
  helpPanel.querySelector('#app-help-guide').addEventListener('click', () => {
    helpPanel.classList.add('hidden');
    const { overlay, close } = openModal(guideModalHtml());
    document.getElementById('app-guide-close').addEventListener('click', close);
    overlay.querySelectorAll('.app-guide-item').forEach((a) => a.addEventListener('click', close));
  });
  helpPanel.querySelector('#app-help-faq').addEventListener('click', () => {
    helpPanel.classList.add('hidden');
    const { close } = openModal(faqModalHtml());
    document.getElementById('app-faq-close').addEventListener('click', close);
  });
}

if (helpBtn && helpPanel) {
  helpBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = helpPanel.classList.contains('hidden');
    closeAllHeaderPopups();
    if (willOpen) { renderHelpPanel(); helpPanel.classList.remove('hidden'); }
  });
}

// ── Tài khoản ───────────────────────────────────────────────────────────────
const userChipBtn = document.getElementById('app-user-chip');
const userMenu = document.getElementById('app-user-menu');

function renderUserMenu() {
  if (!userMenu) return;
  const hasSettings = allowedFeatures(currentStaff).some((f) => f.route === SIDEBAR_FOOTER_ROUTE);
  userMenu.innerHTML = `
    ${hasSettings ? `<a href="#/cai-dat">${icon('cai-dat')}<span>Cài đặt</span></a>` : ''}
    <hr>
    <button type="button" id="app-user-logout">${icon('dang-xuat')}<span>Đăng xuất</span></button>`;
  userMenu.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => userMenu.classList.add('hidden')));
  userMenu.querySelector('#app-user-logout').addEventListener('click', async () => {
    userMenu.classList.add('hidden');
    try { await api.post('/api/mgr/auth/logout'); } catch { /* đăng xuất kể cả khi mạng lỗi */ }
    currentStaff = null;
    location.hash = '#/dang-nhap';
    location.reload();
  });
}

if (userChipBtn && userMenu) {
  userChipBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = userMenu.classList.contains('hidden');
    closeAllHeaderPopups();
    if (willOpen) { renderUserMenu(); userMenu.classList.remove('hidden'); }
  });
}

// Đóng từng khung khi bấm ra ngoài CHÍNH khung đó — không đóng "tất cả bất kể bấm đâu", vì bấm
// vào chính ô tìm kiếm/chuông/tài khoản để MỞ ra cũng là một cú click nổi bọt lên document, đóng
// nhầm ngay khung vừa mở nếu không loại trừ (bug tự phát hiện lúc viết T104: 23/08/2026).
document.addEventListener('click', (e) => {
  if (searchResults && !e.target.closest('.app-search')) searchResults.classList.add('hidden');
  if (helpPanel && !e.target.closest('.app-help-wrap')) helpPanel.classList.add('hidden');
  if (notifPanel && !e.target.closest('.app-notif-wrap')) notifPanel.classList.add('hidden');
  if (userMenu && !e.target.closest('.app-user-wrap')) userMenu.classList.add('hidden');
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAllHeaderPopups(); });

(async () => {
  if (!location.hash) location.hash = `#/${DEFAULT_ROUTE}`;
  router();
  // Chấm thông báo tự làm mới mỗi phút — đủ nhanh cho quán ăn, không tốn pin máy nhân viên.
  unreadTimer = setInterval(refreshUnreadBadge, 60000);
})();

window.addEventListener('beforeunload', () => clearInterval(unreadTimer));
