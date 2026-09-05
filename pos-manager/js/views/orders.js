// T12 — Danh sách đơn hàng.
import { api, getApiBase } from '../api.js';
import { formatVND, escapeHtml, toast, openModal, confirmDialog, tableName } from '../ui.js';
import { icon } from '../icons.js';
import { createRangePicker } from '../date-range-picker.js';

const TABS = [
  ['tat-ca', 'Tất cả'],
  ['cho-xac-nhan', 'Chờ xác nhận'],
  ['dang-xu-ly', 'Đang xử lý'],
  ['da-giao', 'Đã giao'],
  ['tra-hang', 'Trả hàng'],
  ['huy', 'Đã huỷ'],
];
const STATUS_LABEL = {
  payment_pending: 'Chờ xác nhận', confirmed: 'Đang xử lý', preparing: 'Đang xử lý',
  paid: 'Đã giao', delivered: 'Đã giao', returned: 'Trả hàng', cancelled: 'Huỷ',
};
const DELIVERY_LABEL = { 'tai-ban': 'Tại bàn', 'mang-ve': 'Mang về', 'giao-hang': 'Giao hàng' };
const NEXT_STATUS = {
  confirmed: [['preparing', 'Bắt đầu chuẩn bị'], ['delivered', 'Đánh dấu đã giao']],
  preparing: [['delivered', 'Đánh dấu đã giao']],
  paid: [['delivered', 'Đánh dấu đã giao'], ['returned', 'Trả hàng']],
  delivered: [['returned', 'Trả hàng']],
};

// ── Task 2 mục 4 (2026-08-08): sắp xếp + lọc nhanh theo thời gian ─────────────────────────────
// Khoá phải KHỚP CHÍNH XÁC ORDER_SORTS trong src/pos-manager/services/order-service.js — server
// chỉ chấp nhận đúng 4 khoá này, giá trị lạ sẽ âm thầm rơi về 'moi-nhat'.
// Task 2 (2026-08-09): chủ quán xin gọi tên ngắn hơn — "Mới nhất" thay "Mới nhất trước", và
// "Giá trị" thay "Tiền" (đơn hàng có giá trị, không chỉ có tiền mặt). CHỈ đổi CHỮ HIỆN RA, khoá
// gửi lên máy chủ giữ nguyên.
export const SORTS = {
  'moi-nhat': 'Mới nhất',
  'cu-nhat': 'Cũ nhất',
  'tien-cao': 'Giá trị cao → thấp',
  'tien-thap': 'Giá trị thấp → cao',
  // Task 3 (10/08/2026) — sắp xếp theo mốc hẹn giao. Khoá PHẢI khớp ORDER_SORTS của
  // src/pos-manager/services/order-service.js, khoá lạ bị máy chủ lặng lẽ đổi về 'moi-nhat'.
  'hen-gan': 'Hẹn giao: gần → xa',
  'hen-xa': 'Hẹn giao: xa → gần',
};
const DEFAULT_SORT = 'moi-nhat';

// ── Task 4 (10/08/2026) — trạng thái GIAO HÀNG (khâu vận chuyển) ─────────────────────────────
// 7 mốc đúng như ô lọc "TT giao hàng" của Sổ Bán Hàng. Khoá khớp DELIVERY_STATUSES của
// order-service.js. Khác hẳn cột "Trạng thái" (khâu xử lý đơn) — xem migration 076.
export const DELIVERY_STATES = [
  ['cho-lay-hang', 'Chờ lấy hàng'],
  ['dang-giao', 'Đang giao'],
  ['giao-that-bai', 'Giao hàng thất bại'],
  ['cho-khach-xac-nhan', 'Chờ khách xác nhận'],
  ['da-giao', 'Đã giao'],
  ['cho-tra-hang', 'Chờ trả hàng'],
  ['da-tra-hang', 'Đã trả hàng'],
];
const DELIVERY_STATE_LABEL = Object.fromEntries(DELIVERY_STATES);

// ── Task 3 (10/08/2026) — lối tắt lọc theo mốc HẸN GIAO ─────────────────────────────────────
// Khoá khớp SCHEDULED_FILTERS của order-service.js. 'tuy-chon' được xử lý riêng: nó mở thêm 2 ô
// ngày để chủ quán tự khoanh khoảng.
export const SCHEDULE_FILTERS = [
  ['khong-hen', 'Không hẹn lịch'],
  ['hom-nay', 'Hôm nay'],
  ['ngay-mai', 'Ngày mai'],
  ['thang-nay', 'Tháng này'],
  ['tuy-chon', 'Tuỳ chọn…'],
];

// Task 2 (2026-08-09) — trạng thái thanh toán + nguồn tiền. Khoá khớp PAYMENT_STATES của
// order-service.js.
export const PAYMENT_STATES = [
  ['da-thanh-toan', 'Đã thanh toán'],
  ['chua-thanh-toan', 'Chưa thanh toán'],
  ['ghi-no', 'Ghi nợ'],
];

// Toán ngày thuần chuỗi 'YYYY-MM-DD' và bộ lối tắt khoảng thời gian nay nằm ở js/date-utils.js
// (từ 12/08/2026) để màn Quản lý bếp dùng chung. Vẫn xuất lại nguyên tên cũ ở đây vì các màn khác
// và bộ test đang nhập từ views/orders.js.
//
// PHẢI `import` rồi mới `export`, KHÔNG viết gộp `export { … } from '…'`:
// dạng gộp chỉ chuyển tiếp tên ra NGOÀI, KHÔNG tạo biến dùng được bên trong tệp này. Bản đầu viết
// gộp nên `QUICK_RANGES` trong quickChipsHtml() là undefined → mở màn Đơn hàng là trắng trơn kèm
// "ReferenceError: QUICK_RANGES is not defined". Bộ test soi mã nguồn KHÔNG bắt được (nó chỉ gọi
// hàm thuần đã xuất, không dựng màn) — chỉ mở Chrome thật mới lộ (12/08/2026).
import {
  QUICK_RANGES, ymd, addDays, weekdayMon0, daysInMonth, rangeDates, monthMatrix, dmy,
} from '../date-utils.js';

export { QUICK_RANGES, ymd, addDays, weekdayMon0, daysInMonth, rangeDates, monthMatrix, dmy };

export async function render(container) {
  let tab = 'tat-ca';
  const emptyFilters = () => ({
    search: '', date_from: '', date_to: '', delivery_type: '', staff_id: '',
    payment_state: '', cash_account_id: '', sort: DEFAULT_SORT,
    // Task 4 — TT giao hàng (chọn nhiều). Task 3 — mốc hẹn giao + khoảng ngày riêng của nó.
    delivery_status: '', scheduled: '', scheduled_from: '', scheduled_to: '',
  });
  let filters = emptyFilters();
  let orders = [];
  let counts = {};
  let kpis = { total_revenue: 0, pending_revenue: 0 }; // Đợt 2 15/08 — KPI doanh thu
  let staffList = [];
  // Đợt 4 (04/09/2026) — phân trang. Máy chủ đã nhận page/page_size từ lâu (order-service.js)
  // nhưng màn này chưa bao giờ gửi, nên quán 245 đơn chỉ thấy 50 đơn đầu mà không hay biết.
  let page = 1;
  let pageSize = 50;

  // Task 3 (09/08/2026 đợt 5) — 4 ô lọc đổi sang kiểu Sổ Bán Hàng: bấm ra một bảng có ô tìm kiếm
  // và danh sách ô-vuông-tích, CHỌN ĐƯỢC NHIỀU mục cùng lúc (ảnh 15/18/19 chủ quán gửi). Trước
  // đây là <select> chỉ chọn được 1 mục nên muốn xem "Mang về + Giao hàng" phải xem 2 lượt.
  // Chỉ RUỘT của ô lọc mới dùng chung hàm dựng; phần vỏ `<div class="ord-dd" id="…">` vẫn viết
  // thẳng ở dưới để mã nguồn đọc ra ngay ô nào nằm chỗ nào trong lưới.
  const ddInner = (label) => `
          <button type="button" class="btn ord-dd-btn" aria-haspopup="listbox" aria-expanded="false">
            <span class="ord-dd-label">${escapeHtml(label)}</span>
            <svg class="ord-dd-caret" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
          </button>
          <div class="ord-dd-pop hidden" role="listbox">
            <div class="ord-dd-search"><input type="search" placeholder="Tìm trong ${escapeHtml(String(label).toLowerCase())}..." aria-label="Tìm trong ${escapeHtml(label)}" /></div>
            <div class="ord-dd-list"></div>
          </div>`;

  // ── Task 1 (12/08/2026) — HAI nút khoảng ngày, CHUNG một cỗ máy ─────────────────────────────
  // Trước đây chỉ ô lọc "Ngày tạo" mới có nút mở bảng lịch đôi, còn "Hẹn giao → Tuỳ chọn…" lại là
  // HAI ô <input type="date"> gõ tay. Chủ quán: "muốn nó giống nút chọn thời gian ở trên, gộp vào
  // thành 1 nút, ấn thì hiện luôn cả lịch chọn ngày đầu và lịch chọn ngày cuối".
  //
  // Phần HÀNH VI (mở/đóng, vẽ lịch, chọn khoảng, lối tắt, bảng Năm…) gói hết trong
  // `createRangePicker(ids, cfg)` bên dưới — sửa một lần là cả hai nút đổi theo. Riêng phần
  // MARKUP thì mỗi nút viết thẳng ra: id phải là chữ thật (`id="ord-date-btn"`) chứ không phải
  // biến `id="${ids.btn}"`, vì các bài kiểm T86/T87/T89/T90 soi thẳng mã nguồn để biết ô lọc nào
  // còn nằm trong lưới — dựng bằng biến là chúng không đọc ra id nữa dù trang chạy vẫn đúng.
  //
  // Hai bộ id dưới đây là hợp đồng giữa markup và cỗ máy: đổi id ở một nơi phải đổi cả hai.
  const quickChipsHtml = () =>
    QUICK_RANGES.map(([key, label]) => `<button type="button" class="chip" data-range="${key}">${label}</button>`).join('');

  const CREATED_IDS = {
    btn: 'ord-date-btn', label: 'ord-date-label', pop: 'ord-date-pop',
    calLeft: 'odp-cal-left', calRight: 'odp-cal-right', quick: 'ord-quick-range',
    yearBtn: 'ord-year-btn', yearPop: 'ord-year-pop',
    sel: 'odp-sel', clear: 'odp-clear', apply: 'odp-apply',
  };
  // Bộ lọc "Hẹn giao → Tuỳ chọn…" — id riêng để hai bảng lịch không giẫm lên nhau.
  const SCHED_IDS = {
    btn: 'ord-sched-btn', label: 'ord-sched-label', pop: 'ord-sched-pop',
    calLeft: 'sdp-cal-left', calRight: 'sdp-cal-right', quick: 'ord-sched-quick-range',
    yearBtn: 'ord-sched-year-btn', yearPop: 'ord-sched-year-pop',
    sel: 'sdp-sel', clear: 'sdp-clear', apply: 'sdp-apply',
  };

  container.innerHTML = `
    <div class="page-head">
      <h2>Đơn hàng</h2>
      <!-- Đợt 4 (04/09/2026) — ảnh mẫu đặt HAI nút cạnh nhau ở góc phải: "Thao tác" (viền trắng,
           gom các việc phụ như tải Excel) rồi mới tới nút xanh "Tạo đơn hàng". -->
      <div class="page-head-actions">
      <div class="ord-more" id="ord-more">
        <button type="button" class="btn ord-more-btn" id="ord-more-btn" aria-haspopup="menu" aria-expanded="false">
          Thao tác
          <svg class="ord-dd-caret" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
        </button>
        <div class="ord-more-menu hidden" id="ord-more-menu" role="menu">
          <button type="button" role="menuitem" id="ord-export">${icon('tai-xuong')} Tải Excel</button>
        </div>
      </div>
      <!-- Nút tạo đơn kiểu Sổ Bán Hàng: phần chính + mũi tên mở thêm lựa chọn (ảnh 16). -->
      <div class="ord-create" id="ord-create">
        <a class="btn btn-primary ord-create-main" href="#/ban-hang">+ Tạo đơn hàng</a>
        <button type="button" class="btn btn-primary ord-create-caret" id="ord-create-caret" aria-haspopup="menu" aria-expanded="false" aria-label="Thêm cách tạo đơn">
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
        </button>
        <div class="ord-create-menu hidden" id="ord-create-menu" role="menu">
          <a href="#/ban-hang" role="menuitem">${icon('ban-hang')} Tạo đơn hàng</a>
          <a href="#/ban-nhanh" role="menuitem">${icon('ban-nhanh')} Bán nhanh</a>
        </div>
      </div>
      </div>
    </div>
    <div class="orders-kpi" id="ord-kpi"></div>
    <!-- Khối lọc là LƯỚI 6 CỘT × 2 HÀNG nên 2 hàng luôn khớp mép phải.
         Hàng 1: tìm kiếm (2 cột) · khoảng ngày · hình thức · nhân viên · sắp xếp.
         Hàng 2: trạng thái thanh toán (2 cột) · nguồn tiền (2 cột) · 2 nút Xoá lọc / Xuất Excel
         (2 cột, ghim mép phải bằng .ord-actions). -->
    <div class="orders-filters">
      <!-- Đợt 4 (04/09/2026) — hàng lọc gọn đúng ảnh mẫu SoBanHang: ô tìm kiếm · nút khoảng ngày ·
           trạng thái thanh toán · nút "Bộ lọc" · "Xoá lọc"; bên phải là ô sắp xếp và nút vuông
           chọn cột. Trước đây 7 ô lọc dàn thành lưới 6 cột × 3 hàng, chiếm gần nửa màn hình.
           5 ô lọc ít dùng chuyển vào hộp thoại "Bộ lọc" bên dưới — VẪN LÀ .ord-dd cũ, cùng một
           cỗ máy chọn-nhiều, chỉ khác là trong hộp thoại chúng luôn mở sẵn (xem ddOpen). -->
      <div class="ord-filter-bar" id="ord-filter-grid">
        <input id="ord-search" class="ord-search" type="search" placeholder="Tìm mã đơn / tên khách / SĐT" />
        <div class="ord-date-wrap">
          <button type="button" class="btn ord-date-btn" id="ord-date-btn" aria-haspopup="dialog" aria-expanded="false">
            <span class="inline-ico">${icon('lich') || ''}</span><span id="ord-date-label">Mọi thời gian</span>
          </button>
          <div class="ord-date-pop hidden" id="ord-date-pop" role="dialog" aria-label="Chọn khoảng ngày">
            <div class="odp-cals">
              <div class="odp-cal" id="odp-cal-left" data-side="left"></div>
              <div class="odp-cal" id="odp-cal-right" data-side="right"></div>
            </div>
            <!-- Lối tắt nằm NGAY TRONG bảng lịch như Sổ Bán Hàng (ảnh 14), không còn là một hàng
                 chip riêng chiếm chỗ ngoài khối lọc. -->
            <div class="ord-quick-range" id="ord-quick-range">
              ${quickChipsHtml()}
              <!-- Task 2 (10/08/2026) — BỎ ô <select> chỉ liệt kê 3 năm gần đây. Chủ quán:
                   "muốn chọn xa hơn nữa thì không chọn được, ấn vào nút Năm… phải chọn được năm
                   bất kỳ". Nay là một NÚT mở bảng 12 năm có mũi tên lùi/tiến 12 năm một lần. -->
              <div class="ord-year-wrap">
                <button type="button" class="chip" id="ord-year-btn" aria-haspopup="dialog" aria-expanded="false">Năm…</button>
                <div class="ord-year-pop hidden" id="ord-year-pop" role="dialog" aria-label="Chọn năm"></div>
              </div>
            </div>
            <div class="odp-foot">
              <span class="odp-sel" id="odp-sel">Chưa chọn ngày</span>
              <button type="button" class="btn btn-ghost" id="odp-clear">Xoá ngày</button>
              <button type="button" class="btn btn-primary" id="odp-apply">Áp dụng</button>
            </div>
          </div>
        </div>
        <div class="ord-dd" id="ord-pay-state">${ddInner('Trạng thái thanh toán')}
        </div>
        <button type="button" class="btn ord-filter-btn" id="ord-filter-btn" aria-haspopup="dialog" aria-expanded="false">
          <span class="inline-ico">${icon('bo-loc')}</span> Bộ lọc<span class="ord-filter-badge hidden" id="ord-filter-badge">0</span>
        </button>
        <button id="ord-reset" class="btn btn-clear" type="button">× Xoá lọc</button>
        <div class="ord-actions">
          <select id="ord-sort" aria-label="Sắp xếp">
            ${Object.entries(SORTS).map(([k, v]) => `<option value="${k}">${escapeHtml(v)}</option>`).join('')}
          </select>
          <div class="ord-cols-wrap" id="ord-cols-wrap">
            <button id="ord-cols-btn" class="btn pm-col-btn ord-cols-icon" type="button" aria-haspopup="true"
              aria-expanded="false" aria-label="Hiển thị cột" title="Hiển thị cột">${icon('cot-hien-thi')}</button>
            <div id="ord-cols-pop" class="ord-cols-pop hidden" role="dialog" aria-label="Chọn cột hiển thị"></div>
          </div>
        </div>
      </div>

      <!-- Hộp thoại "Bộ lọc" — 3 cột đúng ảnh mẫu: trái là tên nhóm, giữa là danh sách tích chọn
           của nhóm đang mở, phải liệt kê những mục đã chọn. Bấm "Hủy" trả lại đúng trạng thái lúc
           mở hộp (các ô bên trong KHÔNG tự gọi lại danh sách đơn khi hộp còn mở — xem fmodalOpen). -->
      <div class="ord-fmodal hidden" id="ord-fmodal">
        <div class="ord-fmodal-backdrop" id="ord-fmodal-backdrop"></div>
        <div class="ord-fmodal-box" role="dialog" aria-modal="true" aria-label="Bộ lọc">
          <div class="ord-fmodal-body">
            <div class="ord-fmodal-rail" id="ord-fmodal-rail">
              <div class="ord-fmodal-title">Bộ lọc</div>
              <button type="button" class="ord-frail-item active" data-grp="g-deliv">Giao hàng</button>
              <button type="button" class="ord-frail-item" data-grp="g-cash">Nguồn tiền nhận</button>
              <button type="button" class="ord-frail-item" data-grp="g-delivst">TT giao hàng</button>
              <button type="button" class="ord-frail-item" data-grp="g-sched">Hẹn giao</button>
              <button type="button" class="ord-frail-item" data-grp="g-staff">Nhân viên tạo đơn</button>
            </div>
            <div class="ord-fmodal-panel" id="ord-fmodal-panel">
              <div class="ord-fgrp" data-grp="g-deliv">
                <div class="ord-dd" id="ord-delivery-type">${ddInner('Hình thức')}
                </div>
              </div>
              <div class="ord-fgrp hidden" data-grp="g-cash">
                <div class="ord-dd" id="ord-cash-account">${ddInner('Nguồn tiền nhận')}
                </div>
              </div>
              <div class="ord-fgrp hidden" data-grp="g-delivst">
                <div class="ord-dd" id="ord-deliv-state">${ddInner('TT giao hàng')}
                </div>
              </div>
              <div class="ord-fgrp hidden" data-grp="g-sched">
                <!-- Task 3 (10/08/2026) — 5 mốc hẹn giao loại trừ nhau nên là <select>, không phải
                     ô tích chọn nhiều; "Tuỳ chọn…" mở thêm nút chọn khoảng ngày ngay dưới. -->
                <select id="ord-schedule" aria-label="Lọc theo hẹn giao">
                  <option value="">Hẹn giao: tất cả</option>
                  ${SCHEDULE_FILTERS.map(([k, v]) => `<option value="${k}">${escapeHtml(v)}</option>`).join('')}
                </select>
                <div class="ord-date-wrap ord-sched-range hidden" id="ord-sched-range">
                  <button type="button" class="btn ord-date-btn" id="ord-sched-btn" aria-haspopup="dialog" aria-expanded="false">
                    <span class="inline-ico">${icon('lich') || ''}</span><span id="ord-sched-label">Chọn khoảng hẹn giao</span>
                  </button>
                  <div class="ord-date-pop hidden" id="ord-sched-pop" role="dialog" aria-label="Chọn khoảng ngày hẹn giao">
                    <div class="odp-cals">
                      <div class="odp-cal" id="sdp-cal-left" data-side="left"></div>
                      <div class="odp-cal" id="sdp-cal-right" data-side="right"></div>
                    </div>
                    <div class="ord-quick-range" id="ord-sched-quick-range">
                      ${quickChipsHtml()}
                      <div class="ord-year-wrap">
                        <button type="button" class="chip" id="ord-sched-year-btn" aria-haspopup="dialog" aria-expanded="false">Năm…</button>
                        <div class="ord-year-pop hidden" id="ord-sched-year-pop" role="dialog" aria-label="Chọn năm"></div>
                      </div>
                    </div>
                    <div class="odp-foot">
                      <span class="odp-sel" id="sdp-sel">Chưa chọn ngày</span>
                      <button type="button" class="btn btn-ghost" id="sdp-clear">Xoá ngày</button>
                      <button type="button" class="btn btn-primary" id="sdp-apply">Áp dụng</button>
                    </div>
                  </div>
                </div>
              </div>
              <div class="ord-fgrp hidden" data-grp="g-staff">
                <div class="ord-dd" id="ord-staff">${ddInner('Nhân viên tạo đơn')}
                </div>
              </div>
            </div>
            <div class="ord-fmodal-side">
              <div class="ord-fmodal-side-head" id="ord-fsel-count">0 bộ lọc đã chọn</div>
              <div class="ord-fmodal-side-list" id="ord-fsel-list"></div>
            </div>
          </div>
          <div class="ord-fmodal-foot">
            <button type="button" class="btn btn-ghost" id="ord-fclear"><span class="inline-ico">${icon('quay-lai')}</span> Thiết lập lại</button>
            <span class="ord-fmodal-foot-gap"></span>
            <button type="button" class="btn" id="ord-fcancel">Hủy</button>
            <button type="button" class="btn btn-primary" id="ord-fapply">Áp dụng</button>
          </div>
        </div>
      </div>
    </div>
    <div class="tab-row orders-tabs" id="ord-tabs"></div>
    <div class="orders-list" id="ord-list"><p>Đang tải…</p></div>
    <div class="ord-pager" id="ord-pager"></div>
  `;

  const $ = (sel) => container.querySelector(sel);

  // Đợt 2 15/08 — 4 thẻ KPI tóm tắt (chỉ hiện trong v2 theme)
  function renderKpi() {
    const el = $('#ord-kpi');
    if (!el) return;
    // Đợt 4 (04/09/2026) — ảnh mẫu SoBanHang: NHÃN đứng trên (chữ xám nhỏ), SỐ đứng dưới (to,
    // mỗi ô một màu), cả 4 ô nằm trong CÙNG một thẻ trắng ngăn nhau bằng vạch dọc. Bản cũ đảo
    // ngược (số trên nhãn dưới) và mỗi ô là một thẻ màu riêng.
    el.innerHTML = `
      <div class="kpi kpi-orders"><div class="kpi-lbl">Đơn hàng</div><div class="kpi-val">${counts['tat-ca'] ?? 0}</div></div>
      <div class="kpi kpi-revenue"><div class="kpi-lbl">Doanh thu</div><div class="kpi-val">${formatVND(kpis.total_revenue)}</div></div>
      <div class="kpi kpi-pending"><div class="kpi-lbl">Chờ xác nhận</div><div class="kpi-val">${counts['cho-xac-nhan'] ?? 0}</div></div>
      <div class="kpi kpi-pending-rev"><div class="kpi-lbl">Doanh thu chưa xử lý</div><div class="kpi-val">${formatVND(kpis.pending_revenue)}</div></div>
    `;
  }

  function renderTabs() {
    $('#ord-tabs').innerHTML = TABS.map(([key, label]) =>
      // Đợt 4 (04/09/2026) — ảnh mẫu ghi số đếm trong VIÊN TRÒN cạnh tên tab, không phải "(245)".
      `<button class="tab ${key === tab ? 'active' : ''}" data-tab="${key}">${label} <span class="tab-count">${counts[key] ?? 0}</span></button>`
    ).join('');
    container.querySelectorAll('[data-tab]').forEach((b) => {
      b.addEventListener('click', () => { tab = b.dataset.tab; load(); });
    });
  }

  // '2026-08-09T15:02:00Z' → { d: '09/08/2026', t: '22:02' } theo giờ VN; rỗng thì trả gạch ngang.
  function stampVN(iso) {
    if (!iso) return { d: '—', t: '' };
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return { d: '—', t: '' };
    const opt = { timeZone: 'Asia/Ho_Chi_Minh' };
    return {
      d: dt.toLocaleDateString('vi-VN', { ...opt, day: '2-digit', month: '2-digit', year: 'numeric' }),
      t: dt.toLocaleTimeString('vi-VN', { ...opt, hour: '2-digit', minute: '2-digit', hour12: false }),
    };
  }

  // Task 3 (09/08/2026 đợt 5) — danh sách đơn đổi sang BẢNG có tiêu đề cột như Sổ Bán Hàng
  // (Thông tin đơn hàng · Ngày tạo · Ngày hoàn thành · Trạng thái · Giao hàng). Vẫn giữ nguyên
  // markup thẻ .order-card bên trong mỗi hàng cho màn hẹp: CSS thu bảng về dạng thẻ ở ≤900px,
  // vì bảng 5 cột trên điện thoại phải cuộn ngang mới đọc được.
  // Task 2 (10/08/2026) — "Thanh toán" là một CỘT RIÊNG. Đọc theo paid_confirmed_at + payment_method
  // đúng như PAYMENT_STATES của máy chủ, KHÔNG suy từ `status`: status 'delivered' vừa có thể là đã
  // thu tiền vừa có thể là shipper thu hộ chưa nộp — hiện nhầm là chủ quán tưởng đã có tiền.
  function payCell(o) {
    if (o.payment_method === 'ghi-no') return '<span class="pay-dot pay-debt" title="Ghi nợ">Ghi nợ</span>';
    if (o.paid_confirmed_at) return '<span class="pay-dot pay-yes" title="Đã thanh toán">Đã TT</span>';
    if (o.status === 'cancelled') return '<span class="pay-dot pay-none">—</span>';
    return '<span class="pay-dot pay-no" title="Chưa thanh toán">Chưa TT</span>';
  }

  function renderList() {
    const el = $('#ord-list');
    if (!orders.length) { el.innerHTML = '<p>Không có đơn nào phù hợp.</p>'; return; }
    const rows = orders.map((o) => {
      const c = stampVN(o.created_at);
      const f = stampVN(o.paid_confirmed_at);
      const s = stampVN(o.scheduled_at);
      const deliv = DELIVERY_LABEL[o.delivery_type] || o.delivery_type;
      return `
        <tr class="ord-row" data-code="${escapeHtml(o.order_code)}">
          <td class="ord-td-info">
            <div class="ord-td-code">${escapeHtml(o.order_code)}</div>
            <div class="ord-td-cust">${escapeHtml(o.customer_name || 'Khách lẻ')}${o.customer_phone ? ' · ' + escapeHtml(o.customer_phone) : ''}</div>
          </td>
          <td data-col="col-created" class="ord-td-date"><div>${c.d}</div><div class="ord-td-time">${c.t}</div></td>
          <td data-col="col-finished" class="ord-td-date"><div>${f.d}</div><div class="ord-td-time">${f.t}</div></td>
          <td data-col="col-sched" class="ord-td-date ord-td-sched"><div>${s.d}</div><div class="ord-td-time">${s.t}</div></td>
          <td><span class="order-status-badge status-${o.status}">${STATUS_LABEL[o.status] || o.status}</span></td>
          <td data-col="col-deliv" class="ord-td-deliv">${escapeHtml(deliv)}${o.table_no ? ' · ' + escapeHtml(tableName(o)) : ''}</td>
          <td data-col="col-delivst" class="ord-td-delivst">${o.delivery_status ? escapeHtml(DELIVERY_STATE_LABEL[o.delivery_status] || o.delivery_status) : '—'}</td>
          <td data-col="col-pay" class="ord-td-pay">${payCell(o)}</td>
          <td class="ord-td-total">${formatVND(o.total)}${o.item_count ? `<div class="ord-td-items">${o.item_count} sản phẩm</div>` : ''}</td>
          <td class="ord-td-act">
            <button type="button" class="ord-kebab" data-menu="${escapeHtml(o.order_code)}"
              aria-haspopup="menu" aria-expanded="false" aria-label="Thao tác với đơn ${escapeHtml(o.order_code)}">${icon('them')}</button>
          </td>
        </tr>`;
    }).join('');
    el.innerHTML = `
      <div class="ord-tablewrap">
        <table class="ord-table ord-table-wide">
          <thead><tr>
            <th>Thông tin đơn hàng</th>
            <th data-col="col-created">Ngày tạo</th>
            <th data-col="col-finished">Ngày hoàn thành</th>
            <th data-col="col-sched">Hẹn giao</th>
            <th>Trạng thái</th>
            <th data-col="col-deliv">Giao hàng</th>
            <th data-col="col-delivst">TT giao hàng</th>
            <th data-col="col-pay">Thanh toán</th>
            <th class="ord-th-total">Tổng đơn hàng</th><th class="ord-th-act"></th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
    el.querySelectorAll('.ord-row').forEach((row) => {
      row.addEventListener('click', (e) => {
        // Bấm vào nút 3 chấm KHÔNG được mở luôn chi tiết đơn — nếu không thì menu vừa bật ra đã bị
        // hộp thoại chi tiết đè lên và chủ quán không bao giờ bấm được "Chỉnh sửa"/"Xoá".
        if (e.target.closest('.ord-kebab')) return;
        openDetailModal(row.dataset.code);
      });
    });
    el.querySelectorAll('.ord-kebab').forEach((btn) => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); openRowMenu(btn); });
    });
  }

  // ── Đợt 2 15/08 — Hiện thị cột (column visibility, v2 feature) ───────────
  const COL_KEY = 'posmgr.orders.cols.v1';
  const TOGGLEABLE_COLS = [
    { id: 'col-created',  label: 'Ngày tạo' },
    { id: 'col-finished', label: 'Ngày hoàn thành' },
    { id: 'col-sched',    label: 'Hẹn giao' },
    { id: 'col-deliv',    label: 'Giao hàng' },
    { id: 'col-delivst',  label: 'TT giao hàng' },
    { id: 'col-pay',      label: 'Thanh toán' },
  ];
  function getHiddenCols() {
    try { return JSON.parse(localStorage.getItem(COL_KEY) || '[]'); } catch { return []; }
  }
  function saveHiddenCols(arr) {
    try { localStorage.setItem(COL_KEY, JSON.stringify(arr)); } catch { /* private mode */ }
  }
  function applyColVisibility() {
    const hidden = getHiddenCols();
    const list = container.querySelector('#ord-list');
    if (!list) return;
    TOGGLEABLE_COLS.forEach(({ id }) => {
      const isHidden = hidden.includes(id);
      list.querySelectorAll(`[data-col="${id}"]`).forEach((el) => el.classList.toggle('ord-col-hidden', isHidden));
    });
  }
  function openColPop() {
    const pop = container.querySelector('#ord-cols-pop');
    const btn = container.querySelector('#ord-cols-btn');
    if (!pop || !btn) return;
    const hidden = getHiddenCols();
    pop.innerHTML = TOGGLEABLE_COLS.map(({ id, label }) =>
      `<label class="ord-col-row"><input type="checkbox" data-col-toggle="${id}" ${hidden.includes(id) ? '' : 'checked'} /><span>${label}</span></label>`
    ).join('');
    pop.querySelectorAll('[data-col-toggle]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const id = cb.dataset.colToggle;
        const h = getHiddenCols();
        if (cb.checked) { const i = h.indexOf(id); if (i !== -1) h.splice(i, 1); }
        else if (!h.includes(id)) h.push(id);
        saveHiddenCols(h);
        applyColVisibility();
      });
    });
    const wasHidden = pop.classList.contains('hidden');
    pop.classList.toggle('hidden');
    btn.setAttribute('aria-expanded', wasHidden ? 'true' : 'false');
  }
  container.querySelector('#ord-cols-btn')?.addEventListener('click', (e) => { e.stopPropagation(); openColPop(); });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#ord-cols-wrap')) {
      container.querySelector('#ord-cols-pop')?.classList.add('hidden');
      container.querySelector('#ord-cols-btn')?.setAttribute('aria-expanded', 'false');
    }
  });
  // ──────────────────────────────────────────────────────────────────────────

  // ── Task 2 (10/08/2026) — menu 3 chấm ở cuối mỗi hàng ────────────────────────────────────────
  // Menu được gắn vào <body> chứ KHÔNG nhét trong ô <td>: .ord-tablewrap có overflow-x:auto, mà
  // phần tử con position:absolute nằm trong khung có overflow sẽ bị CẮT CỤT ở mép bảng — menu ở
  // hàng cuối/ cột cuối coi như biến mất. Đây đúng là bẫy đã dính với nút thu gọn cột trái (T89).
  let openMenuEl = null;
  function closeRowMenu() {
    if (openMenuEl) { openMenuEl.remove(); openMenuEl = null; }
    container.querySelectorAll('.ord-kebab[aria-expanded="true"]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
  }
  function openRowMenu(btn) {
    const code = btn.dataset.menu;
    const wasOpen = btn.getAttribute('aria-expanded') === 'true';
    closeRowMenu();
    if (wasOpen) return;
    const menu = document.createElement('div');
    menu.className = 'row-menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = `
      <button type="button" role="menuitem" data-act="edit">${icon('chinh-sua')} Chỉnh sửa</button>
      <button type="button" role="menuitem" class="danger" data-act="del">${icon('xoa')} Xoá</button>`;
    document.body.appendChild(menu);
    const r = btn.getBoundingClientRect();
    // Mở LÊN TRÊN nếu sát đáy màn hình, canh phải theo nút — menu tràn khỏi màn là bấm không tới.
    const openUp = r.bottom + menu.offsetHeight + 8 > window.innerHeight;
    menu.style.top = `${(openUp ? r.top - menu.offsetHeight - 4 : r.bottom + 4) + window.scrollY}px`;
    menu.style.left = `${Math.max(8, r.right - menu.offsetWidth) + window.scrollX}px`;
    btn.setAttribute('aria-expanded', 'true');
    openMenuEl = menu;
    menu.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]');
      if (!act) return;
      closeRowMenu();
      if (act.dataset.act === 'edit') openEditModal(code);
      else deleteOrder(code);
    });
  }
  document.addEventListener('click', closeRowMenu);

  function queryString() {
    const params = new URLSearchParams({ tab, ...filters });
    for (const [k, v] of [...params.entries()]) if (!v) params.delete(k);
    // Phân trang gắn SAU vòng dọn ô rỗng ở trên — page=1 là giá trị hợp lệ, không phải ô rỗng.
    params.set('page', String(page));
    params.set('page_size', String(pageSize));
    return params.toString();
  }

  // Đợt 4 (04/09/2026) — chân trang "Hiển thị 1–50 / 245 đơn hàng" + chọn số dòng + lùi/tiến trang.
  function renderPager() {
    const el = $('#ord-pager');
    if (!el) return;
    const total = counts[tab] ?? 0;
    const from = total ? (page - 1) * pageSize + 1 : 0;
    const to = Math.min(page * pageSize, total);
    const lastPage = Math.max(1, Math.ceil(total / pageSize));
    el.innerHTML = `
      <div class="ord-pager-info">Hiển thị <b>${from}–${to}</b> / ${total} đơn hàng</div>
      <div class="ord-pager-ctrl">
        <label for="ord-page-size">Hiển thị dòng</label>
        <select id="ord-page-size">${[20, 50, 100, 200].map((n) => `<option value="${n}" ${n === pageSize ? 'selected' : ''}>${n}</option>`).join('')}</select>
        <button type="button" class="ord-page-btn" id="ord-page-prev" ${page <= 1 ? 'disabled' : ''} aria-label="Trang trước">‹</button>
        <span class="ord-page-cur">${page}</span>
        <button type="button" class="ord-page-btn" id="ord-page-next" ${page >= lastPage ? 'disabled' : ''} aria-label="Trang sau">›</button>
      </div>`;
    $('#ord-page-size').addEventListener('change', (e) => {
      pageSize = parseInt(e.target.value, 10) || 50;
      load();
    });
    $('#ord-page-prev').addEventListener('click', () => { if (page > 1) { page -= 1; load(true); } });
    $('#ord-page-next').addEventListener('click', () => { if (page < lastPage) { page += 1; load(true); } });
  }

  // `keepPage` chỉ đúng khi người dùng bấm lùi/tiến trang. Mọi thay đổi bộ lọc đều phải về trang 1,
  // nếu không thì lọc còn 3 đơn mà vẫn đang ở trang 4 → danh sách trống trơn không rõ vì sao.
  async function load(keepPage = false) {
    if (!keepPage) page = 1;
    renderTabs();
    try {
      const res = await api.get(`/api/mgr/orders?${queryString()}`);
      orders = res.orders;
      counts = res.counts;
      kpis = { total_revenue: res.total_revenue || 0, pending_revenue: res.pending_revenue || 0 };
      renderTabs();
      renderKpi();
      renderList();
      renderPager();
      applyColVisibility();
    } catch (err) {
      if (err?.status !== 401 && err?.status !== 403) {
        $('#ord-list').innerHTML = '<p>Không tải được danh sách đơn.</p>';
      }
    }
  }

  // ── Bảng lịch đôi chọn khoảng ngày ─────────────────────────────────────────────────────────
  // Task 1 (12/08/2026) — cỗ máy vẽ lịch nay ở js/date-range-picker.js (màn Quản lý bếp cũng
  // dùng). Ở đây chỉ khai báo HAI bản dựng: một cho "Ngày tạo", một cho "Hẹn giao → Tuỳ chọn…".
  const rangePickers = [];
  const mountPicker = (ids, emptyLabel, getFrom, getTo, set) => {
    const inst = createRangePicker(container, ids, {
      emptyLabel, getFrom, getTo, set, onCommit: load, onWarn: (m) => toast(m, 'error'),
    });
    rangePickers.push(inst);
    return inst;
  };

  mountPicker(CREATED_IDS, 'Mọi thời gian',
    () => filters.date_from, () => filters.date_to,
    (from, to) => { filters.date_from = from; filters.date_to = to; });
  const schedPicker = mountPicker(SCHED_IDS, 'Chọn khoảng hẹn giao',
    () => filters.scheduled_from, () => filters.scheduled_to,
    (from, to) => { filters.scheduled_from = from; filters.scheduled_to = to; });

  // Gõ tìm kiếm: chờ 300ms rồi mới gọi API. Bản cũ gọi mỗi lần gõ một PHÍM nên tìm "Nguyễn" là
  // bắn 6 request liên tiếp, kết quả về không đúng thứ tự còn làm nháy danh sách.
  let searchTimer = null;
  $('#ord-search').addEventListener('input', (e) => {
    filters.search = e.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(load, 300);
  });
  // ── Ô lọc chọn-nhiều kiểu Sổ Bán Hàng ───────────────────────────────────────────────────────
  // Mỗi ô là một nút; bấm ra bảng có ô tìm kiếm + danh sách ô-vuông-tích. Giá trị gửi lên máy chủ
  // là chuỗi ngăn cách bằng dấu phẩy ("mang-ve,giao-hang") — listOrders() đã hiểu dạng này.
  const dds = new Map(); // id → { label, key, options, selected:Set }

  function ddRenderList(id) {
    const st = dds.get(id);
    const root = $(`#${id}`);
    const q = root.querySelector('.ord-dd-search input').value.trim().toLowerCase();
    const shown = st.options.filter(([, text]) => !q || String(text).toLowerCase().includes(q));
    root.querySelector('.ord-dd-list').innerHTML = shown.length
      ? shown.map(([val, text]) => `
          <label class="ord-dd-item">
            <input type="checkbox" value="${escapeHtml(String(val))}" ${st.selected.has(String(val)) ? 'checked' : ''} />
            <span>${escapeHtml(String(text))}</span>
          </label>`).join('')
      : '<p class="ord-dd-empty">Không tìm thấy mục nào</p>';
  }

  function ddSyncButton(id) {
    const st = dds.get(id);
    const root = $(`#${id}`);
    const n = st.selected.size;
    const labelEl = root.querySelector('.ord-dd-label');
    if (!n) labelEl.textContent = st.label;
    else if (n === 1) {
      const hit = st.options.find(([v]) => String(v) === [...st.selected][0]);
      labelEl.textContent = hit ? String(hit[1]) : st.label;
    } else labelEl.textContent = `${st.label}: ${n} mục`;
    root.classList.toggle('has-value', n > 0);
  }

  function ddOpen(id, open) {
    const root = $(`#${id}`);
    // Người dùng có thể đã chuyển sang màn khác trước khi cú bấm ở cấp tài liệu chạy tới đây —
    // lúc đó khung lọc không còn trong trang nữa.
    if (!root) return;
    // Đợt 4 (04/09/2026) — ô lọc nằm TRONG hộp thoại "Bộ lọc" thì không có nút bấm mở/đóng, danh
    // sách phải luôn hiện. Không có nhánh này thì cú bấm "ra ngoài" ở cấp tài liệu (khi bấm vào
    // cột tên nhóm bên trái) sẽ đóng luôn danh sách và hộp thoại trơ ra một khoảng trắng.
    const show = root.closest('.ord-fmodal') ? true : open;
    root.querySelector('.ord-dd-pop').classList.toggle('hidden', !show);
    root.querySelector('.ord-dd-btn').setAttribute('aria-expanded', show ? 'true' : 'false');
    if (show) ddRenderList(id);
  }

  function closeAllDds(except) {
    for (const id of dds.keys()) if (id !== except) ddOpen(id, false);
  }

  function setupDd(id, label, key, options) {
    dds.set(id, { label, key, options, selected: new Set() });
    const root = $(`#${id}`);
    root.querySelector('.ord-dd-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = root.querySelector('.ord-dd-pop').classList.contains('hidden');
      closeAllDds(id);
      ddOpen(id, willOpen);
    });
    // Bảng thả xuống nuốt cú bấm để trình xử lý "bấm ra ngoài thì đóng" ở cấp tài liệu không
    // đóng ngay lúc người dùng vừa tích một ô.
    root.querySelector('.ord-dd-pop').addEventListener('click', (e) => e.stopPropagation());
    root.querySelector('.ord-dd-search input').addEventListener('input', () => ddRenderList(id));
    root.querySelector('.ord-dd-list').addEventListener('change', (e) => {
      const box = e.target.closest('input[type="checkbox"]');
      if (!box) return;
      const st = dds.get(id);
      if (box.checked) st.selected.add(box.value); else st.selected.delete(box.value);
      filters[st.key] = [...st.selected].join(',');
      ddSyncButton(id);
      // Trong hộp thoại "Bộ lọc" thì chờ bấm "Áp dụng" mới tải lại — tải ngay từng lần tích sẽ
      // bắn hàng loạt request và người dùng không còn đường bấm "Hủy".
      if (fmodalOpen) { syncFilterSummary(); return; }
      load();
    });
    ddSyncButton(id);
  }

  function ddSetOptions(id, options) {
    const st = dds.get(id);
    st.options = options;
    // Bỏ những lựa chọn không còn tồn tại (vd nhân viên vừa nghỉ) để không lọc bằng id đã chết.
    const valid = new Set(options.map(([v]) => String(v)));
    for (const v of [...st.selected]) if (!valid.has(v)) st.selected.delete(v);
    filters[st.key] = [...st.selected].join(',');
    ddSyncButton(id);
    if (!$(`#${id} .ord-dd-pop`).classList.contains('hidden')) ddRenderList(id);
  }

  function ddClearAll() {
    for (const [id, st] of dds) { st.selected.clear(); ddSyncButton(id); ddOpen(id, false); }
  }

  setupDd('ord-delivery-type', 'Hình thức', 'delivery_type', [
    ['tai-ban', 'Tại bàn'], ['mang-ve', 'Mang về'], ['giao-hang', 'Giao hàng'],
  ]);
  setupDd('ord-staff', 'Nhân viên tạo đơn', 'staff_id', []);
  setupDd('ord-pay-state', 'Trạng thái thanh toán', 'payment_state', PAYMENT_STATES);
  setupDd('ord-cash-account', 'Nguồn tiền nhận', 'cash_account_id', []);
  // Task 4 — TT giao hàng dùng CHUNG cơ chế ô lọc chọn-nhiều, không viết lại lần nữa.
  setupDd('ord-deliv-state', 'TT giao hàng', 'delivery_status', DELIVERY_STATES);
  document.addEventListener('click', () => closeAllDds());

  // ── Task 3 — ô lọc "Hẹn giao" ───────────────────────────────────────────────────────────────
  $('#ord-schedule').addEventListener('change', (e) => {
    filters.scheduled = e.target.value;
    const custom = filters.scheduled === 'tuy-chon';
    $('#ord-sched-range').classList.toggle('hidden', !custom);
    if (!custom) {
      // Bỏ luôn khoảng ngày riêng khi rời khỏi "Tuỳ chọn…": để sót lại thì chọn "Hôm nay" xong
      // vẫn còn dính khoảng cũ và kết quả trống trơn không rõ vì sao.
      filters.scheduled_from = ''; filters.scheduled_to = '';
      // Task 1 (12/08/2026) — trả nút khoảng ngày về chữ mặc định luôn, không thì rời khỏi
      // "Tuỳ chọn…" xong nút vẫn còn hiện khoảng ngày cũ dù bộ lọc đã bỏ.
      schedPicker.updateLabel(); schedPicker.syncQuick(); schedPicker.open(false);
    }
    if (fmodalOpen) { syncFilterSummary(); return; }
    load();
  });

  $('#ord-sort').addEventListener('change', (e) => {
    filters.sort = SORTS[e.target.value] ? e.target.value : DEFAULT_SORT;
    load();
  });

  // Mũi tên cạnh nút "Tạo đơn hàng" — mở danh sách cách tạo đơn (ảnh 16 chủ quán gửi).
  $('#ord-create-caret').addEventListener('click', (e) => {
    e.stopPropagation();
    const menu = $('#ord-create-menu');
    const willOpen = menu.classList.contains('hidden');
    menu.classList.toggle('hidden', !willOpen);
    e.currentTarget.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  });
  document.addEventListener('click', () => {
    const menu = $('#ord-create-menu');
    if (menu) menu.classList.add('hidden');
  });

  // Đợt 4 (04/09/2026) — menu "Thao tác" (hiện chỉ có "Tải Excel"; ảnh mẫu còn 2 mục xuất file
  // online / liên kết sàn TMĐT nhưng quán này không dùng nên không thêm mục trơ không bấm được).
  $('#ord-more-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const menu = $('#ord-more-menu');
    const willOpen = menu.classList.contains('hidden');
    menu.classList.toggle('hidden', !willOpen);
    e.currentTarget.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  });
  document.addEventListener('click', () => {
    const menu = $('#ord-more-menu');
    if (menu) { menu.classList.add('hidden'); $('#ord-more-btn')?.setAttribute('aria-expanded', 'false'); }
  });

  // ── Đợt 4 (04/09/2026) — hộp thoại "Bộ lọc" ─────────────────────────────────────────────────
  // 5 ô lọc ít dùng đã nằm sẵn trong hộp (xem markup). Ở đây chỉ lo: mở/đóng, đổi nhóm, đếm mục
  // đã chọn, và ghi nhớ trạng thái lúc mở để nút "Hủy" trả lại nguyên trạng.
  const MODAL_DD_IDS = ['ord-delivery-type', 'ord-cash-account', 'ord-deliv-state', 'ord-staff'];
  let fmodalOpen = false;
  let fmodalSnap = null;

  /** Đếm số mục đang chọn trong hộp thoại + vẽ lại cột phải "N bộ lọc đã chọn". */
  function syncFilterSummary() {
    const picked = [];
    for (const id of MODAL_DD_IDS) {
      const st = dds.get(id);
      if (!st) continue;
      for (const v of st.selected) {
        const hit = st.options.find(([val]) => String(val) === v);
        picked.push({ id, val: v, text: `${st.label}: ${hit ? hit[1] : v}` });
      }
    }
    if (filters.scheduled) {
      const hit = SCHEDULE_FILTERS.find(([k]) => k === filters.scheduled);
      picked.push({ id: 'ord-schedule', val: filters.scheduled, text: `Hẹn giao: ${hit ? hit[1] : filters.scheduled}` });
    }
    const countEl = $('#ord-fsel-count');
    const listEl = $('#ord-fsel-list');
    if (countEl) countEl.textContent = `${picked.length} bộ lọc đã chọn`;
    if (listEl) {
      listEl.innerHTML = picked.length
        ? picked.map((x) => `<span class="ord-fsel-chip">${escapeHtml(x.text)}</span>`).join('')
        : '<p class="ord-fsel-empty">Chưa có bộ lọc nào</p>';
    }
    const badge = $('#ord-filter-badge');
    if (badge) {
      badge.textContent = String(picked.length);
      badge.classList.toggle('hidden', picked.length === 0);
    }
    $('#ord-filter-btn')?.classList.toggle('has-value', picked.length > 0);
  }

  function fmodalShowGroup(grp) {
    container.querySelectorAll('.ord-frail-item').forEach((b) => b.classList.toggle('active', b.dataset.grp === grp));
    container.querySelectorAll('.ord-fgrp').forEach((g) => g.classList.toggle('hidden', g.dataset.grp !== grp));
  }

  function fmodalOpenSet(open) {
    fmodalOpen = open;
    $('#ord-fmodal').classList.toggle('hidden', !open);
    $('#ord-filter-btn').setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      fmodalSnap = {
        filters: { ...filters },
        sel: Object.fromEntries(MODAL_DD_IDS.map((id) => [id, [...(dds.get(id)?.selected || [])]])),
      };
      for (const id of MODAL_DD_IDS) ddOpen(id, true);
      syncFilterSummary();
    }
  }

  /** Trả 5 ô lọc trong hộp về đúng lúc vừa mở (nút "Hủy"). */
  function fmodalRestore() {
    if (!fmodalSnap) return;
    for (const id of MODAL_DD_IDS) {
      const st = dds.get(id);
      if (!st) continue;
      st.selected = new Set(fmodalSnap.sel[id] || []);
      filters[st.key] = [...st.selected].join(',');
      ddSyncButton(id);
      ddRenderList(id);
    }
    for (const k of ['scheduled', 'scheduled_from', 'scheduled_to']) filters[k] = fmodalSnap.filters[k];
    $('#ord-schedule').value = filters.scheduled || '';
    $('#ord-sched-range').classList.toggle('hidden', filters.scheduled !== 'tuy-chon');
    schedPicker.updateLabel(); schedPicker.syncQuick(); schedPicker.open(false);
    syncFilterSummary();
  }

  $('#ord-filter-btn').addEventListener('click', (e) => { e.stopPropagation(); fmodalOpenSet(true); });
  $('#ord-fmodal-rail').addEventListener('click', (e) => {
    const b = e.target.closest('.ord-frail-item');
    if (b) fmodalShowGroup(b.dataset.grp);
  });
  $('#ord-fmodal-backdrop').addEventListener('click', () => { fmodalRestore(); fmodalOpenSet(false); });
  $('#ord-fcancel').addEventListener('click', () => { fmodalRestore(); fmodalOpenSet(false); });
  $('#ord-fapply').addEventListener('click', () => { fmodalOpenSet(false); load(); });
  $('#ord-fclear').addEventListener('click', () => {
    for (const id of MODAL_DD_IDS) {
      const st = dds.get(id);
      if (!st) continue;
      st.selected.clear();
      filters[st.key] = '';
      ddSyncButton(id); ddRenderList(id);
    }
    filters.scheduled = ''; filters.scheduled_from = ''; filters.scheduled_to = '';
    $('#ord-schedule').value = '';
    $('#ord-sched-range').classList.add('hidden');
    schedPicker.updateLabel(); schedPicker.syncQuick(); schedPicker.open(false);
    syncFilterSummary();
  });
  // Esc đóng hộp thoại như mọi hộp thoại khác trong app.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && fmodalOpen) { fmodalRestore(); fmodalOpenSet(false); }
  });

  $('#ord-reset').addEventListener('click', () => {
    filters = emptyFilters();
    $('#ord-search').value = '';
    ddClearAll();
    $('#ord-sort').value = DEFAULT_SORT;
    $('#ord-schedule').value = '';
    $('#ord-sched-range').classList.add('hidden');
    // Cả HAI bảng lịch cùng phải trở về mặc định — bản trước chỉ đặt lại bảng "Ngày tạo", nên bấm
    // "Xoá lọc" xong nút hẹn giao vẫn còn hiện khoảng ngày cũ dù bộ lọc đã sạch.
    for (const p of rangePickers) { p.updateLabel(); p.syncQuick(); p.open(false); }
    syncFilterSummary();
    load();
  });

  $('#ord-export').addEventListener('click', () => {
    window.open(`${getApiBase()}/api/mgr/orders/export?${queryString()}`, '_blank');
  });

  // Danh sách nhân viên cho ô lọc. Thu ngân thường KHÔNG có quyền xem danh sách nhân viên (403) —
  // trường hợp đó chỉ ẩn ô lọc đi, không báo lỗi, vì họ vốn chỉ thấy đơn của chính mình.
  async function loadStaffFilter() {
    try {
      const res = await api.get('/api/mgr/staff');
      staffList = res.staff || [];
      ddSetOptions('ord-staff', staffList.map((s) => [String(s.id), s.name]));
    } catch {
      $('#ord-staff').classList.add('hidden');
      // Ẩn luôn tên nhóm trong hộp thoại, nếu không bấm vào chỉ thấy khoảng trắng.
      container.querySelector('.ord-frail-item[data-grp="g-staff"]')?.classList.add('hidden');
    }
  }
  loadStaffFilter();

  // Nguồn tiền (quỹ tiền mặt / tài khoản ngân hàng / ví). Không có quyền 'cash' thì ẩn ô lọc,
  // giống cách xử lý ô nhân viên ở trên.
  async function loadCashAccounts() {
    try {
      const res = await api.get('/api/mgr/cash-accounts');
      const list = res.accounts || [];
      ddSetOptions('ord-cash-account', list.map((a) => [String(a.id), a.name]));
    } catch {
      $('#ord-cash-account').classList.add('hidden');
      container.querySelector('.ord-frail-item[data-grp="g-cash"]')?.classList.add('hidden');
    }
  }
  loadCashAccounts();

  // ── Task 2 (10/08/2026) — CHỈNH SỬA ĐƠN từ menu 3 chấm ──────────────────────────────────────
  // Sửa phần THÔNG TIN, không sửa món/tiền (xem ghi chú updateOrder trong order-service.js).
  // Ô "Hẹn giao" dùng <input type="datetime-local">: giá trị của nó là giờ ĐỊA PHƯƠNG không kèm
  // múi giờ, nên hàm dưới đây đổi mốc UTC trong CSDL sang giờ VN trước khi đổ vào ô — nếu đổ thẳng
  // ISO thì đơn hẹn 18:30 mở ra thành 11:30 và chủ quán bấm Lưu là lệch mất 7 tiếng.
  function toLocalInput(iso) {
    if (!iso) return '';
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return '';
    const p = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(dt).reduce((o, x) => ({ ...o, [x.type]: x.value }), {});
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  }

  async function openEditModal(code) {
    let order;
    try {
      order = (await api.get(`/api/mgr/orders/${encodeURIComponent(code)}`)).order;
    } catch {
      toast('Không tải được đơn để sửa', 'error');
      return;
    }
    const modal = openModal(`
      <h3>Chỉnh sửa đơn ${escapeHtml(order.order_code)}</h3>
      <p class="qr-hint">Sửa được thông tin khách và khâu giao hàng. Muốn đổi món hoặc số tiền thì
        dùng “Thêm món” (đơn còn mở) hoặc huỷ đơn rồi lên lại — để sổ quỹ và tồn kho không lệch.</p>
      <div class="field"><label for="oe-name">Tên khách</label>
        <input id="oe-name" type="text" value="${escapeHtml(order.customer_name || '')}" placeholder="Khách lẻ" /></div>
      <div class="field"><label for="oe-phone">Số điện thoại</label>
        <input id="oe-phone" type="tel" value="${escapeHtml(order.customer_phone || '')}" /></div>
      <div class="field"><label for="oe-address">Địa chỉ giao</label>
        <input id="oe-address" type="text" value="${escapeHtml(order.address || '')}" /></div>
      <div class="field"><label for="oe-sched">Hẹn giao (ngày + giờ)</label>
        <input id="oe-sched" type="datetime-local" value="${escapeHtml(toLocalInput(order.scheduled_at))}" /></div>
      <div class="field"><label for="oe-delivst">Trạng thái giao hàng</label>
        <select id="oe-delivst">
          <option value="">— Chưa đặt —</option>
          ${DELIVERY_STATES.map(([k, v]) => `<option value="${k}" ${order.delivery_status === k ? 'selected' : ''}>${escapeHtml(v)}</option>`).join('')}
        </select></div>
      <div class="field"><label for="oe-note">Ghi chú</label>
        <input id="oe-note" type="text" value="${escapeHtml(order.note || '')}" /></div>
      <div class="modal-close-row">
        <button class="btn" data-action="close">Đóng</button>
        <button class="btn btn-primary" id="oe-save">Lưu thay đổi</button>
      </div>
    `);
    modal.overlay.querySelector('[data-action="close"]').addEventListener('click', modal.close);
    modal.overlay.querySelector('#oe-save').addEventListener('click', async () => {
      const btn = modal.overlay.querySelector('#oe-save');
      btn.disabled = true;
      try {
        await api.patch(`/api/mgr/orders/${encodeURIComponent(code)}`, {
          customer_name: modal.overlay.querySelector('#oe-name').value,
          customer_phone: modal.overlay.querySelector('#oe-phone').value,
          address: modal.overlay.querySelector('#oe-address').value,
          scheduled_at: modal.overlay.querySelector('#oe-sched').value,
          delivery_status: modal.overlay.querySelector('#oe-delivst').value,
          note: modal.overlay.querySelector('#oe-note').value,
        });
        toast('Đã lưu thay đổi');
        modal.close();
        load();
      } catch (err) {
        toast(err?.body?.message || 'Không lưu được', 'error');
      } finally {
        btn.disabled = false;
      }
    });
  }

  async function deleteOrder(code) {
    if (!(await confirmDialog(
      `Xoá hẳn đơn ${code}?\n\nĐơn sẽ biến mất khỏi danh sách và không khôi phục được.\n`
      + 'Nếu chỉ muốn ghi nhận là không bán nữa, hãy dùng "Huỷ đơn" trong chi tiết đơn.',
      { danger: true, okText: 'Xoá đơn' }
    ))) return;
    try {
      await api.del(`/api/mgr/orders/${encodeURIComponent(code)}`);
      toast(`Đã xoá đơn ${code}`);
      load();
    } catch (err) {
      toast(err?.body?.message || 'Không xoá được đơn', 'error');
    }
  }

  // ── Trả hàng (10/08/2026) — dựng theo ảnh "Xác nhận trả hàng" của Sổ Bán Hàng ────────────────
  // Trả được TỪNG PHẦN: khách trả 1 trong 3 suất thì chỉ hoàn tiền 1 suất, đơn vẫn nằm ở tab cũ.
  // Số lượng tối đa lấy từ máy chủ (đã trừ các lần trả trước), không tin số trên màn hình.
  async function openReturnModal(code, onDone) {
    let data;
    try {
      data = await api.get(`/api/mgr/orders/${encodeURIComponent(code)}/returns`);
    } catch (err) {
      return toast(err?.body?.message || 'Không tải được thông tin trả hàng', 'error');
    }
    const rows = (data.items || []).filter((it) => it.remain_qty > 0);
    if (!rows.length) return toast('Đơn này đã trả hết hàng rồi', 'error');

    const modal = openModal(`
      <h3>Xác nhận trả hàng — ${escapeHtml(code)}</h3>
      <table class="ret-table"><thead><tr>
        <th></th><th>Sản phẩm</th><th class="num">Giá bán</th><th class="num">SL trả</th>
      </tr></thead><tbody>
        ${rows.map((it) => `<tr data-index="${it.index}">
          <td><input type="checkbox" class="ret-pick" /></td>
          <td>${escapeHtml(it.name)}${it.unit ? ` <span class="ret-unit">${escapeHtml(it.unit)}</span>` : ''}</td>
          <td class="num">${formatVND(it.price)}</td>
          <td class="num ret-qty-cell">
            <button type="button" class="ret-minus" aria-label="Bớt">−</button>
            <input type="number" class="ret-qty" value="0" min="0" max="${it.remain_qty}" inputmode="numeric" />
            <button type="button" class="ret-plus" aria-label="Thêm">+</button>
            <span class="ret-max">/${it.remain_qty}</span>
          </td>
        </tr>`).join('')}
      </tbody></table>
      <div class="ret-sum-row"><span>Tổng <b id="ret-count">0</b> sản phẩm</span><b id="ret-goods">0đ</b></div>
      <div class="field"><label for="ret-fee">Phí hoàn trả (quán giữ lại)</label>
        <input id="ret-fee" type="number" min="0" value="0" inputmode="numeric" /></div>
      <div class="field"><label for="ret-extra">Trả thêm cho khách (đền bù)</label>
        <input id="ret-extra" type="number" min="0" value="0" inputmode="numeric" /></div>
      <div class="ret-sum-row ret-total"><span>Tổng tiền trả khách</span><b id="ret-total">0đ</b></div>
      <div class="field"><label for="ret-note">Ghi chú</label>
        <textarea id="ret-note" rows="2" placeholder="Vì sao khách trả hàng…"></textarea></div>
      <div class="order-detail-actions">
        <button id="ret-cancel" class="btn" type="button">Quay lại</button>
        <button id="ret-ok" class="btn btn-primary" type="button">Hoàn trả</button>
      </div>
    `);
    const $ = (sel) => modal.overlay.querySelector(sel);
    const priceOf = (i) => (rows.find((r) => r.index === i) || {}).price || 0;

    function picked() {
      return [...modal.overlay.querySelectorAll('.ret-table tbody tr')].map((tr) => ({
        index: Number(tr.dataset.index),
        qty: Math.max(0, Math.min(Number(tr.querySelector('.ret-qty').value || 0),
          Number(tr.querySelector('.ret-qty').max))),
      })).filter((x) => x.qty > 0);
    }
    function recalc() {
      const list = picked();
      const goods = list.reduce((s, x) => s + priceOf(x.index) * x.qty, 0);
      const fee = Math.max(0, Number($('#ret-fee').value || 0));
      const extra = Math.max(0, Number($('#ret-extra').value || 0));
      $('#ret-count').textContent = list.reduce((s, x) => s + x.qty, 0);
      $('#ret-goods').textContent = formatVND(goods);
      $('#ret-total').textContent = formatVND(Math.max(0, goods - Math.min(fee, goods) + extra));
    }
    modal.overlay.querySelectorAll('.ret-table tbody tr').forEach((tr) => {
      const qtyEl = tr.querySelector('.ret-qty');
      const pick = tr.querySelector('.ret-pick');
      const max = Number(qtyEl.max);
      const setQty = (v) => {
        qtyEl.value = Math.max(0, Math.min(max, v));
        pick.checked = Number(qtyEl.value) > 0;
        recalc();
      };
      tr.querySelector('.ret-minus').addEventListener('click', () => setQty(Number(qtyEl.value || 0) - 1));
      tr.querySelector('.ret-plus').addEventListener('click', () => setQty(Number(qtyEl.value || 0) + 1));
      qtyEl.addEventListener('input', () => setQty(Number(qtyEl.value || 0)));
      // Tích ô vuông = trả TOÀN BỘ số còn lại của dòng đó (việc hay làm nhất), bỏ tích = 0.
      pick.addEventListener('change', () => { qtyEl.value = pick.checked ? max : 0; recalc(); });
    });
    $('#ret-fee').addEventListener('input', recalc);
    $('#ret-extra').addEventListener('input', recalc);
    $('#ret-cancel').addEventListener('click', () => modal.close());
    $('#ret-ok').addEventListener('click', async () => {
      const list = picked();
      if (!list.length) return toast('Chưa chọn món nào để trả', 'error');
      const btn = $('#ret-ok');
      btn.disabled = true;
      try {
        const res = await api.post(`/api/mgr/orders/${encodeURIComponent(code)}/return`, {
          items: list,
          fee: Number($('#ret-fee').value || 0),
          extra: Number($('#ret-extra').value || 0),
          note: $('#ret-note').value,
        });
        toast(`Đã trả hàng, hoàn khách ${formatVND(res.refund_amount)}`);
        modal.close();
        if (onDone) await onDone();
        load();
      } catch (err) {
        toast(err?.body?.message || 'Không ghi được phiếu trả hàng', 'error');
        btn.disabled = false;
      }
    });
  }

  // ── Chi tiết đơn: món, đổi trạng thái, in lại, huỷ ──
  function openDetailModal(code) {
    const modal = openModal('<p>Đang tải…</p>');

    function renderDetail(order, payments = [], returns = [], timeline = []) {
      const nextOptions = NEXT_STATUS[order.status] || [];
      // Task 1/2 (10/08/2026) — 2 khối của ảnh "Chi tiết đơn hàng" (Sổ Bán Hàng) mà bản cũ thiếu:
      // bảng THANH TOÁN và LỊCH SỬ THAO TÁC. Đơn chưa có phiếu tiền nào thì bỏ hẳn khối cho gọn.
      const refunded = returns.reduce((s, r) => s + Number(r.refund_amount || 0), 0);
      // Còn món chưa trả thì mới hiện nút "Trả hàng" — trả hết rồi mà nút vẫn sáng là bấm vào chỉ
      // để nhận câu báo lỗi.
      const doneQty = new Map();
      for (const r of returns) {
        for (const it of (r.items || [])) doneQty.set(Number(it.index), (doneQty.get(Number(it.index)) || 0) + Number(it.qty || 0));
      }
      const canReturn = !['cancelled', 'payment_pending'].includes(order.status)
        && (order.items || []).some((it, i) => Number(it.qty || 0) - (doneQty.get(i) || 0) > 0);
      const paidIn = payments.filter((p) => p.direction === 'thu').reduce((s, p) => s + p.amount, 0);
      const payBlock = payments.length ? `
        <div class="ord-pay-block">
          <div class="ord-block-head">
            <b>Thanh toán</b>
            <span class="order-status-badge ${paidIn > 0 ? 'status-paid' : ''}">${paidIn > 0 ? 'Đã thanh toán' : 'Chưa thanh toán'}</span>
          </div>
          <table class="ord-pay-table"><thead><tr>
            <th>Thời gian</th><th>Phương thức</th><th class="num">Số tiền</th>
          </tr></thead><tbody>
            ${payments.map((p) => `<tr>
              <td>${stampVN(p.occurred_at).d} ${stampVN(p.occurred_at).t}</td>
              <td>${escapeHtml(p.account_name || p.category_name || '—')}${p.direction === 'chi' ? ' (hoàn)' : ''}</td>
              <td class="num ${p.direction === 'chi' ? 'ord-pay-out' : ''}">${p.direction === 'chi' ? '-' : ''}${formatVND(p.amount)}</td>
            </tr>`).join('')}
          </tbody></table>
          <div class="ord-pay-sum"><span>Khách đã trả</span><b>${formatVND(Math.max(0, paidIn - refunded))}</b></div>
        </div>` : '';
      const timeBlock = timeline.length ? `
        <div class="ord-time-block">
          <div class="ord-block-head"><b>Lịch sử thao tác</b></div>
          <ol class="ord-timeline">
            ${timeline.map((s) => `<li class="ord-tl-${escapeHtml(s.key)}">
              <span class="ord-tl-label">${escapeHtml(s.label)}</span>
              <span class="ord-tl-meta">${stampVN(s.at).d} ${stampVN(s.at).t}${s.by ? ' · ' + escapeHtml(s.by) : ''}</span>
            </li>`).join('')}
          </ol>
        </div>` : '';
      modal.overlay.querySelector('.modal-box').innerHTML = `
        <h3>${escapeHtml(order.order_code)} <span class="order-status-badge status-${order.status}">${STATUS_LABEL[order.status] || order.status}</span></h3>
        <p>${escapeHtml(order.customer_name || 'Khách lẻ')}${order.customer_phone ? ' — ' + escapeHtml(order.customer_phone) : ''}</p>
        <p>${DELIVERY_LABEL[order.delivery_type] || order.delivery_type}${order.table_no ? ' — ' + escapeHtml(tableName(order)) : ''} · NV bán: ${escapeHtml(order.sold_by_staff_name || '—')}</p>
        <!-- Task 3/4 (10/08/2026) — hẹn giao và khâu vận chuyển phải thấy được ngay ở chi tiết đơn,
             không phải mở hộp thoại Chỉnh sửa mới biết. Không có thì bỏ hẳn dòng cho gọn. -->
        ${order.scheduled_at || order.delivery_status ? `<p class="ord-detail-sched">
          ${order.scheduled_at ? `Hẹn giao: <b>${stampVN(order.scheduled_at).d} ${stampVN(order.scheduled_at).t}</b>` : ''}
          ${order.scheduled_at && order.delivery_status ? ' · ' : ''}
          ${order.delivery_status ? `TT giao hàng: <b>${escapeHtml(DELIVERY_STATE_LABEL[order.delivery_status] || order.delivery_status)}</b>` : ''}
        </p>` : ''}
        <div class="cart-panel" style="margin-top:8px">
          ${(order.items || []).map((it) => `
            <div class="cart-item-top" style="border-bottom:1px solid #eee;padding:6px 0">
              <div>
                <div class="cart-item-name">${it.qty}× ${escapeHtml(it.name)}</div>
                ${it.note ? `<div class="cart-item-size">${escapeHtml(it.note)}</div>` : ''}
              </div>
              <span>${formatVND(it.qty * it.price)}</span>
            </div>
          `).join('')}
          <div class="cart-total-row"><span>Tổng</span><span>${formatVND(order.total)}</span></div>
          ${refunded > 0 ? `<div class="cart-total-row ord-refunded"><span>Đã hoàn khách</span><span>-${formatVND(refunded)}</span></div>` : ''}
        </div>
        ${payBlock}
        ${timeBlock}
        <div class="order-detail-actions">
          <button id="od-print" class="btn" type="button"><span class="inline-ico">${icon('in')}</span> In lại</button>
          <button id="od-copy" class="btn" type="button"><span class="inline-ico">${icon('sao-chep')}</span> Sao chép</button>
          ${canReturn ? `<button id="od-return" class="btn" type="button"><span class="inline-ico">${icon('tra-hang')}</span> Trả hàng</button>` : ''}
          ${nextOptions.filter(([st]) => st !== 'returned').map(([st, label]) => `<button class="btn" data-next="${st}">${escapeHtml(label)}</button>`).join('')}
          ${order.status !== 'cancelled' ? '<button id="od-cancel" class="btn" style="color:var(--danger)">Huỷ đơn</button>' : ''}
        </div>
      `;

      modal.overlay.querySelector('#od-print').addEventListener('click', () => {
        window.open(`${getApiBase()}/api/mgr/bill/${encodeURIComponent(order.order_code)}/print`, '_blank');
      });
      // "Sao chép" = lên lại một đơn y hệt (khách gọi thêm cùng món, hoặc hôm sau gọi lại đúng
      // suất cũ). Chỉ CHUYỂN GIỎ sang màn Bán hàng chứ không tự tạo đơn — tự tạo là bấm nhầm một
      // cái ra ngay một đơn thật, trừ kho thật.
      modal.overlay.querySelector('#od-copy').addEventListener('click', () => {
        try {
          sessionStorage.setItem('posmgr.copyOrder', JSON.stringify({
            // Đúng hình dạng dòng giỏ hàng của màn Bán hàng. Món KHÔNG có trong thực đơn (dòng bán
            // nhanh, `id` rỗng) phải mang cờ `custom` — gửi như món thường thì máy chủ tra không ra
            // mã món và BỎ QUA cả dòng, tức là sao chép xong lại thiếu món mà không báo gì.
            items: (order.items || []).map((it, i) => (
              it.id == null
                ? { key: `custom-copy-${i}`, custom: true, name: it.name, price: Number(it.price || 0),
                  qty: Number(it.qty || 0), note: it.note || '', addons: [] }
                : { key: `${it.id}|${it.size || ''}||`, menuId: it.id, name: it.name,
                  price: Number(it.price || 0), size: it.size || null, qty: Number(it.qty || 0),
                  note: it.note || '', addons: it.addons || [],
                  variantId: it.variant?.id || null, unitId: it.unit?.id || null })),
            customerName: order.customer_name || '',
            customerPhone: order.customer_phone || '',
            deliveryType: order.delivery_type,
            fromCode: order.order_code,
          }));
        } catch { /* chế độ riêng tư: bỏ qua, màn Bán hàng sẽ mở giỏ rỗng */ }
        modal.close();
        location.hash = '#/ban-hang';
      });
      const returnBtn = modal.overlay.querySelector('#od-return');
      if (returnBtn) returnBtn.addEventListener('click', () => openReturnModal(order.order_code, refresh));
      modal.overlay.querySelectorAll('[data-next]').forEach((b) => {
        b.addEventListener('click', () => changeStatus(order.order_code, b.dataset.next));
      });
      const cancelBtn = modal.overlay.querySelector('#od-cancel');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', async () => {
          if (!(await confirmDialog(`Huỷ đơn ${order.order_code}?`))) return;
          changeStatus(order.order_code, 'cancelled');
        });
      }
    }

    async function changeStatus(code, status) {
      try {
        await api.patch(`/api/mgr/orders/${code}/status`, { status });
        toast('Đã cập nhật trạng thái đơn');
        await refresh();
        load();
      } catch (err) {
        toast(err?.body?.message || 'Không đổi được trạng thái', 'error');
      }
    }

    async function refresh() {
      const res = await api.get(`/api/mgr/orders/${code}`);
      renderDetail(res.order, res.payments || [], res.returns || [], res.timeline || []);
    }

    refresh().catch(() => { modal.overlay.querySelector('.modal-box').innerHTML = '<p>Không tải được chi tiết đơn.</p>'; });
  }

  for (const p of rangePickers) p.updateLabel();
  await load();
}
