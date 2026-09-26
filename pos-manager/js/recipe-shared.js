// Dùng CHUNG cho mọi chỗ soạn công thức: màn Công thức (cửa sổ Tạo + cửa sổ Sửa) và mục Công thức
// trong form Sản phẩm (san-pham.js). Gồm: tạo nhanh nguyên vật liệu ngay lúc đang soạn, tổng giá vốn
// theo công thức + cảnh báo NVL chưa khai giá nhập, kiểm tra dòng nhập.
//
// Giá vốn món CÓ công thức do MÁY CHỦ tự tính khi lưu (ingredient-service.js::recomputeMenuCosts);
// recipeTotals() ở đây chỉ để HIỆN số xem trước lúc đang soạn, và cố ý làm tròn giống máy chủ
// (cộng hết các dòng rồi mới làm tròn số nguyên đồng) để số xem trước khớp số sẽ được lưu.
import { api } from './api.js';
import { escapeHtml, formatVND, openModal, toast, attachNumberInput, parseNumberInput } from './ui.js';

export const NEW_ING = '__new__';
const COMMON_UNITS = ['kg', 'g', 'lít', 'ml', 'cái', 'hộp', 'gói', 'lọ', 'chai', 'lon', 'túi', 'thùng', 'bó', 'vỉ', 'tép', 'muỗng'];

const byId = (ingredients) => new Map((ingredients || []).map((x) => [Number(x.id), x]));

// rows: [{ ingredient_id, qty_per_dish }]. Dòng chưa chọn NVL thì bỏ qua. Số lượng đổi ra phần nghìn
// (đúng độ chính xác NUMERIC(14,3) của cột) để nhân chia toàn số nguyên, không dính sai số số thực.
export function recipeTotals(rows, ingredients) {
  const map = byId(ingredients);
  let milli = 0;
  let missingPrice = 0;
  let lineCount = 0;
  for (const r of rows || []) {
    const ing = map.get(Number(r.ingredient_id));
    if (!ing) continue;
    lineCount++;
    const cost = Number(ing.cost_price) || 0;
    if (!cost) missingPrice++;
    milli += Math.round((Number(r.qty_per_dish) || 0) * 1000) * cost;
  }
  return { total: Math.round(milli / 1000), missingPrice, lineCount };
}

// Trả về câu báo lỗi tiếng Việt, hoặc null nếu các dòng hợp lệ. Chọn TRÙNG 1 NVL ở 2 dòng phải chặn: máy
// chủ gộp theo (món, NVL) và lấy dòng SAU, dòng trước mất âm thầm.
export function validateRecipeRows(rows, ingredients) {
  const map = byId(ingredients);
  const seen = new Set();
  for (const r of rows || []) {
    const id = Number(r.ingredient_id);
    const ing = map.get(id);
    if (!ing) return 'Chọn nguyên vật liệu cho tất cả các dòng (hoặc xoá dòng trống)';
    if (!(Number(r.qty_per_dish) > 0)) return `Số lượng của "${ing.name}" phải lớn hơn 0`;
    if (seen.has(id)) return `"${ing.name}" bị chọn ở 2 dòng, hãy gộp thành 1 dòng`;
    seen.add(id);
  }
  return null;
}

// Các <option> cho ô chọn NVL của 1 dòng: dòng trống, dòng "+ Tạo mới" (ngay dưới, không bị chôn cuối
// danh sách dài), rồi danh sách NVL.
export function ingredientOptionsHtml(ingredients, selectedId) {
  const sel = Number(selectedId) || 0;
  return `<option value="" ${sel ? '' : 'selected'}>— Chọn nguyên vật liệu —</option>`
    + `<option value="${NEW_ING}">+ Tạo nguyên vật liệu mới…</option>`
    + (ingredients || []).map((x) =>
      `<option value="${x.id}" ${Number(x.id) === sel ? 'selected' : ''}>${escapeHtml(x.name)} (${escapeHtml(x.unit)})</option>`).join('');
}

// Dòng "Giá vốn theo công thức: X" + cảnh báo có bao nhiêu NVL chưa khai giá nhập (giá vốn đang thiếu).
export function recipeSummaryHtml(rows, ingredients, { label = 'Giá vốn theo công thức' } = {}) {
  const t = recipeTotals(rows, ingredients);
  return `<div style="display:flex;justify-content:space-between;font-size:14px;font-weight:600;padding:8px 0 4px;border-top:1px solid var(--border,#eee);margin-top:8px">
      <span>${escapeHtml(label)}</span><span>${formatVND(t.total)}</span></div>`
    + (t.missingPrice
      ? `<p style="margin:2px 0 0;font-size:13px;color:var(--warn,#b45309)">Có ${t.missingPrice} nguyên vật liệu chưa khai giá nhập nên giá vốn đang thiếu phần này. Khai giá ở màn Nguyên vật liệu.</p>`
      : '');
}

// Ô "Giá vốn" trong form Tạo/Sửa món có 2 cách tính: NHẬP TAY hoặc THEO CÔNG THỨC.
//  - Món ĐÃ có công thức: theo công thức (máy chủ tự tính, ô khoá). Muốn nhập tay lại phải xoá hết dòng công thức.
//  - Món CHƯA có công thức: nhập tay được, nhưng chỉ chủ quán (quyền report_manage, cùng màn Giá vốn — máy chủ
//    chặn ở PATCH /reports/cost-prices) — hoặc chuyển sang "Theo công thức" (mở cửa sổ công thức; món mới chưa
//    có mã nên phải lưu món trước, và cần quyền sửa công thức).
export function costFieldState({ isNew = false, recipeCount = 0, canCost = false, canRecipe = false } = {}) {
  const byRecipe = Number(recipeCount) > 0;
  return {
    mode: byRecipe ? 'recipe' : 'manual',
    inputEditable: !byRecipe && !!canCost,
    canPickManual: !byRecipe && !!canCost, // không nhập được thì nút "Nhập tay" cũng mờ, khỏi tưởng bấm được
    canPickRecipe: !isNew && !!canRecipe,
  };
}

// Giá vốn gõ ở ô nhập tay → có cần gửi lên máy chủ không. Ô trống = xoá giá vốn (null), số lẻ làm tròn số
// nguyên đồng, số âm / không phải số là lỗi — cùng quy ước màn Giá vốn (gia-von.js) và bulkUpdateCostPrices().
export function manualCostChange(raw, original) {
  const oldCost = original === null || original === undefined ? null : Number(original);
  const text = String(raw ?? '').trim();
  if (text === '') return { changed: oldCost !== null, value: null, error: null };
  // parseNumberInput (không phải Number thẳng): ô gọi hàm này nay hiện dấu chấm hàng nghìn
  // (vd "24.000"), Number("24.000") sẽ ra 24 sai hẳn 1000 lần nếu không gỡ định dạng trước.
  const n = parseNumberInput(text);
  if (!Number.isFinite(n) || n < 0) return { changed: false, value: null, error: 'Giá vốn phải là số không âm' };
  const value = Math.round(n);
  return { changed: value !== oldCost, value, error: null };
}

// Cửa sổ tạo nhanh 1 NVL (tên, đơn vị, giá nhập) → POST /api/mgr/ingredients → nạp lại danh sách NVL.
// Trả về { ingredient, items } (items = danh sách NVL mới nạp, đã gồm NVL vừa tạo) hoặc null nếu huỷ.
// `existing` là danh sách NVL người gọi đang có, để chặn tạo trùng (cùng tên VÀ cùng đơn vị).
// Cửa sổ này mở CHỒNG lên cửa sổ soạn công thức nên không đụng gì tới công thức đang nhập dở.
export function createIngredientInline({ existing = [] } = {}) {
  return new Promise((resolve) => {
    const modal = openModal(`
      <h3>Tạo nguyên vật liệu mới</h3>
      <div class="field"><label>Tên nguyên vật liệu <i class="req">*</i></label>
        <input id="qi-name" type="text" placeholder="Ví dụ: Thịt ba chỉ" /></div>
      <div class="field"><label>Đơn vị <i class="req">*</i></label>
        <input id="qi-unit" type="text" list="qi-units" placeholder="Ví dụ: kg" />
        <datalist id="qi-units">${COMMON_UNITS.map((u) => `<option value="${u}"></option>`).join('')}</datalist></div>
      <div class="field"><label>Giá nhập (đồng / 1 đơn vị)</label>
        <input id="qi-cost" type="text" inputmode="numeric" value="0" />
        <p class="hint">Chưa biết giá thì để 0. Giá vốn món sẽ thiếu phần này cho tới khi khai giá ở màn Nguyên vật liệu.</p></div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button type="button" class="btn btn-ghost" id="qi-cancel" style="flex:1">Huỷ</button>
        <button type="button" class="btn btn-primary" id="qi-save" style="flex:1">Tạo và chọn</button>
      </div>`);
    // Cửa sổ soạn công thức ở màn Công thức tự dựng lớp phủ z-index 1000 (openModal chỉ có 60): phải nổi hơn.
    modal.overlay.style.zIndex = '1100';
    const $ = (sel) => modal.overlay.querySelector(sel);
    attachNumberInput($('#qi-cost'), { decimals: 0 });
    let finished = false;
    const finish = (value) => { if (finished) return; finished = true; modal.close(); resolve(value); };

    $('#qi-cancel').addEventListener('click', () => finish(null));
    modal.overlay.addEventListener('click', (e) => { if (e.target === modal.overlay) finish(null); });
    modal.overlay.querySelectorAll('input').forEach((input) => {
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#qi-save').click(); } });
    });

    $('#qi-save').addEventListener('click', async () => {
      const name = $('#qi-name').value.trim();
      const unit = $('#qi-unit').value.trim();
      const cost = Math.round(parseNumberInput($('#qi-cost').value) || 0);
      if (!name) { toast('Chưa nhập tên nguyên vật liệu', 'error'); $('#qi-name').focus(); return; }
      if (!unit) { toast('Chưa nhập đơn vị', 'error'); $('#qi-unit').focus(); return; }
      if (cost < 0) { toast('Giá nhập không được âm', 'error'); $('#qi-cost').focus(); return; }
      const dup = existing.find((x) => String(x.name).trim().toLowerCase() === name.toLowerCase()
        && String(x.unit).trim().toLowerCase() === unit.toLowerCase());
      if (dup) { toast(`Đã có nguyên vật liệu "${dup.name}" (${dup.unit}), hãy chọn nó trong danh sách`, 'error'); return; }

      const btn = $('#qi-save');
      btn.disabled = true;
      try {
        const created = await api.post('/api/mgr/ingredients', { name, unit, cost_price: cost });
        const list = await api.get('/api/mgr/ingredients');
        toast(`Đã tạo nguyên vật liệu "${name}"`);
        finish({ ingredient: created.ingredient, items: list.items || [] });
      } catch (err) {
        btn.disabled = false;
        toast(err?.body?.message || 'Không tạo được nguyên vật liệu', 'error');
      }
    });
    $('#qi-name').focus();
  });
}

// Xử lý 1 lần chọn ở ô NVL của 1 dòng. Chọn "+ Tạo nguyên vật liệu mới…" thì mở cửa sổ tạo nhanh; tạo xong
// trả luôn NVL vừa tạo để dòng đó CHỌN SẴN nó, huỷ thì giữ lựa chọn cũ. Trả về { id, items } — items chỉ có
// khi vừa tạo (danh sách NVL đã nạp lại, người gọi cần gán lại danh sách của mình).
export async function resolveIngredientPick(value, currentId, existing) {
  if (value !== NEW_ING) return { id: value ? Number(value) : null };
  const made = await createIngredientInline({ existing });
  return made ? { id: made.ingredient.id, items: made.items } : { id: currentId ?? null };
}
