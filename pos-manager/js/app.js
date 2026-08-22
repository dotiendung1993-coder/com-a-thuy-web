import { api } from './api.js';
import { icon } from './icons.js';
import {
  getTabRoutes, featureByRoute, allowedFeatures, applyNavOrder, TAB_HOME, TAB_MORE, GROUP_ORDER,
  getTheme, setTheme, superGroupOf, matchFeatureLabel, groupLabelV2,
} from './nav.js';
import * as loginView from './views/login.js';
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
          <span class="g-label">${getTheme() === 'v2' ? groupLabelV2(groupName) : groupName}</span>${chevronSvg}
        </button>
        <div class="sidebar-group-items">${itemsHtml}</div>
      </div>`;
    }).join('');

  const isSlim = localStorage.getItem('posmgr.sidebar.slim') === '1';
  // Task 1 (09/08/2026 đợt 5) — đầu cột trái là KHỐI THƯƠNG HIỆU giống app Sổ Bán Hàng (ô vuông
  // bo góc màu trắng + tên quán), không phải một nút ≡ trơ trọi. Nút thu gọn tách hẳn ra thành
  // nút TRÒN nằm đè lên mép phải cột trái (đúng chỗ chủ quán khoanh đen trong ảnh khảo sát).
  //   ⚠️ Nút tròn phải là position:fixed chứ KHÔNG absolute: .sidebar có overflow-x:hidden nên
  //   nút thò ra ngoài mép phải sẽ bị CẮT CỤT (đúng cái bẫy đã gặp ở submenu nổi, Task 8).
  sidebar.innerHTML = `
    <div class="sidebar-brand">
      <span class="sidebar-brand-logo">${icon('mon-an')}</span>
      <span class="sidebar-brand-name">Cơm A Thúy</span>
    </div>
    <button class="sidebar-toggle" id="sidebar-toggle" type="button" title="Thu nhỏ / Mở rộng" aria-label="Thu nhỏ / Mở rộng menu">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
    </button>
    <a href="#/trang-chu" data-route="trang-chu">${icon('trang-chu')}<span>Trang chủ</span></a>
    ${menuHtml}
    <div class="sidebar-footer">
      ${hasSettings ? `<a href="#/cai-dat" data-route="cai-dat" title="Cài đặt">${icon('cai-dat')}<span>Cài đặt</span></a>` : ''}
      <button type="button" class="sidebar-theme-toggle" id="sidebar-theme-toggle">
        ${getTheme() === 'v2'
          ? `${icon('quay-lai')}<span>Quay lại giao diện cũ</span>`
          : `${icon('sao-chep')}<span>Dùng giao diện mới (thử nghiệm)</span>`}
      </button>
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
  const avatar = document.getElementById('app-user-avatar');
  if (userV2) userV2.textContent = currentStaff ? `${currentStaff.name} (${currentStaff.role})` : '';
  if (avatar) avatar.textContent = currentStaff?.name ? currentStaff.name.trim().charAt(0).toUpperCase() : '';
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
  if (!route.requiresAuth && currentStaff && routeName === 'dang-nhap') {
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

const notifBtn = document.getElementById('app-notif');
if (notifBtn) notifBtn.addEventListener('click', () => { location.hash = '#/thong-bao'; });

// Đợt 1 (15/08/2026) — ô tìm kiếm thanh trên (giao diện v2). Enter mới chuyển trang, tránh
// nhảy trang khi đang gõ dở. Chỉ lọc trong FEATURES hiện có (xem giới hạn phạm vi ở spec).
const searchInput = document.getElementById('app-search');
if (searchInput) {
  searchInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const match = matchFeatureLabel(searchInput.value, allowedFeatures(currentStaff));
    if (match) {
      location.hash = `#/${match.route}`;
      searchInput.value = '';
      searchInput.blur();
    }
  });
}

(async () => {
  if (!location.hash) location.hash = `#/${DEFAULT_ROUTE}`;
  router();
  // Chấm thông báo tự làm mới mỗi phút — đủ nhanh cho quán ăn, không tốn pin máy nhân viên.
  unreadTimer = setInterval(refreshUnreadBadge, 60000);
})();

window.addEventListener('beforeunload', () => clearInterval(unreadTimer));
