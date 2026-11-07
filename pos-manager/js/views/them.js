// GĐ7 — Màn "Thêm": mọi tính năng chia theo nhóm giống app Sổ Bán Hàng,
// kèm nút chỉnh sửa thanh dưới ngay đầu màn.
import { escapeHtml, toast, openModal } from '../ui.js';
import { icon, iconColor } from '../icons.js';
import {
  allowedFeatures, GROUP_ORDER, getTabRoutes, setTabRoutes, TAB_SLOTS,
} from '../nav.js';

function featureCardHtml(f) {
  return `
    <a href="#/${f.route}" class="feature-card">
      <span class="icon" style="color:${iconColor(f.route)}">${icon(f.route)}</span>
      <span>${escapeHtml(f.label)}</span>
    </a>`;
}

// Hộp thoại "Chỉnh sửa thanh dưới": chọn đúng TAB_SLOTS tính năng cho 3 ô giữa.
export function openTabPicker(staff, onSaved) {
  const all = allowedFeatures(staff);
  let picked = getTabRoutes(staff);

  const { overlay, close } = openModal(`
    <h3>Chỉnh sửa thanh dưới</h3>
    <p class="picker-hint">Ô "Trang chủ" và "Thêm" luôn cố định. Chọn ${TAB_SLOTS} tính năng
      cho ${TAB_SLOTS} ô ở giữa.</p>
    <div class="feature-grid" id="tab-grid"></div>
    <div class="modal-close-row">
      <button class="btn" id="tab-cancel">Huỷ</button>
      <button class="btn btn-primary" id="tab-save">Lưu</button>
    </div>
  `);

  const grid = overlay.querySelector('#tab-grid');
  function paint() {
    grid.innerHTML = all.map((f) => {
      const pos = picked.indexOf(f.route);
      return `
        <button type="button" class="feature-card" data-route="${f.route}">
          <span class="icon" style="color:${iconColor(f.route)}">${icon(f.route)}</span>
          <span>${escapeHtml(f.label)}</span>
          <span class="pick-badge ${pos >= 0 ? 'remove' : ''}">${pos >= 0 ? pos + 1 : '+'}</span>
        </button>`;
    }).join('');
  }
  paint();

  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-route]');
    if (!btn) return;
    const r = btn.dataset.route;
    if (picked.includes(r)) picked = picked.filter((x) => x !== r);
    else if (picked.length >= TAB_SLOTS) return toast(`Chỉ chọn được ${TAB_SLOTS} ô`, 'error');
    else picked = [...picked, r];
    paint();
  });

  overlay.querySelector('#tab-cancel').addEventListener('click', close);
  overlay.querySelector('#tab-save').addEventListener('click', () => {
    if (picked.length !== TAB_SLOTS) return toast(`Phải chọn đủ ${TAB_SLOTS} ô`, 'error');
    setTabRoutes(picked);
    close();
    toast('Đã lưu thanh dưới');
    onSaved();
  });
}

export async function render(container, { staff } = {}) {
  const all = allowedFeatures(staff);
  const groups = GROUP_ORDER
    .map((g) => ({ name: g, items: all.filter((f) => f.group === g) }))
    .filter((g) => g.items.length);

  container.innerHTML = `
    <div class="section-label">
      <span>Tất cả tính năng</span>
      <button class="edit-link" id="edit-tabs">${icon('chinh-sua')}Chỉnh sửa thanh dưới</button>
    </div>
    ${groups.map((g) => `
      <div class="group-block">
        <div class="group-title">${escapeHtml(g.name)}</div>
        <div class="feature-grid">${g.items.map(featureCardHtml).join('')}</div>
      </div>`).join('')}
  `;

  container.querySelector('#edit-tabs').addEventListener('click', () => {
    // Lưu xong thì đá về trang chủ để thanh dưới dựng lại ngay (app.js dựng lại mỗi lần đổi route).
    openTabPicker(staff, () => { location.hash = '#/trang-chu'; });
  });
}
