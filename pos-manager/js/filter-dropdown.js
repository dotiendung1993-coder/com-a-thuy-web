// Đợt 2 (18/08/2026) — ô lọc nhiều-chọn dạng hộp thoại checkbox (ảnh Website v2: "Trạng thái hoá
// đơn", "Kết quả kiểm tra", "Trạng thái xử lý"). Tách thành module dùng chung vì cả 2 màn hoá đơn
// (đầu vào, đầu ra) đều cần — tránh chép lại cùng một đoạn HTML/JS hai lần.
import { escapeHtml } from './ui.js';

/** HTML nút + hộp thoại. `id` phải là duy nhất trong trang. */
export function filterDropdownHtml(id, label, options) {
  return `
    <div class="hd-split" id="${id}-wrap">
      <button type="button" class="btn btn-ghost hd-filter-toggle" id="${id}-btn"
        aria-haspopup="dialog" aria-expanded="false">${escapeHtml(label)} ▾</button>
      <div class="hd-colpop hd-filterpop hidden" id="${id}-pop" role="dialog" aria-label="${escapeHtml(label)}">
        <div class="hd-colpop-list">
          ${options.map(([v, text]) => `
            <label class="hd-colrow">
              <span>${escapeHtml(text)}</span>
              <input type="checkbox" data-val="${escapeHtml(v)}" />
            </label>`).join('')}
        </div>
      </div>
    </div>`;
}

/**
 * Gắn hành vi cho một ô lọc: mở/đóng hộp, đổi là gọi lại `onChange(mảng giá trị đã chọn)` NGAY —
 * không có nút "Áp dụng" riêng, giống các ô lọc kiểm tra nhanh khác trong app.
 * `closeOthers` do màn gọi truyền vào để đóng các hộp lọc/menu khác đang mở cùng lúc.
 */
export function bindFilterDropdown(container, id, closeOthers, onChange) {
  const wrap = container.querySelector(`#${id}-wrap`);
  const btn = container.querySelector(`#${id}-btn`);
  const pop = container.querySelector(`#${id}-pop`);
  wrap.addEventListener('click', (e) => e.stopPropagation());
  btn.addEventListener('click', () => {
    const show = pop.classList.contains('hidden');
    closeOthers();
    pop.classList.toggle('hidden', !show);
    btn.setAttribute('aria-expanded', show ? 'true' : 'false');
    btn.classList.toggle('active', show);
  });
  pop.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const values = [...pop.querySelectorAll('input[type="checkbox"]:checked')].map((c) => c.dataset.val);
      btn.classList.toggle('hd-filter-on', values.length > 0);
      onChange(values);
    });
  });
  return {
    close: () => { pop.classList.add('hidden'); btn.setAttribute('aria-expanded', 'false'); btn.classList.remove('active'); },
    reset: () => {
      pop.querySelectorAll('input[type="checkbox"]').forEach((cb) => { cb.checked = false; });
      btn.classList.remove('hd-filter-on');
    },
  };
}
