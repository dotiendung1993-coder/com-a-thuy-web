// Service worker POS Manager — CHỈ cache vỏ app (HTML/CSS/JS/icon).
// TUYỆT ĐỐI KHÔNG cache api-url.json và không cache lời gọi API — xem mục 2.4 kế hoạch:
// cache nhầm là app trỏ mãi vào URL tunnel đã chết.
// Đổi số version mỗi lần sửa vỏ app, nếu không máy nhân viên vẫn chạy bản cũ trong cache.
// ⚠️ ĐỔI SỐ NÀY MỖI LẦN sửa BẤT KỲ file nào trong SHELL_FILES — kể cả chỉ sửa 1 đường vẽ icon.
// Không đổi thì máy nhân viên vẫn lấy bản cũ trong cache vĩnh viễn (bug-063, và lặp lại 04/08/2026
// khi sửa icons.js mà quên nâng v12 -> icon cũ vẫn hiện dù máy chủ đã có file mới).
const CACHE_NAME = 'posmgr-shell-v23'; // v23: Task 2 (08/08) — bán hàng kiểu danh sách + lọc/sắp xếp, ảnh món, bán nhanh, khu vực bàn + QR, lọc đơn, bếp theo bàn/món, cài đặt 3 cột, trang chủ thu gọn
// NHỚ: mỗi lần đổi/thêm file JS/CSS đều PHẢI nâng version ở đây — quên nâng thì máy khách vẫn
// dùng bản cache cũ dù server đã có bản mới (bug lặp lại từ GĐ6, xem .wolf/buglog.json).
const SHELL_FILES = [
  './',
  './index.html',
  './css/app.css',
  './js/app.js',
  './js/api.js',
  './js/ui.js',
  './js/icons.js',
  './js/icons-sbh.js',
  './js/nav.js',
  './js/display.js',
  './js/views/login.js',
  './js/views/home.js',
  './js/views/sell.js',
  './js/views/quick-sell.js',
  './js/views/payment-modal.js',
  './js/views/tables.js',
  './js/views/orders.js',
  './js/views/staff.js',
  './js/views/kitchen.js',
  './js/views/them.js',
  './js/views/nguon-tien.js',
  './js/views/thu-chi.js',
  './js/views/so-quy.js',
  './js/views/so-no.js',
  './js/views/bao-cao-ban-hang.js',
  './js/views/lai-lo.js',
  './js/views/bao-cao-thu-chi.js',
  './js/views/uoc-tinh-thue.js',
  './js/views/gia-von.js',
  './js/views/san-pham.js',
  './js/views/nhap-xuat-kho.js',
  './js/views/so-kho.js',
  './js/views/kiem-kho.js',
  './js/views/ton-kho.js',
  './js/views/nha-cung-cap.js',
  './js/views/nhom-tuy-chon.js',
  './js/views/nvl.js',
  './js/views/nhap-nvl.js',
  './js/views/cong-thuc.js',
  './js/views/ton-nvl.js',
  './js/views/khach-hang.js',
  './js/views/nhom-khach.js',
  './js/views/tich-diem.js',
  './js/views/khuyen-mai.js',
  './js/views/quan-ly-ca.js',
  './js/views/cai-dat.js',
  // GĐ8 mục G/K + GĐ9 đợt 2/3
  './js/views/table-ops-modal.js',
  './js/views/thong-bao.js',
  './js/views/danh-muc.js',
  './js/views/bao-cao-kho.js',
  './js/views/vai-tro.js',
  './manifest.json',
  './icons/192.png',
  './icons/512.png',
];

self.addEventListener('install', (event) => {
  // BẮT BUỘC dùng cache:'reload'. cache.addAll() mặc định được phép lấy file từ bộ nhớ đệm HTTP
  // của trình duyệt — tức bản CŨ vừa tải trước khi deploy — rồi lưu luôn bản cũ đó vào cache mới.
  // Hậu quả: đổi số version mà máy nhân viên vẫn chạy giao diện cũ (bug-063, 03/08/2026).
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => Promise.all(
      SHELL_FILES.map((url) => fetch(new Request(url, { cache: 'reload' })).then((res) => {
        if (!res.ok) throw new Error('Không tải được ' + url);
        return cache.put(url, res);
      }))
    )).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isApiUrlJson = url.pathname.endsWith('/api-url.json');

  // Không cache api-url.json, không đụng vào request khác nguồn (API ở tunnel).
  if (!isSameOrigin || isApiUrlJson) return;

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
