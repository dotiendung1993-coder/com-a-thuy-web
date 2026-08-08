import { api } from './api.js';
import { icon } from './icons.js';
import { getTabRoutes, featureByRoute, allowedFeatures, TAB_HOME, TAB_MORE, GROUP_ORDER } from './nav.js';
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
import * as giaVonView from './views/gia-von.js';
import * as sanPhamView from './views/san-pham.js';
import * as nhapXuatKhoView from './views/nhap-xuat-kho.js';
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
import * as quanLyCaView from './views/quan-ly-ca.js';
import * as caiDatView from './views/cai-dat.js';
// Giai đoạn 8 mục K/L
import * as thongBaoView from './views/thong-bao.js';
import { loadAndApplyDisplay } from './display.js';
// Giai đoạn 9 đợt 2/3
import * as danhMucView from './views/danh-muc.js';
import * as baoCaoKhoView from './views/bao-cao-kho.js';
import * as vaiTroView from './views/vai-tro.js';

const ROUTES = {
  'dang-nhap': { title: 'Đăng nhập', requiresAuth: false, view: loginView },
  'trang-chu': { title: 'Trang chủ', requiresAuth: true, view: homeView },
  'ban-hang': { title: 'Bán hàng', requiresAuth: true, view: sellView },
  'ban-nhanh': { title: 'Bán nhanh', requiresAuth: true, view: quickSellView },
  'quan-ly-ban': { title: 'Quản lý bàn', requiresAuth: true, view: tablesView },
  'don-hang': { title: 'Đơn hàng', requiresAuth: true, view: ordersView },
  'bep': { title: 'Bếp', requiresAuth: true, view: kitchenView },
  'nhan-vien': { title: 'Nhân viên', requiresAuth: true, view: staffView },
  'nguon-tien': { title: 'Nguồn tiền', requiresAuth: true, view: nguonTienView },
  'thu-chi': { title: 'Thu chi', requiresAuth: true, view: thuChiView },
  'so-quy': { title: 'Sổ quỹ', requiresAuth: true, view: soQuyView },
  'so-no': { title: 'Sổ nợ', requiresAuth: true, view: soNoView },
  'them': { title: 'Thêm', requiresAuth: true, view: themView },
  'bao-cao-ban-hang': { title: 'Báo cáo bán hàng', requiresAuth: true, view: baoCaoBanHangView },
  'lai-lo': { title: 'Lãi lỗ', requiresAuth: true, view: laiLoView },
  'bao-cao-thu-chi': { title: 'Báo cáo thu chi', requiresAuth: true, view: baoCaoThuChiView },
  'uoc-tinh-thue': { title: 'Ước tính thuế', requiresAuth: true, view: uocTinhThueView },
  'gia-von': { title: 'Giá vốn món ăn', requiresAuth: true, view: giaVonView },
  'san-pham': { title: 'Sản phẩm', requiresAuth: true, view: sanPhamView },
  'nhap-xuat-kho': { title: 'Nhập / Xuất kho', requiresAuth: true, view: nhapXuatKhoView },
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
  'quan-ly-ca': { title: 'Quản lý ca', requiresAuth: true, view: quanLyCaView },
  'cai-dat': { title: 'Cài đặt', requiresAuth: true, view: caiDatView },
  // Giai đoạn 8 mục K
  'thong-bao': { title: 'Thông báo', requiresAuth: true, view: thongBaoView },
  // Giai đoạn 9 đợt 2
  'danh-muc':    { title: 'Danh mục sản phẩm', requiresAuth: true, view: danhMucView },
  'bao-cao-kho': { title: 'Báo cáo kho',        requiresAuth: true, view: baoCaoKhoView },
  // Giai đoạn 9 đợt 3
  'vai-tro': { title: 'Vai trò', requiresAuth: true, view: vaiTroView },
};
const DEFAULT_ROUTE = 'trang-chu';

// Icon đại diện mỗi nhóm — dùng route của mục đầu tiên trong nhóm
const GROUP_ICON_ROUTE = {
  'Bán hàng':       'ban-hang',
  'Hàng hoá & Kho': 'san-pham',
  'Nguyên liệu':    'nvl',
  'Sổ tiền':        'nguon-tien',
  'Khách hàng':     'khach-hang',
  'Báo cáo':        'bao-cao-ban-hang',
  'Quản lý':        'nhan-vien',
};

let currentStaff = null;

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
  const features = allowedFeatures(staff).filter((f) => f.route !== SIDEBAR_FOOTER_ROUTE);
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

  const menuHtml = [...byGroup.entries()]
    .filter(([, items]) => items.length)
    .map(([groupName, items]) => {
      const isOpen = !collapsedGroups.has(groupName);
      const groupRoute = GROUP_ICON_ROUTE[groupName] || items[0].route;
      const itemsHtml = items.map((t) =>
        `<a href="#/${t.route}" data-route="${t.route}" class="sidebar-child">${icon(t.route)}<span>${t.label}</span></a>`
      ).join('');
      return `<div class="sidebar-group ${isOpen ? 'open' : ''}" data-g="${groupName}">
        <button class="sidebar-group-btn" type="button" data-g="${groupName}" title="${groupName}">
          <span class="sbh-icon">${icon(groupRoute)}</span>
          <span class="g-label">${groupName}</span>${chevronSvg}
        </button>
        <div class="sidebar-group-items">${itemsHtml}</div>
      </div>`;
    }).join('');

  const isSlim = localStorage.getItem('posmgr.sidebar.slim') === '1';
  sidebar.innerHTML = `
    <button class="sidebar-toggle" id="sidebar-toggle" type="button" title="Thu nhỏ / Mở rộng">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
    </button>
    <a href="#/trang-chu" data-route="trang-chu">${icon('trang-chu')}<span>Trang chủ</span></a>
    ${menuHtml}
    ${hasSettings ? `<div class="sidebar-footer">
      <a href="#/cai-dat" data-route="cai-dat" title="Cài đặt">${icon('cai-dat')}<span>Cài đặt</span></a>
    </div>` : ''}`;

  if (isSlim) {
    sidebar.classList.add('collapsed');
    document.body.classList.add('sidebar-slim');
  }

  sidebar.querySelector('#sidebar-toggle').addEventListener('click', () => {
    const slim = sidebar.classList.toggle('collapsed');
    document.body.classList.toggle('sidebar-slim', slim);
    localStorage.setItem('posmgr.sidebar.slim', slim ? '1' : '0');
  });

  sidebar.querySelectorAll('.sidebar-group-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      // Icon-only mode: bấm vào nhóm thì chuyển sang mục đầu tiên của nhóm
      if (sidebar.classList.contains('collapsed')) {
        const group = btn.closest('.sidebar-group');
        const firstLink = group.querySelector('a[data-route]');
        if (firstLink) location.hash = `#/${firstLink.dataset.route}`;
        return;
      }
      const group = btn.closest('.sidebar-group');
      const open = group.classList.toggle('open');
      const g = group.dataset.g;
      if (open) collapsedGroups.delete(g);
      else collapsedGroups.add(g);
      localStorage.setItem('posmgr.sidebar.cg', JSON.stringify([...collapsedGroups]));
    });
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

(async () => {
  if (!location.hash) location.hash = `#/${DEFAULT_ROUTE}`;
  router();
  // Chấm thông báo tự làm mới mỗi phút — đủ nhanh cho quán ăn, không tốn pin máy nhân viên.
  unreadTimer = setInterval(refreshUnreadBadge, 60000);
})();

window.addEventListener('beforeunload', () => clearInterval(unreadTimer));
