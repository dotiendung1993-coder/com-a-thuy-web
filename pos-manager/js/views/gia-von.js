// GĐ3 — Giá vốn món ăn: nhập/sửa giá vốn từng món để tính lãi lỗ chính xác hơn.
import { api } from '../api.js';
import { formatVND, escapeHtml, toast } from '../ui.js';

const ERROR_MESSAGES = {
  no_items: 'Chưa chọn món nào để lưu',
  too_many_items: 'Chỉ được lưu tối đa 500 món mỗi lần',
  invalid_menu_id: 'Có món không hợp lệ',
  invalid_cost: 'Giá vốn không hợp lệ',
};
function errMsg(err) { return ERROR_MESSAGES[err?.body?.error] || err?.body?.message || 'Có lỗi xảy ra'; }

function marginHtml(price, costStr) {
  if (costStr === '' || costStr === null || costStr === undefined) return '—';
  const cost = Number(costStr);
  if (Number.isNaN(cost)) return '—';
  const margin = price - cost;
  const cls = margin >= 0 ? 'rp-margin-pos' : 'rp-margin-neg';
  return `<span class="${cls}">${formatVND(margin)}</span>`;
}

export async function render(container, { staff } = {}) {
  const perms = staff?.perms || {};
  if (!perms.report) {
    container.innerHTML = '<p>Bạn không có quyền xem màn hình này.</p>';
    return;
  }
  const canManage = !!perms.report_manage;

  let q = '';
  let missingOnly = false;
  let items = [];
  const changes = new Map(); // menu_id -> cost_price (number hoặc null)

  container.innerHTML = `
    <div class="orders-filters-row">
      <input id="gv-search" type="search" placeholder="Tìm tên món" />
    </div>
    <label style="display:flex;align-items:center;gap:8px;margin:8px 0">
      <input id="gv-missing" type="checkbox" style="width:auto;min-height:auto" /> Chỉ hiện món chưa có giá vốn
    </label>
    <div id="gv-stats" class="rp-stats-line"></div>
    ${!canManage ? '<p class="rp-readonly-note">Chỉ chủ quán mới sửa được giá vốn.</p>' : ''}
    <div id="gv-list"><p>Đang tải…</p></div>
    ${canManage ? '<div class="rp-savebar"><button id="gv-save" class="btn btn-primary" style="width:100%">Lưu tất cả</button></div>' : ''}
  `;

  // Chờ người dùng gõ xong mới gọi máy chủ — 140 món, gõ mỗi chữ một lần gọi là quá nhiều
  let searchTimer = null;
  container.querySelector('#gv-search').addEventListener('input', (e) => {
    q = e.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(load, 300);
  });
  container.querySelector('#gv-missing').addEventListener('change', (e) => { missingOnly = e.target.checked; load(); });
  if (canManage) container.querySelector('#gv-save').addEventListener('click', saveAll);

  function renderStats(total, withCost, missing) {
    container.querySelector('#gv-stats').textContent = `Đã nhập ${withCost}/${total} món · còn thiếu ${missing} món`;
  }

  function renderList() {
    const el = container.querySelector('#gv-list');
    if (!items.length) { el.innerHTML = '<p>Không có món nào phù hợp.</p>'; return; }
    // Giá đang hiển thị = giá vừa gõ (nếu có) chứ không phải giá từ máy chủ. Nếu không, đổi bộ
    // lọc hay gõ ô tìm kiếm là những gì vừa nhập biến mất khỏi màn hình nhưng vẫn nằm trong
    // danh sách chờ lưu — bấm "Lưu tất cả" sẽ lưu con số người dùng không còn nhìn thấy.
    const shownCost = (it) => (changes.has(it.id) ? changes.get(it.id) : it.cost_price) ?? '';
    el.innerHTML = `
      <div class="table-scroll">
        <table class="roles-table">
          <thead><tr><th>Tên món</th><th>Danh mục</th><th>Giá bán</th><th>Giá vốn</th><th>Lãi/phần</th></tr></thead>
          <tbody>
            ${items.map((it) => `
              <tr data-item-row="${it.id}">
                <td>${escapeHtml(it.name)}</td>
                <td>${escapeHtml(it.category || 'Chưa phân loại')}</td>
                <td>${formatVND(it.price)}</td>
                <td>
                  <input class="rp-cost-input" type="number" min="0" data-cost="${it.id}"
                    value="${shownCost(it)}" ${canManage ? '' : 'disabled'} />
                </td>
                <td data-margin="${it.id}">${marginHtml(it.price, shownCost(it))}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    if (canManage) {
      el.querySelectorAll('[data-cost]').forEach((input) => {
        input.addEventListener('input', () => {
          const id = input.dataset.cost;
          const item = items.find((it) => String(it.id) === id);
          const raw = input.value;
          const newVal = raw === '' ? null : Number(raw);
          const original = item.cost_price ?? null;
          if (newVal === original) changes.delete(id);
          else changes.set(id, newVal);
          el.querySelector(`[data-margin="${id}"]`).innerHTML = marginHtml(item.price, raw);
        });
      });
    }
  }

  async function saveAll() {
    // Mã món là UUID (chuỗi), KHÔNG được ép sang số — Number('e0266996-…') ra NaN, máy chủ
    // trả invalid_menu_id và không lưu được món nào.
    const entries = Array.from(changes.entries()).map(([id, cost_price]) => ({ id, cost_price }));
    if (!entries.length) { toast('Không có thay đổi nào để lưu'); return; }
    try {
      for (let i = 0; i < entries.length; i += 500) {
        const batch = entries.slice(i, i + 500);
        await api.patch('/api/mgr/reports/cost-prices', { items: batch });
      }
      toast(`Đã lưu giá vốn ${entries.length} món`);
      changes.clear();
      await load();
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  }

  async function load() {
    const el = container.querySelector('#gv-list');
    el.innerHTML = '<p>Đang tải…</p>';
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (missingOnly) params.set('missing', '1');
      const data = await api.get(`/api/mgr/reports/cost-prices?${params.toString()}`);
      items = data.items;
      renderStats(data.total, data.with_cost, data.missing);
      renderList();
    } catch (err) {
      if (err?.status !== 401 && err?.status !== 403) el.innerHTML = '<p>Không tải được danh sách món.</p>';
    }
  }

  await load();
}
