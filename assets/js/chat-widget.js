// CHAT WIDGET — nút chat nổi 💬 cho landing page, nói chuyện với sales-bot (/api/chat).
// Self-contained: tự tiêm CSS, không phụ thuộc framework. Đổi endpoint qua window.SALES_CHAT_API.
(function () {
  var API = window.SALES_CHAT_API || 'http://localhost:3020/api/chat';
  // Base URL của sales-bot (bỏ /api/chat cuối)
  var API_BASE = API.replace(/\/api\/chat$/, '');
  // Endpoint polling tin NHÂN VIÊN (Chat Center): cùng gốc với API, thêm /updates.
  var API_UPDATES = window.SALES_CHAT_UPDATES || (API.replace(/\/+$/, '') + '/updates');
  var SID = null;
  try {
    SID = localStorage.getItem('cat_chat_sid');
    if (!SID) { SID = 'w' + Date.now() + Math.random().toString(36).slice(2, 8); localStorage.setItem('cat_chat_sid', SID); }
  } catch (e) { SID = 'w' + Date.now(); }
  // Kiểm tra khách đã điền form thông tin chưa (chỉ hỏi 1 lần)
  var profileDone = false;
  try { profileDone = !!localStorage.getItem('cat_profile_done'); } catch (e) {}

  var css = [
    '#cat-chat-btn{position:fixed;bottom:20px;right:20px;width:60px;height:60px;border-radius:50%;',
    'display:flex;align-items:center;justify-content:center;color:#fff;border:none;cursor:pointer;z-index:9998;',
    'background:radial-gradient(circle at 30% 25%,#00C6FF 0%,#0A7CFF 45%,#8A3FFC 78%,#FF5C8A 100%);',
    'box-shadow:0 6px 18px rgba(0,90,255,.45);transition:transform .15s ease,box-shadow .15s ease}',
    '#cat-chat-btn:hover{transform:scale(1.07);box-shadow:0 8px 22px rgba(0,90,255,.55)}',
    '#cat-chat-btn svg{width:32px;height:32px}',
    '#cat-chat-box{position:fixed;bottom:88px;right:20px;width:min(360px,calc(100vw - 32px));height:480px;max-height:70vh;',
    'background:#fff;border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,.3);display:none;flex-direction:column;overflow:hidden;z-index:9999;font-family:inherit}',
    '#cat-chat-box.open{display:flex}',
    '#cat-chat-head{background:#16a34a;color:#fff;padding:12px 16px;font-weight:700}',
    '#cat-chat-head small{display:block;font-weight:400;opacity:.85}',
    '#cat-chat-log{flex:1;overflow-y:auto;padding:12px;background:#f6f7f8;color:#1f2937}',
    '.cat-msg{max-width:85%;margin:6px 0;padding:8px 12px;border-radius:12px;font-size:14px;line-height:1.45;white-space:pre-wrap;word-break:break-word;color:#1f2937}',
    '.cat-msg.bot{background:#fff;color:#1f2937;border:1px solid #e5e7eb;border-bottom-left-radius:4px}',
    '.cat-msg.user{background:#dcfce7;color:#14532d;margin-left:auto;border-bottom-right-radius:4px}',
    // Tin NHÂN VIÊN trả lời trực tiếp (AI tạm dừng) — viền xanh + nhãn nhỏ phía trên
    '.cat-msg.staff{background:#eff6ff;color:#1e3a8a;border:1px solid #bfdbfe;border-bottom-left-radius:4px}',
    '.cat-staff-tag{display:block;font-size:11px;font-weight:700;color:#2563eb;margin-bottom:2px}',
    '#cat-chat-form{display:flex;border-top:1px solid #e5e7eb;background:#fff}',
    '#cat-chat-inp{flex:1;border:none;padding:12px;font-size:14px;outline:none;color:#111;background:#fff}',
    '#cat-chat-inp::placeholder{color:#9ca3af}',
    '#cat-chat-send{border:none;background:#16a34a;color:#fff;padding:0 18px;cursor:pointer;font-size:16px}',
    // Bong bóng "đang nhập…" — 3 chấm nhấp nháy như Messenger/Zalo để khách biết bot đang trả lời
    '.cat-typing{display:flex;gap:5px;align-items:center;width:auto;padding:12px 14px}',
    '.cat-dot{width:7px;height:7px;border-radius:50%;background:#9ca3af;animation:cat-bounce 1.2s infinite ease-in-out}',
    '.cat-dot:nth-child(2){animation-delay:.18s}',
    '.cat-dot:nth-child(3){animation-delay:.36s}',
    '@keyframes cat-bounce{0%,60%,100%{transform:translateY(0);opacity:.4}30%{transform:translateY(-5px);opacity:1}}',
    // Pre-chat registration modal
    '#cat-reg-box{position:fixed;bottom:88px;right:20px;width:min(360px,calc(100vw - 32px));max-height:80vh;overflow-y:auto;',
    'background:#1a1f1c;border:1px solid rgba(255,255,255,.12);border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,.5);display:none;flex-direction:column;z-index:9999;font-family:inherit}',
    '#cat-reg-box.open{display:flex}',
    '#cat-reg-head{background:#1a472a;color:#d1fae5;padding:14px 16px;border-radius:16px 16px 0 0}',
    '#cat-reg-head h3{font-size:15px;font-weight:700;margin:0}',
    '#cat-reg-head p{font-size:12px;opacity:.8;margin:3px 0 0}',
    '#cat-reg-body{padding:16px;display:flex;flex-direction:column;gap:10px}',
    '.cat-reg-field{display:flex;flex-direction:column;gap:4px}',
    '.cat-reg-field label{font-size:12px;color:#9ca3af}',
    '.cat-reg-field input,.cat-reg-field select{background:#0f1612;border:1px solid rgba(255,255,255,.15);border-radius:8px;',
    'color:#f3f4f6;padding:9px 12px;font-size:14px;outline:none;width:100%;color-scheme:dark}',
    '.cat-reg-field input:focus,.cat-reg-field select:focus{border-color:#16a34a}',
    '.cat-reg-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}',
    '#cat-reg-submit{background:#16a34a;color:#fff;border:none;border-radius:10px;padding:11px;font-size:14px;font-weight:700;cursor:pointer;margin-top:4px}',
    '#cat-reg-submit:hover{background:#15803d}',
    '#cat-reg-skip{background:transparent;color:#6b7280;border:none;font-size:12px;cursor:pointer;padding:4px;text-align:center}',
    '#cat-reg-skip:hover{color:#9ca3af}',
    '#cat-reg-err{color:#f87171;font-size:12px;display:none}'
  ].join('');
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // Logo Messenger (bong bóng trắng + tia chớp) — giống nút chat Facebook Messenger.
  var MSG_SVG = '<svg viewBox="0 0 28 28" aria-hidden="true">' +
    '<path fill="#fff" d="M14 2.3C7.3 2.3 2.3 7.2 2.3 13.6c0 3.35 1.37 6.25 3.6 8.25.19.17.3.4.31.66l.06 2.02c.02.64.68 1.06 1.27.8l2.26-1c.19-.08.4-.1.6-.05 1.18.32 2.44.5 3.75.5 6.7 0 11.7-4.9 11.7-11.3S20.7 2.3 14 2.3z"/>' +
    '<path fill="#0A7CFF" d="M6.9 16.9l3.44-5.46c.55-.87 1.72-1.08 2.55-.47l2.73 2.05c.25.19.59.19.84 0l3.69-2.8c.49-.37 1.13.22.8.74l-3.44 5.46c-.55.87-1.72 1.08-2.55.47l-2.73-2.05a.7.7 0 0 0-.84 0l-3.69 2.8c-.49.37-1.13-.22-.8-.74z"/></svg>';
  var btn = document.createElement('button');
  btn.id = 'cat-chat-btn'; btn.innerHTML = MSG_SVG; btn.title = 'Chat đặt cơm';
  btn.setAttribute('aria-label', 'Mở khung chat đặt cơm');
  var box = document.createElement('div');
  box.id = 'cat-chat-box';
  box.innerHTML =
    '<div id="cat-chat-head">Cơm A Thuý — đặt món nhanh<small>Nhắn món bạn muốn, ví dụ: "2 cơm bò kho xốt vang"</small></div>' +
    '<div id="cat-chat-log"></div>' +
    '<form id="cat-chat-form"><input id="cat-chat-inp" placeholder="Nhập tin nhắn…" autocomplete="off">' +
    '<button id="cat-chat-send" type="submit">➤</button></form>';
  // ── Registration modal DOM ──────────────────────────────────────────────
  var regBox = document.createElement('div');
  regBox.id = 'cat-reg-box';
  regBox.innerHTML =
    '<div id="cat-reg-head"><h3>Chào bạn! Cho quán biết thông tin của bạn để phục vụ tốt hơn nhé 😊</h3>' +
    '<p>Thông tin chỉ dùng nội bộ, không chia sẻ bên ngoài.</p></div>' +
    '<form id="cat-reg-form"><div id="cat-reg-body">' +
    '<div class="cat-reg-field"><label>Số điện thoại <span style="color:#f87171">*</span></label>' +
    '<input id="cat-reg-phone" type="tel" placeholder="0382462678" autocomplete="tel" inputmode="numeric"></div>' +
    '<div class="cat-reg-field"><label>Họ và tên</label>' +
    '<input id="cat-reg-name" type="text" placeholder="Nguyễn Văn A" autocomplete="name"></div>' +
    '<div class="cat-reg-row">' +
    '<div class="cat-reg-field"><label>Ngày sinh</label>' +
    '<input id="cat-reg-dob" type="date" max="' + new Date().toISOString().slice(0,10) + '"></div>' +
    '<div class="cat-reg-field"><label>Giới tính</label>' +
    '<select id="cat-reg-gender"><option value="">-- chọn --</option>' +
    '<option value="male">Nam</option><option value="female">Nữ</option><option value="other">Khác</option></select></div>' +
    '</div>' +
    '<div class="cat-reg-field"><label>Email</label>' +
    '<input id="cat-reg-email" type="email" placeholder="example@gmail.com" autocomplete="email"></div>' +
    '<div class="cat-reg-field"><label>Địa chỉ giao hàng</label>' +
    '<input id="cat-reg-address" type="text" placeholder="Số nhà, tòa nhà, khu vực…" autocomplete="street-address"></div>' +
    '<p id="cat-reg-err"></p>' +
    '<button id="cat-reg-submit" type="submit">Tiếp tục →</button>' +
    '<button id="cat-reg-skip" type="button">Bỏ qua, chat ngay</button>' +
    '</div></form>';
  document.body.appendChild(btn);
  document.body.appendChild(box);
  document.body.appendChild(regBox);

  function openRegBox() {
    regBox.classList.add('open');
    btn.innerHTML = '<span style="font-size:28px;line-height:1;font-weight:300">✕</span>';
    setTimeout(function () { var el = regBox.querySelector('#cat-reg-phone'); if (el) el.focus(); }, 50);
  }
  function closeRegBox() {
    regBox.classList.remove('open');
    btn.innerHTML = MSG_SVG;
  }
  function openChat() {
    box.classList.add('open');
    btn.innerHTML = '<span style="font-size:28px;line-height:1;font-weight:300">✕</span>';
    inp.focus();
    if (!started) { started = true; sendToBot('chào quán'); }
    startPoll();
  }
  function closeChat() {
    box.classList.remove('open');
    btn.innerHTML = MSG_SVG;
    stopPoll();
  }

  // Form submit: lưu thông tin khách rồi mở chat
  regBox.querySelector('#cat-reg-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var phone = (regBox.querySelector('#cat-reg-phone').value || '').trim().replace(/\s+/g, '');
    if (!phone) {
      var errEl = regBox.querySelector('#cat-reg-err');
      errEl.textContent = 'Vui lòng nhập số điện thoại.'; errEl.style.display = 'block'; return;
    }
    var payload = {
      session_id: SID, phone: phone,
      name: (regBox.querySelector('#cat-reg-name').value || '').trim() || null,
      dob: regBox.querySelector('#cat-reg-dob').value || null,
      gender: regBox.querySelector('#cat-reg-gender').value || null,
      email: (regBox.querySelector('#cat-reg-email').value || '').trim() || null,
      address: (regBox.querySelector('#cat-reg-address').value || '').trim() || null,
    };
    var submitBtn = regBox.querySelector('#cat-reg-submit');
    submitBtn.disabled = true; submitBtn.textContent = 'Đang lưu…';
    fetch(API_BASE + '/api/customer/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    }).then(function () {
      try { localStorage.setItem('cat_profile_done', '1'); } catch (e) {}
      profileDone = true;
      closeRegBox(); openChat();
    }).catch(function () {
      // Nếu server lỗi vẫn cho chat (không chặn khách)
      profileDone = true;
      closeRegBox(); openChat();
    });
  });

  // Bỏ qua form: vẫn cho chat nhưng flag là done (hỏi lại ở session sau)
  regBox.querySelector('#cat-reg-skip').addEventListener('click', function () {
    closeRegBox(); openChat();
  });

  var log = box.querySelector('#cat-chat-log');
  var inp = box.querySelector('#cat-chat-inp');

  // Nhận diện link ẢNH QR VietQR / data-URL để hiện thành ẢNH (thay vì link chữ) — Task 2, 2026-07-16.
  var QR_IMG_RE = /(https?:\/\/img\.vietqr\.io\/image\/\S+|data:image\/png;base64,[A-Za-z0-9+/=]+)/;
  function qrImg(src) {
    var img = document.createElement('img');
    img.src = src; img.alt = 'QR chuyển khoản';
    img.style.cssText = 'display:block;max-width:220px;width:100%;border-radius:8px;margin:6px 0;background:#fff;cursor:pointer';
    img.addEventListener('click', function () { window.open(src, '_blank'); });
    return img;
  }
  function addMsg(text, who, attachments) {
    var d = document.createElement('div');
    d.className = 'cat-msg ' + who;
    var atts = Array.isArray(attachments) ? attachments : [];
    var hasImg = atts.some(function (a) { return a && a.type === 'image'; });
    atts.forEach(function (att) { if (att && att.type === 'image' && att.url) d.appendChild(qrImg(att.url)); });
    if (text) {
      // Nếu đã có ảnh đính kèm thì không trích link trong chữ thành ảnh lần 2 (tránh hiện 2 QR).
      var m = hasImg ? null : String(text).match(QR_IMG_RE);
      if (m) {
        var before = text.slice(0, m.index).replace(/\s+$/, '');
        var after = text.slice(m.index + m[0].length).replace(/^\s+/, '');
        if (before) d.appendChild(document.createTextNode(before));
        d.appendChild(qrImg(m[0]));
        if (after) d.appendChild(document.createTextNode(after));
      } else {
        d.appendChild(document.createTextNode(text));
      }
    }
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
  }

  // Trạng thái "đang nhập…" trong khung web (hiện khi chờ bot trả lời, ẩn khi có trả lời).
  function showTyping() {
    hideTyping();
    var d = document.createElement('div');
    d.className = 'cat-msg bot cat-typing';
    d.id = 'cat-typing';
    d.innerHTML = '<span class="cat-dot"></span><span class="cat-dot"></span><span class="cat-dot"></span>';
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
  }
  function hideTyping() {
    var t = document.getElementById('cat-typing');
    if (t) t.remove();
  }

  // ── Polling tin NHÂN VIÊN (Chat Center): khi AI tạm dừng, NV trả lời từ trang quản lý,
  // widget kéo tin mới mỗi 4s (chỉ khi khung chat đang mở — không tốn tài nguyên nền).
  var afterId = -1; // -1 = hỏi server mốc id mới nhất trước, tránh dội lại tin cũ
  try { afterId = Number(localStorage.getItem('cat_chat_after')) || -1; } catch (e) {}
  var pollTimer = null;
  function addStaffMsg(m) {
    var d = document.createElement('div');
    d.className = 'cat-msg staff';
    var tag = document.createElement('span');
    tag.className = 'cat-staff-tag';
    tag.textContent = '👤 ' + (m.staff_name || 'Nhân viên quán');
    d.appendChild(tag);
    // Đính kèm ảnh/tệp từ NV (Task 3, 2026-07-13)
    var atts = Array.isArray(m.attachments) ? m.attachments : [];
    atts.forEach(function(att) {
      if (att.type === 'image') {
        var img = document.createElement('img');
        img.src = att.url; img.alt = att.name || 'Ảnh';
        img.style.cssText = 'display:block;max-width:100%;border-radius:8px;margin-top:4px;cursor:pointer';
        img.addEventListener('click', function() { window.open(att.url, '_blank'); });
        d.appendChild(img);
      } else if (att.type === 'video') {
        var vid = document.createElement('video');
        vid.src = att.url; vid.controls = true;
        vid.style.cssText = 'display:block;max-width:100%;border-radius:8px;margin-top:4px';
        d.appendChild(vid);
      } else if (att.type === 'audio') {
        // Task 6 (2026-07-14): tin nhắn thoại quán gửi — phát trực tiếp bằng <audio>, luôn nghe
        // được 100% trên web (không phụ thuộc định dạng như Telegram/Messenger/Zalo).
        var aud = document.createElement('audio');
        aud.src = att.url; aud.controls = true;
        aud.style.cssText = 'display:block;max-width:100%;margin-top:4px';
        d.appendChild(aud);
      } else {
        var a = document.createElement('a');
        a.href = att.url; a.target = '_blank'; a.rel = 'noopener';
        a.textContent = '📎 ' + (att.name || 'Tệp đính kèm');
        a.style.cssText = 'display:block;margin-top:4px;font-size:13px;color:#2563eb';
        d.appendChild(a);
      }
    });
    if (m.text) d.appendChild(document.createTextNode(m.text));
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
  }
  function pollStaff() {
    fetch(API_UPDATES + '?session_id=' + encodeURIComponent(SID) + '&after_id=' + afterId)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (typeof d.last_id === 'number') {
          if (afterId >= 0) (d.messages || []).forEach(function (m) { addStaffMsg(m); });
          afterId = d.last_id;
          try { localStorage.setItem('cat_chat_after', String(afterId)); } catch (e) {}
        }
      })
      .catch(function () { /* mạng lỗi thì lần poll sau thử lại */ });
  }
  function startPoll() { if (!pollTimer) { pollStaff(); pollTimer = setInterval(pollStaff, 4000); } }
  function stopPoll() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

  var started = false;
  btn.addEventListener('click', function () {
    // Đang mở reg box → đóng
    if (regBox.classList.contains('open')) { closeRegBox(); return; }
    // Đang mở chat box → đóng
    if (box.classList.contains('open')) { closeChat(); return; }
    // Chưa mở gì: nếu chưa điền thông tin → hiện form trước
    if (!profileDone) { openRegBox(); return; }
    // Đã điền thông tin → mở chat thẳng
    openChat();
  });

  var staffNotified = false; // chỉ báo "đã chuyển cho NV" 1 lần, không lặp mỗi tin
  function sendToBot(text) {
    showTyping();
    var t0 = Date.now();
    // Giữ "đang nhập…" tối thiểu ~450ms cho tự nhiên (bot rule-based trả lời gần như tức thì).
    function reply(msg, attachments) {
      var wait = Math.max(0, 450 - (Date.now() - t0));
      setTimeout(function () { hideTyping(); addMsg(msg, 'bot', attachments); }, wait);
    }
    fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: SID, message: text })
    }).then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.ai_paused) {
          // AI đang tạm dừng — NV trả lời trực tiếp qua polling, không hiện câu bot mặc định.
          hideTyping();
          if (!staffNotified) {
            staffNotified = true;
            addMsg('Dạ nhân viên quán đang trả lời trực tiếp cho mình ạ, anh/chị chờ xíu nha 💬', 'bot');
          }
          return;
        }
        staffNotified = false;
        reply(d.reply || 'Dạ quán sẽ trả lời ngay ạ!', d.attachments);
      })
      .catch(function () {
        reply('Hệ thống chat đang bận 🥲 Anh/chị gọi 0382462678 để đặt món trực tiếp nhé!');
      });
  }

  box.querySelector('#cat-chat-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var text = inp.value.trim();
    if (!text) return;
    addMsg(text, 'user');
    inp.value = '';
    sendToBot(text);
  });
})();
