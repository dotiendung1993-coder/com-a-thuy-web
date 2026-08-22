// GĐ6 — Cài đặt: thông tin quán + cấu hình tích điểm. Chỉ chủ quán sửa được.
// GĐ8 mục F — thêm Quản lý phụ thu (sao chép "Cài đặt > Quản lý phụ phí" của Sổ Bán Hàng).
// GĐ12 (07/08/2026) — dựng lại thành TRANG MỤC LỤC giống /setting của app.sobanhang.com:
//   4 nhóm (CỬA HÀNG · TỐI ƯU BÁN HÀNG · MÀN HÌNH & THIẾT BỊ · KHÁC), mỗi mục là một dòng có
//   mũi tên, bấm vào mở màn con qua địa chỉ #/cai-dat?m=<mã>. Trước đây tất cả dồn vào một
//   trang dài lê thê, khác hẳn app.
//   3 màn con MỚI thêm cho giống app: Quản lý tính năng · Thông tin sản phẩm · Mẫu hoá đơn
//   (+ Đồng bộ dữ liệu).
import { api } from '../api.js';
import { escapeHtml, formatVND, toast } from '../ui.js';
import { icon } from '../icons.js';
// GĐ8 mục L — Cỡ chữ / hướng màn hình
import {
  FONT_LABEL, ORIENTATION_LABEL, applyDisplay, readLocalOverride, saveLocalOverride, clearLocalOverride,
} from '../display.js';
import {
  allowedFeatures, getTabRoutes, setTabRoutes, TAB_SLOTS, resetNavPrefs,
  setNavOrder, applyNavOrder,
} from '../nav.js';

// Mục lục — bám theo các nhóm của app.sobanhang.com/setting.
// Task 2 (13/08/2026) — chủ quán gửi 19 ảnh chụp màn Cài đặt của app và bảo "bạn chưa làm".
// Trước đây 5 mục bị BỎ HẲN vì cho là "không áp dụng cho quán cơm" (Website cửa hàng, Hoá đơn
// điện tử, Xoá cửa hàng…) — nay dựng đủ. Mấy mục cần tài khoản bên thứ ba (GHN, Ahamove, HĐĐT,
// Chatbot) làm đủ giao diện + chỗ khai khoá API, chủ quán có tài khoản là điền vào chạy được luôn.
export const SETTING_MENU = [
  { group: 'Cửa hàng', items: [
    { key: 'cua-hang',   ico: 'quan-ly',      label: 'Thông tin cửa hàng', hint: 'Tên, địa chỉ, điện thoại, mã số thuế' },
    { key: 'man-hinh-phu', ico: 'toan-man-hinh', label: 'Màn hình phụ',    hint: 'Hiện đơn + mã QR cho khách trên màn thứ hai' },
    { key: 'website',    ico: 'ma-qr',        label: 'Website cửa hàng',   hint: 'Ảnh bìa, banner, video, danh mục nổi bật' },
    { key: 'tinh-nang',  ico: 'chinh-sua',    label: 'Quản lý tính năng',  hint: 'Chọn 3 ô giữa của thanh dưới, lối tắt trang chủ' },
    { key: 'sap-xep',    ico: 'danh-muc',     label: 'Sắp xếp vị trí menu', hint: 'Đổi thứ tự, ẩn bớt mục ở cột bên trái' },
    { key: 'van-chuyen', ico: 'giao-hang',    label: 'Quản lý vận chuyển', hint: 'Giao Hàng Nhanh, Ahamove' },
    { key: 'dong-bo',    ico: 'ma-qr',        label: 'Đồng bộ dữ liệu',    hint: 'Tải lại bản mới nhất, xoá bộ nhớ tạm của máy này' },
    { key: 'nhap-du-lieu', ico: 'ma-qr',      label: 'Nhập dữ liệu',       hint: 'Thêm nhiều sản phẩm cùng lúc từ file Excel/CSV' },
  ] },
  { group: 'Tối ưu bán hàng', items: [
    { key: 'quy-trinh',    ico: 'ban-hang',    label: 'Quy trình bán hàng',   hint: '16 công tắc + kiểu chốt đơn' },
    { key: 'san-pham',     ico: 'san-pham',    label: 'Thông tin sản phẩm',   hint: 'Thẻ món ở màn Bán hàng hiện những gì' },
    { key: 'mau-hoa-don',  ico: 'in',          label: 'Mẫu hoá đơn',          hint: 'Khổ giấy, mã QR chuyển khoản' },
    { key: 'mau-in-tem',   ico: 'in',          label: 'Mẫu in tem',           hint: 'Tem món dán ly/hộp cho bếp, khổ 50×30mm' },
    { key: 'tich-diem',    ico: 'tich-diem',   label: 'Tích điểm khách hàng', hint: 'Bật/tắt, cách quy đổi điểm' },
    { key: 'phu-thu',      ico: 'thu-chi',     label: 'Quản lý phụ thu',      hint: 'Phí phục vụ, phí đóng gói…' },
    { key: 'thue',         ico: 'uoc-tinh-thue', label: 'Quản lý thuế',       hint: 'Bật tính thuế khi bán hàng, thuế suất mặc định' },
    { key: 'hoa-don-dt',   ico: 'don-hang',    label: 'Hoá đơn điện tử',      hint: 'Phát hành HĐĐT, đồng bộ hoá đơn từ Cơ quan thuế' },
  ] },
  { group: 'Cài đặt tin nhắn', items: [
    { key: 'cau-hinh-tin-nhan', ico: 'thong-bao', label: 'Cấu hình',  hint: 'Nhãn hội thoại, tin nhắn nhanh, câu hỏi thường gặp' },
    { key: 'chatbot',           ico: 'thong-bao', label: 'Chatbot',   hint: 'Trả lời tự động, câu chào, câu ngoài giờ' },
  ] },
  { group: 'Màn hình & thiết bị', items: [
    { key: 'man-hinh', ico: 'toan-man-hinh', label: 'Cỡ chữ & hướng màn hình', hint: 'Riêng máy này hoặc mặc định cả quán' },
  ] },
  // Task 2 mục 6 (2026-08-08) — chủ quán: "giao diện cài đặt còn ít chức năng quá". SoBanHang gom
  // mọi thứ "khai báo một lần rồi dùng dài" vào Cài đặt; bên mình các màn đó ĐÃ CÓ SẴN nhưng nằm
  // rải rác trong menu Thêm nên chủ quán không tìm ra. Đây là lối tắt tới chính các màn đó — KHÔNG
  // dựng màn mới trùng lặp. Mọi `hash` dưới đây đều là tuyến có thật trong js/nav.js.
  { group: 'Khai báo danh mục', items: [
    { key: 'lk-danh-muc',     ico: 'danh-muc',      label: 'Nhóm sản phẩm',      hint: 'Thêm, sửa, xoá nhóm món', hash: '#/danh-muc' },
    { key: 'lk-nhom-tuy-chon', ico: 'nhom-tuy-chon', label: 'Nhóm tuỳ chọn',      hint: 'Topping, mức đá, mức cay…', hash: '#/nhom-tuy-chon' },
    { key: 'lk-quan-ly-ban',  ico: 'quan-ly-ban',   label: 'Bàn & khu vực',      hint: 'Thêm bàn, đổi tên khu vực, mã QR gọi món', hash: '#/quan-ly-ban' },
    { key: 'lk-nhom-khach',   ico: 'nhom-khach',    label: 'Nhóm khách hàng',    hint: 'Phân loại khách để áp giá, ưu đãi', hash: '#/nhom-khach' },
    { key: 'lk-nha-cung-cap', ico: 'nha-cung-cap',  label: 'Nhà cung cấp',       hint: 'Danh sách nơi nhập hàng', hash: '#/nha-cung-cap' },
  ] },
  { group: 'Tiền & nhân sự', items: [
    { key: 'muc-tieu',      ico: 'bao-cao-ban-hang', label: 'Mục tiêu doanh thu', hint: 'Đặt mục tiêu tháng hiện trên trang chủ' },
    { key: 'lk-nguon-tien', ico: 'nguon-tien',       label: 'Nguồn tiền',         hint: 'Tiền mặt, tài khoản ngân hàng, ví', hash: '#/nguon-tien' },
    { key: 'lk-khuyen-mai', ico: 'khuyen-mai',       label: 'Khuyến mãi',         hint: 'Chương trình giảm giá đang chạy', hash: '#/khuyen-mai' },
    { key: 'lk-nhan-vien',  ico: 'nhan-vien',        label: 'Nhân viên',          hint: 'Thêm người, đặt mã PIN đăng nhập', hash: '#/nhan-vien' },
    { key: 'lk-vai-tro',    ico: 'vai-tro',          label: 'Vai trò & quyền',    hint: 'Ai được xem, ai được sửa gì', hash: '#/vai-tro' },
    { key: 'lk-quan-ly-ca', ico: 'quan-ly-ca',       label: 'Ca làm việc',        hint: 'Mở ca, chốt ca, kiểm tiền đầu ca', hash: '#/quan-ly-ca' },
  ] },
  { group: 'Khác', items: [
    { key: 'thong-bao-link', ico: 'thong-bao', label: 'Trung tâm thông báo', hint: 'Xem lại các thông báo của quán', hash: '#/thong-bao' },
    { key: 'sao-luu',        ico: 'so-kho',    label: 'Sao lưu dữ liệu',     hint: 'Tự gửi dữ liệu về hộp thư 00:00 chủ nhật hàng tuần' },
    { key: 'xoa-cua-hang',   ico: 'canh-bao',  label: 'Xoá cửa hàng',        hint: 'Xoá toàn bộ dữ liệu quán — không lấy lại được' },
  ] },
];

// CHỈ các mục có màn con thật mới vào TITLES. Mục có `hash` là lối tắt sang màn khác — nếu để
// lẫn vào đây thì mở #/cai-dat?m=lk-danh-muc sẽ ra một trang trắng có tiêu đề mà không có nội dung.
const TITLES = Object.fromEntries(
  SETTING_MENU.flatMap((g) => g.items).filter((it) => !it.hash).map((it) => [it.key, it.label])
);

// Task 2 (19/08/2026) — ảnh mẫu "Thông tin cửa hàng": Loại hình kinh doanh, tối đa 2 ô. Đặt ở
// PHẠM VI MODULE (không phải trong render()) — cùng bẫy "vùng chết tạm thời" đã ghi ở bindSave()
// bên dưới: renderStore() bị dispatcher if/else gọi TRƯỚC dòng khai báo nếu để `const` trong
// thân render().
const BUSINESS_TYPES = [
  ['tap-hoa', 'Tạp hoá & Bán sỉ/lẻ'], ['an-uong', 'Ăn uống (F&B)'],
  ['my-pham', 'Mỹ phẩm và thời trang'], ['giai-tri', 'Giải trí và dịch vụ'],
  ['dien-thoai', 'Điện thoại và điện tử'], ['duoc', 'Dược và nhà thuốc'],
  ['phan-phoi', 'Nhà phân phối'], ['san-xuat', 'Sản xuất'], ['khac', 'Khác'],
];

export async function render(container, { staff, params } = {}) {
  const perms = staff?.perms || {};
  const canManage = !!perms.settings_manage;
  // Task 1 (09/08/2026 đợt 3) — chủ quán: "vào Cài đặt là phải chọn sẵn Thông tin cửa hàng, đừng
  // để khung bên phải trống". Vào #/cai-dat (không kèm ?m=) thì coi như đang mở mục đầu tiên.
  // CHỈ áp dụng ở màn rộng (bố cục 2 khung, ≥901px — trùng ngưỡng trong style.css). Màn hẹp chỉ
  // hiện được MỘT khung: mở sẵn mục con thì cột mục lục bị ẩn và nút "‹ Cài đặt" quay về #/cai-dat
  // lại rơi vào mục con đó → không bao giờ ra được mục lục.
  const DEFAULT_SUB = 'cua-hang';
  const twoPane = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(min-width: 901px)').matches
    : true;
  const sub = params?.m || (twoPane ? DEFAULT_SUB : '');

  // ── Bố cục 2 khung: mục lục 1 CỘT bên trái, nội dung cài đặt bên phải ────
  // Task 4 (09/08/2026) — chủ quán: "chỉ xếp thành 1 hàng vào khung màu đen thay vì 3 hàng, còn
  // khung màu xám là phần hiển thị cài đặt… chọn Thông tin cửa hàng thì bên phải hiện luôn, không
  // phải chuyển tab quá nhiều". Trước đây mục lục dàn 3 cột (.set-cols) và mở màn con là THAY CẢ
  // TRANG, nên mỗi lần sửa xong phải bấm "‹ Cài đặt" quay lại mới chọn được mục kế tiếp.
  // Địa chỉ vẫn là #/cai-dat?m=<mã> như cũ (chia sẻ / bookmark / nút Back của trình duyệt vẫn đúng),
  // chỉ khác là cột mục lục không biến mất nữa.
  const hasSub = Boolean(sub && TITLES[sub]);
  const menuHtml = SETTING_MENU.map((g) => `
    <div class="set-group">
      <div class="set-group-title">${escapeHtml(g.group)}</div>
      <div class="set-list">
        ${g.items.map((it) => `
          <a class="set-item${it.key === sub ? ' active' : ''}" href="${it.hash || `#/cai-dat?m=${it.key}`}">
            <span class="set-ico">${icon(it.ico)}</span>
            <span class="set-text">${escapeHtml(it.label)}<small>${escapeHtml(it.hint)}</small></span>
            <span class="set-arrow">›</span>
          </a>`).join('')}
      </div>
    </div>`).join('');

  container.innerHTML = `
    <h2>Cài đặt</h2>
    <div class="set-layout${hasSub ? ' has-sub' : ''}">
      <nav class="set-nav">${menuHtml}</nav>
      <section class="set-detail">
        ${hasSub ? `
          <a class="set-back" href="#/cai-dat">${icon('quay-lai')}Cài đặt</a>
          <h3 class="set-detail-title">${escapeHtml(TITLES[sub])}</h3>
          <div id="cd-body"><p>Đang tải…</p></div>`
    : '<div class="set-detail-empty">Chọn một mục ở cột bên trái để xem và chỉnh cài đặt.</div>'}
      </section>
    </div>
    ${canManage ? '' : '<p class="hint">Bạn chỉ xem được các cài đặt này. Chỉ chủ quán mới chỉnh sửa được.</p>'}
  `;
  if (!hasSub) return;
  const body = container.querySelector('#cd-body');

  // Vài màn con không cần hỏi máy chủ — dựng ngay cho nhanh.
  if (sub === 'tinh-nang') { renderFeatures(); return; }
  if (sub === 'dong-bo') { renderSync(); return; }
  if (sub === 'xoa-cua-hang') { renderDeleteStore(); return; }
  if (sub === 'nhap-du-lieu') { renderImportData(); return; }

  let settings = {};
  let surcharges = [];

  if (sub === 'phu-thu') {
    await loadSurcharges();
    return;
  }

  try {
    const res = await api.get('/api/mgr/settings');
    settings = res.settings || {};
  } catch {
    body.innerHTML = '<p>Không tải được cài đặt.</p>';
    return;
  }

  if (sub === 'cua-hang') renderStore();
  else if (sub === 'tich-diem') renderLoyalty();
  else if (sub === 'man-hinh') renderDisplay();
  else if (sub === 'quy-trinh') renderSalesProcess();
  else if (sub === 'san-pham') renderProductInfo();
  else if (sub === 'mau-hoa-don') renderInvoiceForm();
  else if (sub === 'muc-tieu') renderRevenueGoal();
  // Task 2 (13/08/2026) — 9 màn mới theo 19 ảnh chủ quán gửi.
  else if (sub === 'man-hinh-phu') renderSecondScreen();
  else if (sub === 'website') renderWebsite();
  else if (sub === 'sap-xep') renderNavOrder();
  else if (sub === 'van-chuyen') renderShipping();
  else if (sub === 'mau-in-tem') renderLabelPrint();
  else if (sub === 'thue') renderTax();
  else if (sub === 'hoa-don-dt') renderEInvoice();
  else if (sub === 'cau-hinh-tin-nhan') renderChatConfig();
  else if (sub === 'chatbot') renderChatbot();
  else if (sub === 'sao-luu') renderBackup();

  // ── Bộ dựng dùng chung cho 9 màn mới ─────────────────────────────────────
  // 9 màn đều cùng một khuôn: vài công tắc + vài ô chữ + nút Lưu. Viết tay từng cái sẽ ra ~700
  // dòng gần như giống hệt nhau, nên gom vào 4 hàm dựng + 1 hàm gắn nút Lưu.

  /** Một dòng công tắc bật/tắt, dùng lại đúng .sp-row của màn Quy trình bán hàng. */
  function sw(key, label, hint, on) {
    return `
      <label class="sp-row">
        <span class="sp-text"><b>${escapeHtml(label)}</b>${hint ? `<small>${escapeHtml(hint)}</small>` : ''}</span>
        <input type="checkbox" data-f="${key}" ${on ? 'checked' : ''} ${canManage ? '' : 'disabled'} />
      </label>`;
  }

  function txt(key, label, value, { hint = '', type = 'text', ph = '' } = {}) {
    return `
      <div class="field"><label>${escapeHtml(label)}</label>
        <input data-f="${key}" data-kind="${type === 'number' ? 'number' : 'text'}" type="${type}"
          value="${escapeHtml(String(value ?? ''))}" placeholder="${escapeHtml(ph)}" ${canManage ? '' : 'readonly'} />
        ${hint ? `<small class="hint">${escapeHtml(hint)}</small>` : ''}
      </div>`;
  }

  function sel(key, label, options, current) {
    return `
      <div class="field"><label>${escapeHtml(label)}</label>
        <select data-f="${key}" data-kind="text" ${canManage ? '' : 'disabled'}>
          ${Object.entries(options).map(([v, t]) =>
    `<option value="${escapeHtml(v)}" ${current === v ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}
        </select></div>`;
  }

  /**
   * Ô nhập DANH SÁCH (banner, nhãn hội thoại, câu hỏi thường gặp…): mỗi dòng một mục.
   * Dùng <textarea> thay cho kiểu "thẻ + nút x" vì chủ quán quen dán cả cụm từ Excel/Zalo vào;
   * máy chủ đã tự bỏ dòng trống, bỏ trùng và cắt theo giới hạn.
   */
  function list(key, label, items, max, hint) {
    const arr = Array.isArray(items) ? items : [];
    return `
      <div class="field"><label>${escapeHtml(label)} <small>(${arr.length}/${max})</small></label>
        <textarea data-f="${key}" data-kind="list" rows="${Math.min(8, Math.max(3, arr.length + 1))}"
          placeholder="Mỗi dòng một mục" ${canManage ? '' : 'readonly'}>${escapeHtml(arr.join('\n'))}</textarea>
        ${hint ? `<small class="hint">${escapeHtml(hint)}</small>` : ''}
      </div>`;
  }

  /**
   * Gắn nút Lưu: gom mọi phần tử [data-f] trong khung rồi PATCH đúng một khoá cài đặt.
   * data-kind quyết định cách đọc: list → mảng dòng, number → số, còn lại → chuỗi;
   * ô tích thì luôn đọc .checked.
   */
  function bindSave(settingKey, okMsg) {
    if (!canManage) return;
    const btn = body.querySelector('#cd-save');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      const patch = {};
      body.querySelectorAll('[data-f]').forEach((elm) => {
        const k = elm.dataset.f;
        if (elm.type === 'checkbox') { patch[k] = elm.checked; return; }
        // Nhóm radio dùng chung data-f (VD: phương pháp tính thuế) — chỉ ô ĐANG CHỌN mới ghi
        // vào patch, không thì ô sau ghi đè ô trước bất kể cái nào đang được chọn thật.
        if (elm.type === 'radio') { if (elm.checked) patch[k] = elm.value; return; }
        if (elm.dataset.kind === 'list') {
          patch[k] = elm.value.split('\n').map((s) => s.trim()).filter(Boolean);
          return;
        }
        if (elm.dataset.kind === 'number') { patch[k] = Number(elm.value) || 0; return; }
        patch[k] = elm.value.trim();
      });
      try {
        const res = await api.patch(`/api/mgr/settings/${settingKey}`, patch);
        settings[settingKey] = res.value;
        toast(okMsg);
        return res.value;
      } catch (err) {
        toast(err?.body?.message || 'Không lưu được', 'error');
        return null;
      }
    });
  }

  // BUG (phát hiện 13/08/2026 khi mở Chrome thật): 9/11 màn Cài đặt mới kẹt ở chữ "Đang tải…",
  // console báo `ReferenceError: Cannot access 'saveBtn' before initialization`.
  // GỐC RỄ: hàm này từng viết bằng `const saveBtn = (text) => …`, mà nó nằm DƯỚI chuỗi
  // if/else gọi renderTax() / renderChatbot() / … Biến `const` nằm trong "vùng chết tạm thời":
  // chưa chạy tới dòng khai báo thì đụng vào là nổ. Hai màn không dùng saveBtn (Sắp xếp vị trí,
  // Xoá cửa hàng) vẫn chạy nên nhìn qua tưởng chỉ mạng chậm.
  // Viết bằng `function` thì được kéo lên đầu phạm vi, gọi lúc nào cũng có.
  // NHỚ: MỌI hàm phụ trong render() phải là `function`, đừng dùng `const` — chuỗi if/else gọi chúng
  // nằm ở TRÊN. Cùng loại bẫy với `export { X } from` hồi 12/08 (bug-092): 2774 lượt kiểm tự động
  // đều PASS vì chúng chỉ soi chuỗi và gọi hàm thuần, không màn nào được dựng thật.
  function saveBtn(text) {
    return canManage
      ? `<button id="cd-save" class="btn btn-primary" style="margin-top:12px">${escapeHtml(text)}</button>`
      : readonlyNote();
  }

  // ── Màn hình phụ (ảnh CD-02) ─────────────────────────────────────────────
  // Task 2 (19/08/2026) — ảnh mẫu chia 2 dải ảnh (chờ / đang nhận order) tối đa 9 ảnh + tốc độ
  // đổi ảnh. Dùng URL ảnh (giống banner Website) vì dự án chưa có endpoint tải file ảnh lên.
  function renderSecondScreen() {
    const v = settings.second_screen || {};
    body.innerHTML = `
      <div class="sp-group">
        ${sw('enabled', 'Màn hình phụ', 'Áp dụng cho tất cả thiết bị màn hình phụ kết nối với cửa hàng này', v.enabled)}
        ${sw('show_qr', 'Hiện mã QR thanh toán', 'Khách quét trả tiền ngay trên màn phụ', v.show_qr)}
      </div>
      ${txt('greeting', 'Lời chào hiện khi chưa có đơn', v.greeting, { ph: 'VD: Cảm ơn quý khách!' })}
      <h4>Màn hình chờ</h4>
      <p class="hint">Hiển thị khi máy POS chính chưa có đơn hàng nào đang tạo.</p>
      ${list('idle_images', 'Ảnh màn hình chờ', v.idle_images, 9, 'Dán đường dẫn ảnh, mỗi dòng một ảnh · tỉ lệ đề xuất 16:9')}
      <h4>Màn hình thông tin đơn hàng &amp; thanh toán</h4>
      <p class="hint">Ảnh nền hiển thị phía sau bảng tạm tính khi đang nhận order (tuỳ chọn).</p>
      ${list('order_images', 'Ảnh màn hình đang nhận order', v.order_images, 9, 'Dán đường dẫn ảnh, mỗi dòng một ảnh · tỉ lệ đề xuất 3:4')}
      ${txt('image_interval_sec', 'Đổi ảnh mỗi (giây)', v.image_interval_sec ?? 12, { type: 'number', hint: 'Cần từ 2 ảnh trở lên mới tự đổi' })}
      <p class="hint">Hiển thị đơn hàng và QR thanh toán cho khách hàng trên màn hình thứ hai gắn tại POS.
        Mở màn phụ bằng địa chỉ <b>#/man-hinh-phu</b> trên máy nối màn thứ hai.</p>
      ${saveBtn('Lưu thay đổi')}
    `;
    bindSave('second_screen', 'Đã lưu cài đặt màn hình phụ');
  }

  // ── Website cửa hàng (ảnh CD-03 → CD-04b) ────────────────────────────────
  // Task 2 (19/08/2026) — chia lại 3 tab đúng ảnh mẫu: Ảnh/Banner · Danh mục nổi bật · Cài đặt
  // Website. Trước đây dồn hết vào một trang dài; giữ nguyên field/khoá cũ, chỉ thêm tab +
  // nhóm "Cài đặt Website" còn thiếu.
  function renderWebsite(tab = 'anh') {
    const v = settings.website || {};
    const TABS = [['anh', 'Ảnh / Banner'], ['danh-muc', 'Danh mục nổi bật'], ['config', 'Cài đặt Website']];
    const tabsHtml = `<div class="tabs" id="cd-web-tabs">
      ${TABS.map(([k, label]) => `<button type="button" class="tab-btn${k === tab ? ' active' : ''}" data-tab="${k}">${escapeHtml(label)}</button>`).join('')}
    </div>`;

    let panelHtml = '';
    if (tab === 'anh') {
      panelHtml = `
        <div class="sp-group">
          ${sw('enabled', 'Bật website bán hàng', 'Trang đặt món online của quán', v.enabled)}
        </div>
        <h4>Thay ảnh</h4>
        ${txt('avatar_url', 'Ảnh đại diện', v.avatar_url, { type: 'url', hint: 'Kích thước đề xuất 500×500px, dung lượng tối đa 2MB', ph: 'https://...' })}
        ${txt('cover_url', 'Ảnh bìa cửa hàng', v.cover_url, { type: 'url', hint: 'Kích thước đề xuất 1920×640px, dung lượng tối đa 2MB', ph: 'https://...' })}
        <h4>Danh sách banner</h4>
        ${list('banners', 'Banner Website bán hàng', v.banners, 5, 'Dán đường dẫn ảnh, mỗi dòng một banner')}
        <h4>Danh sách video</h4>
        ${list('videos', 'Thêm video cho Website', v.videos, 3, 'Dán đường dẫn YouTube, mỗi dòng một video')}
        <h4>Giới thiệu</h4>
        ${txt('intro', 'Giới thiệu ngắn', v.intro, { ph: 'VD: Cơm nhà nấu, giao tận nơi' })}
        ${txt('hotline', 'Hotline hiện trên web', v.hotline, { type: 'tel' })}
        ${saveBtn('Cập nhật')}`;
    } else if (tab === 'danh-muc') {
      panelHtml = `
        <p class="hint">Các danh mục sẽ hiển thị trên website bán hàng trực tuyến theo thứ tự bạn thiết lập.</p>
        ${list('featured_cats', 'Danh mục nổi bật', v.featured_cats, 10, 'Tên danh mục hiện ở đầu trang web, mỗi dòng một danh mục — thứ tự dán vào cũng là thứ tự hiện trên web')}
        ${saveBtn('Cập nhật')}`;
    } else {
      const publicUrl = (typeof window !== 'undefined' && window.location?.origin) || '';
      panelHtml = `
        <div class="sp-group">
          <div class="sp-group-title">Cửa hàng trực tuyến</div>
          <div class="field"><label>Địa chỉ Website (URL)</label>
            <input type="text" value="${escapeHtml(publicUrl)}" readonly /></div>
          ${sw('online_register_enabled', 'Đăng ký bán hàng trực tuyến', 'Cung cấp CMND / CCCD với Bộ Công Thương', v.online_register_enabled)}
        </div>
        <div class="sp-group">
          <div class="sp-group-title">Phí vận chuyển</div>
          ${sw('flat_shipping_enabled', 'Phí vận chuyển đồng giá', 'Tự động điền phí vận chuyển khi tạo đơn', v.flat_shipping_enabled)}
          ${txt('flat_shipping_fee', 'Mức phí đồng giá (đồng)', v.flat_shipping_fee ?? 0, { type: 'number' })}
        </div>
        <div class="sp-group">
          <div class="sp-group-title">Cài đặt hiển thị</div>
          <p class="hint">Tuỳ chỉnh nội dung hiển thị trên trang mua hàng.</p>
          ${sw('show_contact_price', 'Hiển thị giá liên hệ các sản phẩm trên trang mua hàng', '', v.show_contact_price)}
          ${sw('show_sold_count', 'Hiển thị tổng số lượng đã bán trên website', '', v.show_sold_count)}
          ${sw('hide_out_of_stock', 'Ẩn sản phẩm hết hàng với khách mua hàng', '', v.hide_out_of_stock)}
          ${sw('allow_preorder_out_of_stock', 'Cho phép khách đặt hàng trước sản phẩm hết hàng', '', v.allow_preorder_out_of_stock)}
        </div>
        <div class="sp-group">
          <div class="sp-group-title">Tạm đóng cửa hàng</div>
          ${sw('store_closed', 'Tạm đóng cửa hàng', 'Khách hàng khi truy cập địa chỉ website sẽ được thông báo cửa hàng tạm đóng', v.store_closed)}
        </div>
        ${saveBtn('Cập nhật')}`;
    }

    body.innerHTML = `${tabsHtml}<div id="cd-web-panel">${panelHtml}</div>`;
    body.querySelectorAll('#cd-web-tabs [data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => renderWebsite(btn.dataset.tab));
    });
    bindSave('website', 'Đã cập nhật website cửa hàng');
  }

  // ── Quản lý vận chuyển (ảnh CD-05) ───────────────────────────────────────
  // App gốc chỉ có 2 thẻ + nút "Kết nối" mở trang đăng nhập của đối tác. Quán chưa có tài khoản
  // nên ở đây là chỗ khai mã cửa hàng + khoá API: có tài khoản là điền vào chạy được ngay.
  function renderShipping() {
    const v = settings.shipping || {};
    body.innerHTML = `
      <div class="sp-group">
        <div class="sp-group-title">Giao Hàng Nhanh</div>
        <p class="hint">Giải pháp giao hàng, thu hộ chuyên nghiệp trải dài mọi miền đất nước.</p>
        ${sw('ghn_enabled', 'Bật Giao Hàng Nhanh', '', v.ghn_enabled)}
        ${txt('ghn_shop_id', 'Mã cửa hàng GHN', v.ghn_shop_id, { ph: 'Lấy trong trang quản trị GHN' })}
        ${txt('ghn_token', 'Khoá API GHN', v.ghn_token, { ph: 'Token do GHN cấp' })}
      </div>
      <div class="sp-group">
        <div class="sp-group-title">Ahamove</div>
        <p class="hint">Dịch vụ giao nội thành siêu tốc, siêu tiết kiệm và thông minh.</p>
        ${sw('ahamove_enabled', 'Bật Ahamove', '', v.ahamove_enabled)}
        ${txt('ahamove_phone', 'Số điện thoại tài khoản Ahamove', v.ahamove_phone, { type: 'tel' })}
        ${txt('ahamove_token', 'Khoá API Ahamove', v.ahamove_token, { ph: 'Token do Ahamove cấp' })}
      </div>
      ${txt('pickup_address', 'Địa chỉ lấy hàng', v.pickup_address, { hint: 'Tài xế tới đây nhận đơn' })}
      <p class="hint">Chưa có tài khoản đối tác thì cứ để trống — đơn giao hàng vẫn ghi nhận bình thường,
        chỉ là không tự gọi tài xế được.</p>
      ${saveBtn('Lưu cài đặt vận chuyển')}
    `;
    bindSave('shipping', 'Đã lưu cài đặt vận chuyển');
  }

  // ── Mẫu in tem (ảnh CD-11 → CD-14) ───────────────────────────────────────
  function renderLabelPrint() {
    const v = settings.label_print || {};
    const SCOPE = { all: 'Tất cả', category: 'Theo danh mục', product: 'Theo sản phẩm' };
    const FONT = { 'mac-dinh': 'Mặc định', lon: 'Lớn' };
    body.innerHTML = `
      <div class="sp-group">
        ${sw('enabled', 'Bật in tem món', 'In tem dán lên ly / hộp để bếp biết món nào của bàn nào', v.enabled)}
      </div>
      ${txt('name', 'Tên chức năng in', v.name, { ph: 'VD: In tem món' })}
      ${txt('description', 'Mô tả', v.description)}
      ${sel('paper', 'Chọn khổ giấy in', { '50x30': 'Khổ 50×30mm' }, v.paper || '50x30')}
      ${sel('scope', 'Chọn món cho chức năng in', SCOPE, v.scope || 'all')}
      ${list('scope_ids', 'Danh mục / sản phẩm được in tem', v.scope_ids, 200,
    'Chỉ dùng khi chọn "Theo danh mục" hoặc "Theo sản phẩm" — mỗi dòng một tên')}
      <h4>Điều chỉnh mẫu tem</h4>
      ${sel('font_size', 'Cỡ chữ', FONT, v.font_size || 'mac-dinh')}
      <div class="sp-group">
        <div class="sp-group-title">Thông tin mẫu</div>
        ${sw('show_store', 'Tên cửa hàng', '', v.show_store)}
        ${sw('show_table', 'Tên bàn - Khu vực hoặc Hình thức bán', '', v.show_table)}
        ${sw('show_code', 'Mã hoá đơn', '', v.show_code)}
        ${sw('show_index', 'Số thứ tự món / Tổng số lượng món', '', v.show_index)}
        ${sw('show_price', 'Tổng giá món', '', v.show_price)}
        ${sw('show_time', 'Ngày giờ tạo đơn', '', v.show_time)}
      </div>
      <h4>Xem trước</h4>
      <div class="cd-tem-preview" id="cd-tem-preview"></div>
      ${saveBtn('Cập nhật mẫu tem')}
    `;
    drawLabelPreview();
    // Tích/bỏ tích là bản xem trước đổi NGAY — chủ quán thấy tem trông ra sao trước khi bấm Lưu.
    body.querySelectorAll('[data-f]').forEach((elm) => elm.addEventListener('change', drawLabelPreview));
    bindSave('label_print', 'Đã cập nhật mẫu in tem');

    function drawLabelPreview() {
      const on = (k) => {
        const elm = body.querySelector(`[data-f="${k}"]`);
        return elm ? elm.checked : false;
      };
      const big = (body.querySelector('[data-f="font_size"]') || {}).value === 'lon';
      const store = settings.store?.name || 'Cơm A Thuý';
      body.querySelector('#cd-tem-preview').innerHTML = `
        <div class="cd-tem${big ? ' big' : ''}">
          <div class="cd-tem-head">
            <b>${on('show_store') ? escapeHtml(store) : ''}</b>
            <span>${on('show_time') ? '16:48 31/05' : ''}</span>
          </div>
          <div class="cd-tem-sub">${on('show_table') ? '(Sảnh - Bàn 1)' : ''} ${on('show_code') ? 'FFHQFX' : ''}</div>
          <div class="cd-tem-name">Cơm sườn - Size M</div>
          <div class="cd-tem-note">+ Ít đá<br>+ Thêm canh</div>
          <div class="cd-tem-foot">
            <span>${on('show_index') ? '2/5' : ''}</span>
            <b>${on('show_price') ? '43.000' : ''}</b>
          </div>
        </div>`;
    }
  }

  // ── Quản lý thuế (ảnh CD-16) ─────────────────────────────────────────────
  // Task 2 (19/08/2026) — thêm "Phương pháp tính thuế" (trực tiếp/khấu trừ) + thuế vận chuyển
  // riêng + giảm thuế NQ204 theo ảnh mẫu. KHÔNG tự đặt sẵn % ưu đãi theo ngành nghề (dễ sai luật
  // thuế thật của từng hộ kinh doanh) — ô "Thuế suất mặc định" vẫn để chủ quán/kế toán tự gõ số.
  function renderTax() {
    const v = settings.tax || {};
    const method = v.method || 'truc-tiep';
    body.innerHTML = `
      <p class="hint">Cấu hình cách tính thuế GTGT cho cửa hàng.</p>
      <div class="sp-group">
        ${sw('enabled', 'Quản lý thuế', 'Bật để cấu hình thuế GTGT cho cửa hàng. Tắt để ẩn toàn bộ phần cấu hình.', v.enabled)}
      </div>
      <h4>Phương pháp tính thuế</h4>
      <label class="sp-row">
        <span class="sp-text"><b>Thuế trực tiếp</b><small>Thuế tính theo tỷ lệ % cố định trên doanh thu, theo ngành nghề. Phù hợp hộ kinh doanh nhỏ.</small></span>
        <input type="radio" name="tax-method" value="truc-tiep" ${method === 'truc-tiep' ? 'checked' : ''} ${canManage ? '' : 'disabled'} />
      </label>
      <label class="sp-row">
        <span class="sp-text"><b>Thuế khấu trừ</b><small>GTGT 0% / 5% / 8% / 10% cộng vào giá bán. Phù hợp hộ kinh doanh quy mô lớn.</small></span>
        <input type="radio" name="tax-method" value="khau-tru" ${method === 'khau-tru' ? 'checked' : ''} ${canManage ? '' : 'disabled'} />
      </label>
      <h4>Quản lý thuế</h4>
      ${txt('rate', 'Tỷ lệ thuế mặc định (%)', v.rate ?? 8, { type: 'number', hint: 'Áp cho toàn bộ sản phẩm khi lưu — hàng ăn uống thường 8% hoặc 10%' })}
      ${txt('shipping_tax_rate', 'Tỷ lệ thuế vận chuyển (%)', v.shipping_tax_rate ?? 0, { type: 'number', hint: 'Trên phí vận chuyển' })}
      ${sw('price_include', 'Giá bán đã bao gồm thuế', 'Bật: tách thuế ra từ giá đang bán. Tắt: cộng thêm thuế vào giá', v.price_include)}
      <label class="sp-row">
        <span class="sp-text"><b>Áp dụng giảm thuế theo Nghị quyết 204/2025/QH15</b><small>Áp mức giảm thuế GTGT theo nghị quyết hiện hành cho hộ kinh doanh đủ điều kiện.</small></span>
        <input type="checkbox" data-f="nq204_discount" ${v.nq204_discount ? 'checked' : ''} ${canManage ? '' : 'disabled'} />
      </label>
      <p class="hint" style="color:var(--money-out)"><b>Lưu ý:</b> Khi thay đổi thuế GTGT, hệ thống sẽ tự động cập nhật lại thuế GTGT mới cho toàn bộ sản phẩm của cửa hàng.</p>
      <p class="hint">Bật mục này thì màn <b>Ước tính thuế</b> và <b>Hoá đơn đầu ra</b> dùng thuế suất ở đây làm mặc định.</p>
      ${saveBtn('Cập nhật')}
    `;
    bindSave('tax', 'Đã lưu cài đặt thuế');
    if (!canManage) return;
    body.querySelectorAll('input[name="tax-method"]').forEach((r) => r.setAttribute('data-f', 'method'));
  }

  // ── Hoá đơn điện tử (ảnh CD-17) ──────────────────────────────────────────
  function renderEInvoice() {
    const v = settings.e_invoice || {};
    body.innerHTML = `
      <p class="hint">Quản lý phát hành và đồng bộ hoá đơn điện tử cho cửa hàng.</p>
      <div class="sp-group">
        <div class="sp-group-title">Phát hành hoá đơn điện tử</div>
        <p class="hint">Liên kết với đơn vị cung cấp hoá đơn điện tử để phát hành HĐĐT trực tiếp.</p>
        ${sw('issue_enabled', 'Bật phát hành hoá đơn điện tử', '', v.issue_enabled)}
        ${txt('provider', 'Đơn vị cung cấp', v.provider, { ph: 'VD: Viettel, VNPT, MISA meInvoice' })}
        ${txt('issue_account', 'Tài khoản phát hành', v.issue_account)}
        ${txt('issue_token', 'Khoá kết nối', v.issue_token)}
      </div>
      <div class="sp-group">
        <div class="sp-group-title">Đồng bộ hoá đơn đầu vào tự động từ Cơ quan thuế</div>
        <p class="hint">Tự động tải hoá đơn mua vào theo lịch đã cài đặt. Hoá đơn tải về nằm ở
          <b>Quản lý hoá đơn › Hoá đơn đầu vào</b>.</p>
        ${sw('sync_enabled', 'Bật đồng bộ tự động', '', v.sync_enabled)}
        ${txt('tax_account', 'Tài khoản thuedientu.gdt.gov.vn', v.tax_account)}
        ${txt('tax_password', 'Mật khẩu', v.tax_password, { type: 'password' })}
        ${txt('sync_hour', 'Giờ đồng bộ hằng ngày (0–23)', v.sync_hour ?? 2, { type: 'number' })}
      </div>
      <p class="hint">Chưa có tài khoản thì để trống — vẫn nhập hoá đơn đầu vào bằng tay hoặc nhập file được.</p>
      ${saveBtn('Lưu cài đặt hoá đơn điện tử')}
    `;
    bindSave('e_invoice', 'Đã lưu cài đặt hoá đơn điện tử');
  }

  // ── Cấu hình tin nhắn (ảnh CD-18) ────────────────────────────────────────
  function renderChatConfig() {
    const v = settings.chat_config || {};
    body.innerHTML = `
      <h4>Quản lý trang</h4>
      ${txt('page_name', 'Trang đang quản lý', v.page_name, { hint: 'Tên hiện ở đầu Chat Center' })}
      <h4>Quản lý chung</h4>
      ${list('labels', 'Nhãn hội thoại', v.labels, 30, 'VD: Khách quen · Cần gọi lại · Đơn lớn')}
      ${list('quick_replies', 'Tin nhắn nhanh', v.quick_replies, 30, 'Câu trả lời soạn sẵn, gõ "/" trong Chat Center để chọn')}
      <h4>Quản lý riêng</h4>
      ${list('faqs', 'Câu hỏi thường gặp', v.faqs, 30, 'Mỗi dòng một câu hỏi + câu trả lời')}
      <div class="sp-group">
        ${sw('auto_reply_comment', 'Tự trả lời bình luận', 'Trả lời bình luận trên bài đăng bằng câu đầu tiên trong tin nhắn nhanh', v.auto_reply_comment)}
      </div>
      ${saveBtn('Lưu cấu hình tin nhắn')}
    `;
    bindSave('chat_config', 'Đã lưu cấu hình tin nhắn');
  }

  // ── Chatbot (ảnh CD-18) ──────────────────────────────────────────────────
  function renderChatbot() {
    const v = settings.chatbot || {};
    body.innerHTML = `
      <div class="sp-group">
        ${sw('enabled', 'Bật chatbot trả lời tự động', 'Trả lời khách trên Zalo / Messenger khi chưa có người trực', v.enabled)}
      </div>
      ${txt('greeting', 'Câu chào đầu tiên', v.greeting)}
      ${txt('away_message', 'Câu trả lời ngoài giờ', v.away_message)}
      ${txt('off_from', 'Ngoài giờ tính từ (giờ)', v.off_from ?? 22, { type: 'number' })}
      ${txt('off_to', 'Ngoài giờ đến (giờ)', v.off_to ?? 6, { type: 'number' })}
      <p class="hint">Tắt chatbot ở đây là tắt cho CẢ QUÁN. Muốn tắt riêng một khách thì bấm nút
        tạm dừng AI ngay trong hội thoại đó ở Chat Center.</p>
      ${saveBtn('Lưu cài đặt chatbot')}
    `;
    bindSave('chatbot', 'Đã lưu cài đặt chatbot');
  }

  // ── Sao lưu dữ liệu (ảnh CD-19) ──────────────────────────────────────────
  function renderBackup() {
    const v = settings.backup || {};
    body.innerHTML = `
      <div class="sp-group">
        ${sw('weekly_enabled', 'Sao lưu dữ liệu hàng tuần',
    'Hệ thống sẽ tự động gửi dữ liệu lúc 00:00 - chủ nhật hàng tuần vào mail của bạn', v.weekly_enabled)}
      </div>
      ${txt('email', 'Gửi về hộp thư', v.email, { type: 'email', ph: 'ten@gmail.com' })}
      ${saveBtn('Cập nhật')}
    `;
    bindSave('backup', 'Đã lưu cài đặt sao lưu');
  }

  // ── Sắp xếp vị trí menu (ảnh CD-01 / CD-04) ──────────────────────────────
  // App gốc là hộp thoại kéo-thả toàn màn hình. Ở đây dùng 2 nút mũi tên thay cho kéo-thả: chủ
  // quán bấm trên máy tính bảng dính dầu mỡ, kéo-thả trượt tay hay nhả nhầm chỗ.
  function renderNavOrder() {
    const saved = settings.nav_order || {};
    // Máy chủ là bản gốc — mở màn này là đồng bộ luôn xuống bộ nhớ đệm của máy, để cột trái của
    // máy vừa đăng nhập lần đầu cũng đúng thứ tự chủ quán đã đặt.
    setNavOrder({ order: saved.order || [], hidden: saved.hidden || [] });

    const all = allowedFeatures(staff).filter((f) => !f.sidebarHidden);
    let order = applyNavOrder(all, { order: saved.order || [], hidden: [] }).map((f) => f.route);
    let hidden = new Set(saved.hidden || []);

    function draw() {
      // Xếp theo NHÓM y như cột trái, trong mỗi nhóm mới cho đổi chỗ — đảo một mục sang nhóm khác
      // thì cột trái vẫn vẽ nó ở nhóm cũ (nhóm là thuộc tính của tính năng), nhìn như nút hỏng.
      const byGroup = new Map();
      for (const route of order) {
        const f = all.find((x) => x.route === route);
        if (!f) continue;
        if (!byGroup.has(f.group)) byGroup.set(f.group, []);
        byGroup.get(f.group).push(f);
      }
      body.innerHTML = `
        <p class="hint">Chọn thứ tự và ẩn bớt các mục ở cột bên trái. Bỏ tích là mục đó biến khỏi
          cột trái nhưng vẫn vào được bằng ô tìm kiếm và màn "Thêm".</p>
        ${[...byGroup.entries()].map(([g, items]) => `
          <div class="sp-group">
            <div class="sp-group-title">${escapeHtml(g)}</div>
            ${items.map((f, i) => `
              <div class="cd-sort-row">
                <input type="checkbox" data-show="${f.route}" ${hidden.has(f.route) ? '' : 'checked'}
                  ${canManage ? '' : 'disabled'} aria-label="Hiện ${escapeHtml(f.label)}" />
                <span class="set-ico">${icon(f.route)}</span>
                <span class="cd-sort-name">${escapeHtml(f.label)}</span>
                <button type="button" class="cd-sort-btn" data-move="up" data-route="${f.route}"
                  ${i === 0 || !canManage ? 'disabled' : ''} aria-label="Lên trên">↑</button>
                <button type="button" class="cd-sort-btn" data-move="down" data-route="${f.route}"
                  ${i === items.length - 1 || !canManage ? 'disabled' : ''} aria-label="Xuống dưới">↓</button>
              </div>`).join('')}
          </div>`).join('')}
        ${canManage ? `
          <div class="tables-top-actions" style="margin-top:12px">
            <button id="cd-sort-save" class="btn btn-primary">Lưu</button>
            <button id="cd-sort-reset">Khôi phục mặc định</button>
          </div>` : readonlyNote()}
      `;

      body.querySelectorAll('[data-show]').forEach((cb) => cb.addEventListener('change', () => {
        if (cb.checked) hidden.delete(cb.dataset.show);
        else hidden.add(cb.dataset.show);
        draw();
      }));
      body.querySelectorAll('[data-move]').forEach((btn) => btn.addEventListener('click', () => {
        const route = btn.dataset.route;
        const f = all.find((x) => x.route === route);
        // Đổi chỗ với NGƯỜI HÀNG XÓM CÙNG NHÓM gần nhất, không phải phần tử liền kề trong `order`
        // (liền kề có thể đang thuộc nhóm khác → bấm ↑ mà không thấy gì nhúc nhích).
        const idx = order.indexOf(route);
        const step = btn.dataset.move === 'up' ? -1 : 1;
        for (let i = idx + step; i >= 0 && i < order.length; i += step) {
          const other = all.find((x) => x.route === order[i]);
          if (!other || other.group !== f.group) continue;
          order[idx] = order[i];
          order[i] = route;
          break;
        }
        draw();
      }));
      if (!canManage) return;
      body.querySelector('#cd-sort-save').addEventListener('click', async () => {
        const pref = { order, hidden: [...hidden] };
        try {
          const res = await api.patch('/api/mgr/settings/nav_order', pref);
          settings.nav_order = res.value;
          setNavOrder(res.value);
          toast('Đã lưu. Tải lại trang để thấy cột trái đổi thứ tự.');
        } catch (err) { toast(err?.body?.message || 'Không lưu được', 'error'); }
      });
      body.querySelector('#cd-sort-reset').addEventListener('click', () => {
        order = all.map((f) => f.route);
        hidden = new Set();
        draw();
      });
    }
    draw();
  }

  // ── Xoá cửa hàng (ảnh CD-18 / CD-19, mục cuối nhóm KHÁC) ─────────────────
  // KHÔNG làm nút "xoá sạch cơ sở dữ liệu": bấm nhầm là mất toàn bộ đơn hàng, khách hàng, sổ quỹ
  // của quán, không có đường lùi. Màn này làm đúng 2 việc THẬT và an toàn — tải dữ liệu về máy
  // trước khi tính chuyện xoá, và xoá dấu vết đăng nhập trên chính máy đang dùng.
  function renderDeleteStore() {
    body.innerHTML = `
      <div class="sp-group">
        <div class="sp-group-title">Trước khi xoá: tải dữ liệu về máy</div>
        <p class="hint">Xuất toàn bộ đơn hàng, khách hàng và sổ quỹ ra file để giữ lại. Nên làm
          việc này trước tiên — xoá rồi thì không lấy lại được.</p>
        <a class="btn btn-primary" href="#/bao-cao-ban-hang">Mở Báo cáo bán hàng để xuất file</a>
      </div>
      <div class="sp-group">
        <div class="sp-group-title">Xoá dữ liệu quán trên MÁY NÀY</div>
        <p class="hint">Đăng xuất và xoá sạch bộ nhớ tạm, đơn đang mở dở, cài đặt riêng của máy này.
          Dữ liệu trên máy chủ <b>không</b> bị ảnh hưởng — máy khác vẫn dùng bình thường.</p>
        <button id="cd-wipe-local" class="btn btn-danger">Xoá dữ liệu trên máy này</button>
      </div>
      <div class="sp-group">
        <div class="sp-group-title">Xoá hẳn cửa hàng</div>
        <p class="hint">Xoá vĩnh viễn toàn bộ dữ liệu của quán khỏi máy chủ. Thao tác này
          <b>không thể hoàn tác</b> nên phải do kỹ thuật thực hiện cùng bạn, không đặt thành một nút
          bấm ở đây. Liên hệ kỹ thuật khi bạn thật sự muốn dừng dùng phần mềm.</p>
      </div>
    `;
    body.querySelector('#cd-wipe-local').addEventListener('click', async () => {
      // eslint-disable-next-line no-alert
      if (!window.confirm('Xoá toàn bộ dữ liệu POS Manager trên máy này và đăng xuất?')) return;
      try {
        if (typeof caches !== 'undefined' && caches.keys) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
        Object.keys(localStorage)
          .filter((k) => k.startsWith('posmgr'))
          .forEach((k) => localStorage.removeItem(k));
      } catch { /* xoá được tới đâu hay tới đó */ }
      location.hash = '#/dang-nhap';
      location.reload();
    });
  }

  // ── Mục tiêu doanh thu (Task 2 mục 6) ────────────────────────────────────
  // Khoá `dashboard.revenue_goal` đã có sẵn trong SETTING_SCHEMA và trang chủ đã vẽ thanh tiến độ
  // theo nó, nhưng trước đây chỉ sửa được qua một hộp thoại nhỏ nằm trong trang chủ. Đưa vào Cài
  // đặt để chủ quán tìm thấy ở đúng chỗ mình nghĩ nó phải ở.
  function renderRevenueGoal() {
    const goal = Number(settings.dashboard?.revenue_goal || 0);
    body.innerHTML = `
      <div class="field"><label>Mục tiêu doanh thu mỗi tháng (đồng)</label>
        <input id="cd-goal" type="number" min="0" step="100000" value="${goal}" ${canManage ? '' : 'readonly'} /></div>
      <p class="hint">Đặt 0 để tắt thanh tiến độ trên trang chủ. Hiện tại: ${formatVND(goal)}.</p>
      ${canManage ? '<button class="btn btn-primary" id="cd-goal-save">Lưu</button>' : ''}
    `;
    if (!canManage) return;
    body.querySelector('#cd-goal-save').addEventListener('click', async () => {
      const value = Math.max(0, parseInt(body.querySelector('#cd-goal').value, 10) || 0);
      try {
        await api.patch('/api/mgr/settings/dashboard', { revenue_goal: value });
        settings.dashboard = { ...(settings.dashboard || {}), revenue_goal: value };
        toast('Đã lưu mục tiêu doanh thu');
        renderRevenueGoal();
      } catch (err) {
        toast(err?.body?.message || 'Không lưu được mục tiêu', 'error');
      }
    });
  }

  // ── Thông tin cửa hàng ───────────────────────────────────────────────────
  function renderStore() {
    const store = settings.store || {};
    const logoUrl = store.logo_url || '';
    const types = new Set(Array.isArray(store.business_types) ? store.business_types : []);
    body.innerHTML = `
      <div class="store-avatar-wrap">
        <div class="store-avatar-preview" id="cd-avatar-preview">
          ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="Logo" />` : `<span class="store-avatar-placeholder">${icon('quan-ly')}</span>`}
        </div>
        <div class="store-avatar-fields">
          <div class="field" style="margin-bottom:0">
            <label>URL ảnh đại diện quán (tuỳ chọn)</label>
            <input id="cd-slogo" type="url" value="${escapeHtml(logoUrl)}" placeholder="https://..." ${canManage ? '' : 'readonly'} />
          </div>
          <p class="hint" style="margin-top:4px">Dán đường dẫn ảnh từ Google Drive, Imgur, hoặc bất kỳ URL ảnh nào. Ảnh hiện trên hoá đơn in.</p>
        </div>
      </div>
      <div class="field"><label>Tên cửa hàng</label>
        <input id="cd-sname" type="text" value="${escapeHtml(store.name || '')}" ${canManage ? '' : 'readonly'} /></div>
      <div class="field"><label>Số điện thoại</label>
        <input id="cd-sphone" type="tel" value="${escapeHtml(store.phone || '')}" ${canManage ? '' : 'readonly'} /></div>
      <div class="field"><label>Giờ mở cửa</label>
        <input id="cd-shours" type="text" value="${escapeHtml(store.business_hours || '')}" placeholder="VD: 08:00 - 17:00" ${canManage ? '' : 'readonly'} /></div>
      <div class="field"><label>Loại hình kinh doanh <small>(chọn tối đa 2 loại hình)</small></label>
        <div class="set-list" id="cd-btypes">
          ${BUSINESS_TYPES.map(([v, label]) => `
            <label class="sp-row">
              <span class="sp-text">${escapeHtml(label)}</span>
              <input type="checkbox" data-btype="${v}" ${types.has(v) ? 'checked' : ''} ${canManage ? '' : 'disabled'} />
            </label>`).join('')}
        </div>
      </div>
      <div class="field"><label>Mô tả cửa hàng</label>
        <textarea id="cd-sdesc" rows="3" placeholder="Nhập mô tả..." ${canManage ? '' : 'readonly'}>${escapeHtml(store.description || '')}</textarea></div>
      <div class="field"><label>Địa chỉ</label>
        <input id="cd-saddr" type="text" value="${escapeHtml(store.address || '')}" ${canManage ? '' : 'readonly'} /></div>
      <h4>Địa điểm kinh doanh <small>(dùng cho hoá đơn và khai báo thuế)</small></h4>
      <div class="field"><label>Mã địa điểm <small>(5 chữ số)</small></label>
        <input id="cd-slocc" type="text" maxlength="5" value="${escapeHtml(store.location_code || '')}" placeholder="VD: 00012" ${canManage ? '' : 'readonly'} /></div>
      <div class="field"><label>Tên địa điểm</label>
        <input id="cd-slocn" type="text" value="${escapeHtml(store.location_name || '')}" ${canManage ? '' : 'readonly'} /></div>
      <div class="field"><label>Địa chỉ địa điểm kinh doanh</label>
        <input id="cd-sloca" type="text" value="${escapeHtml(store.location_address || '')}" ${canManage ? '' : 'readonly'} /></div>
      <div class="field"><label>Mã số thuế (tuỳ chọn)</label>
        <input id="cd-stax" type="text" value="${escapeHtml(store.tax_code || '')}" ${canManage ? '' : 'readonly'} /></div>
      <div class="field"><label>Chân hoá đơn (tuỳ chọn)</label>
        <input id="cd-sfooter" type="text" value="${escapeHtml(store.bill_footer || '')}" placeholder="VD: Cảm ơn quý khách!" ${canManage ? '' : 'readonly'} /></div>
      ${canManage ? '<button id="cd-save-store" class="btn btn-primary">Lưu thông tin quán</button>' : readonlyNote()}
    `;
    if (!canManage) return;
    // Cập nhật preview ảnh khi người dùng gõ URL
    body.querySelector('#cd-slogo').addEventListener('input', (e) => {
      const preview = body.querySelector('#cd-avatar-preview');
      const url = e.target.value.trim();
      if (url) {
        preview.innerHTML = `<img src="${escapeHtml(url)}" alt="Logo" onerror="this.style.display='none'" />`;
      } else {
        preview.innerHTML = `<span class="store-avatar-placeholder">${icon('quan-ly')}</span>`;
      }
    });
    // Tối đa 2 loại hình — bấm ô thứ 3 thì tự bỏ tích, kèm báo cho biết vì sao (đúng ý ảnh mẫu).
    body.querySelectorAll('[data-btype]').forEach((cb) => cb.addEventListener('change', () => {
      const checked = body.querySelectorAll('[data-btype]:checked');
      if (checked.length > 2) { cb.checked = false; toast('Chỉ chọn được tối đa 2 loại hình', 'error'); }
    }));
    body.querySelector('#cd-save-store').addEventListener('click', async () => {
      try {
        await api.patch('/api/mgr/settings/store', {
          name: body.querySelector('#cd-sname').value.trim(),
          address: body.querySelector('#cd-saddr').value.trim(),
          phone: body.querySelector('#cd-sphone').value.trim(),
          tax_code: body.querySelector('#cd-stax').value.trim(),
          bill_footer: body.querySelector('#cd-sfooter').value.trim(),
          logo_url: body.querySelector('#cd-slogo').value.trim(),
          business_hours: body.querySelector('#cd-shours').value.trim(),
          business_types: [...body.querySelectorAll('[data-btype]:checked')].map((c) => c.dataset.btype),
          description: body.querySelector('#cd-sdesc').value.trim(),
          location_code: body.querySelector('#cd-slocc').value.trim(),
          location_name: body.querySelector('#cd-slocn').value.trim(),
          location_address: body.querySelector('#cd-sloca').value.trim(),
        });
        toast('Đã lưu thông tin quán');
      } catch (err) { toast(err?.body?.message || 'Không lưu được', 'error'); }
    });
  }

  // ── Tích điểm ────────────────────────────────────────────────────────────
  function renderLoyalty() {
    const loyalty = settings.loyalty || {};
    body.innerHTML = `
      <label style="display:flex;align-items:center;gap:8px;margin:8px 0">
        <input id="cd-lenabled" type="checkbox" style="width:auto;min-height:auto" ${loyalty.enabled ? 'checked' : ''} ${canManage ? '' : 'disabled'} />
        Bật tính năng tích điểm
      </label>
      <div class="field"><label>Mỗi X đồng được 1 điểm</label>
        <input id="cd-learn" type="number" min="1000" step="1000" value="${loyalty.earn_per_point ?? 10000}" ${canManage ? '' : 'readonly'} /></div>
      <div class="field"><label>1 điểm = X đồng khi đổi</label>
        <input id="cd-lvalue" type="number" min="100" step="100" value="${loyalty.redeem_value ?? 1000}" ${canManage ? '' : 'readonly'} /></div>
      <div class="field"><label>Số điểm tối thiểu để đổi</label>
        <input id="cd-lmin" type="number" min="1" value="${loyalty.min_redeem_points ?? 10}" ${canManage ? '' : 'readonly'} /></div>
      <label style="display:flex;align-items:center;gap:8px;margin:8px 0">
        <input id="cd-lpromo" type="checkbox" style="width:auto;min-height:auto" ${loyalty.include_promo_paid !== false ? 'checked' : ''} ${canManage ? '' : 'disabled'} />
        Tích điểm cho hoá đơn thanh toán bằng điểm thưởng
      </label>
      <label style="display:flex;align-items:center;gap:8px;margin:8px 0">
        <input id="cd-lship" type="checkbox" style="width:auto;min-height:auto" ${loyalty.exclude_shipping !== false ? 'checked' : ''} ${canManage ? '' : 'disabled'} />
        Tích điểm không bao gồm phí vận chuyển
      </label>
      ${canManage ? '<button id="cd-save-loyalty" class="btn btn-primary">Lưu cài đặt tích điểm</button>' : readonlyNote()}
    `;
    if (!canManage) return;
    body.querySelector('#cd-save-loyalty').addEventListener('click', async () => {
      try {
        await api.patch('/api/mgr/settings/loyalty', {
          enabled: body.querySelector('#cd-lenabled').checked,
          earn_per_point: Number(body.querySelector('#cd-learn').value) || 10000,
          redeem_value: Number(body.querySelector('#cd-lvalue').value) || 1000,
          min_redeem_points: Number(body.querySelector('#cd-lmin').value) || 10,
          include_promo_paid: body.querySelector('#cd-lpromo').checked,
          exclude_shipping: body.querySelector('#cd-lship').checked,
        });
        toast('Đã lưu cài đặt tích điểm');
      } catch (err) { toast(err?.body?.message || 'Không lưu được', 'error'); }
    });
  }

  // ── GĐ8-L — Cỡ chữ / hướng màn hình ─────────────────────────────────────
  // Hai phần: mặc định của QUÁN (chỉ chủ quán sửa) và đè riêng của MÁY NÀY (ai cũng chỉnh được).
  function renderDisplay() {
    const shop = settings.display || {};
    const mine = readLocalOverride() || {};
    const pickRow = (id, label, options, current) => `
      <div class="field"><label>${escapeHtml(label)}</label>
        <select id="${id}">
          ${Object.entries(options).map(([value, text]) =>
            `<option value="${escapeHtml(value)}" ${current === value ? 'selected' : ''}>${escapeHtml(text)}</option>`).join('')}
        </select></div>`;

    body.innerHTML = `
      <p class="hint">Máy này đang dùng: ${escapeHtml(FONT_LABEL[mine.font_scale ?? shop.font_scale] || 'Vừa')} ·
        ${escapeHtml(ORIENTATION_LABEL[mine.orientation ?? shop.orientation] || 'Tự động')}.</p>

      <h4>Riêng máy này</h4>
      ${pickRow('cd-my-font', 'Cỡ chữ', FONT_LABEL, mine.font_scale ?? shop.font_scale ?? 'vua')}
      ${pickRow('cd-my-orient', 'Hướng màn hình', ORIENTATION_LABEL, mine.orientation ?? shop.orientation ?? 'auto')}
      <label style="display:flex;align-items:center;gap:8px;margin:8px 0">
        <input id="cd-my-touch" type="checkbox" style="width:auto;min-height:auto"
          ${(mine.big_touch ?? shop.big_touch) ? 'checked' : ''} />
        Nút bấm to (dễ bấm cho người lớn tuổi)
      </label>
      <button id="cd-my-save" class="btn btn-primary">Áp dụng cho máy này</button>
      <button id="cd-my-reset">Dùng lại cài đặt của quán</button>

      ${canManage ? `
        <h4 style="margin-top:16px">Mặc định của cả quán</h4>
        ${pickRow('cd-shop-font', 'Cỡ chữ', FONT_LABEL, shop.font_scale || 'vua')}
        ${pickRow('cd-shop-orient', 'Hướng màn hình', ORIENTATION_LABEL, shop.orientation || 'auto')}
        <label style="display:flex;align-items:center;gap:8px;margin:8px 0">
          <input id="cd-shop-touch" type="checkbox" style="width:auto;min-height:auto" ${shop.big_touch ? 'checked' : ''} />
          Nút bấm to
        </label>
        <button id="cd-shop-save" class="btn btn-primary">Lưu mặc định của quán</button>` : ''}
    `;

    const readMine = () => ({
      font_scale: body.querySelector('#cd-my-font').value,
      orientation: body.querySelector('#cd-my-orient').value,
      big_touch: body.querySelector('#cd-my-touch').checked,
    });

    body.querySelector('#cd-my-save').addEventListener('click', () => {
      const next = readMine();
      saveLocalOverride(next);
      applyDisplay(next);
      toast('Đã áp dụng cho máy này');
      renderDisplay();
    });
    body.querySelector('#cd-my-reset').addEventListener('click', () => {
      clearLocalOverride();
      applyDisplay(settings.display || {});
      toast('Máy này quay lại dùng cài đặt của quán');
      renderDisplay();
    });

    if (!canManage) return;
    body.querySelector('#cd-shop-save').addEventListener('click', async () => {
      try {
        const res = await api.patch('/api/mgr/settings/display', {
          font_scale: body.querySelector('#cd-shop-font').value,
          orientation: body.querySelector('#cd-shop-orient').value,
          big_touch: body.querySelector('#cd-shop-touch').checked,
        });
        settings.display = res.value;
        // Máy nào đang đè riêng thì giữ nguyên cái riêng — đúng ý "cài đặt của máy thắng".
        applyDisplay({ ...res.value, ...(readLocalOverride() || {}) });
        toast('Đã lưu mặc định của quán');
        renderDisplay();
      } catch (err) { toast(err?.body?.message || 'Không lưu được', 'error'); }
    });
  }

  // ── GĐ9 — Quy trình bán hàng (/setting/sales-process) ────────────────────
  // Nhóm + câu mô tả lấy đúng chữ trong app (khảo sát 04/08/2026).
  function renderSalesProcess() {
    const SP_GROUPS = [
      { title: 'Chế độ bán hàng', items: [
        ['dine_in_mode', 'Chế độ bán ăn tại chỗ, in bếp', 'Quản lý bàn, in bếp, nguyên vật liệu'],
        ['auto_open_table', 'Tự động mở bàn', 'Tự động ghi nhận bàn đang phục vụ khi có đơn'],
      ] },
      { title: 'Hỗ trợ bán hàng', items: [
        ['barcode_scan', 'Quét mã vạch', 'Tìm / chọn nhanh sản phẩm khi bán hàng'],
        ['print_bill', 'In hoá đơn', 'Xem trước hoá đơn để in cho khách sau khi tạo đơn'],
        ['print_provisional', 'In tạm tính', 'In xác nhận hoá đơn trước khi thanh toán'],
        ['keep_debt_state', 'Lưu trạng thái ghi nợ', ''],
        ['sound_on_paid', 'Chuông báo tiền về', ''],
        ['speak_amount', 'Đọc số tiền', ''],
      ] },
      { title: 'Thông tin thêm cho đơn', items: [
        ['allow_wholesale', 'Có thể bán giá sỉ khi tạo đơn', ''],
        ['allow_discount', 'Thêm chiết khấu cho đơn', ''],
        ['allow_delivery_fee', 'Thêm phí vận chuyển cho đơn', ''],
        ['allow_promotion', 'Thêm khuyến mãi cho đơn', ''],
        ['allow_surcharge', 'Thêm phụ thu cho đơn', ''],
        ['edit_created_at', 'Xem và sửa ngày tạo cho đơn hàng', ''],
        ['ask_customer', 'Khách hàng / Hẹn giao sau', ''],
        ['pay_before_confirm', 'Thanh toán trước', 'Ghi nhận số tiền khách trả trước khi xác nhận đơn'],
      ] },
    ];
    const SP_FINISH = [
      ['giao-luu-don', 'Giao đơn / Lưu đơn',
        'Ghi nhận đơn hàng, chưa ghi doanh thu — hợp với giao sau, quán thanh toán theo bàn'],
      ['ban-nhanh', 'Bán nhanh / Thanh toán',
        'Hoàn thành đơn và ghi doanh thu ngay — hợp với bán lẻ, quán ăn nhanh'],
      ['cho-xac-nhan', 'Chờ xác nhận',
        'Ghi nhận đơn nhưng chưa ghi doanh thu — hợp khi cần kiểm kho trước'],
    ];

    const sp = settings.sales_process || {};
    const row = ([key, label, hint]) => `
      <label class="sp-row">
        <span class="sp-text">
          <b>${escapeHtml(label)}</b>
          ${hint ? `<small>${escapeHtml(hint)}</small>` : ''}
        </span>
        <input type="checkbox" data-sp="${key}" ${sp[key] ? 'checked' : ''} ${canManage ? '' : 'disabled'} />
      </label>`;

    body.innerHTML = `
      ${SP_GROUPS.map((g) => `
        <div class="sp-group">
          <div class="sp-group-title">${escapeHtml(g.title)}</div>
          ${g.items.map(row).join('')}
        </div>`).join('')}
      <div class="sp-group">
        <div class="sp-group-title">Kiểu chốt đơn</div>
        ${SP_FINISH.map(([val, label, hint]) => `
          <label class="sp-row">
            <span class="sp-text"><b>${escapeHtml(label)}</b><small>${escapeHtml(hint)}</small></span>
            <input type="radio" name="sp-finish" value="${val}"
              ${sp.finish_mode === val ? 'checked' : ''} ${canManage ? '' : 'disabled'} />
          </label>`).join('')}
      </div>
      <div class="field"><label>Mã đơn hàng</label>
        <select data-sp="order_code_style" ${canManage ? '' : 'disabled'}>
          <option value="mac-dinh" ${(sp.order_code_style || 'mac-dinh') === 'mac-dinh' ? 'selected' : ''}>Mặc định</option>
          <option value="random" ${sp.order_code_style === 'random' ? 'selected' : ''}>Ngẫu nhiên</option>
        </select></div>
      <div class="field"><label>Chuẩn bị tiền về</label>
        <select data-sp="money_announce" ${canManage ? '' : 'disabled'}>
          <option value="speak" ${(sp.money_announce || 'speak') === 'speak' ? 'selected' : ''}>Đọc số tiền</option>
          <option value="silent" ${sp.money_announce === 'silent' ? 'selected' : ''}>Im lặng</option>
        </select></div>
      ${canManage ? '<button id="cd-save-sp" class="btn btn-primary">Lưu quy trình bán hàng</button>' : readonlyNote()}
    `;

    if (!canManage) return;
    body.querySelector('#cd-save-sp').addEventListener('click', async () => {
      const patch = {};
      body.querySelectorAll('[data-sp]').forEach((c) => {
        patch[c.dataset.sp] = c.type === 'checkbox' ? c.checked : c.value;
      });
      const picked = body.querySelector('input[name="sp-finish"]:checked');
      if (picked) patch.finish_mode = picked.value;
      try {
        const res = await api.patch('/api/mgr/settings/sales_process', patch);
        settings.sales_process = res.value;
        toast('Đã lưu quy trình bán hàng');
      } catch (err) { toast(err?.body?.message || 'Không lưu được', 'error'); }
    });
  }

  // ── MỚI — Thông tin sản phẩm (/setting/product-info của app) ─────────────
  // Quyết định thẻ món ở màn Bán hàng hiện những gì. 3 công tắc gốc (show_image/show_price/
  // show_code) có tác dụng THẬT: js/views/sell.js đọc khi vẽ lưới món. Task 2 (19/08/2026) —
  // thêm đủ 4 nhóm theo ảnh mẫu; các công tắc mới là CẤU HÌNH HIỂN THỊ trường ở màn Sản phẩm
  // (chưa nối vào san-pham.js — ghi rõ trong hint để không hiểu nhầm là đã có tác dụng).
  function renderProductInfo() {
    const pi = settings.product_info || {};
    const row = ([key, label, hint]) => `
      <label class="sp-row">
        <span class="sp-text"><b>${escapeHtml(label)}</b>${hint ? `<small>${escapeHtml(hint)}</small>` : ''}</span>
        <input type="checkbox" data-pi="${key}" ${pi[key] ? 'checked' : ''} ${canManage ? '' : 'disabled'} />
      </label>`;
    const GROUPS = [
      { title: 'Thông tin chung', items: [
        ['show_image', 'Hình ảnh', 'Đăng và hiển thị hình ảnh sản phẩm — tắt thì thẻ món chỉ còn chữ, bấm nhanh hơn trên máy yếu'],
        ['show_unit', 'Đơn vị sản phẩm', 'Hiển thị đơn vị sản phẩm (lon, lốc, kg…)'],
        ['unit_convert', 'Đơn vị quy đổi', 'Ví dụ: 1 Lốc = 6 Lon, 1 Thùng = 24 Lon'],
        ['show_desc', 'Mô tả sản phẩm', 'Hiển thị mô tả giới thiệu sản phẩm'],
        ['show_suggest', 'Gợi ý sản phẩm', 'Hiển thị gợi ý sản phẩm'],
      ] },
      { title: 'Giá sản phẩm', items: [
        ['show_promo_price', 'Hiển thị giá khuyến mãi', ''],
        ['wholesale_price', 'Cài đặt giá sỉ cho từng sản phẩm', ''],
      ] },
      { title: 'Tồn kho', items: [
        ['track_stock_field', 'Theo dõi tồn kho', ''],
        ['mfg_barcode', 'Mã vạch sản xuất', ''],
        ['show_ingredients', 'Nguyên vật liệu', ''],
      ] },
      { title: 'Khác', items: [
        ['combo', 'Bán kèm', ''],
        ['classify', 'Phân loại', ''],
        ['show_on_website', 'Hiển thị sản phẩm trên Website', ''],
        ['product_tag', 'Gắn nhãn sản phẩm', ''],
      ] },
    ];
    body.innerHTML = `
      ${GROUPS.map((g) => `
        <div class="sp-group">
          <div class="sp-group-title">${escapeHtml(g.title)}</div>
          ${g.items.map(row).join('')}
        </div>`).join('')}
      <div class="sp-group">
        <div class="sp-group-title">Thẻ món ở màn Bán hàng</div>
        ${row(['show_price', 'Hiện giá bán trên thẻ món', ''])}
        ${row(['show_code', 'Hiện mã món (SKU)', 'Tiện khi nhân viên đọc mã để gọi món'])}
      </div>
      <p class="hint">3 công tắc trong nhóm "Thẻ món ở màn Bán hàng" (Hình ảnh · Hiện giá bán ·
        Hiện mã món) có tác dụng ngay ở màn Bán hàng. Các công tắc còn lại là cấu hình hiển thị
        cho màn Sản phẩm — lưu lại để dùng cho lần cập nhật kế tiếp.</p>
      ${canManage ? '<button id="cd-save-pi" class="btn btn-primary">Lưu</button>' : readonlyNote()}
    `;
    if (!canManage) return;
    body.querySelector('#cd-save-pi').addEventListener('click', async () => {
      const patch = {};
      body.querySelectorAll('[data-pi]').forEach((c) => { patch[c.dataset.pi] = c.checked; });
      try {
        const res = await api.patch('/api/mgr/settings/product_info', patch);
        settings.product_info = res.value;
        toast('Đã lưu. Mở lại màn Bán hàng để thấy thay đổi.');
      } catch (err) { toast(err?.body?.message || 'Không lưu được', 'error'); }
    });
  }

  // ── MỚI — Mẫu hoá đơn (/setting/invoice-form của app) ────────────────────
  // Có tác dụng THẬT: src/pos-manager/routes/bill.js đọc các khoá này khi dựng trang in.
  function renderInvoiceForm() {
    const inv = settings.invoice_form || {};
    const PAPER = { k80: 'Khổ K80 (giấy nhiệt 80mm)', k58: 'Khổ K58 (giấy nhiệt 58mm)', a5: 'Khổ A5' };
    const BANKS = { vcb: 'Vietcombank', tcb: 'Techcombank', acb: 'ACB', mb: 'MB Bank', vtb: 'Vietinbank', bidv: 'BIDV' };

    const chk = (key, label, hint, defaultOn = false) => `
      <label class="sp-row">
        <span class="sp-text"><b>${escapeHtml(label)}</b>${hint ? `<small>${escapeHtml(hint)}</small>` : ''}</span>
        <input type="checkbox" data-f="${key}" ${inv[key] !== undefined ? (inv[key] ? 'checked' : '') : (defaultOn ? 'checked' : '')} ${canManage ? '' : 'disabled'} />
      </label>`;

    const FONT = { nho: 'Nhỏ', vua: 'Vừa', lon: 'Lớn' };
    body.innerHTML = `
      <div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap">
        <div style="flex:1;min-width:260px">
          <div class="sp-group">
            <div class="sp-group-title">Hiển thị hoá đơn</div>
            <div class="field" style="padding:11px 14px">
              <label>Cỡ chữ</label>
              <div style="display:flex;gap:16px">
                ${Object.entries(FONT).map(([v, t]) => `
                  <label style="display:flex;align-items:center;gap:6px;font-weight:400">
                    <input type="radio" name="inv-font" data-f="font_size" value="${v}"
                      style="width:auto;min-height:auto" ${(inv.font_size || 'vua') === v ? 'checked' : ''} ${canManage ? '' : 'disabled'} />
                    ${escapeHtml(t)}
                  </label>`).join('')}
              </div>
            </div>
          </div>
          <div class="sp-group">
            <div class="sp-group-title">Thông tin chung</div>
            ${chk('show_logo', 'Logo cửa hàng', '')}
            ${chk('show_title', 'Tiêu đề', '', true)}
            <div class="field" style="padding-left:8px">
              <input data-f="title_text" type="text" placeholder="Hoá đơn bán hàng"
                value="${escapeHtml(inv.title_text || '')}" ${canManage ? '' : 'readonly'} />
            </div>
            ${chk('show_store_phone', 'Số điện thoại cửa hàng', '')}
            ${chk('show_store_address', 'Địa chỉ cửa hàng', '', true)}
          </div>
          <div class="sp-group">
            <div class="sp-group-title">Thông tin khách hàng</div>
            ${chk('cust_name', 'Tên khách hàng', '')}
            ${chk('cust_code', 'Mã khách', '')}
            ${chk('cust_phone', 'Số điện thoại', '')}
            ${chk('cust_points', 'Điểm tích lũy khách hàng', '')}
            ${chk('cust_address', 'Địa chỉ khách hàng', '')}
          </div>
          <div class="sp-group">
            <div class="sp-group-title">Thông tin đơn hàng</div>
            ${chk('order_barcode', 'Barcode mã đơn hàng', '')}
            ${chk('order_note', 'Ghi chú đơn hàng', '')}
            ${chk('order_staff', 'Nhân viên bán hàng', '')}
            ${chk('order_table', 'Thông tin bàn', '')}
            ${chk('order_service_time', 'Thời gian phục vụ', '')}
          </div>
          <div class="sp-group">
            <div class="sp-group-title">Thông tin sản phẩm</div>
            ${chk('item_discount', 'Giảm giá sản phẩm (riêng từng món)', '')}
          </div>
          <div class="sp-group">
            <div class="sp-group-title">Thông tin thanh toán</div>
            ${chk('show_vat', 'In thuế VAT', '')}
            ${chk('show_paid', 'Khách đã trả', '')}
            ${chk('show_debt', 'Tổng công nợ', '')}
          </div>
          <div class="sp-group">
            <div class="sp-group-title">Thông tin thêm</div>
            ${chk('bank_account', 'Tài khoản ngân hàng', '')}
            ${chk('show_qr', 'Mã QR chuyển khoản', 'Khách quét trả tiền ngay, khỏi đọc số tài khoản', true)}
            <div class="field" style="padding-left:8px">
              <label>Chọn ngân hàng QR</label>
              <select data-f="qr_bank" ${canManage ? '' : 'disabled'}>
                ${Object.entries(BANKS).map(([v, t]) =>
                  `<option value="${v}" ${(inv.qr_bank || 'vcb') === v ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}
              </select>
            </div>
            ${chk('show_store_name', 'Tên cửa hàng', '')}
            ${chk('show_payment_method', 'Hiển thị thanh toán tiền mặt và chuyển khoản', '')}
            <div class="field" style="padding-left:8px">
              <label>Chân hoá đơn</label>
              <textarea data-f="footer_text" rows="2" placeholder="Chữ từ cài đặt cửa hàng" ${canManage ? '' : 'readonly'}>${escapeHtml(inv.footer_text || '')}</textarea>
            </div>
            ${chk('show_thanks', 'Cảm ơn quý khách và hẹn gặp lại', '', true)}
          </div>
          <div class="sp-group">
            <div class="sp-group-title">Thiết lập in</div>
            <div class="field">
              <label>Khổ giấy</label>
              <select data-f="paper_size" ${canManage ? '' : 'disabled'}>
                ${Object.entries(PAPER).map(([v, t]) =>
                  `<option value="${v}" ${(inv.paper_size || 'k80') === v ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}
              </select>
            </div>
          </div>
          ${canManage ? '<button id="cd-save-inv" class="btn btn-primary">Lưu mẫu hoá đơn</button>' : readonlyNote()}
        </div>
        <div id="cd-inv-preview" style="flex:1;min-width:220px;max-width:320px;border:1px solid #ccc;border-radius:6px;padding:12px;font-family:monospace;font-size:12px;line-height:1.6;background:#fff;align-self:flex-start"></div>
      </div>
    `;

    function drawInvoicePreview() {
      const on = (k) => {
        const els = body.querySelectorAll(`[data-f="${k}"]`);
        if (!els.length) return inv[k];
        if (els.length > 1) { // nhóm radio dùng chung data-f (cỡ chữ, khổ giấy)
          const checked = [...els].find((e) => e.checked);
          return checked ? checked.value : inv[k];
        }
        const el = els[0];
        return el.type === 'checkbox' ? el.checked : el.value;
      };
      const storeInfo = settings.store || {};
      const store = storeInfo.name || 'Cơm A Thuý';
      const paper = on('paper_size') || 'k80';
      const fontSize = on('font_size') || 'vua';
      const scale = fontSize === 'nho' ? 0.9 : fontSize === 'lon' ? 1.15 : 1;
      const width = paper === 'k58' ? 200 : paper === 'a5' ? 300 : 240;
      const preview = body.querySelector('#cd-inv-preview');
      if (!preview) return;
      let html = `<div style="width:${width}px;margin:0 auto;font-size:${(scale * 100).toFixed(0)}%">`;
      if (on('show_logo')) html += `<div style="text-align:center;margin-bottom:4px">[LOGO]</div>`;
      if (on('show_title')) html += `<div style="text-align:center;font-weight:bold;font-size:13px">${escapeHtml(on('title_text') || 'Hoá đơn bán hàng')}</div>`;
      html += `<div style="text-align:center;font-weight:bold;font-size:14px;margin-bottom:4px">${escapeHtml(on('show_store_name') ? store : '')}</div>`;
      if (on('show_store_phone') && storeInfo.phone) html += `<div style="text-align:center;font-size:11px">ĐT: ${escapeHtml(storeInfo.phone)}</div>`;
      if (on('show_store_address') && storeInfo.address) html += `<div style="text-align:center;font-size:11px">${escapeHtml(storeInfo.address)}</div>`;
      html += `<div style="text-align:center;font-size:11px;border-bottom:1px dashed #999;padding-bottom:4px;margin-bottom:4px">`;
      if (on('order_barcode')) html += `<div>[|||||||||||]</div>`;
      if (on('cust_name')) html += `<div>KH: Nguyễn Văn A</div>`;
      if (on('cust_phone')) html += `<div>ĐT: 0901234567</div>`;
      if (on('order_staff')) html += `<div>NV: Nhân Viên</div>`;
      if (on('order_table')) html += `<div>Bàn: Bàn 5</div>`;
      html += `</div>`;
      html += `<table style="width:100%;border-collapse:collapse;font-size:11px">`;
      html += `<tr><td>Cà phê sữa</td><td style="text-align:right">×2</td><td style="text-align:right">50.000</td></tr>`;
      if (on('item_discount')) html += `<tr><td colspan="2" style="padding-left:8px;color:#888">  Giảm</td><td style="text-align:right;color:#888">-5.000</td></tr>`;
      html += `<tr><td>Bánh mì thịt</td><td style="text-align:right">×1</td><td style="text-align:right">20.000</td></tr>`;
      html += `</table>`;
      html += `<div style="border-top:1px dashed #999;margin-top:4px;padding-top:4px;font-size:11px">`;
      html += `<div style="display:flex;justify-content:space-between"><span>Tổng cộng</span><span>70.000đ</span></div>`;
      html += `<div style="display:flex;justify-content:space-between"><span>Chiết khấu</span><span>-10.000đ</span></div>`;
      html += `<div style="display:flex;justify-content:space-between;font-weight:bold"><span>Thanh toán</span><span>60.000đ</span></div>`;
      if (on('show_vat')) html += `<div style="display:flex;justify-content:space-between;color:#888"><span>VAT (8%)</span><span>4.800đ</span></div>`;
      if (on('show_paid')) html += `<div style="display:flex;justify-content:space-between"><span>Khách trả</span><span>100.000đ</span></div>`;
      if (on('show_debt')) html += `<div style="display:flex;justify-content:space-between"><span>Còn nợ</span><span>0đ</span></div>`;
      if (on('show_payment_method')) html += `<div style="color:#888;font-size:10px">Tiền mặt / Chuyển khoản</div>`;
      html += `</div>`;
      if (on('bank_account') || on('show_qr')) {
        html += `<div style="border-top:1px dashed #999;margin-top:4px;padding-top:4px;font-size:11px;text-align:center">`;
        if (on('bank_account')) html += `<div>TK: 1234567890 - ${escapeHtml(on('qr_bank') || 'VCB')}</div>`;
        if (on('show_qr')) html += `<div style="margin:4px auto;width:60px;height:60px;background:#eee;display:flex;align-items:center;justify-content:center;font-size:9px">QR</div>`;
        html += `</div>`;
      }
      const footer = on('footer_text');
      if (footer) html += `<div style="text-align:center;font-size:10px;color:#888;margin-top:4px;border-top:1px dashed #999;padding-top:4px">${escapeHtml(footer)}</div>`;
      if (on('show_thanks')) html += `<div style="text-align:center;font-size:11px;margin-top:4px">Cảm ơn quý khách và hẹn gặp lại!</div>`;
      html += `</div>`;
      preview.innerHTML = html;
    }

    drawInvoicePreview();
    body.querySelectorAll('[data-f]').forEach((el) => el.addEventListener('change', drawInvoicePreview));

    if (!canManage) return;
    body.querySelector('#cd-save-inv').addEventListener('click', async () => {
      const patch = {};
      body.querySelectorAll('[data-f]').forEach((el) => {
        const k = el.dataset.f;
        if (el.type === 'checkbox') { patch[k] = el.checked; return; }
        // BUG phát hiện 19/08/2026 khi tự bấm tay: nhóm radio "Cỡ chữ" dùng chung data-f="font_size"
        // (3 input cùng tên) — bản cũ rơi vào nhánh `patch[k] = el.value` cho MỌI phần tử kể cả
        // radio CHƯA chọn, forEach chạy tuần tự nên phần tử ĐỨNG SAU CÙNG trong DOM luôn thắng bất
        // kể người dùng chọn ô nào (ở đây luôn ra "Lớn" vì FONT liệt kê nho→vua→lon). Cùng lỗi đã
        // vá trong bindSave() dùng chung — hàm này KHÔNG gọi bindSave() nên phải vá riêng.
        if (el.type === 'radio') { if (el.checked) patch[k] = el.value; return; }
        if (el.tagName === 'TEXTAREA') { patch[k] = el.value.trim(); return; }
        patch[k] = el.value;
      });
      try {
        const res = await api.patch('/api/mgr/settings/invoice_form', patch);
        settings.invoice_form = res.value;
        toast('Đã lưu mẫu hoá đơn');
      } catch (err) { toast(err?.body?.message || 'Không lưu được', 'error'); }
    });
  }

  // ── Phụ thu ──────────────────────────────────────────────────────────────
  function renderSurcharges() {
    body.innerHTML = `
      <div id="cd-surcharge-list">
        ${surcharges.length ? surcharges.map((s) => `
          <div class="stock-row ${s.active ? '' : 'inactive'}">
            <div class="stock-main">
              <div class="stock-name">${escapeHtml(s.name)}
                ${s.auto_apply ? '<span class="badge">Tự động</span>' : ''}
                ${s.active ? '' : '<span class="badge-warn">Đã tắt</span>'}
              </div>
              <div class="stock-meta">${s.value_type === 'percent' ? `${s.value}%` : formatVND(s.value)}${s.code ? ' · Mã: ' + escapeHtml(s.code) : ''}</div>
            </div>
            ${canManage ? `<div class="stock-actions"><button data-toggle-sc="${s.id}">${s.active ? 'Tắt' : 'Bật'}</button></div>` : ''}
          </div>`).join('') : '<p>Chưa có phụ thu nào.</p>'}
      </div>
      ${canManage ? `
        <h4 style="margin-top:12px">+ Thêm phụ thu mới</h4>
        <div class="field"><label>Tên phụ thu</label><input id="sc-name" type="text" placeholder="VD: Phí phục vụ" /></div>
        <div class="field"><label>Mã (tuỳ chọn)</label><input id="sc-code" type="text" placeholder="VD: PHUCVU" /></div>
        <div class="field"><label>Giá trị</label>
          <input id="sc-value" type="number" min="0" value="0" style="width:60%;display:inline-block" />
          <select id="sc-type" style="width:38%;display:inline-block;margin-left:2%">
            <option value="amount">VNĐ</option>
            <option value="percent">%</option>
          </select>
        </div>
        <label style="display:flex;align-items:center;gap:8px;margin:8px 0">
          <input id="sc-auto" type="checkbox" style="width:auto;min-height:auto" />
          Tự động ghi vào mọi đơn hàng mới
        </label>
        <button id="sc-add" class="btn btn-primary">Thêm phụ thu</button>
      ` : readonlyNote()}
    `;

    if (!canManage) return;
    body.querySelectorAll('[data-toggle-sc]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const s = surcharges.find((x) => String(x.id) === btn.dataset.toggleSc);
        try {
          await api.patch(`/api/mgr/surcharges/${s.id}/active`, { active: !s.active });
          toast(s.active ? 'Đã tắt phụ thu' : 'Đã bật phụ thu');
          await loadSurcharges();
        } catch (err) { toast(err?.body?.message || 'Không đổi được', 'error'); }
      });
    });
    body.querySelector('#sc-add').addEventListener('click', async () => {
      const payload = {
        name: body.querySelector('#sc-name').value.trim(),
        code: body.querySelector('#sc-code').value.trim(),
        value: Number(body.querySelector('#sc-value').value) || 0,
        value_type: body.querySelector('#sc-type').value,
        auto_apply: body.querySelector('#sc-auto').checked,
      };
      if (!payload.name) { toast('Nhập tên phụ thu', 'error'); return; }
      try {
        await api.post('/api/mgr/surcharges', payload);
        toast('Đã thêm phụ thu');
        await loadSurcharges();
      } catch (err) { toast(err?.body?.message || 'Không thêm được', 'error'); }
    });
  }

  async function loadSurcharges() {
    try {
      const res = await api.get('/api/mgr/surcharges');
      surcharges = res.surcharges || [];
      renderSurcharges();
    } catch {
      body.innerHTML = '<p>Không tải được danh sách phụ thu.</p>';
    }
  }

  // ── MỚI — Quản lý tính năng (app gọi là "Chỉnh sửa ẩn/hiện thanh công cụ") ──
  // Dùng lại đúng bộ hàm của js/nav.js mà màn Trang chủ / màn Thêm đang dùng, không viết lại.
  function renderFeatures() {
    const all = allowedFeatures(staff);
    let picked = getTabRoutes(staff);
    function draw() {
      body.innerHTML = `
        <p class="hint">Thanh dưới (điện thoại) có 5 ô: <b>Trang chủ</b> và <b>Thêm</b> cố định,
          ${TAB_SLOTS} ô giữa do bạn chọn. Đang chọn ${picked.length}/${TAB_SLOTS}.</p>
        <div class="set-list">
          ${all.map((f) => `
            <label class="set-item">
              <span class="set-ico">${icon(f.route)}</span>
              <span class="set-text">${escapeHtml(f.label)}</span>
              <input type="checkbox" data-feat="${f.route}" style="width:auto;min-height:auto"
                ${picked.includes(f.route) ? 'checked' : ''} />
            </label>`).join('')}
        </div>
        <div class="tables-top-actions" style="margin-top:12px">
          <button id="cd-feat-save" class="btn btn-primary">Lưu thanh dưới</button>
          <button id="cd-feat-reset">Khôi phục mặc định</button>
        </div>
        <p class="hint">Lối tắt ở <b>Trang chủ</b> chỉnh ngay tại trang đó (nút “Chỉnh sửa”).</p>
      `;
      body.querySelectorAll('[data-feat]').forEach((cb) => {
        cb.addEventListener('change', () => {
          const r = cb.dataset.feat;
          if (cb.checked) {
            if (picked.length >= TAB_SLOTS) { cb.checked = false; toast(`Chỉ chọn được ${TAB_SLOTS} ô`, 'error'); return; }
            picked = [...picked, r];
          } else {
            picked = picked.filter((x) => x !== r);
          }
          draw();
        });
      });
      body.querySelector('#cd-feat-save').addEventListener('click', () => {
        setTabRoutes(picked);
        toast('Đã lưu thanh dưới cho máy này');
      });
      body.querySelector('#cd-feat-reset').addEventListener('click', () => {
        resetNavPrefs();
        picked = getTabRoutes(staff);
        draw();
        toast('Đã khôi phục mặc định');
      });
    }
    draw();
  }

  // ── MỚI — Đồng bộ dữ liệu ────────────────────────────────────────────────
  // Việc hay phải làm nhất sau mỗi lần cập nhật: máy nhân viên vẫn chạy bản cũ vì service worker
  // còn giữ bộ nhớ tạm (bug-063). Nút dưới đây xoá sạch rồi tải lại giúp chủ quán.
  function renderSync() {
    body.innerHTML = `
      <p class="hint">Ứng dụng lưu sẵn giao diện trong máy để mở được cả khi mạng chập chờn.
        Nếu máy này vẫn hiện bản cũ sau khi cửa hàng cập nhật, bấm nút dưới đây.</p>
      <div class="set-list">
        <div class="set-item"><span class="set-text">Bộ nhớ tạm của máy này<small id="cd-sync-cache">Đang kiểm tra…</small></span></div>
        <div class="set-item"><span class="set-text">Thẻ đơn đang mở ở màn Bán hàng<small id="cd-sync-carts">—</small></span></div>
      </div>
      <button id="cd-sync-now" class="btn btn-primary" style="margin-top:12px">Xoá bộ nhớ tạm &amp; tải lại</button>
    `;
    const cacheEl = body.querySelector('#cd-sync-cache');
    const cartsEl = body.querySelector('#cd-sync-carts');
    try {
      const raw = JSON.parse(localStorage.getItem('posmgr_carts_v1') || 'null');
      cartsEl.textContent = raw?.carts?.length ? `${raw.carts.length} đơn đang mở dở` : 'Không có đơn dở nào';
    } catch { cartsEl.textContent = 'Không có đơn dở nào'; }

    if (typeof caches !== 'undefined' && caches.keys) {
      caches.keys().then((keys) => {
        cacheEl.textContent = keys.length ? keys.join(', ') : 'Chưa lưu gì';
      }).catch(() => { cacheEl.textContent = 'Không đọc được'; });
    } else {
      cacheEl.textContent = 'Trình duyệt này không lưu bộ nhớ tạm';
    }

    body.querySelector('#cd-sync-now').addEventListener('click', async () => {
      try {
        if (typeof caches !== 'undefined' && caches.keys) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
        if (navigator.serviceWorker?.getRegistrations) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
        }
      } catch { /* xoá được tới đâu hay tới đó, vẫn tải lại */ }
      location.reload();
    });
  }

  // ── MỚI — Nhập dữ liệu (ảnh CD-09/10, /setting/sync-data của app) ────────
  // Task 2 (19/08/2026) — app gốc nhận file xuất thẳng từ Sapo/Misa/KiotViet (3 định dạng riêng
  // của họ, dự án không có mẫu thật để soi cột) hoặc mẫu Excel Sổ Bán Hàng. Vì không chắc đúng cột
  // của 3 nguồn kia (rủi ro NHẬP SAI DỮ LIỆU THẬT vào menu quán), chỉ làm THẬT một luồng: tải mẫu
  // CSV chuẩn (Tên, Giá, Danh mục, Mã SKU) → khách tự đổ dữ liệu từ Sapo/Misa/KiotViet của họ sang
  // đúng mẫu này → nhập vào đây. 3 thẻ nguồn kia vẫn hiện đủ như ảnh, bấm vào dẫn thẳng tới đúng
  // bước tải mẫu — không giả vờ đọc được file gốc của họ.
  function renderImportData() {
    let step = 1;
    let rows = [];
    let result = null;

    function parseCsv(text) {
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (!lines.length) return [];
      const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
      const idxName = header.findIndex((h) => h.includes('tên') || h.includes('ten') || h === 'name');
      const idxPrice = header.findIndex((h) => h.includes('giá') || h.includes('gia') || h === 'price');
      const idxCat = header.findIndex((h) => h.includes('danh mục') || h.includes('danh muc') || h === 'category');
      const idxSku = header.findIndex((h) => h.includes('sku') || h.includes('mã') || h.includes('ma '));
      return lines.slice(1).map((line) => {
        const cols = line.split(',').map((c) => c.trim());
        return {
          name: idxName >= 0 ? cols[idxName] || '' : '',
          price: idxPrice >= 0 ? Number(String(cols[idxPrice] || '0').replace(/[^\d.-]/g, '')) || 0 : 0,
          category: idxCat >= 0 ? cols[idxCat] || '' : '',
          sku: idxSku >= 0 ? cols[idxSku] || '' : '',
        };
      }).filter((r) => r.name);
    }

    function draw() {
      const steps = ['Chọn nguồn', 'Tải file', 'Kết quả'];
      const stepsHtml = `<div class="sp-row" style="justify-content:flex-start;gap:24px;background:none;border:none;padding:0 0 14px">
        ${steps.map((s, i) => `<span style="font-size:13px;font-weight:${i + 1 === step ? 700 : 500};color:${i + 1 === step ? 'var(--primary)' : 'var(--text-3)'}">${i + 1}&nbsp;${escapeHtml(s)}</span>`).join('<span style="color:var(--text-3)">──</span>')}
      </div>`;

      let panel = '';
      if (step === 1) {
        const SOURCES = [['Sapo', false], ['Misa', false], ['KiotViet', false], ['Sổ Bán Hàng / Excel', true]];
        panel = `
          <p class="hint">Chuyển dữ liệu sản phẩm vào cửa hàng từ Sapo, Misa, KiotViet — hoặc mẫu Excel/CSV chuẩn.</p>
          <div class="set-list">
            ${SOURCES.map(([label, ready]) => `
              <button type="button" class="set-item" data-src="${escapeHtml(label)}" style="text-align:left;cursor:pointer;background:none;border:1px solid var(--line)">
                <span class="set-text"><b>${escapeHtml(label)}</b>
                  <small>${ready ? 'Tải mẫu CSV rồi nhập trực tiếp' : 'Xuất dữ liệu ra Excel rồi dán vào đúng mẫu CSV (Tên, Giá, Danh mục, Mã SKU)'}</small>
                </span>
                <span class="set-arrow">›</span>
              </button>`).join('')}
          </div>`;
      } else if (step === 2) {
        const csvTemplate = 'Tên,Giá,Danh mục,Mã SKU\nCơm sườn nướng,45000,Cơm phần,\nTrà đá,5000,Đồ uống,\n';
        const csvUrl = `data:text/csv;charset=utf-8,${encodeURIComponent('﻿' + csvTemplate)}`;
        panel = `
          <p class="hint">Mẫu cột: <b>Tên, Giá, Danh mục, Mã SKU</b> (Mã SKU có thể để trống). Dòng đầu tiên là tiêu đề cột.</p>
          <a class="btn" href="${csvUrl}" download="mau-nhap-san-pham.csv">Tải file mẫu CSV</a>
          <div class="field" style="margin-top:12px"><label>Chọn file CSV đã điền</label>
            <input id="cd-imp-file" type="file" accept=".csv,text/csv" /></div>
          <div id="cd-imp-preview"></div>
          <div class="tables-top-actions" style="margin-top:12px">
            <button id="cd-imp-back">‹ Quay lại</button>
            <button id="cd-imp-next" class="btn btn-primary" disabled>Tiếp tục</button>
          </div>`;
      } else {
        panel = result ? `
          <div class="sp-group">
            <div class="sp-group-title">Kết quả nhập dữ liệu</div>
            <div class="sp-row"><span class="sp-text"><b>Tổng số dòng đọc được</b></span><span>${rows.length}</span></div>
            <div class="sp-row"><span class="sp-text"><b>Đã thêm thành công</b></span><span style="color:var(--money-in)">${result.ok}</span></div>
            <div class="sp-row"><span class="sp-text"><b>Bị bỏ qua / lỗi</b></span><span style="color:var(--money-out)">${result.fail}</span></div>
          </div>
          ${result.errors.length ? `<div class="hint"><b>Chi tiết lỗi:</b><br>${result.errors.slice(0, 20).map((e) => escapeHtml(e)).join('<br>')}</div>` : ''}
          <div class="tables-top-actions" style="margin-top:12px">
            <a class="btn btn-primary" href="#/san-pham">Xem danh sách sản phẩm</a>
            <button id="cd-imp-again">Nhập file khác</button>
          </div>` : '<p class="hint">Đang nhập dữ liệu…</p>';
      }

      body.innerHTML = stepsHtml + panel;

      if (step === 1) {
        body.querySelectorAll('[data-src]').forEach((btn) => btn.addEventListener('click', () => { step = 2; draw(); }));
      } else if (step === 2) {
        const fileInput = body.querySelector('#cd-imp-file');
        const nextBtn = body.querySelector('#cd-imp-next');
        const previewEl = body.querySelector('#cd-imp-preview');
        fileInput.addEventListener('change', async () => {
          const file = fileInput.files?.[0];
          if (!file) return;
          const text = await file.text();
          rows = parseCsv(text);
          if (!rows.length) {
            previewEl.innerHTML = '<p class="hint" style="color:var(--money-out)">Không đọc được dòng nào hợp lệ — kiểm tra lại cột "Tên".</p>';
            nextBtn.disabled = true;
            return;
          }
          previewEl.innerHTML = `
            <p class="hint">Đọc được ${rows.length} sản phẩm. Xem trước 5 dòng đầu:</p>
            <div class="table-scroll"><table class="hd-table"><thead><tr><th>Tên</th><th>Giá</th><th>Danh mục</th><th>SKU</th></tr></thead>
              <tbody>${rows.slice(0, 5).map((r) => `<tr><td>${escapeHtml(r.name)}</td><td>${formatVND(r.price)}</td><td>${escapeHtml(r.category)}</td><td>${escapeHtml(r.sku)}</td></tr>`).join('')}</tbody>
            </table></div>`;
          nextBtn.disabled = false;
        });
        body.querySelector('#cd-imp-back').addEventListener('click', () => { step = 1; draw(); });
        nextBtn.addEventListener('click', async () => {
          step = 3; result = null; draw();
          const errors = [];
          let ok = 0;
          for (const r of rows) {
            try {
              await api.post('/api/mgr/products', { name: r.name, price: r.price, category: r.category || undefined, code: r.sku || undefined });
              ok++;
            } catch (err) {
              errors.push(`${r.name}: ${err?.body?.message || 'Không thêm được'}`);
            }
          }
          result = { ok, fail: errors.length, errors };
          draw();
        });
      } else if (result) {
        const again = body.querySelector('#cd-imp-again');
        if (again) again.addEventListener('click', () => { step = 1; rows = []; result = null; draw(); });
      }
    }
    draw();
  }

  function readonlyNote() {
    return '<p class="hint">Chỉ chủ quán mới chỉnh sửa được cài đặt này.</p>';
  }
}
