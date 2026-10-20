# Landing Page — Cơm A Thuý

Trang giới thiệu quán (1 trang, tĩnh, không cần build). Tạo 2026-07-02 theo mẫu [vietnamese-restaurant-76.aura.build](https://vietnamese-restaurant-76.aura.build/) (dark style, spotlight cards, glassmorphism), Việt hóa toàn bộ với dữ liệu thật từ database menu + brand_brain.json.

## Cấu trúc

```text
landing-page/
├── index.html              # Toàn bộ trang (HTML + Tailwind + JS inline)
├── assets/
│   ├── js/                 # Script self-host (không phụ thuộc CDN, đã verify sha384)
│   │   ├── tailwind-3.4.16.min.js
│   │   └── iconify-icon-2.1.0.min.js
│   └── img/                # Ảnh món (từ data/creative + SDXL local) & logo
│       ├── logo.png                (logo quán, đã xóa nền trắng)
│       ├── bo-sot-vang.jpg
│       ├── ba-chi-quay-com.png
│       ├── ca-tram-kho-gieng.png
│       ├── suon-xao-chua-ngot.png
│       ├── ba-chi-rang-cai-cay.png
│       ├── chan-nam-om-thit-bam.png
│       ├── khong-gian-mon.png
│       └── com-trang.png
└── README.md
```

## Cập nhật 2026-07-02 (đợt 2)

- SĐT hiển thị đổi thành **038 246 2678** (link gọi vẫn `tel:0382462678`)
- Logo thật của quán ở nav + footer + favicon (nền trắng đã xóa, nguồn: Downloads FB avatar)
- Card "Đặt cơm trước" có thêm **Nhắn Zalo** (zalo.me/0382462678); "Tìm quán" → "Địa chỉ"
- Card "Món tủ của quán" thành **carousel trượt 6 món** (tự chạy 4s, bấm chấm để chuyển)
- Khối khách quen: 7 avatar + **+450 khách hàng**; slogan mới theo yêu cầu chủ quán

## Cách xem

Mở thẳng `index.html` bằng trình duyệt (double-click), hoặc:

```bash
cd output/landing-page && python3 -m http.server 8080
# → http://localhost:8080
```

## Cách deploy

Copy nguyên thư mục `landing-page/` lên bất kỳ static host nào (Netlify, Vercel, GitHub Pages, hosting thường). Không cần Node/build.

## Menu tự động (cập nhật 2026-07-03)

Menu KHÔNG còn hardcode trong HTML. Trang đọc `assets/data/menu-today.js` (window.MENU_TODAY) do
`scripts/sync-landing-menu.js` sinh ra từ hệ thống auto-content:

- Món + giá cơm phần/đồ uống: `src/knowledge/menu-source.js` (đã trừ món chủ quán ẩn hôm nay)
- **Cơm mâm giá theo size XS/S/M/L**: đọc TRỰC TIẾP Google Sheet tab "Cơm Mâm" (cột C–F) —
  giá size chỉ có trên Sheet, không có trong DB. Sheet lỗi → fallback giá đại diện từ DB.
- **Món đặc biệt**: bảng `daily_specials` — hôm nay có món → badge "Còn hàng"; không có → hiện
  món GẦN NHẤT với badge "Hết hàng", đến khi auto-content tạo món đặc biệt mới thay thế.
- Ảnh món: `assets/img/dishes/<slug>.png|jpg`; ảnh đồ uống: `assets/img/drinks/<slug>.png`;
  ảnh mâm cơm gallery: `assets/img/tray/tray-NN.png` (đã đóng logo + SĐT).
  Tạo ảnh thiếu: `node scripts/gen-landing-dish-images.js` (cơm phần) và
  `node scripts/gen-landing-extra-images.js` (đồ uống + mâm cơm).
- **Tự động sync: PM2 app `landing-sync`** — mỗi 10 phút (phút 2,12,22…), lệch 2 phút sau
  `sheets-sync` để lấy dữ liệu Sheet mới nhất. Xem log: `pm2 logs landing-sync`.
  (Crontab sync-landing cũ 30 phút đã gỡ 2026-07-03 để tránh trùng.)

Chạy tay khi cần: `node scripts/sync-landing-menu.js`

## Cập nhật 2026-07-03 (9 task chủ quán)

1. "⭐ Món đặc biệt" luôn có trên thanh thực đơn (đầu tiên) — món gần nhất + trạng thái còn/hết hàng
2. Ticker chạy chữ liệt kê ĐỦ món cơm mâm hôm nay + "Rau & Canh theo mùa / Mang về tiện lợi / Giao hàng tận nơi"
3. Card cơm phần to gấp 1.5 lần (ảnh h-48, chữ + giá lớn hơn), đồng bộ Sheet "Cơm Phần" tự động
4. Cơm mâm: mỗi món 1 bảng size XS/S/M/L + giá bên dưới, đồng bộ Sheet "Cơm Mâm"
5. Đồ uống có ảnh từng loại (SDXL local, `assets/img/drinks/`)
6. Bếp A Thuý: "Canh & Rau theo mùa / Thịt, Cá tươi ngon / Gia vị kiểu Miền Bắc" + swipe gallery
   mâm cơm (tự nạp `assets/img/tray/tray-01..20.png`, ảnh thiếu tự gỡ, nút ‹ › + đếm trang)
7. Thêm 9 feedback (gắn nhãn GOOGLE MAPS / FACEBOOK)
8. Giờ mở cửa: bữa tối chỉ T2–T6, thêm ô "Tối thứ 7 & Chủ nhật — QUÁN NGHỈ" + footer cập nhật
9. Liên hệ: thêm Zalo (zalo.me/0382462678) với logo Zalo + logo Facebook chính chủ

## Cập nhật nội dung

- **Giá / món ăn**: sửa trong DB/bot như bình thường rồi chờ cron (hoặc chạy sync tay) — KHÔNG sửa index.html.
- **Giờ mở cửa**: hiện tại 10:30–14:00 & 17:30–20:00 (theo `config/.env` BUSINESS_HOURS).
- **SĐT / địa chỉ**: 0382 462 678 — Thủy Tiên 2 – 01S11, KĐT Ecopark, Phụng Công, Hưng Yên.

## Ghi chú kỹ thuật

- Tailwind chạy bản Play (JIT trong trình duyệt) → console có 1 warning "should not be used in production", chấp nhận được với trang 1 file. Muốn tối ưu: build CSS tĩnh bằng Tailwind CLI.
- Font Geist + Inter tải từ Google Fonts (cần mạng); texture cubes từ transparenttextures.com — mất mạng trang vẫn hiển thị bình thường, chỉ thiếu texture mờ.
