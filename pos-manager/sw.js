// Service worker POS Manager — CHỈ cache vỏ app (HTML/CSS/JS/icon).
// TUYỆT ĐỐI KHÔNG cache api-url.json và không cache lời gọi API — xem mục 2.4 kế hoạch:
// cache nhầm là app trỏ mãi vào URL tunnel đã chết.
// Đổi số version mỗi lần sửa vỏ app, nếu không máy nhân viên vẫn chạy bản cũ trong cache.
// ⚠️ ĐỔI SỐ NÀY MỖI LẦN sửa BẤT KỲ file nào trong SHELL_FILES — kể cả chỉ sửa 1 đường vẽ icon.
// Không đổi thì máy nhân viên vẫn lấy bản cũ trong cache vĩnh viễn (bug-063, và lặp lại 04/08/2026
// khi sửa icons.js mà quên nâng v12 -> icon cũ vẫn hiện dù máy chủ đã có file mới).
const CACHE_NAME = 'posmgr-shell-v82'; // v75: 04/09 — Đơn hàng Thao tác thêm 2 mục, Thu chi Thao tác button + Loại giao dịch, Sổ quỹ Loại giao dịch. // v73: 04/09 — thư mục 5 Sản phẩm: KPI dải chung, hàng lọc 1 hàng, tab viên thuốc, ảnh SP, cột sắp xếp. Trước đó v72: 04/09 — Việc 'Website v2' thư mục 4 Đơn hàng: hàng lọc gọn + hộp thoại Bộ lọc, KPI 1 thẻ, tab viên thuốc, phân trang, menu Thao tác (orders.js, icons.js, app.css, theme-v2.css).
// v70: 03/09 — bug-614: màn Quản lý bếp hiện TÊN MÓN ở chỗ đáng lẽ là TÊN BÀN (hàm tableName lẫn cột `name` = tên món của pos_kitchen_items với `name` = tên bàn của restaurant_tables).
// v69: 03/09 — bug-613: màn Quản lý bếp gắn nhãn "Mang về" cho đơn ĂN TẠI BÀN lên từ POS Manager (đơn ăn tại quán tồn tại dưới 2 giá trị delivery_type: 'tai-quan' của khách quét QR và 'tai-ban' của nhân viên; mỗi chỗ trong code chỉ nhận một nửa). Nay nhận cả hai.
// v68: 03/09 — TÊN RIÊNG cho bàn (migration 091 thêm cột name, mặc định "Bàn <số>"): đặt/sửa tên ngay trong cửa sổ Tạo bàn và menu 3 chấm ("Đổi tên / số / khu vực" nay là MỘT cửa sổ chung); tên hiện ở lưới Quản lý bàn, thẻ QR in ra, màn Đơn hàng, màn Bếp, hoá đơn và trang gọi món của khách; tìm kiếm được theo tên; đổi tên KHÔNG đụng table_no đang gắn với đơn hàng.
// v67: 03/09 — Quản lý bàn: (T2) cửa sổ "Tải QR bàn" chia mã theo KHU VỰC, tích ở tên khu vực là chọn/bỏ cả khu, trang in cũng tách theo khu vực; (T3) ô "+ Thêm bàn mới" mở cửa sổ Tạo bàn (xem trước tên bàn, chọn hoặc thêm khu vực ngay) thay vì tạo thẳng; (T4) Quản lý khu vực có nút mũi tên lên/xuống đổi thứ tự (lưu ở máy chủ qua PUT /zones/order, chip lọc theo đúng thứ tự đó) + icon cho nút Đổi tên/Xoá.
// v67: 03/09 — Quản lý bàn: (T2) cửa sổ "Tải QR bàn" chia mã theo KHU VỰC, tích ở tên khu vực là chọn/bỏ cả khu, trang in cũng tách theo khu vực; (T3) ô "+ Thêm bàn mới" mở cửa sổ Tạo bàn (xem trước tên bàn, chọn hoặc thêm khu vực ngay) thay vì tạo thẳng; (T4) Quản lý khu vực có nút mũi tên lên/xuống đổi thứ tự (lưu ở máy chủ qua PUT /zones/order, chip lọc theo đúng thứ tự đó) + icon cho nút Đổi tên/Xoá.
// v66: 03/09 — Quản lý bàn: fix nút 3 chấm (.tc-kebab) và nút chỉnh sửa (.tc-edit-flag) bị đè lên nút QR — chuyển sang position:absolute top:7px right:33px, thêm padding-right:58px vào .tc-top để tên bàn không bị che.
// v64: 03/09 — Quản lý bàn v2: filterbar+toolbar mới, zone-grouped grid, Tạo bàn/Khu vực drawer, mute localStorage.
// v62: 29/08 — T1 nút thu gọn cột trái dời vào CÙNG DÒNG với chữ "POS Manager" (bỏ hẳn dòng riêng, .view hết chừa 44px trống); T2 mỗi Loại hình kinh doanh (Cài đặt > Thông tin cửa hàng) có icon màu riêng + ô tick về đúng mép phải; T3 Quản lý nhân viên: cột Email khôi phục, ảnh đại diện (tải ảnh lên, nén 128×128 lưu data: URL), sửa SĐT/email/ghi chú, đặt PIN theo ý, và "Xem mã PIN" cho chủ quán (migration 090 + auth/pin-crypto.js).
// v61: 25/08 đợt 17 tiếp — hàng món ở kiểu gom "Theo món" cao 3 dòng (thêm "Xong lúc...") khiến ô tích/×N/nút hành động dính mép TRÊN thay vì canh giữa cả hàng; đổi .kds-row align-items:flex-start -> center.
// v60: 25/08 đợt 17 — số trong "Đang xử lý/Đang chế biến/Đã xong (N)" đổi từ đếm SỐ MÓN sang đếm SỐ THẺ theo đúng kiểu gom đang chọn (Theo đơn=số đơn, Theo bàn=số bàn, Theo món=số tên món, Từng món lẻ=số suất — không đổi).
// v59: 25/08 đợt 16 (sửa lại lần 3) — v58 tự vẽ ô tích (appearance:none) nhưng chưa chặn min-height/width — bị luật chung "input,select,textarea{min-height:44px;width:100%}" (app.css) đè thành hình chữ nhật to (checkbox NATIVE trước đó tự bỏ qua luật này, appearance:none làm nó thành input thường nên bị áp y hệt input chữ). Thêm min/max-width/height:17px + box-sizing:border-box + display:inline-flex canh giữa — giờ chắc chắn là hình vuông 17×17 thẳng hàng ×N.
// v58: 25/08 đợt 16 — Quản lý bếp: chủ quán test thật trên Windows Chrome vẫn thấy ô tích ×N lệch dù v57 đã xoá margin — root cause là ô tích NATIVE (accent-color) của Windows tự vẽ có đệm nội bộ không đối xứng mà CSS margin/width/height không sửa được; đổi hẳn sang tự vẽ ô tích bằng appearance:none + ::after (không lệ thuộc cách hệ điều hành vẽ checkbox nữa).
// v57: 24/08 đợt 15 — Quản lý bếp: tiêu đề "Đang xử lý" hết đậm lệch tông (800->600, khớp 2 tab bên phải) + thêm số lượng "(N)"; ô tích ×N thật sự thẳng hàng (input checkbox có margin mặc định của trình duyệt, v56 mới ép cao bằng nhau chứ chưa xoá margin); kiểu gom "Theo đơn" tách 2 dòng: dòng 1 = tên khách (chỉ tên mới đậm) + mã đơn không đậm, dòng 2 = SĐT + địa chỉ (trước đây dòng 2 là "Đơn <mã> · địa chỉ", SĐT nằm chung dòng 1 làm cả cụm bị đậm theo).
// v56: 24/08 đợt 14 — "SỐ DƯ HÔM NAY"/"MỤC TIÊU DOANH THU" xuống dòng riêng đúng ý (select nguồn tiền + nút đặt mục tiêu dời xuống dưới, thêm icon mục tiêu mới 'muc-tieu'); Quản lý bếp: canh thẳng hàng ô tích với ×N, kiểu gom "Theo đơn" thêm dòng mã đơn + địa chỉ dưới tên khách (routes/kitchen.js JOIN thêm s.address).
// v55: 24/08 Tổng quan — hạ ngưỡng .kpi-row-5 xuống cùng 900px với .kpi-row (trước đây 1400px riêng khiến "SỐ DƯ HÔM NAY"/"MỤC TIÊU DOANH THU" rớt dòng ở laptop 1366px, dù server đã có bản mới máy chủ quán vẫn thấy bản cũ vì QUÊN nâng version này — đúng bug lặp lại đã ghi ở dòng dưới); đổi tên thương hiệu góc trên-trái "Cơm A Thúy" -> "POS Manager".
// v54: 23/08 Việc header — sửa icon "Nhật ký kê khai"/"Ước tính thuế" biến mất (bug scripts/gen-sbh-icons.py xoá nhầm width/height của <rect> lồng bên trong, không chỉ ở <svg> gốc); gộp nút đổi giao diện thành 1 icon cùng dòng với Cài đặt (bỏ chữ "giao diện cũ"/"giao diện thử nghiệm"); thanh trên viết lại theo ảnh mẫu SoBanHang — ô tìm kiếm có icon+gợi ý Ctrl K+khung kết quả nhiều dòng (nav.js matchFeatureLabels), chuông mở bảng thả xuống tại chỗ, khối tài khoản có avatar+tên+vai trò+mũi tên mở menu (Cài đặt/Đăng xuất — trước đây không có lối đăng xuất nào ngoài xoá sạch dữ liệu máy); thêm Đăng ký tài khoản (chỉ mở khi CHƯA có chủ quán) + Quên/Đặt lại mật khẩu qua email (views/dang-ky.js, quen-mat-khau.js, dat-lai-mat-khau.js; backend routes/auth.js + auth/staff.js dùng lại src/pos/mailer.js; migration 086 thêm cột email/reset_token/reset_expires_at vào pos_staff).
// v53: 19/08 Việc "Thuế" — nhóm menu mới "Thuế" (ảnh Website v2/Thuế): Nhật ký kê khai/Kê khai thuế/Ước tính thuế + wizard "Thiết lập sổ kế toán" 2 bước; Ước tính thuế chuyển từ nhóm Báo cáo sang Thuế; backend mới tax-filing-service.js/routes/tax-filing.js + migration 085 (bảng tax_filing_periods/tax_filing_log) + settings-service.js key tax_classification; hoàn thiện quyền "Kê khai thuế" đã chốt 17/8 (real: report/report_manage).
// v52: 19/08 Task 2 tiếp — tự bấm tay phát hiện bug-580: radio "Cỡ chữ" ở Mẫu hoá đơn luôn lưu ra "Lớn" bất kể chọn gì (handler Lưu riêng của renderInvoiceForm không dùng bindSave() dùng chung nên chưa được vá cùng đợt v51).
// v51: 19/08 Task 2 — Cài đặt v2 theo 36 ảnh mẫu Website v2/Cài đặt: fix bug chữ thẳng bị đổi thành chữ cong ở Mẫu hoá đơn (class/data-f vỡ), fix bug ~20 công tắc Mẫu hoá đơn không lưu được (thiếu khai báo schema), thêm Giờ mở cửa/Loại hình kinh doanh/Địa điểm kinh doanh, ảnh màn hình phụ, tab Cài đặt Website, mở rộng Thông tin sản phẩm + Quản lý thuế + Tích điểm, thêm màn Nhập dữ liệu.
// v50: 19/08 Đợt 7 Báo cáo — 3 màn giao diện SoBanHang v2 (Kho hàng/Bán hàng/Lãi lỗ): KPI 4 thẻ, biểu đồ SVG, bảng chi tiết, modal, So sánh cùng kỳ, Lợi nhuận theo.
// v49: 18/08 Việc 1-4 — nhóm mới "Kênh bán hàng" (san-tmdt/don-hang-tmdt/san-pham-tmdt/hoa-don-tmdt.js), avatar khách cross-origin fix, import Excel thật cho Nhà cung cấp (KHÔNG cache js/vendor/xlsx.mini.min.js — nặng, tải lazy khi cần), toggle "Đồng thời là nhà cung cấp" ở Khách hàng.
// v48: 18/08 Đợt 7 — nhóm "Đối tác" giao diện v2 (Khách hàng/Nhóm khách hàng/Nhà cung cấp/Hội thoại), thêm views/hoi-thoai.js vào cache.
// v46: 18/08 — Đợt 2 "Quản lý hoá đơn" theo bộ ảnh mới (Website v2/Quản lý hoá đơn): đầu vào từ 21→26 cột (+Mã CQT, +Hình thức thanh toán, +Đơn vị tiền tệ, +Trạng thái thanh toán, +Địa chỉ người bán/mua), 2 ô lọc nhiều-chọn mới "Trạng thái hoá đơn"/"Kết quả kiểm tra" (module dùng chung mới js/filter-dropdown.js), tách nút "Thao tác ▾" (Nhập/Xuất file) khỏi "Đồng bộ hoá đơn" (nay chạy thẳng); đầu ra thêm hộp "Ẩn/Hiện cột" (9 cột, trước đây chưa có), cột "Loại hoá đơn", ô lọc "Trạng thái xử lý" + nút "Đã xử lý/Bỏ xử lý" từng dòng, nút "Nhập từ file" đính file .xml/.zip đã ký (khớp theo tên file); backend: migration 081 (5 cột đầu vào + process_status/invoice_type/signed_file_* đầu ra), invoice-service.js mở rộng, routes mới PATCH /out/:id + POST /out/import-signed, server.js tăng giới hạn body riêng cho đường dẫn import-signed.
// v45: 17/08 — Đợt 6 giao diện SoBanHang v2 nhóm "Quản lý kho" (ảnh mẫu Website v2/Quản lý kho/*): viết lại ton-kho.js/so-kho.js/kiem-kho.js theo bảng + 4 thẻ KPI + popover "Hiển thị cột"; tách nhap-xuat-kho.js (1 màn 2 tab) thành 2 màn mới nhap-hang.js/xuat-kho.js — mỗi màn là danh sách PHIẾU (không phải dòng di chuyển kho lẻ) với modal "Tạo phiếu" đầy đủ: chọn sản phẩm/NVL, giảm giá/thuế từng dòng, chọn nhà cung cấp, thanh toán hoặc ghi nợ (nối Sổ nợ/Sổ quỹ có sẵn), đính kèm ảnh; nav.js sắp lại đúng thứ tự sidebar ảnh mẫu; backend mới stock-document-service.js + routes/stock-documents.js + migration 079 (bảng pos_stock_documents, cột document_id nối pos_stock_moves/pos_ingredient_moves).
// v44: 16/08 — Đợt 4 Tổng quan theo ảnh mẫu "Bức tranh kinh doanh" mới nhất (Website v2/Tổng quan): 5 thẻ KPI (thêm "Khách mới", vẫn giữ "Mục tiêu doanh thu"); khối "Cần xem xét" 7 dòng cố định thay "Cần xử lý"; khối "Thao tác nhanh" 9 nút lưới + banner POS (thay 3 nút chữ, 2 nút Tạo khoản thu/chi giờ mở modal thật tại chỗ thay vì link ?tao= chết); khối mới "Hoạt động gần đây" (tab Đơn vừa bán/Thu chi gần đây); backend overview-service.js thêm today.discount/return/avg_order_value/customers_per_order, new_customers, review[], recent_activity; sửa chữ màn "Hệ thống đang tạm nghỉ" gây hiểu lầm giờ hoạt động (thực chất là mất kết nối mạng, KHÔNG có giới hạn giờ thật).
// v43: 16/08 — Đợt 3 giao diện v2 khu vực Tài chính (T1-14): nhãn "Tài chính" + breadcrumb 2 cấp; backend debt quá hạn + sort; backend transaction category mảng + /partners endpoint; Thu chi KPI +/- màu, gộp cột Mã phiếu/Ngày, cột Mô tả/Mã giao dịch, chip Xoá lọc, Hiển thị cột, phân trang, modal toggle Thu/Chi + +Thêm phân loại, dropdown checkbox 3 bộ lọc; Sổ nợ 2 nút Tôi đã đưa/nhận, 4 KPI quá hạn, filter/sort, Hiển thị cột, autocomplete SĐT; Sổ quỹ tách cột thu/chi, hàng Tổng, phân trang, Hiển thị cột, kebab Huỷ phiếu, 3 dropdown checkbox; Nguồn tiền bảng + tìm kiếm; theme-v2.css tương ứng.
// v42: 16/08 — Đợt 3 T4-6 Thu chi: KPI +/- màu, gộp cột Mã phiếu/Ngày, cột Mô tả/Mã giao dịch, chip "Xoá lọc", popover Hiện thị cột + phân trang, modal toggle Thu/Chi + "+Thêm phân loại" inline, dropdown checkbox Loại giao dịch (thay <select> đơn); theme-v2.css tương ứng.
// v41: 15/08 — Đợt 2 giao diện v2 khu vực Bán hàng: sidebar BÁN HÀNG label; sell.js tab Nhóm khách hàng; orders.js KPI row + Hiện thị cột; theme-v2.css Quản lý bàn + orders KPI + column visibility CSS; backend: customers/search +group_id, order-service +revenue KPIs. // v40: 15/08 — Đợt 1 giao diện mới kiểu SoBanHang v2: cờ localStorage posmgr.theme + 2 link chuyển đổi cũ/mới; sidebar v2 (màu trắng, nhãn nhóm cấp cao QUẢN LÝ, nút thu gọn dời vào hàng thương hiệu); thanh trên v2 (breadcrumb, tìm kiếm Enter-để-chuyển, avatar đọc tên/vai trò); Tổng quan v2 (4 thẻ KPI tô màu, giữ nguyên 4 chỉ số cũ). File mới css/theme-v2.css. // v39: 14/08 — Audit Sổ tiền: Nguồn tiền gọi ?all=1 (tắt nguồn không còn mất khỏi danh sách/Tổng số dư); Thu chi+Sổ quỹ thêm ô "Hiện phiếu đã huỷ" (include_voided, trước đây huỷ phiếu là mất luôn không xem lại được); Sổ nợ modal chi tiết tự vẽ lại sau khi Thu nợ/Trả nợ (trước đây hiện số cũ dù đã ghi nhận); Thu chi/Sổ quỹ/Sổ nợ thêm chặn phản hồi cũ ghi đè khi đổi nhiều bộ lọc liên tiếp thật nhanh // v38: 14/08 — Phần 1: renderInvoiceForm đầy đủ (2 cột, 6 nhóm, 21 field, preview live); Phần 2: renderSalesProcess thêm toggle auto_open_table + 2 dropdown order_code_style/money_announce, save handler xử lý cả select // v37: 13/08 đợt sau — Việc 2: đổi vỏ ngoài Thu chi/Sổ nợ/Sổ quỹ giống ảnh mẫu tài chính Sổ Bán Hàng (bảng + thẻ số liệu + hàng công cụ), gộp Sổ nợ vào thanh tab dùng chung, sắp lại thứ tự Thu chi·Sổ nợ·Sổ quỹ·Nguồn tiền; Việc 3: nút "+ Thêm hoá đơn" ghim ở hàng trên cùng màn Hoá đơn đầu vào + sửa lệch icon/chữ (nút bánh răng, "Xoá lọc", "Xuất file"); Việc 4: panel "Yêu cầu" (chuông) dùng chung màn Bán hàng + Quản lý bàn, mount lại Quản lý bếp bên trong thay vì chỉ mở màn Thông báo chung
// (v36: 13/08 — T1 bảng lịch màn Quản lý bếp hết bị thẻ cha overflow:hidden xén cụt (đổi sang position:fixed tự tính toạ độ); T2 thêm 11 màn Cài đặt còn thiếu so với Sổ Bán Hàng (Màn hình phụ · Website cửa hàng · Sắp xếp vị trí menu · Quản lý vận chuyển · Mẫu in tem · Quản lý thuế · Hoá đơn điện tử · Cấu hình tin nhắn · Chatbot · Sao lưu dữ liệu · Xoá cửa hàng); T3 nhóm menu MỚI "Quản lý hoá đơn" với 2 màn Hoá đơn đầu vào (nhập tay/nhập file/xuất file/ẩn-hiện 21 cột) và Hoá đơn đầu ra (phát hành từ đơn hàng thật))
// (v35: 12/08 — T1 ô "Hẹn giao → Tuỳ chọn…" gộp thành MỘT nút mở bảng lịch đôi (cỗ máy lịch tách ra js/date-range-picker.js + js/date-utils.js, dùng chung với màn bếp) và nút tròn thu gọn cột trái dời ra khỏi thanh cuộn; T3 phiếu in bill + tin Telegram báo bếp có thêm "Hẹn giao" và "TT giao hàng"; T4 màn Bếp đổi tên "Quản lý bếp", mỗi nửa có bảng lịch chọn khoảng ngày + lọc "đã chờ ≥ N phút" + menu 3 kiểu sắp xếp
// (v33: 10/08 đợt 6 — T1 Trả hàng từng phần + phiếu chi hoàn tiền thật; T2 chi tiết đơn có bảng Thanh toán + Lịch sử thao tác + nút Sao chép đơn; T3 POS thêm ô Chiết khấu (VND|%) + Ghi chú đơn + nút "Lưu đơn (F2)" + bảng Chú thích phím tắt (F1/F2/F3/F4/ALT+C/ALT+N); T4 màn Khách hàng 4 thẻ chỉ số + Cài đặt hiển thị; T5 Thư viện template vai trò (6 mẫu) và SỬA lỗi màn Vai trò trắng trơn (ReferenceError staff)
// (v32: 10/08 — T1 ô bàn thu nhỏ + nút "In mã QR bàn" (in tất cả / chọn bàn); T2 bảng lịch hết tràn (max-width 528px), nút "Năm…" chọn năm bất kỳ, bảng đơn thêm cột Hẹn giao/TT giao hàng/Thanh toán/Tổng đơn hàng + nút 3 chấm sửa-xoá (dùng chung cho Khách hàng, Sản phẩm), sửa thông tin khách + ảnh đại diện; T3 ô Hẹn giao khi lên đơn + lọc/sắp xếp theo hẹn giao; T4 lọc TT giao hàng; T5 màn Bếp dựng lại 2 nửa kiểu Sổ Bán Hàng
// NHỚ: mỗi lần đổi/thêm file JS/CSS đều PHẢI nâng version ở đây — quên nâng thì máy khách vẫn
// dùng bản cache cũ dù server đã có bản mới (bug lặp lại từ GĐ6, xem .wolf/buglog.json).
const SHELL_FILES = [
  './',
  './index.html',
  './css/app.css',
  './css/theme-v2.css',
  './js/app.js',
  './js/api.js',
  './js/ui.js',
  './js/icons.js',
  './js/icons-sbh.js',
  './js/nav.js',
  './js/display.js',
  // Task 1 (12/08/2026) — toán ngày + bảng lịch đôi dùng chung cho màn Đơn hàng và Quản lý bếp.
  './js/date-utils.js',
  './js/date-range-picker.js',
  './js/filter-dropdown.js',
  './js/yeu-cau-panel.js',
  './js/views/login.js',
  './js/views/dang-ky.js',
  './js/views/quen-mat-khau.js',
  './js/views/dat-lai-mat-khau.js',
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
  // Việc "Thuế" (19/08/2026)
  './js/views/nhat-ky-ke-khai.js',
  './js/views/ke-khai-thue.js',
  './js/views/thiet-lap-so-ke-toan.js',
  './js/views/gia-von.js',
  './js/views/san-pham.js',
  './js/views/nhap-hang.js',
  './js/views/xuat-kho.js',
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
  './js/views/hoi-thoai.js',
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
  // Task 3 (13/08/2026) — Quản lý hoá đơn
  './js/views/hoa-don-vao.js',
  './js/views/hoa-don-ra.js',
  // Đợt 5 (17/08/2026) — In tem mã vạch (màn mới tách từ san-pham)
  './js/views/in-tem-ma-vach.js',
  // Việc 1 (18/08/2026) — nhóm "Kênh bán hàng"
  './js/views/san-tmdt.js',
  './js/views/don-hang-tmdt.js',
  './js/views/san-pham-tmdt.js',
  './js/views/hoa-don-tmdt.js',
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
