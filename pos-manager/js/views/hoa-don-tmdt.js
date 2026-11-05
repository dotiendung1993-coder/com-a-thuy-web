// Việc 1 (18/08/2026) — Kênh bán hàng > Hoá đơn TMĐT (ảnh mẫu Website v2\Kênh bán hàng\*, 7 ảnh).
//
// GIỚI HẠN CHỦ Ý (đã hỏi & được chủ quán xác nhận trước khi làm): màn này xuất hoá đơn điện tử
// CHO ĐƠN BÁN QUA SÀN TMĐT — quán chưa liên kết sàn nào (xem san-tmdt.js) nên KHÔNG có đơn thật
// nào để hiện, mọi số liệu/danh sách đều rỗng thật (không phải lỗi tải dữ liệu). Phần DUY NHẤT có
// dữ liệu thật là "Cài đặt tự động xuất hoá đơn" — lưu qua khoá settings `ecom_invoice` (settings-
// service.js, khác khoá `e_invoice` dùng cho Cài đặt > Hoá đơn điện tử chung của quán), để sẵn quy
// tắc khi quán bắt đầu bán qua sàn thật thì không phải cấu hình lại từ đầu.
import { api } from '../api.js';
import { escapeHtml, toast, openModal } from '../ui.js';
import { icon } from '../icons.js';
import { createRangePicker, rangePickerHtml } from '../date-range-picker.js';

const TABS = [
  ['can-bo-sung', 'Cần bổ sung'],
  ['san-sang', 'Sẵn sàng'],
  ['dang-cho', 'Đang chờ'],
  ['da-phat-hanh', 'Đã phát hành'],
  ['dieu-chinh', 'Hoá đơn điều chỉnh'],
  ['loi', 'Lỗi phát hành'],
];
const LS_COLS = 'posmgr.hoadontmdt.cols.v1';
const COLS = [
  ['giao-xong', 'Giao xong'],
  ['khach-tra', 'Khách trả'],
  ['tinh-trang', 'Tình trạng'],
  ['so-hoa-don', 'Số hoá đơn'],
];
const TRIGGER_OPTS = [
  ['giao-thanh-cong', 'Tự xuất khi sàn báo giao thành công', 'Hầu hết chọn cách này'],
  ['chuan-bi-xuat', 'Chuẩn bị sẵn, tôi bấm xuất', 'Hệ thống gom đơn đủ điều kiện, bạn duyệt theo lô'],
  ['tu-lam', 'Tôi tự làm từng đơn', 'Không tự động gì cả'],
];
const ISSUE_WHEN_OPTS = [
  ['xuat-kho', 'Đơn hàng xuất kho', 'Ngay khi sàn chuyển sang trạng thái đang giao'],
  ['giao-thanh-cong', 'Giao hàng thành công', 'Khuyến nghị — đúng thời điểm chuyển giao quyền sở hữu'],
  ['cho-them-ngay', 'Chờ thêm vài ngày sau khi giao', 'Cho khách kịp xin hoá đơn, nhưng có thể bị coi là lập hoá đơn chậm'],
];
const NO_REQUEST_OPTS = [
  ['ban-cho-nguoi-tieu-dung', 'Ghi "Bán cho người tiêu dùng"', 'Đúng câu chữ Nghị định 254/2026 quy định'],
  ['xu-ly-thu-cong', 'Chờ tôi xử lý thủ công', 'Đơn nằm ở tab Chưa xuất cho tới khi bạn bấm'],
];

function readHiddenCols() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_COLS) || '[]');
    return new Set(Array.isArray(raw) ? raw.filter((x) => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.report) {
    container.innerHTML = '<p>Bạn không có quyền xem Kênh bán hàng.</p>';
    return;
  }
  const canManage = !!perms.settings_manage;

  const state = { q: '', from: '', to: '', tab: TABS[0][0] };
  let hiddenCols = readHiddenCols();

  const pickerIds = {
    btn: 'hdt-date-btn', label: 'hdt-date-label', pop: 'hdt-date-pop',
    calLeft: 'hdt-cal-left', calRight: 'hdt-cal-right',
    quick: 'hdt-quick', yearBtn: 'hdt-year-btn', yearPop: 'hdt-year-pop',
    sel: 'hdt-sel', clear: 'hdt-clear', apply: 'hdt-apply',
  };

  container.innerHTML = `
    <div class="page-head">
      <h2>Hoá đơn TMĐT <button type="button" class="stm-help-btn" id="hdt-help" aria-label="Hướng dẫn">?</button></h2>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="button" class="btn" id="hdt-sync">${icon('tai-xuong')} Đồng bộ</button>
        ${canManage ? `<button type="button" class="btn btn-primary" id="hdt-auto-settings">${icon('cai-dat')} Cài đặt tự động</button>` : ''}
      </div>
    </div>

    <div class="sbh-kpi" id="hdt-kpi"></div>

    <div class="hd-tools">
      <label class="hd-search">
        <span class="inline-ico">${icon('tim-kiem')}</span>
        <input id="hdt-q" type="search" placeholder="Tìm mã đơn, tên khách" aria-label="Tìm hoá đơn TMĐT" />
      </label>
      <div class="ord-date-wrap hd-range" id="hdt-range">
        ${rangePickerHtml(pickerIds, 'Ngày giao hàng', 'Chọn ngày giao hàng')}
      </div>
      <select id="hdt-gian-hang" disabled title="Quán chưa liên kết gian hàng nào">
        <option>Tất cả gian hàng</option>
      </select>
      <div class="hd-split" id="hdt-col-wrap">
        <button type="button" class="btn btn-ghost hd-cog" id="hdt-cog" aria-haspopup="dialog" aria-expanded="false"
          aria-label="Hiển thị cột">${icon('cai-dat')}</button>
        <div class="hd-colpop hidden" id="hdt-colpop" role="dialog" aria-label="Hiển thị cột">
          <div class="hd-colpop-head"><b>Hiển thị cột</b></div>
          <div class="hd-colpop-list">
            ${COLS.map(([key, label]) => `
              <label class="hd-colrow">
                <span>${escapeHtml(label)}</span>
                <input type="checkbox" data-col="${key}" ${hiddenCols.has(key) ? '' : 'checked'} />
              </label>`).join('')}
          </div>
        </div>
      </div>
    </div>

    <div class="tab-row hd-subtabs" id="hdt-subtabs" role="tablist">
      ${TABS.map(([v, label], i) => `
        <button class="tab${i === 0 ? ' active' : ''}" type="button" role="tab" data-tab="${v}">
          ${escapeHtml(label)} <span class="badge-default">0</span>
        </button>`).join('')}
    </div>

    <div class="hd-empty">
      ${icon('hoa-don-tmdt')}
      <p><b>Chưa có đơn hàng sàn nào</b></p>
      <p class="hint">Kết nối gian hàng để đơn tự đổ về đây — vào <a href="#/san-tmdt">Sàn TMĐT</a> để liên kết.</p>
    </div>
  `;

  // ── KPI (luôn 0 vì chưa có gian hàng nào kết nối — không phải lỗi tải) ──────────────────────
  container.querySelector('#hdt-kpi').innerHTML = [
    ['Sẵn sàng xuất', 0, 'kpi-c3'],
    ['Cần bổ sung', 0, 'kpi-c4'],
    ['Sắp hết hạn', 0, 'kpi-c4'],
    ['Đã phát hành tháng này', 0, 'kpi-c1'],
  ].map(([label, value, cls]) => `
    <div class="kpi-card ${cls}">
      <div class="kpi-label">${label}</div>
      <div class="kpi-val">${value}</div>
    </div>`).join('');

  // ── Tìm kiếm + khoảng ngày (giữ trạng thái thật dù danh sách luôn rỗng — sẵn sàng khi có dữ liệu) ──
  const qInput = container.querySelector('#hdt-q');
  qInput.addEventListener('input', () => { state.q = qInput.value.trim(); });
  createRangePicker(container.querySelector('#hdt-range'), pickerIds, {
    emptyLabel: 'Ngày giao hàng',
    getFrom: () => state.from,
    getTo: () => state.to,
    set: (from, to) => { state.from = from; state.to = to; },
    onCommit: () => {},
    onWarn: (m) => toast(m, 'error'),
  });

  // ── Tab ───────────────────────────────────────────────────────────────────────────────────
  container.querySelectorAll('#hdt-subtabs .tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.tab = btn.dataset.tab;
      container.querySelectorAll('#hdt-subtabs .tab').forEach((b) => b.classList.toggle('active', b === btn));
    });
  });

  // ── Hiển thị cột ──────────────────────────────────────────────────────────────────────────
  const colPop = container.querySelector('#hdt-colpop');
  function closeColPop() {
    colPop.classList.add('hidden');
    container.querySelector('#hdt-cog')?.setAttribute('aria-expanded', 'false');
  }
  document.addEventListener('click', closeColPop);
  container.querySelector('#hdt-col-wrap').addEventListener('click', (e) => e.stopPropagation());
  container.querySelector('#hdt-cog').addEventListener('click', () => {
    const show = colPop.classList.contains('hidden');
    closeColPop();
    colPop.classList.toggle('hidden', !show);
    container.querySelector('#hdt-cog').setAttribute('aria-expanded', show ? 'true' : 'false');
  });
  colPop.querySelectorAll('[data-col]').forEach((cb) => {
    cb.addEventListener('change', () => {
      if (cb.checked) hiddenCols.delete(cb.dataset.col); else hiddenCols.add(cb.dataset.col);
      try { localStorage.setItem(LS_COLS, JSON.stringify([...hiddenCols])); } catch { /* riêng tư */ }
    });
  });

  // ── Đồng bộ ───────────────────────────────────────────────────────────────────────────────
  container.querySelector('#hdt-sync').addEventListener('click', () => {
    toast('Chưa có gian hàng nào được kết nối để đồng bộ', 'error');
  });

  // ── Hướng dẫn ─────────────────────────────────────────────────────────────────────────────
  container.querySelector('#hdt-help').addEventListener('click', () => openHelp());

  // ── Cài đặt tự động ───────────────────────────────────────────────────────────────────────
  if (canManage) {
    container.querySelector('#hdt-auto-settings').addEventListener('click', () => openAutoSettings());
  }
}

function openHelp() {
  const modal = openModal(`
    <h3>Hướng dẫn: Hoá đơn TMĐT</h3>
    <p><b>Màn hình này để làm gì</b></p>
    <p class="hint">Xuất hoá đơn điện tử cho các đơn bạn đã bán qua sàn, và cho biết đơn nào đang
      thiếu gì nên chưa xuất được. Hệ thống không tự ý phát hành hoá đơn thay bạn. Mặc định việc tự
      động là TẮT — bạn tự bấm xuất, cho tới khi chính bạn bật Cài đặt tự động.</p>

    <p><b>Một đơn đi qua những bước nào</b></p>
    <ol class="hint">
      <li><b>Đơn về</b> — Đơn từ gian hàng đã kết nối chạy về màn Đơn hàng TMĐT.</li>
      <li><b>Giao xong</b> — Khi sàn ghi nhận đã giao, hệ thống đóng mốc ngày giao xong và đưa đơn sang màn này.</li>
      <li><b>Kiểm tra</b> — Hệ thống soát đủ điều kiện lập hoá đơn hay chưa (danh sách dưới đây). Thiếu bất kỳ điều nào là Cần bổ sung.</li>
      <li><b>Chờ (nếu bạn đặt chờ)</b> — Mặc định là xuất được ngay khi giao xong. Nếu bạn chọn chờ thêm vài ngày sau giao để tránh khách đổi trả, đơn nằm ở Đang chờ tới đúng ngày đó.</li>
      <li><b>Xuất</b> — Đủ điều kiện thì đơn sang Sẵn sàng. Bạn bấm xuất từng đơn hoặc chọn nhiều đơn xuất một lượt. Ngay sau khi xuất còn một khoảng ngắn để bạn hoàn tác nếu bấm nhầm.</li>
    </ol>

    <p><b>Sáu điều kiện để xuất được</b></p>
    <ul class="hint">
      <li><b>Hàng đã ghép SKU</b> — Mọi dòng hàng trong đơn phải nối được với sản phẩm trong kho.</li>
      <li><b>Có đơn vị tính</b> — Hoá đơn bắt buộc ghi đơn vị tính (cái, hộp, kg).</li>
      <li><b>Có nhóm thuế</b> — Mỗi mặt hàng phải có thuế suất.</li>
      <li><b>Tiền khớp nhau</b> — Tổng các dòng hàng phải bằng số khách thực trả. Lệch từ 1 đồng là bị giữ lại.</li>
      <li><b>Đủ thông tin người mua</b> — Chỉ áp dụng khi khách có gửi mã số thuế để lấy hoá đơn công ty.</li>
      <li><b>Đơn không đang tranh chấp</b> — Đơn đang hoàn tiền, đang trả hàng hoặc đã huỷ thì hệ thống giữ lại, chờ bên sàn xử lý xong.</li>
    </ul>
    <p class="hint"><b>Hạn lấy dữ liệu từ sàn</b> — phần dễ mất tiền nhất: Shopee khoảng 21 ngày,
      Lazada và TikTok Shop khoảng 30 ngày tính từ ngày giao xong. Quá hạn, sàn không trả dữ liệu
      nữa. Quá hạn không có nghĩa là thôi không phải xuất — nghĩa vụ xuất hoá đơn vẫn còn, chỉ là
      bạn phải tự nhập tay thông tin đơn. Nhóm Sắp hết hạn nên được xử lý trước tất cả.</p>

    <p><b>Đọc hiểu các nhóm</b></p>
    <ul class="hint">
      <li><b>Cần bổ sung</b> — Thiếu dữ liệu nên chưa xuất được.</li>
      <li><b>Đang chờ</b> — Đã đủ điều kiện nhưng còn trong khoảng chờ bạn đặt ra.</li>
      <li><b>Sẵn sàng</b> — Đủ hết, bấm là xuất.</li>
      <li><b>Đã phát hành</b> — Đã có số hoá đơn. Xem được số, tải bản PDF và XML, gửi cho người mua.</li>
      <li><b>Hoá đơn điều chỉnh</b> — Hoá đơn đã xuất rồi nhưng đơn có thay đổi. Phải lập hoá đơn điều chỉnh, không sửa đè lên hoá đơn cũ.</li>
      <li><b>Lỗi</b> — Gửi lên cơ quan thuế không thành công. Mở chi tiết để xem lý do và gửi lại.</li>
    </ul>

    <p><b>Gặp vướng thì làm gì</b></p>
    <ul class="hint">
      <li><b>Cộng dòng hàng lệch so với số khách trả</b> — Bấm Phân bổ chênh lệch.</li>
      <li><b>Đơn giao xong mà không thấy sang màn này</b> — Chờ hết một lượt lấy dữ liệu rồi bấm Đồng bộ. Nếu vẫn không có, kiểm tra gian hàng còn kết nối không.</li>
      <li><b>Xuất nhầm thì sao</b> — Ngay sau khi xuất còn một khoảng ngắn để hoàn tác. Qua khoảng đó, hoá đơn đã phát hành thì không xoá được, phải lập hoá đơn điều chỉnh.</li>
      <li><b>Muốn hệ thống tự xuất</b> — Vào Cài đặt tự động, bật lên và chọn mốc: xuất khi giao xong, hay chờ thêm mấy ngày.</li>
      <li><b>Khách không lấy hoá đơn công ty</b> — Vẫn xuất bình thường theo dạng bán cho người tiêu dùng. Không cần khách cung cấp gì thêm.</li>
    </ul>
    <div class="dlg-actions"><button class="btn btn-primary" id="hdt-help-close">Đã hiểu</button></div>
  `);
  modal.overlay.querySelector('#hdt-help-close').addEventListener('click', modal.close);
}

async function openAutoSettings() {
  let value;
  try {
    const res = await api.get('/api/mgr/settings/ecom_invoice');
    value = res.value;
  } catch {
    toast('Không tải được cài đặt hiện tại', 'error');
    return;
  }

  const modal = openModal(`
    <h3>Tự động xuất hoá đơn cho đơn hàng TMĐT</h3>
    <p class="hint">Áp dụng cho tất cả gian hàng đang kết nối.</p>

    <div class="pform-switches">
      <div class="pform-row"><span>Bật tự động xuất hoá đơn</span>
        <label class="sw"><input id="hdt-auto-enabled" type="checkbox" ${value.auto_enabled ? 'checked' : ''} /><i></i></label></div>
    </div>

    <p><b>Khi nào xuất hoá đơn?</b></p>
    ${TRIGGER_OPTS.map(([v, label, hint]) => `
      <label class="sp-row">
        <span class="sp-text"><b>${escapeHtml(label)}</b><small>${escapeHtml(hint)}</small></span>
        <input type="radio" name="hdt-trigger" value="${v}" ${value.trigger === v ? 'checked' : ''} />
      </label>`).join('')}

    <div class="field" style="margin-top:12px"><label>Nhóm ngành nghề</label>
      <input id="hdt-industry" type="text" value="${escapeHtml(value.industry_group || '')}" placeholder="Quyết định tỷ lệ thuế trên doanh thu của hộ" /></div>

    <p class="hint" style="margin-top:14px"><b>Ba việc luôn tự động, không hỏi</b><br/>
      · Giữ lại đơn thiếu dữ liệu<br/>
      · Chuyển đơn có mã số thuế sang duyệt tay<br/>
      · Gửi hoá đơn cho người mua sau khi ký</p>

    <details class="pform-img-url">
      <summary>Tuỳ chỉnh chi tiết</summary>
      <p style="margin-top:10px"><b>Xuất khi</b></p>
      ${ISSUE_WHEN_OPTS.map(([v, label, hint]) => `
        <label class="sp-row">
          <span class="sp-text"><b>${escapeHtml(label)}</b><small>${escapeHtml(hint)}</small></span>
          <input type="radio" name="hdt-issue-when" value="${v}" ${value.issue_when === v ? 'checked' : ''} />
        </label>`).join('')}
      <p style="margin-top:10px"><b>Khi khách không yêu cầu hoá đơn</b></p>
      ${NO_REQUEST_OPTS.map(([v, label, hint]) => `
        <label class="sp-row">
          <span class="sp-text"><b>${escapeHtml(label)}</b><small>${escapeHtml(hint)}</small></span>
          <input type="radio" name="hdt-no-request" value="${v}" ${value.no_request_behavior === v ? 'checked' : ''} />
        </label>`).join('')}
      <p class="hint" style="margin-top:10px"><b>Chặn an toàn</b><br/>
        · Không tự xuất khi thiếu dữ liệu<br/>
        · Không tự xuất đơn đang có yêu cầu hoàn, kể cả khi đã qua thời điểm xuất</p>
    </details>

    <div class="dlg-actions">
      <button class="btn" id="hdt-auto-cancel">Huỷ</button>
      <button class="btn btn-primary" id="hdt-auto-save">Lưu</button>
    </div>
  `);
  const ov = modal.overlay;
  ov.querySelector('#hdt-auto-cancel').addEventListener('click', modal.close);
  ov.querySelector('#hdt-auto-save').addEventListener('click', async () => {
    const patch = {
      auto_enabled: ov.querySelector('#hdt-auto-enabled').checked,
      trigger: ov.querySelector('input[name="hdt-trigger"]:checked')?.value || value.trigger,
      industry_group: ov.querySelector('#hdt-industry').value.trim(),
      issue_when: ov.querySelector('input[name="hdt-issue-when"]:checked')?.value || value.issue_when,
      no_request_behavior: ov.querySelector('input[name="hdt-no-request"]:checked')?.value || value.no_request_behavior,
    };
    try {
      await api.patch('/api/mgr/settings/ecom_invoice', patch);
      toast('Đã lưu cài đặt tự động xuất hoá đơn');
      modal.close();
    } catch (err) {
      toast(err?.body?.message || 'Không lưu được', 'error');
    }
  });
}
