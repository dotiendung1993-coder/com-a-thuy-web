// Booking Modal Logic

const API_BASE = window.BOOKING_API_BASE || (window.location.hostname === 'localhost'
  ? 'http://localhost:3030'
  : 'https://wing-chemical-doors-liver.trycloudflare.com');

let bookingState = {
  date: null,
  time: null,
  tableMode: 'any', // 'any' = không cần chọn bàn (backend tự gán) · 'pick' = khách tự chọn bàn (bước 2)
  tableNo: null,
  zone: null,
  orderItems: {} // { "<menuId>[:SIZE]": { id, qty, size } } — Task 2 (2026-07-28) gọi món ngay bây giờ
};

// Cache thực đơn (Task 2, 2026-07-28) — fetch 1 lần/phiên, dùng lại mỗi lần tích "Gọi món ngay bây giờ".
let preorderMenuItems = null;

// Toast notification — thay cho alert() mặc định của trình duyệt (xấu, không chuyên nghiệp)
function showToast(message, type = 'error', duration = 4500) {
  const container = document.getElementById('booking-toast-container');
  if (!container) { window.alert(message); return; } // fallback nếu container chưa kịp render

  const icons = { error: '⚠️', success: '✅', warning: '⏰' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.error}</span>
    <span class="toast-message"></span>
    <span class="toast-close">&times;</span>
  `;
  toast.querySelector('.toast-message').textContent = message;

  const remove = () => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 250);
  };
  toast.querySelector('.toast-close').onclick = remove;

  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(remove, duration);
}

// Modal control
function openBookingModal() {
  document.getElementById('booking-modal').classList.add('active');
  initStep1();
}

function closeBookingModal() {
  document.getElementById('booking-modal').classList.remove('active');
  resetModal();
}

function resetModal() {
  bookingState = { date: null, time: null, tableMode: 'any', tableNo: null, zone: null, orderItems: {} };
  showStep(1);
  document.getElementById('booking-datetime-form').reset();
  document.getElementById('booking-customer-form').reset();
  document.getElementById('booking-success').style.display = 'none';
  document.getElementById('preorder-menu').style.display = 'none';
}

function showStep(stepNum) {
  document.querySelectorAll('.booking-step').forEach(step => {
    step.classList.remove('active');
  });
  document.getElementById(`booking-step-${stepNum}`).classList.add('active');
}

function nextStep(stepNum) {
  if (stepNum === 2) {
    if (!validateStep1()) return;
    const btn = document.querySelector('#booking-step-1 button[type="button"]');
    if (btn) btn.disabled = true;
    loadAvailableTables().finally(() => {
      if (btn) btn.disabled = false;
    });
  } else if (stepNum === 3) {
    if (!validateStep2()) return;
  }
  showStep(stepNum);
}

function prevStep(stepNum) {
  showStep(stepNum);
}

// Nút "Tiếp tục" ở bước 1: đọc lựa chọn "Không cần chọn bàn" / "Tôi muốn chọn bàn cụ thể".
// tableMode='any' → bỏ qua hẳn bước 2 (không cần tải/hiện danh sách bàn), sang thẳng bước 3.
// tableMode='pick' → giữ nguyên luồng cũ (tải danh sách bàn trống rồi hiện bước 2).
function handleStep1Continue() {
  if (!validateStep1()) return;
  const mode = document.querySelector('input[name="table-mode"]:checked').value;
  bookingState.tableMode = mode;

  if (mode === 'any') {
    bookingState.tableNo = null;
    bookingState.zone = null;
    updateSelectedTableDisplay();
    showStep(3);
    return;
  }

  const btn = document.querySelector('#booking-step-1 button[type="button"]');
  if (btn) btn.disabled = true;
  loadAvailableTables().finally(() => {
    if (btn) btn.disabled = false;
  });
  showStep(2);
}

// Nút "Quay lại" ở bước 3: về đúng bước khách vừa đi qua (bỏ qua bước 2 nếu đang ở chế độ 'any').
function prevFromStep3() {
  showStep(bookingState.tableMode === 'pick' ? 2 : 1);
}

// Step 1: Date & Time
function initStep1() {
  populateTimeOptions();
  setMinMaxDates();
}

function setMinMaxDates() {
  const dateInput = document.getElementById('booking-date');
  const today = new Date().toISOString().split('T')[0];
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + 30);
  const max = maxDate.toISOString().split('T')[0];

  dateInput.min = today;
  dateInput.max = max;
}

function populateTimeOptions() {
  const timeSelect = document.getElementById('booking-time');
  timeSelect.innerHTML = '<option value="">Chọn giờ</option>';

  // 10:00 - 21:00, 30-min intervals
  for (let hour = 10; hour < 21; hour++) {
    for (let min of [0, 30]) {
      const time = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
      timeSelect.innerHTML += `<option value="${time}">${time}</option>`;
    }
  }
}

function validateStep1() {
  const date = document.getElementById('booking-date').value;
  const time = document.getElementById('booking-time').value;

  if (!date || !time) {
    showToast('Vui lòng chọn ngày và giờ', 'warning');
    return false;
  }

  // Check if time is in the past (if today)
  const today = new Date().toISOString().split('T')[0];
  if (date === today) {
    const now = new Date();
    const [hours, minutes] = time.split(':').map(Number);
    const selectedTime = new Date();
    selectedTime.setHours(hours, minutes, 0, 0);

    if (selectedTime <= now) {
      showToast('Không thể đặt giờ đã qua. Vui lòng chọn giờ khác.', 'warning');
      return false;
    }
  }

  bookingState.date = date;
  bookingState.time = time;
  return true;
}

// Step 2: Table Selection
async function loadAvailableTables() {
  const grid = document.getElementById('table-grid');
  grid.innerHTML = '<p>Đang tải danh sách bàn...</p>';

  try {
    const response = await fetch(
      `${API_BASE}/api/bookings/available-tables?date=${bookingState.date}&time=${bookingState.time}`
    );
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.message || 'Không thể tải danh sách bàn');
    }

    renderTableGrid(data.available_tables);
    updateDateTimeDisplay();
  } catch (error) {
    console.error('Error loading tables:', error);
    showToast('Có lỗi khi tải danh sách bàn. Vui lòng thử lại.', 'error');
    prevStep(1);
  }
}

function renderTableGrid(availableTables) {
  const grid = document.getElementById('table-grid');
  grid.innerHTML = '';

  const availableSet = new Set(availableTables.map(t => t.table_no));

  // 16 tables total
  for (let i = 1; i <= 16; i++) {
    const isAvailable = availableSet.has(i);
    const zone = i % 2 === 1 ? 'Trong nhà' : 'Ngoài sân';

    const card = document.createElement('div');
    card.className = `table-card ${isAvailable ? '' : 'booked'}`;
    card.innerHTML = `
      <div class="table-no">${i}</div>
      <div class="table-zone">${zone}</div>
    `;

    if (isAvailable) {
      card.onclick = (e) => selectTable(e, i, zone);
    }

    grid.appendChild(card);
  }
}

function selectTable(event, tableNo, zone) {
  // Deselect all
  document.querySelectorAll('.table-card').forEach(card => {
    card.classList.remove('selected');
  });

  // Select clicked
  event.currentTarget.classList.add('selected');

  bookingState.tableNo = tableNo;
  bookingState.zone = zone;
}

function updateDateTimeDisplay() {
  const dateStr = new Date(bookingState.date + 'T00:00:00').toLocaleDateString('vi-VN');
  document.getElementById('selected-datetime').textContent =
    `Ngày ${dateStr} - ${bookingState.time}`;
}

function validateStep2() {
  if (!bookingState.tableNo) {
    showToast('Vui lòng chọn bàn', 'warning');
    return false;
  }

  updateSelectedTableDisplay();
  return true;
}

function updateSelectedTableDisplay() {
  const dateStr = new Date(bookingState.date + 'T00:00:00').toLocaleDateString('vi-VN');
  document.getElementById('selected-table').textContent = bookingState.tableMode === 'any'
    ? `Quán sẽ sắp xếp bàn phù hợp - ${dateStr} ${bookingState.time}`
    : `Bàn ${bookingState.tableNo} (${bookingState.zone}) - ${dateStr} ${bookingState.time}`;
}

// Step 3: Customer Form + Pre-order (Task 2, 2026-07-28)
function formatVnd(n) {
  return Math.round(n).toLocaleString('vi-VN') + 'đ';
}

async function togglePreorder() {
  const checked = document.getElementById('has-preorder').checked;
  document.getElementById('preorder-menu').style.display = checked ? 'block' : 'none';
  if (!checked) return;

  if (preorderMenuItems) {
    renderPreorderMenu();
  } else {
    await loadPreorderMenu();
  }
}

// Dùng chung GET /api/menu với trang order.html (POS tại quán) — trả về id thật trong bảng `menu`
// nên order_items gửi lên /api/bookings tra cứu được giá/tên đúng ở backend.
async function loadPreorderMenu() {
  const menuDiv = document.getElementById('preorder-menu');
  menuDiv.innerHTML = '<p class="preorder-loading">Đang tải thực đơn...</p>';
  try {
    const response = await fetch(`${API_BASE}/api/menu`);
    const rows = await response.json();
    preorderMenuItems = buildPreorderItemList(Array.isArray(rows) ? rows : []);
    renderPreorderMenu();
  } catch (error) {
    console.error('Error loading preorder menu:', error);
    menuDiv.innerHTML = '<p class="preorder-error">Không tải được thực đơn. Vui lòng thử lại.</p>';
    preorderMenuItems = null;
  }
}

// Cơm mâm có size_prices (XS/S/M/L) — tách thành từng dòng riêng theo size, đặt tên
// "<món> (mâm <size>)" giống hệt cách /api/orders đặt tên khi enrich item, để nhất quán trên bill/bếp.
// Task (2026-08-02): thêm img/description/baseName để renderPreorderMenu() vẽ giao diện dạng thẻ có
// ảnh giống order.html (POS) — KHÔNG đổi key/id/price/size, đây vẫn là field mà /api/bookings đọc.
function buildPreorderItemList(rows) {
  const list = [];
  rows
    // Task 2 (2026-08-02): bỏ "Món ăn thêm" khỏi màn gọi món trước khi đặt bàn — chủ quán muốn tự
    // liên hệ trực tiếp khách nếu cần món này thay vì bán tự chọn qua đây (giống order.html).
    .filter(r => r.availability === 'available' && r.category !== 'Món ăn thêm')
    .forEach(r => {
      const sizePrices = r.size_prices || {};
      // Task 2 (2026-08-02): bỏ size XS (trùng suất Cơm phần) — chỉ còn S/M/L, khớp order.html.
      const sizes = Object.keys(sizePrices).filter(sz => sz.toUpperCase() !== 'XS');
      const img = r.img || null;
      const description = r.description || '';
      if (sizes.length) {
        sizes.forEach(size => {
          list.push({
            key: `${r.id}:${size}`,
            id: r.id,
            name: `${r.name} (mâm ${size})`,
            baseName: r.name,
            price: sizePrices[size],
            size,
            category: r.category,
            img,
            description
          });
        });
      } else {
        list.push({ key: r.id, id: r.id, name: r.name, baseName: r.name, price: r.price, size: null, category: r.category, img, description });
      }
    });
  return list;
}

// /api/menu trả về img dạng path tương đối (vd "/menu-img/dishes/x.png") vì được phục vụ TỪ
// pos-server — landing page là domain khác (cross-origin, xem ghi chú CORS ở pos-server.js) nên phải
// tự ghép API_BASE vào trước khi gán src.
function preorderImgUrl(img) {
  if (!img) return null;
  return /^https?:\/\//.test(img) ? img : `${API_BASE}${img}`;
}

const PREORDER_CATEGORY_ORDER = ['Cơm phần', 'Cơm mâm', 'Đồ uống', 'Món ăn thêm'];
const PREORDER_CATEGORY_ICON = { 'Cơm phần': '🍚', 'Cơm mâm': '🍱', 'Đồ uống': '🥤', 'Món ăn thêm': '🥗' };
// Task 2 (2026-08-02): định mức người ăn theo size Cơm mâm — khớp order.html (MAM_SIZES).
const PREORDER_SIZE_SERVES = { S: '1-2 người', M: '2-3 người', L: '3-4 người' };
let preorderActiveCategory = 'all'; // 'all' hoặc 1 trong PREORDER_CATEGORY_ORDER — khách tự lọc, không ẩn hẳn loại nào.

function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function filterPreorderCategory(category) {
  preorderActiveCategory = category;
  renderPreorderMenu();
}

// Gộp các dòng cùng id (vd 4 dòng size XS/S/M/L của 1 món Cơm mâm) thành 1 thẻ để vẽ ảnh 1 lần,
// bên trong thẻ mỗi size vẫn là 1 lựa chọn +/- riêng (key "<id>:<size>" giữ nguyên).
function groupPreorderCards(items) {
  const byId = new Map();
  items.forEach(item => {
    if (!byId.has(item.id)) {
      byId.set(item.id, { id: item.id, category: item.category, name: item.baseName || item.name, img: item.img, description: item.description, variants: [] });
    }
    byId.get(item.id).variants.push(item);
  });
  return Array.from(byId.values());
}

function renderPreorderMenu() {
  const menuDiv = document.getElementById('preorder-menu');
  if (!preorderMenuItems || !preorderMenuItems.length) {
    menuDiv.innerHTML = '<p class="preorder-error">Thực đơn hiện chưa có món nào.</p>';
    return;
  }

  const presentCategories = PREORDER_CATEGORY_ORDER.filter(cat => preorderMenuItems.some(i => i.category === cat));
  if (preorderActiveCategory !== 'all' && !presentCategories.includes(preorderActiveCategory)) {
    preorderActiveCategory = 'all';
  }

  let chipsHtml = `<button type="button" class="preorder-chip${preorderActiveCategory === 'all' ? ' active' : ''}" onclick="filterPreorderCategory('all')">Tất cả</button>`;
  presentCategories.forEach(cat => {
    chipsHtml += `<button type="button" class="preorder-chip${preorderActiveCategory === cat ? ' active' : ''}" onclick="filterPreorderCategory('${cat}')">${PREORDER_CATEGORY_ICON[cat] || ''} ${cat}</button>`;
  });

  let groupsHtml = '';
  presentCategories
    .filter(cat => preorderActiveCategory === 'all' || preorderActiveCategory === cat)
    .forEach(cat => {
      const cards = groupPreorderCards(preorderMenuItems.filter(i => i.category === cat));
      if (!cards.length) return;
      groupsHtml += `<div class="preorder-cat-group"><h4 class="preorder-cat-title">${PREORDER_CATEGORY_ICON[cat] || ''} ${cat}</h4><div class="preorder-grid">`;
      cards.forEach(card => { groupsHtml += renderPreorderCard(card); });
      groupsHtml += `</div></div>`;
    });

  menuDiv.innerHTML = `
    <div class="preorder-toolbar">${chipsHtml}</div>
    ${groupsHtml || '<p class="preorder-error">Không có món trong mục này.</p>'}
    <div class="preorder-total-row">Tổng món đã chọn: <span id="preorder-total-amount">${formatVnd(preorderTotal())}</span></div>
  `;
}

// 1 thẻ món: ảnh (hoặc emoji placeholder theo category nếu thiếu ảnh) + tên + mô tả ngắn.
// Cơm phần/Đồ uống/Món ăn thêm: 1 giá + 1 bộ +/-. Cơm mâm: mỗi size 1 chip riêng có giá + +/- riêng.
function renderPreorderCard(card) {
  const src = preorderImgUrl(card.img);
  const media = src
    ? `<img class="preorder-card-img" src="${src}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'preorder-card-ph',textContent:'${PREORDER_CATEGORY_ICON[card.category] || '🍽️'}'}))">`
    : `<div class="preorder-card-ph">${PREORDER_CATEGORY_ICON[card.category] || '🍽️'}</div>`;
  const desc = card.description ? `<div class="preorder-card-desc">${escHtml(card.description)}</div>` : '';

  if (card.variants.length === 1 && card.variants[0].size === null) {
    const v = card.variants[0];
    const qty = bookingState.orderItems[v.key]?.qty || 0;
    return `
      <div class="preorder-card">
        <div class="preorder-card-media">${media}</div>
        <div class="preorder-card-body">
          <div class="preorder-card-name">${escHtml(card.name)}</div>
          ${desc}
          <div class="preorder-card-footer">
            <span class="preorder-card-price">${formatVnd(v.price)}</span>
            <div class="preorder-qty">
              <button type="button" onclick="changePreorderQty('${v.key}', -1)">−</button>
              <span id="preorder-qty-${v.key}">${qty}</span>
              <button type="button" onclick="changePreorderQty('${v.key}', 1)">+</button>
            </div>
          </div>
        </div>
      </div>`;
  }

  // Task 2 (2026-08-02): định mức người ăn cạnh mỗi size, khớp order.html (MAM_SIZES).
  const sizeRows = card.variants.map(v => {
    const qty = bookingState.orderItems[v.key]?.qty || 0;
    const serves = PREORDER_SIZE_SERVES[String(v.size).toUpperCase()] || '';
    return `
      <div class="preorder-size-chip${qty > 0 ? ' active' : ''}" data-key="${v.key}">
        <span class="preorder-size-label">Size ${escHtml(v.size)}${serves ? ` <span class="preorder-size-serves">(${serves})</span>` : ''}</span>
        <span class="preorder-size-price">${formatVnd(v.price)}</span>
        <div class="preorder-qty">
          <button type="button" onclick="changePreorderQty('${v.key}', -1)">−</button>
          <span id="preorder-qty-${v.key}">${qty}</span>
          <button type="button" onclick="changePreorderQty('${v.key}', 1)">+</button>
        </div>
      </div>`;
  }).join('');

  return `
    <div class="preorder-card preorder-card-mam">
      <div class="preorder-card-media">${media}</div>
      <div class="preorder-card-body">
        <div class="preorder-card-name">${escHtml(card.name)}</div>
        ${desc}
        <div class="preorder-size-list">${sizeRows}</div>
      </div>
    </div>`;
}

function changePreorderQty(key, delta) {
  const item = preorderMenuItems && preorderMenuItems.find(i => i.key === key);
  if (!item) return;

  const current = bookingState.orderItems[key]?.qty || 0;
  const next = Math.max(0, current + delta);
  if (next === 0) {
    delete bookingState.orderItems[key];
  } else {
    bookingState.orderItems[key] = { id: item.id, qty: next, size: item.size };
  }

  const qtySpan = document.getElementById(`preorder-qty-${key}`);
  if (qtySpan) qtySpan.textContent = next;
  const chip = document.querySelector(`.preorder-size-chip[data-key="${key}"]`);
  if (chip) chip.classList.toggle('active', next > 0);
  const totalSpan = document.getElementById('preorder-total-amount');
  if (totalSpan) totalSpan.textContent = formatVnd(preorderTotal());
}

function preorderTotal() {
  return Object.entries(bookingState.orderItems).reduce((sum, [key, selection]) => {
    const item = preorderMenuItems && preorderMenuItems.find(i => i.key === key);
    return sum + (item ? item.price * selection.qty : 0);
  }, 0);
}

document.getElementById('booking-customer-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const hasPreorder = document.getElementById('has-preorder').checked;
  let orderItems = [];
  if (hasPreorder) {
    orderItems = Object.values(bookingState.orderItems).map(sel => ({ id: sel.id, qty: sel.qty, size: sel.size }));
    if (!orderItems.length) {
      showToast('Vui lòng chọn ít nhất 1 món, hoặc bỏ tích "Gọi món ngay bây giờ"', 'warning');
      return;
    }
  }

  const formData = {
    table_no: bookingState.tableMode === 'any' ? null : bookingState.tableNo,
    booking_date: bookingState.date,
    booking_time: bookingState.time,
    customer_name: document.getElementById('customer-name').value,
    customer_phone: document.getElementById('customer-phone').value,
    customer_email: document.getElementById('customer-email').value,
    party_size: parseInt(document.getElementById('party-size').value),
    notes: document.getElementById('notes').value,
    has_preorder: hasPreorder,
    order_items: orderItems
  };

  // Show loading
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalText = submitBtn.textContent;
  submitBtn.textContent = 'Đang xử lý...';
  submitBtn.disabled = true;

  try {
    const response = await fetch(`${API_BASE}/api/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(formData)
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.message || 'Đặt bàn thất bại');
    }

    // Show success
    document.getElementById('booking-customer-form').style.display = 'none';
    document.getElementById('booking-success').style.display = 'block';
    document.getElementById('success-message').textContent =
      `${data.message}\n\nMã đặt bàn: ${data.booking_code}`;

  } catch (error) {
    console.error('Booking error:', error);
    showToast(error.message || 'Có lỗi xảy ra. Vui lòng thử lại.', 'error');
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  }
});

// Close modal when clicking outside
window.onclick = (event) => {
  const modal = document.getElementById('booking-modal');
  if (event.target === modal) {
    closeBookingModal();
  }
};

// QR "Đặt bàn" trỏ vào /?book=1 — tự mở modal khi khách quét mã, không cần bấm nút trên trang.
document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('book') === '1') {
    openBookingModal();
  }
});
