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
import { allowedFeatures, getTabRoutes, setTabRoutes, TAB_SLOTS, resetNavPrefs } from '../nav.js';

// Mục lục — bám theo 4 nhóm của app.sobanhang.com/setting (khảo sát: 18 mục con).
// Những mục của app KHÔNG áp dụng cho quán cơm (Website cửa hàng, Sàn TMĐT, Hoá đơn điện tử,
// Kết nối FinanBook, Xoá cửa hàng) thì bỏ hẳn thay vì làm nút bấm không chạy.
export const SETTING_MENU = [
  { group: 'Cửa hàng', items: [
    { key: 'cua-hang',  ico: 'quan-ly',   label: 'Thông tin cửa hàng', hint: 'Tên, địa chỉ, điện thoại, mã số thuế' },
    { key: 'tinh-nang', ico: 'chinh-sua', label: 'Quản lý tính năng',  hint: 'Chọn 3 ô giữa của thanh dưới, lối tắt trang chủ' },
    { key: 'dong-bo',   ico: 'ma-qr',     label: 'Đồng bộ dữ liệu',    hint: 'Tải lại bản mới nhất, xoá bộ nhớ tạm của máy này' },
  ] },
  { group: 'Tối ưu bán hàng', items: [
    { key: 'quy-trinh',    ico: 'ban-hang',    label: 'Quy trình bán hàng',   hint: '16 công tắc + kiểu chốt đơn' },
    { key: 'san-pham',     ico: 'san-pham',    label: 'Thông tin sản phẩm',   hint: 'Thẻ món ở màn Bán hàng hiện những gì' },
    { key: 'mau-hoa-don',  ico: 'in',          label: 'Mẫu hoá đơn',          hint: 'Khổ giấy, mã QR chuyển khoản' },
    { key: 'tich-diem',    ico: 'tich-diem',   label: 'Tích điểm khách hàng', hint: 'Bật/tắt, cách quy đổi điểm' },
    { key: 'phu-thu',      ico: 'thu-chi',     label: 'Quản lý phụ thu',      hint: 'Phí phục vụ, phí đóng gói…' },
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
  ] },
];

// CHỈ các mục có màn con thật mới vào TITLES. Mục có `hash` là lối tắt sang màn khác — nếu để
// lẫn vào đây thì mở #/cai-dat?m=lk-danh-muc sẽ ra một trang trắng có tiêu đề mà không có nội dung.
const TITLES = Object.fromEntries(
  SETTING_MENU.flatMap((g) => g.items).filter((it) => !it.hash).map((it) => [it.key, it.label])
);

export async function render(container, { staff, params } = {}) {
  const perms = staff?.perms || {};
  const canManage = !!perms.settings_manage;
  const sub = params?.m || '';

  // ── Trang mục lục ────────────────────────────────────────────────────────
  if (!sub || !TITLES[sub]) {
    // Task 2 mục 6 (2026-08-08) — chủ quán: "menu cài đặt dòng thì ngắn, màn hình thừa nhiều chỗ
    // quá". Trên máy tính xếp các nhóm thành 3 cột (CSS .set-cols) thay vì một cột dọc dài lê thê;
    // điện thoại vẫn 1 cột như cũ.
    container.innerHTML = `
      <h2>Cài đặt</h2>
      <div class="set-cols">
        ${SETTING_MENU.map((g) => `
          <div class="set-group">
            <div class="set-group-title">${escapeHtml(g.group)}</div>
            <div class="set-list">
              ${g.items.map((it) => `
                <a class="set-item" href="${it.hash || `#/cai-dat?m=${it.key}`}">
                  <span class="set-ico">${icon(it.ico)}</span>
                  <span class="set-text">${escapeHtml(it.label)}<small>${escapeHtml(it.hint)}</small></span>
                  <span class="set-arrow">›</span>
                </a>`).join('')}
            </div>
          </div>`).join('')}
      </div>
      ${canManage ? '' : '<p class="hint">Bạn chỉ xem được các cài đặt này. Chỉ chủ quán mới chỉnh sửa được.</p>'}
    `;
    return;
  }

  // ── Màn con ──────────────────────────────────────────────────────────────
  container.innerHTML = `
    <a class="set-back" href="#/cai-dat">${icon('quay-lai')}Cài đặt</a>
    <h2>${escapeHtml(TITLES[sub])}</h2>
    <div id="cd-body"><p>Đang tải…</p></div>
  `;
  const body = container.querySelector('#cd-body');

  // Vài màn con không cần hỏi máy chủ — dựng ngay cho nhanh.
  if (sub === 'tinh-nang') { renderFeatures(); return; }
  if (sub === 'dong-bo') { renderSync(); return; }

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
    body.innerHTML = `
      <div class="field"><label>Tên cửa hàng</label>
        <input id="cd-sname" type="text" value="${escapeHtml(store.name || '')}" ${canManage ? '' : 'readonly'} /></div>
      <div class="field"><label>Địa chỉ</label>
        <input id="cd-saddr" type="text" value="${escapeHtml(store.address || '')}" ${canManage ? '' : 'readonly'} /></div>
      <div class="field"><label>Số điện thoại</label>
        <input id="cd-sphone" type="tel" value="${escapeHtml(store.phone || '')}" ${canManage ? '' : 'readonly'} /></div>
      <div class="field"><label>Mã số thuế (tuỳ chọn)</label>
        <input id="cd-stax" type="text" value="${escapeHtml(store.tax_code || '')}" ${canManage ? '' : 'readonly'} /></div>
      <div class="field"><label>Chân hoá đơn (tuỳ chọn)</label>
        <input id="cd-sfooter" type="text" value="${escapeHtml(store.bill_footer || '')}" placeholder="VD: Cảm ơn quý khách!" ${canManage ? '' : 'readonly'} /></div>
      ${canManage ? '<button id="cd-save-store" class="btn btn-primary">Lưu thông tin quán</button>' : readonlyNote()}
    `;
    if (!canManage) return;
    body.querySelector('#cd-save-store').addEventListener('click', async () => {
      try {
        await api.patch('/api/mgr/settings/store', {
          name: body.querySelector('#cd-sname').value.trim(),
          address: body.querySelector('#cd-saddr').value.trim(),
          phone: body.querySelector('#cd-sphone').value.trim(),
          tax_code: body.querySelector('#cd-stax').value.trim(),
          bill_footer: body.querySelector('#cd-sfooter').value.trim(),
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
      ${canManage ? '<button id="cd-save-sp" class="btn btn-primary">Lưu quy trình bán hàng</button>' : readonlyNote()}
    `;

    if (!canManage) return;
    body.querySelector('#cd-save-sp').addEventListener('click', async () => {
      const patch = {};
      body.querySelectorAll('[data-sp]').forEach((c) => { patch[c.dataset.sp] = c.checked; });
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
  // Quyết định thẻ món ở màn Bán hàng hiện những gì. Có tác dụng THẬT: js/views/sell.js đọc
  // 3 công tắc này khi vẽ lưới món.
  function renderProductInfo() {
    const pi = settings.product_info || {};
    const rows = [
      ['show_image', 'Hiện ảnh món', 'Tắt đi thì thẻ món chỉ còn chữ — bấm nhanh hơn trên máy yếu'],
      ['show_price', 'Hiện giá bán trên thẻ món', ''],
      ['show_code', 'Hiện mã món (SKU)', 'Tiện khi nhân viên đọc mã để gọi món'],
    ];
    body.innerHTML = `
      <div class="sp-group">
        <div class="sp-group-title">Thẻ món ở màn Bán hàng</div>
        ${rows.map(([key, label, hint]) => `
          <label class="sp-row">
            <span class="sp-text"><b>${escapeHtml(label)}</b>${hint ? `<small>${escapeHtml(hint)}</small>` : ''}</span>
            <input type="checkbox" data-pi="${key}" ${pi[key] ? 'checked' : ''} ${canManage ? '' : 'disabled'} />
          </label>`).join('')}
      </div>
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
  // Có tác dụng THẬT: src/pos-manager/routes/bill.js đọc 2 khoá này khi dựng trang in.
  function renderInvoiceForm() {
    const inv = settings.invoice_form || {};
    const PAPER = { k80: 'Khổ K80 (giấy nhiệt 80mm)', k58: 'Khổ K58 (giấy nhiệt 58mm)', a5: 'Khổ A5' };
    body.innerHTML = `
      <div class="field"><label>Khổ giấy in</label>
        <select id="cd-paper" ${canManage ? '' : 'disabled'}>
          ${Object.entries(PAPER).map(([v, t]) =>
            `<option value="${v}" ${(inv.paper_size || 'k80') === v ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}
        </select></div>
      <div class="sp-group">
        <label class="sp-row">
          <span class="sp-text"><b>In mã QR chuyển khoản trên hoá đơn</b>
            <small>Khách quét trả tiền ngay, khỏi đọc số tài khoản</small></span>
          <input type="checkbox" id="cd-inv-qr" ${inv.show_qr !== false ? 'checked' : ''} ${canManage ? '' : 'disabled'} />
        </label>
      </div>
      <p class="hint">Dòng chữ cuối hoá đơn đặt ở mục <b>Thông tin cửa hàng</b> (ô “Chân hoá đơn”).</p>
      ${canManage ? '<button id="cd-save-inv" class="btn btn-primary">Lưu mẫu hoá đơn</button>' : readonlyNote()}
    `;
    if (!canManage) return;
    body.querySelector('#cd-save-inv').addEventListener('click', async () => {
      try {
        const res = await api.patch('/api/mgr/settings/invoice_form', {
          paper_size: body.querySelector('#cd-paper').value,
          show_qr: body.querySelector('#cd-inv-qr').checked,
        });
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

  function readonlyNote() {
    return '<p class="hint">Chỉ chủ quán mới chỉnh sửa được cài đặt này.</p>';
  }
}
