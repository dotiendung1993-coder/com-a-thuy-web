// Bảng lịch ĐÔI chọn khoảng ngày — dùng chung cho màn Đơn hàng và màn Quản lý bếp.
//
// Task 1 (12/08/2026) — trước đây cỗ máy này viết thẳng trong views/orders.js và bám cứng vào id
// #ord-date-pop nên chỉ chạy được cho ĐÚNG MỘT ô lọc. Chủ quán xin thêm 2 chỗ nữa dùng y hệt
// (ô "Hẹn giao → Tuỳ chọn…" ở màn Đơn hàng, và 2 nửa màn Quản lý bếp) nên tách hẳn ra đây.
//
// Mỗi bản dựng giữ RIÊNG 3 thứ (để nhiều bảng lịch trên cùng một trang không giẫm lên nhau):
//   • draft  — lựa chọn ĐANG chọn dở; chỉ khi bấm "Áp dụng" mới đổ ra ngoài rồi mới gọi máy chủ,
//              tránh bắn 2 request giữa chừng lúc mới chọn được ngày đầu.
//   • cal    — tháng/năm của TỪNG bảng lịch. Bản đầu chỉ có một cặp calYear/calMonth và bảng phải
//              luôn = bảng trái + 1 tháng, nên bấm mũi tên là CẢ HAI cùng nhảy — chủ quán không
//              xem được "tháng 3" cạnh "tháng 11" để quét một khoảng dài.
//   • picker — null = đang xem ngày; { side, mode } = đang chọn nhanh tháng/năm cho lịch bên đó.
import {
  MONTH_NAMES, WEEKDAY_SHORT, QUICK_RANGES, MOC_RANGES,
  monthMatrix, parseYMD, rangeDates, dmy, weeksOfMonth, daysInMonth, ymd,
} from './date-utils.js';
import { todayVN, escapeHtml } from './ui.js';
import { icon } from './icons.js';

/** Mọi bản dựng đang sống — để một cú bấm ra ngoài đóng hết mọi bảng lịch. */
const registry = [];
let outsideBound = false;

/**
 * Toạ độ MÀN HÌNH cho bảng lịch, tách riêng khỏi DOM để bài kiểm chạy được bằng số thật.
 *
 * BUG (chủ quán báo 13/08/2026, màn Quản lý bếp): "ấn vào lịch bị che mất" — nửa TRÁI cụt mất hàng
 * nút "Xoá ngày / Áp dụng" ở đáy, nửa PHẢI cụt mất 2 cột đầu (T2, T3) bên trái.
 * GỐC RỄ: bảng lịch là position:absolute mà nằm trong `.kds-col { overflow:hidden }` (và
 * `.kds-board` cũng overflow:hidden). Phần tử absolute LUÔN bị cha có overflow:hidden xén, z-index
 * cao đến đâu cũng vô ích. Màn Đơn hàng không lộ lỗi vì ở đó không cha nào xén.
 *
 * @param {{left:number,right:number,top:number,bottom:number}} btn  khung của nút bấm
 * @param {number} w  bề rộng bảng lịch   @param {number} h  chiều cao bảng lịch
 * @param {number} winW  bề rộng khung nhìn   @param {number} winH  chiều cao khung nhìn
 * @returns {{left:number, top:number}} toạ độ so với khung nhìn (dùng cho position:fixed)
 */
export function popPosition(btn, w, h, winW, winH, gap = 6, pad = 8) {
  // Ngang: bám mép trái nút; tràn khỏi mép phải màn hình thì kéo ngược vào trong; bảng rộng hơn
  // cả màn hình thì ghim mép trái (thà thò bên phải còn hơn mất 2 cột đầu của lịch).
  let left = Math.min(btn.left, winW - w - pad);
  if (left < pad) left = pad;
  // Dọc: mặc định thả xuống dưới nút; không đủ chỗ thì lật lên trên nút; vẫn không đủ thì ghim
  // sát đáy màn hình rồi mới tới sát mép trên.
  let top = btn.bottom + gap;
  if (top + h > winH - pad) {
    const above = btn.top - gap - h;
    top = above >= pad ? above : Math.max(pad, winH - h - pad);
  }
  return { left, top };
}

/**
 * HTML của một nút khoảng ngày + bảng lịch đôi.
 * `ids` là hợp đồng giữa markup và cỗ máy: mọi khoá phải khớp với lúc gọi createRangePicker.
 * Màn Đơn hàng KHÔNG dùng hàm này — nó viết markup thẳng ra để các bài kiểm soi được id bằng
 * chữ thật; nhưng vẫn dùng chung createRangePicker bên dưới.
 */
export function rangePickerHtml(ids, emptyLabel, ariaLabel, cls = '') {
  const chips = QUICK_RANGES
    .map(([key, label]) => `<button type="button" class="chip" data-range="${key}">${label}</button>`)
    .join('');
  return `
    <button type="button" class="btn ord-date-btn ${cls}" id="${ids.btn}" aria-haspopup="dialog" aria-expanded="false">
      <span class="inline-ico">${icon('lich') || ''}</span><span id="${ids.label}">${escapeHtml(emptyLabel)}</span>
    </button>
    <div class="ord-date-pop hidden" id="${ids.pop}" role="dialog" aria-label="${escapeHtml(ariaLabel)}">
      <div class="odp-cals">
        <div class="odp-cal" id="${ids.calLeft}" data-side="left"></div>
        <div class="odp-cal" id="${ids.calRight}" data-side="right"></div>
      </div>
      <div class="ord-quick-range" id="${ids.quick}">
        ${chips}
        <div class="ord-year-wrap">
          <button type="button" class="chip" id="${ids.yearBtn}" aria-haspopup="dialog" aria-expanded="false">Năm…</button>
          <div class="ord-year-pop hidden" id="${ids.yearPop}" role="dialog" aria-label="Chọn năm"></div>
        </div>
      </div>
      <div class="odp-foot">
        <span class="odp-sel" id="${ids.sel}">Chưa chọn ngày</span>
        <button type="button" class="btn btn-ghost" id="${ids.clear}">Xoá ngày</button>
        <button type="button" class="btn btn-primary" id="${ids.apply}">Áp dụng</button>
      </div>
    </div>`;
}

/**
 * @param {Element} root  khung chứa markup (thường là chính ô lọc)
 * @param {object}  ids   { btn,label,pop,calLeft,calRight,quick,yearBtn,yearPop,sel,clear,apply }
 * @param {object}  cfg   { emptyLabel, getFrom, getTo, set, onCommit, onWarn }
 */
export function createRangePicker(root, ids, cfg) {
  const thisYMD = parseYMD(todayVN());
  const thisYear = thisYMD.y;
  const thisMonth = thisYMD.m;

  let draft = { from: '', to: '' };
  let picker = null;
  let yearPage = thisYear - 7; // năm đầu của trang đang xem trong bảng "Năm…"
  const cal = {
    left: { y: thisYear, m: thisMonth },
    right: thisMonth === 12 ? { y: thisYear + 1, m: 1 } : { y: thisYear, m: thisMonth + 1 },
  };
  const el = (key) => root.querySelector(`#${ids[key]}`);

  function shiftMonth(side, step) {
    const c = cal[side];
    let m = c.m + step;
    let y = c.y;
    while (m > 12) { m -= 12; y++; }
    while (m < 1) { m += 12; y--; }
    cal[side] = { y, m };
  }

  /** Bảng chọn nhanh: 12 tháng, hoặc 12 năm quanh năm đang xem. */
  function pickerHtml(side) {
    const c = cal[side];
    if (picker.mode === 'year') {
      const base = c.y - 7;
      const years = Array.from({ length: 12 }, (_, i) => base + i);
      return `<div class="odp-picker">
        <div class="odp-picker-head">
          <button type="button" class="odp-nav" data-pick-page="-12" aria-label="12 năm trước">‹</button>
          <b>${years[0]} – ${years[years.length - 1]}</b>
          <button type="button" class="odp-nav" data-pick-page="12" aria-label="12 năm sau">›</button>
        </div>
        <div class="odp-picker-grid">
          ${years.map((y) => `<button type="button" class="odp-pick${y === c.y ? ' sel' : ''}" data-pick-year="${y}">${y}</button>`).join('')}
        </div>
      </div>`;
    }
    return `<div class="odp-picker">
      <div class="odp-picker-head">
        <button type="button" class="odp-nav" data-pick-page="-1" aria-label="Năm trước">‹</button>
        <button type="button" class="odp-pick-year" data-pick-mode="year">${c.y}</button>
        <button type="button" class="odp-nav" data-pick-page="1" aria-label="Năm sau">›</button>
      </div>
      <div class="odp-picker-grid">
        ${MONTH_NAMES.map((name, i) => `<button type="button" class="odp-pick${i + 1 === c.m ? ' sel' : ''}" data-pick-month="${i + 1}">${name}</button>`).join('')}
      </div>
    </div>`;
  }

  function calHtml(side) {
    const { y: year, m: month } = cal[side];
    if (picker && picker.side === side) {
      return `<div class="odp-cal-head">
          <button type="button" class="odp-nav" data-nav="-1" data-side="${side}" aria-label="Tháng trước">‹</button>
          <button type="button" class="odp-title open" data-title="${side}">${MONTH_NAMES[month - 1]} ${year}</button>
          <button type="button" class="odp-nav" data-nav="1" data-side="${side}" aria-label="Tháng sau">›</button>
        </div>${pickerHtml(side)}`;
    }
    const cells = monthMatrix(year, month);
    const today = todayVN();
    // Mỗi lịch có ĐỦ 2 mũi tên và tiêu đề BẤM ĐƯỢC để nhảy thẳng tới tháng/năm bất kỳ —
    // chủ quán không phải bấm từng tháng một khi muốn xem lùi vài năm.
    return `
      <div class="odp-cal-head">
        <button type="button" class="odp-nav" data-nav="-1" data-side="${side}" aria-label="Tháng trước">‹</button>
        <button type="button" class="odp-title" data-title="${side}" title="Bấm để chọn nhanh tháng / năm">${MONTH_NAMES[month - 1]} ${year}</button>
        <button type="button" class="odp-nav" data-nav="1" data-side="${side}" aria-label="Tháng sau">›</button>
      </div>
      <div class="odp-dow">${WEEKDAY_SHORT.map((d) => `<span>${d}</span>`).join('')}</div>
      <div class="odp-days">
        ${cells.map((d) => {
    if (!d) return '<span class="odp-day empty"></span>';
    const inRange = draft.from && draft.to && d > draft.from && d < draft.to;
    const isEdge = d === draft.from || d === draft.to;
    return `<button type="button" class="odp-day${isEdge ? ' edge' : ''}${inRange ? ' in' : ''}${d === today ? ' today' : ''}" data-date="${d}">${parseYMD(d).d}</button>`;
  }).join('')}
      </div>`;
  }

  function renderCals() {
    el('calLeft').innerHTML = calHtml('left');
    el('calRight').innerHTML = calHtml('right');
    el('sel').textContent = draft.from
      ? `${dmy(draft.from)} → ${draft.to ? dmy(draft.to) : '…'}`
      : 'Chưa chọn ngày';
    // Đổi sang bảng chọn tháng/năm làm bảng lịch cao/thấp khác đi → đặt lại chỗ, nếu không nó
    // thò xuống dưới mép màn hình.
    placePop();
  }

  /** Chữ trên nút: "09/08/2026 – 10/08/2026" khi đang lọc, không thì câu mặc định. */
  function updateLabel() {
    const from = cfg.getFrom();
    el('label').textContent = from ? `${dmy(from)} – ${dmy(cfg.getTo() || from)}` : cfg.emptyLabel;
    el('btn').classList.toggle('has-value', Boolean(from));
  }

  // ── Bảng chọn NĂM BẤT KỲ ────────────────────────────────────────────────────────────────────
  // Bản đầu là <select> nạp cứng 3 năm (2026/2025/2024) nên đơn từ 2023 trở về trước không có
  // cách nào xem lại. Nay là bảng 12 năm, mũi tên lùi/tiến 12 năm một lần → đi ngược bao xa cũng
  // được.
  function isYearFilter(y) {
    const [f, t] = rangeDates(`nam:${y}`);
    return cfg.getFrom() === f && cfg.getTo() === t;
  }
  function renderYearPop() {
    const years = Array.from({ length: 12 }, (_, i) => yearPage + i);
    el('yearPop').innerHTML = `
      <div class="odp-picker-head">
        <button type="button" class="odp-nav" data-year-page="-12" aria-label="12 năm trước">‹</button>
        <b>${years[0]} – ${years[years.length - 1]}</b>
        <button type="button" class="odp-nav" data-year-page="12" aria-label="12 năm sau">›</button>
      </div>
      <div class="odp-picker-grid">
        ${years.map((y) => `<button type="button" class="odp-pick${isYearFilter(y) ? ' sel' : ''}" data-year="${y}">${y}</button>`).join('')}
      </div>`;
    const cur = Number(String(cfg.getFrom()).slice(0, 4));
    el('yearBtn').classList.toggle('active', Boolean(cur) && isYearFilter(cur));
  }
  function openYearPop(isOpen) {
    const pop = el('yearPop');
    if (!pop) return;
    pop.classList.toggle('hidden', !isOpen);
    el('yearBtn').setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    if (isOpen) renderYearPop();
  }

  // ── Đặt bảng lịch bằng toạ độ MÀN HÌNH (position:fixed) ──────────────────────────────────────
  // CÁCH SỬA lỗi "bấm vào lịch bị che mất" (xem popPosition ở đầu tệp): mở ra thì chuyển sang
  // position:fixed và tự tính toạ độ từ nút bấm. Phần tử fixed KHÔNG bị cha overflow:hidden xén
  // (chỉ bị xén nếu có cha mang transform/filter — cây DOM của POS Manager không có).
  // Đặt thẳng style trên phần tử nên đè được mọi quy tắc left/right/top trong CSS.
  function placePop() {
    const pop = el('pop');
    const btn = el('btn');
    if (!pop || !btn || pop.classList.contains('hidden')) return;
    const r = btn.getBoundingClientRect();
    pop.style.position = 'fixed';
    pop.style.right = 'auto';
    pop.style.bottom = 'auto';
    const { left, top } = popPosition(r, pop.offsetWidth, pop.offsetHeight, window.innerWidth, window.innerHeight);
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
  }

  // Cuộn/đổi cỡ cửa sổ trong lúc bảng lịch đang mở thì nút bấm trôi đi, còn bảng lịch fixed thì
  // đứng yên → phải tính lại. Dùng capture để bắt cả cuộn BÊN TRONG khung con (.kds-col-body).
  const reposition = () => placePop();

  function open(isOpen) {
    const pop = el('pop');
    if (!pop) return;
    pop.classList.toggle('hidden', !isOpen);
    el('btn').setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    if (isOpen) {
      window.addEventListener('scroll', reposition, true);
      window.addEventListener('resize', reposition);
    } else {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    }
    // Bảng chọn năm nằm BÊN TRONG bảng lịch: đóng lịch mà quên đóng nó thì lần mở lịch sau bảng
    // năm vẫn đang bung ra, che mất hàng lối tắt.
    if (!isOpen) openYearPop(false);
    if (isOpen) {
      draft = { from: cfg.getFrom(), to: cfg.getTo() };
      picker = null;
      // Mở lại thì lịch trái nhảy về tháng của ngày bắt đầu, lịch phải về tháng của ngày kết thúc
      // (đang lọc 03/2025 → 08/2026 thì thấy ngay cả hai đầu, không phải bấm mũi tên 17 lần).
      if (draft.from) { const p = parseYMD(draft.from); cal.left = { y: p.y, m: p.m }; }
      if (draft.to) { const p = parseYMD(draft.to); cal.right = { y: p.y, m: p.m }; }
      renderCals();
    }
  }

  // Tô đậm chip khớp với cặp ngày đang lọc (kể cả khi người dùng tự chọn đúng khoảng đó trên lịch).
  function syncQuick() {
    root.querySelectorAll(`#${ids.quick} .chip[data-range]`).forEach((chip) => {
      const [from, to] = rangeDates(chip.dataset.range);
      chip.classList.toggle('active', Boolean(cfg.getFrom()) && cfg.getFrom() === from && cfg.getTo() === to);
    });
    // Nút "Năm…" đổi thành "Năm 2023" khi đang lọc trọn một năm, để nhìn là biết đang xem năm nào.
    const btn = el('yearBtn');
    const y = Number(String(cfg.getFrom()).slice(0, 4));
    const on = Boolean(cfg.getFrom()) && Number.isInteger(y) && y > 0 && isYearFilter(y);
    btn.textContent = on ? `Năm ${y}` : 'Năm…';
    btn.classList.toggle('active', on);
    if (on) yearPage = y - 7;
  }

  /** Chốt một khoảng ngày: ghi ra ngoài, đồng bộ nhãn + chip rồi báo cho màn tải lại. */
  function commit(from, to) {
    cfg.set(from, to);
    draft = { from, to };
    updateLabel();
    syncQuick();
    open(false);
    cfg.onCommit();
  }
  function applyRange(key) {
    const [from, to] = rangeDates(key);
    commit(from, to);
  }

  // ── Gắn sự kiện ─────────────────────────────────────────────────────────────────────────────
  el('btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = el('pop').classList.contains('hidden');
    for (const p of registry) if (p.ids !== ids) p.open(false);
    open(willOpen);
  });
  el('pop').addEventListener('click', (e) => {
    e.stopPropagation();
    // Mũi tên tháng: CHỈ đổi lịch bên bấm (data-side), không kéo theo lịch kia.
    const nav = e.target.closest('[data-nav]');
    if (nav) { shiftMonth(nav.dataset.side, Number(nav.dataset.nav)); renderCals(); return; }
    // Bấm vào "Tháng 8 2026" → mở bảng chọn nhanh tháng; bấm lần nữa → quay lại xem ngày.
    const title = e.target.closest('[data-title]');
    if (title) {
      const side = title.dataset.title;
      picker = picker && picker.side === side ? null : { side, mode: 'month' };
      renderCals();
      return;
    }
    if (picker) {
      const toYearMode = e.target.closest('[data-pick-mode]');
      if (toYearMode) { picker = { ...picker, mode: 'year' }; renderCals(); return; }
      const page = e.target.closest('[data-pick-page]');
      if (page) {
        // Bảng THÁNG lùi/tiến 1 năm, bảng NĂM lùi/tiến 12 năm — bước đi ghi ngay trong data-*.
        const c = cal[picker.side];
        cal[picker.side] = { y: c.y + Number(page.dataset.pickPage), m: c.m };
        renderCals();
        return;
      }
      const pickYear = e.target.closest('[data-pick-year]');
      if (pickYear) {
        cal[picker.side] = { y: Number(pickYear.dataset.pickYear), m: cal[picker.side].m };
        picker = { ...picker, mode: 'month' }; // chọn năm xong thì chọn tiếp tháng
        renderCals();
        return;
      }
      const pickMonth = e.target.closest('[data-pick-month]');
      if (pickMonth) {
        cal[picker.side] = { y: cal[picker.side].y, m: Number(pickMonth.dataset.pickMonth) };
        picker = null; // xong: quay lại lưới ngày của đúng tháng vừa chọn
        renderCals();
        return;
      }
    }
    const day = e.target.closest('[data-date]');
    if (day) {
      const d = day.dataset.date;
      // Bấm lần 1 = ngày bắt đầu, lần 2 = ngày kết thúc. Chọn ngược (lần 2 sớm hơn lần 1) thì tự
      // đảo lại thay vì báo lỗi — chủ quán hay bấm từ phải sang trái.
      if (!draft.from || draft.to) draft = { from: d, to: '' };
      else draft = d < draft.from ? { from: d, to: draft.from } : { from: draft.from, to: d };
      renderCals();
    }
  });
  el('clear').addEventListener('click', () => commit('', ''));
  el('apply').addEventListener('click', () => {
    if (!draft.from) { cfg.onWarn('Chưa chọn ngày nào'); return; }
    commit(draft.from, draft.to || draft.from);
  });

  // Chip khoảng thời gian: bấm lần nữa vào chip đang chọn thì bỏ lọc ngày (hành vi bật/tắt).
  root.querySelectorAll(`#${ids.quick} .chip[data-range]`).forEach((chip) => {
    chip.addEventListener('click', () => {
      if (chip.classList.contains('active')) commit('', '');
      else applyRange(chip.dataset.range);
    });
  });

  el('yearBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    openYearPop(el('yearPop').classList.contains('hidden'));
  });
  el('yearPop').addEventListener('click', (e) => {
    e.stopPropagation();
    const page = e.target.closest('[data-year-page]');
    if (page) { yearPage += Number(page.dataset.yearPage); renderYearPop(); return; }
    const y = e.target.closest('[data-year]');
    if (!y) return;
    openYearPop(false);
    applyRange(`nam:${y.dataset.year}`);
  });

  const inst = { ids, open, updateLabel, syncQuick, applyRange };
  registry.push(inst);
  // Chỉ gắn MỘT trình xử lý "bấm ra ngoài" cho cả trang: gắn theo từng bản dựng thì mở lại màn
  // Đơn hàng 5 lần là có 5 trình xử lý chạy song song, mỗi cái quét lại toàn bộ danh sách.
  if (!outsideBound) {
    outsideBound = true;
    document.addEventListener('click', () => {
      // Bản dựng của màn đã rời đi thì phần tử không còn trong tài liệu — bỏ ra khỏi danh sách
      // thay vì gọi querySelector trên khung đã chết.
      for (let i = registry.length - 1; i >= 0; i--) {
        const p = registry[i];
        if (!p.alive()) { registry.splice(i, 1); continue; }
        p.open(false);
      }
    });
  }
  inst.alive = () => Boolean(el('pop') && el('pop').isConnected);
  updateLabel();
  return inst;
}

// ════════════════════════════════════════════════════════════════════════════════════════════
// Đợt 7 (18/08/2026) — bảng lịch 5 TAB (Mốc / Ngày / Tuần / Tháng / Năm), thêm cho màn Lãi lỗ
// (ảnh mẫu Website v2\Báo cáo\Lãi lỗ). KHÔNG đụng tới rangePickerHtml/createRangePicker ở trên —
// Đơn hàng và Quản lý bếp vẫn dùng nguyên bản 1-tab cũ, không đổi hành vi. Đây là một cỗ máy vẽ
// lịch RIÊNG, chỉ dùng chung hằng số/hàm toán ngày từ date-utils.js và cùng `registry` "bấm ra
// ngoài thì đóng hết" ở trên (đăng ký vào registry để 2 loại bảng lịch trên cùng trang không
// giẫm chân nhau).
export function tabbedRangePickerHtml(ids, emptyLabel, ariaLabel, cls = '') {
  return `
    <button type="button" class="btn ord-date-btn ll-date-btn ${cls}" id="${ids.btn}" aria-haspopup="dialog" aria-expanded="false">
      <span class="inline-ico">${icon('lich') || ''}</span><span id="${ids.label}">${escapeHtml(emptyLabel)}</span>
    </button>
    <div class="odp-pop ll-pop hidden" id="${ids.pop}" role="dialog" aria-label="${escapeHtml(ariaLabel)}">
      <div class="ll-tabs" id="${ids.tabs}">
        <button type="button" class="ll-tab active" data-tab="moc">Mốc</button>
        <button type="button" class="ll-tab" data-tab="ngay">Ngày</button>
        <button type="button" class="ll-tab" data-tab="tuan">Tuần</button>
        <button type="button" class="ll-tab" data-tab="thang">Tháng</button>
        <button type="button" class="ll-tab" data-tab="nam">Năm</button>
      </div>
      <div class="ll-tab-body" id="${ids.body}"></div>
    </div>`;
}

/**
 * @param {object} cfg { emptyLabel, getFrom, getTo, set, onCommit, onWarn }
 */
export function createTabbedRangePicker(root, ids, cfg) {
  const t = parseYMD(todayVN());
  let activeTab = 'moc';
  const cal = {
    left: { y: t.y, m: t.m },
    right: t.m === 12 ? { y: t.y + 1, m: 1 } : { y: t.y, m: t.m + 1 },
  };
  let draft = { from: '', to: '' };
  let weekNav = { y: t.y, m: t.m };
  let monthNav = { y: t.y };
  let yearPage = t.y - 5;

  const el = (key) => root.querySelector(`#${ids[key]}`);

  function isPresetActive(key) {
    const [f, tt] = rangeDates(key);
    return cfg.getFrom() === f && cfg.getTo() === tt;
  }

  function mocBodyHtml() {
    return `<div class="ll-moc-list">
      ${MOC_RANGES.map(([k, label]) => `
        <button type="button" class="ll-moc-item${isPresetActive(k) ? ' active' : ''}" data-preset="${k}">${escapeHtml(label)}</button>`).join('')}
    </div>`;
  }

  function dayCalHtml(side) {
    const { y: year, m: month } = cal[side];
    const cells = monthMatrix(year, month);
    const today = todayVN();
    return `
      <div class="odp-cal" data-side="${side}">
        <div class="odp-cal-head">
          <button type="button" class="odp-nav" data-day-nav="-1" data-side="${side}" aria-label="Tháng trước">‹</button>
          <b>${MONTH_NAMES[month - 1]} ${year}</b>
          <button type="button" class="odp-nav" data-day-nav="1" data-side="${side}" aria-label="Tháng sau">›</button>
        </div>
        <div class="odp-dow">${WEEKDAY_SHORT.map((d) => `<span>${d}</span>`).join('')}</div>
        <div class="odp-days">
          ${cells.map((d) => {
    if (!d) return '<span class="odp-day empty"></span>';
    const inRange = draft.from && draft.to && d > draft.from && d < draft.to;
    const isEdge = d === draft.from || d === draft.to;
    return `<button type="button" class="odp-day${isEdge ? ' edge' : ''}${inRange ? ' in' : ''}${d === today ? ' today' : ''}" data-day-pick="${d}">${parseYMD(d).d}</button>`;
  }).join('')}
        </div>
      </div>`;
  }

  function ngayBodyHtml() {
    return `<div class="ll-ngay-body">
      <div class="ll-moc-list ll-ngay-side">
        ${MOC_RANGES.map(([k, label]) => `
          <button type="button" class="ll-moc-item${isPresetActive(k) ? ' active' : ''}" data-preset="${k}">${escapeHtml(label)}</button>`).join('')}
      </div>
      <div class="odp-cals ll-ngay-cals">${dayCalHtml('left')}${dayCalHtml('right')}</div>
    </div>
    <div class="odp-foot">
      <span class="odp-sel" id="${ids.body}-sel">${draft.from ? `${dmy(draft.from)} → ${draft.to ? dmy(draft.to) : '…'}` : 'Chưa chọn ngày'}</span>
      <button type="button" class="btn btn-ghost" data-day-clear="1">Xoá ngày</button>
      <button type="button" class="btn btn-primary" data-day-apply="1">Áp dụng</button>
    </div>`;
  }

  function tuanBodyHtml() {
    const weeks = weeksOfMonth(weekNav.y, weekNav.m);
    const isWeekActive = (w) => cfg.getFrom() === w.from && cfg.getTo() === w.to;
    return `
      <div class="odp-picker-head">
        <button type="button" class="odp-nav" data-week-nav="-1" aria-label="Tháng trước">‹</button>
        <b>${MONTH_NAMES[weekNav.m - 1]} ${weekNav.y}</b>
        <button type="button" class="odp-nav" data-week-nav="1" aria-label="Tháng sau">›</button>
      </div>
      <div class="ll-week-list">
        ${weeks.map((w) => `
          <button type="button" class="ll-week-item${isWeekActive(w) ? ' active' : ''}" data-week-from="${w.from}" data-week-to="${w.to}">
            Tuần ${w.n}: ${dmy(w.from)} - ${dmy(w.to)}
          </button>`).join('')}
      </div>
      <div class="odp-foot"><button type="button" class="btn btn-primary" data-week-apply="1">Áp dụng</button></div>`;
  }

  function thangBodyHtml() {
    const isMonthActive = (m) => {
      const from = ymd(monthNav.y, m, 1);
      const to = ymd(monthNav.y, m, daysInMonth(monthNav.y, m));
      return cfg.getFrom() === from && cfg.getTo() === to;
    };
    return `
      <div class="odp-picker-head">
        <button type="button" class="odp-nav" data-month-nav="-1" aria-label="Năm trước">‹</button>
        <b>${monthNav.y}</b>
        <button type="button" class="odp-nav" data-month-nav="1" aria-label="Năm sau">›</button>
      </div>
      <div class="odp-picker-grid">
        ${MONTH_NAMES.map((name, i) => `<button type="button" class="odp-pick${isMonthActive(i + 1) ? ' sel' : ''}" data-month-pick="${i + 1}">${name}</button>`).join('')}
      </div>
      <div class="odp-foot"><button type="button" class="btn btn-primary" data-month-apply="1">Áp dụng</button></div>`;
  }

  function namBodyHtml() {
    const years = Array.from({ length: 12 }, (_, i) => yearPage + i);
    const isYearActive = (y) => {
      const [f, tt] = rangeDates(`nam:${y}`);
      return cfg.getFrom() === f && cfg.getTo() === tt;
    };
    return `
      <div class="odp-picker-head">
        <button type="button" class="odp-nav" data-year-nav="-12" aria-label="12 năm trước">‹</button>
        <b>${years[0]} – ${years[years.length - 1]}</b>
        <button type="button" class="odp-nav" data-year-nav="12" aria-label="12 năm sau">›</button>
      </div>
      <div class="odp-picker-grid">
        ${years.map((y) => `<button type="button" class="odp-pick${isYearActive(y) ? ' sel' : ''}" data-year-pick="${y}">${y}</button>`).join('')}
      </div>`;
  }

  function renderBody() {
    root.querySelectorAll(`#${ids.tabs} .ll-tab`).forEach((b) => b.classList.toggle('active', b.dataset.tab === activeTab));
    const body = el('body');
    if (activeTab === 'moc') body.innerHTML = mocBodyHtml();
    else if (activeTab === 'ngay') body.innerHTML = ngayBodyHtml();
    else if (activeTab === 'tuan') body.innerHTML = tuanBodyHtml();
    else if (activeTab === 'thang') body.innerHTML = thangBodyHtml();
    else body.innerHTML = namBodyHtml();
    placePop();
  }

  function updateLabel() {
    const from = cfg.getFrom();
    const to = cfg.getTo();
    const label = el('label');
    if (!from) { label.textContent = cfg.emptyLabel; el('btn').classList.remove('has-value'); return; }
    el('btn').classList.add('has-value');
    const moc = MOC_RANGES.find(([k]) => { const [f, tt] = rangeDates(k); return f === from && tt === to; });
    if (moc) { label.textContent = `${moc[1]} | ${dmy(from)} - ${dmy(to)}`; return; }
    const { y, m, d } = parseYMD(from);
    if (d === 1 && to === ymd(y, m, daysInMonth(y, m))) { label.textContent = `Tháng ${m}, ${y}`; return; }
    if (from === ymd(y, 1, 1) && to === ymd(y, 12, 31)) { label.textContent = `Năm ${y}`; return; }
    label.textContent = `${dmy(from)} - ${dmy(to)}`;
  }

  // Đặt bảng lịch bằng toạ độ MÀN HÌNH — cùng cách làm với createRangePicker() ở trên (xem
  // popPosition + ghi chú bug "bấm vào lịch bị che mất" đầu tệp).
  function placePop() {
    const pop = el('pop');
    const btn = el('btn');
    if (!pop || !btn || pop.classList.contains('hidden')) return;
    const r = btn.getBoundingClientRect();
    pop.style.position = 'fixed';
    pop.style.right = 'auto';
    pop.style.bottom = 'auto';
    const { left, top } = popPosition(r, pop.offsetWidth, pop.offsetHeight, window.innerWidth, window.innerHeight);
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
  }
  const reposition = () => placePop();

  function open(isOpen) {
    const pop = el('pop');
    if (!pop) return;
    pop.classList.toggle('hidden', !isOpen);
    el('btn').setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    if (isOpen) {
      window.addEventListener('scroll', reposition, true);
      window.addEventListener('resize', reposition);
      draft = { from: cfg.getFrom(), to: cfg.getTo() };
      if (draft.from) { const p = parseYMD(draft.from); cal.left = { y: p.y, m: p.m }; weekNav = { y: p.y, m: p.m }; monthNav = { y: p.y }; }
      if (draft.to) { const p = parseYMD(draft.to); cal.right = { y: p.y, m: p.m }; }
      renderBody();
    } else {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    }
  }

  function commit(from, to) {
    cfg.set(from, to);
    draft = { from, to };
    updateLabel();
    open(false);
    cfg.onCommit();
  }

  el('btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = el('pop').classList.contains('hidden');
    for (const p of registry) if (p.ids !== ids) p.open(false);
    open(willOpen);
  });

  root.querySelectorAll(`#${ids.tabs} .ll-tab`).forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      activeTab = btn.dataset.tab;
      renderBody();
    });
  });

  el('pop').addEventListener('click', (e) => {
    e.stopPropagation();

    const preset = e.target.closest('[data-preset]');
    if (preset) { const [f, tt] = rangeDates(preset.dataset.preset); commit(f, tt); return; }

    const dayNav = e.target.closest('[data-day-nav]');
    if (dayNav) {
      const side = dayNav.dataset.side;
      let m = cal[side].m + Number(dayNav.dataset.dayNav);
      let y = cal[side].y;
      while (m > 12) { m -= 12; y++; }
      while (m < 1) { m += 12; y--; }
      cal[side] = { y, m };
      renderBody();
      return;
    }
    const dayPick = e.target.closest('[data-day-pick]');
    if (dayPick) {
      const d = dayPick.dataset.dayPick;
      if (!draft.from || draft.to) draft = { from: d, to: '' };
      else draft = d < draft.from ? { from: d, to: draft.from } : { from: draft.from, to: d };
      renderBody();
      return;
    }
    if (e.target.closest('[data-day-clear]')) { commit('', ''); return; }
    if (e.target.closest('[data-day-apply]')) {
      if (!draft.from) { cfg.onWarn('Chưa chọn ngày nào'); return; }
      commit(draft.from, draft.to || draft.from);
      return;
    }

    const weekNavBtn = e.target.closest('[data-week-nav]');
    if (weekNavBtn) {
      let m = weekNav.m + Number(weekNavBtn.dataset.weekNav);
      let y = weekNav.y;
      while (m > 12) { m -= 12; y++; }
      while (m < 1) { m += 12; y--; }
      weekNav = { y, m };
      renderBody();
      return;
    }
    const weekItem = e.target.closest('[data-week-from]');
    if (weekItem) { draft = { from: weekItem.dataset.weekFrom, to: weekItem.dataset.weekTo }; renderBody(); return; }
    if (e.target.closest('[data-week-apply]')) {
      if (!draft.from) { cfg.onWarn('Chưa chọn tuần nào'); return; }
      commit(draft.from, draft.to);
      return;
    }

    const monthNavBtn = e.target.closest('[data-month-nav]');
    if (monthNavBtn) { monthNav = { y: monthNav.y + Number(monthNavBtn.dataset.monthNav) }; renderBody(); return; }
    const monthPick = e.target.closest('[data-month-pick]');
    if (monthPick) {
      const m = Number(monthPick.dataset.monthPick);
      commit(ymd(monthNav.y, m, 1), ymd(monthNav.y, m, daysInMonth(monthNav.y, m)));
      return;
    }

    const yearNavBtn = e.target.closest('[data-year-nav]');
    if (yearNavBtn) { yearPage += Number(yearNavBtn.dataset.yearNav); renderBody(); return; }
    const yearPick = e.target.closest('[data-year-pick]');
    if (yearPick) { const [f, tt] = rangeDates(`nam:${yearPick.dataset.yearPick}`); commit(f, tt); return; }
  });

  const inst = { ids, open };
  registry.push(inst);
  if (!outsideBound) {
    outsideBound = true;
    document.addEventListener('click', () => {
      for (let i = registry.length - 1; i >= 0; i--) {
        const p = registry[i];
        if (!p.alive()) { registry.splice(i, 1); continue; }
        p.open(false);
      }
    });
  }
  inst.alive = () => Boolean(el('pop') && el('pop').isConnected);
  updateLabel();
  return inst;
}
