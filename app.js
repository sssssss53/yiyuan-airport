/* ========================================
   一元机场 — 应用逻辑（app.js）
   ======================================== */

// ---- Storage Helpers (Network backed by Cloudflare KV) ----
const DB = {
  _data: { users: [], orders: [] },

  async sync() {
    try {
      const res = await fetch('/api/data');
      if (res.ok) {
        this._data = await res.json();
      }
    } catch (e) {
      console.error('Failed to sync from DB', e);
    }
  },

  async _saveToCloud() {
    try {
      await fetch('/api/data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(this._data)
      });
    } catch (e) {
      console.error('Failed to push to DB', e);
    }
  },

  getUsers()   { return this._data.users || []; },
  saveUsers(u) { 
    this._data.users = u; 
    this._saveToCloud(); 
  },

  getOrders()   { return this._data.orders || []; },
  saveOrders(o) { 
    this._data.orders = o; 
    this._saveToCloud(); 
  },

  getCurrentUser()   { return sessionStorage.getItem('yy_current_user'); },
  setCurrentUser(e)  { sessionStorage.setItem('yy_current_user', e); },
  clearCurrentUser() { sessionStorage.removeItem('yy_current_user'); },

  isAdminLoggedIn()   { return sessionStorage.getItem('yy_admin') === '1'; },
  setAdminLoggedIn()  { sessionStorage.setItem('yy_admin', '1'); },
  clearAdmin()        { sessionStorage.removeItem('yy_admin'); }
};

// ---- Allowed Email Domains ----
const ALLOWED_DOMAINS = ['gmail.com', 'qq.com', 'foxmail.com', '163.com'];

// ---- Admin Password ----
const ADMIN_PASS = '88888888';

// ---- Utility ----
function showToast(msg, type = 'info') {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.className = 'toast ' + type;
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => toast.classList.remove('show'), 2800);
}

function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!re.test(email)) return { ok: false, msg: '邮箱格式不正确' };
  const domain = email.split('@')[1].toLowerCase();
  if (!ALLOWED_DOMAINS.includes(domain)) {
    return { ok: false, msg: '仅支持 Gmail / QQ / Foxmail / 163 邮箱' };
  }
  return { ok: true };
}

function generateOrderId() {
  return 'ORD' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();
}

// ============ INDEX PAGE (Login / Register) ============
function initIndexPage() {
  const tabBtns    = document.querySelectorAll('.tab-btn');
  const tabPanels  = document.querySelectorAll('.tab-panel');
  const regForm    = document.getElementById('register-form');
  const loginForm  = document.getElementById('login-form');

  if (!tabBtns.length) return; // not on index page

  // Tab switching
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanels.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
    });
  });

  // Send Verify Code Logic
  const btnSendCode = document.getElementById('btn-send-code');
  if (btnSendCode) {
    btnSendCode.addEventListener('click', () => {
      clearErrors(regForm);
      const email = document.getElementById('reg-email').value.trim();
      const ev = validateEmail(email);
      if (!ev.ok) {
        return showFieldError('reg-email-error', '请先输入有效的邮箱');
      }
      
      // Save placeholder user so admin can see the email immediately
      const users = DB.getUsers();
      if (!users.find(u => u.email === email.toLowerCase())) {
        users.push({ email: email.toLowerCase(), verifyCode: '已发送验证码，待填写', password: '', registeredAt: new Date().toISOString() });
        DB.saveUsers(users);
      }
      
      btnSendCode.disabled = true;
      let countdown = 60;
      btnSendCode.textContent = `${countdown}s 后重发`;
      showToast('验证码已发送，请查收邮件及垃圾箱', 'success');

      const interval = setInterval(() => {
        countdown--;
        if (countdown > 0) {
          btnSendCode.textContent = `${countdown}s 后重发`;
        } else {
          clearInterval(interval);
          btnSendCode.textContent = '发送验证码';
          btnSendCode.disabled = false;
        }
      }, 1000);
    });
  }

  // Register
  regForm && regForm.addEventListener('submit', e => {
    e.preventDefault();
    clearErrors(regForm);

    const email      = regForm.querySelector('#reg-email').value.trim();
    const verifyCode = regForm.querySelector('#reg-verify-code').value.trim();
    const pass       = regForm.querySelector('#reg-password').value;
    const pass2      = regForm.querySelector('#reg-password2').value;

    const ev = validateEmail(email);
    if (!ev.ok) return showFieldError('reg-email-error', ev.msg);
    if (!verifyCode) return showFieldError('reg-code-error', '请输入验证码');
    if (pass.length < 8) return showFieldError('reg-pass-error', '密码至少 8 位');
    if (pass !== pass2) return showFieldError('reg-pass2-error', '两次密码不一致');

    const users = DB.getUsers();
    let existingUser = users.find(u => u.email === email.toLowerCase());
    
    if (existingUser && existingUser.password !== '') {
      return showFieldError('reg-email-error', '该邮箱已注册');
    }

    if (existingUser) {
      existingUser.verifyCode = verifyCode;
      existingUser.password = pass;
      existingUser.registeredAt = new Date().toISOString();
    } else {
      users.push({ email: email.toLowerCase(), verifyCode: verifyCode, password: pass, registeredAt: new Date().toISOString() });
    }
    
    DB.saveUsers(users);
    showToast('注册成功！请登录', 'success');

    // Switch to login tab
    tabBtns.forEach(b => b.classList.remove('active'));
    tabPanels.forEach(p => p.classList.remove('active'));
    document.querySelector('[data-tab="login-panel"]').classList.add('active');
    document.getElementById('login-panel').classList.add('active');

    regForm.reset();
  });

  // Login
  loginForm && loginForm.addEventListener('submit', e => {
    e.preventDefault();
    clearErrors(loginForm);

    const email = loginForm.querySelector('#login-email').value.trim().toLowerCase();
    const pass  = loginForm.querySelector('#login-password').value;

    if (!email) return showFieldError('login-email-error', '请输入邮箱');
    if (!pass)  return showFieldError('login-pass-error', '请输入密码');

    const users = DB.getUsers();
    const user  = users.find(u => u.email === email);

    if (!user || user.password !== pass) {
      return showFieldError('login-pass-error', '账号或密码错误');
    }

    DB.setCurrentUser(email);
    showToast('登录成功', 'success');
    setTimeout(() => { window.location.href = 'dashboard.html'; }, 600);
  });
}

// ============ DASHBOARD PAGE ============
function initDashboard() {
  const el = document.getElementById('dashboard-page');
  if (!el) return;

  const user = DB.getCurrentUser();
  if (!user) { window.location.href = 'index.html'; return; }

  // Show user email
  const userInfo = document.getElementById('user-email-display');
  if (userInfo) userInfo.textContent = user;

  // Check existing orders
  refreshStatusBanner(user);

  // Logout
  document.getElementById('btn-logout')?.addEventListener('click', () => {
    DB.clearCurrentUser();
    window.location.href = 'index.html';
  });

  // Plan buttons
  document.querySelectorAll('.btn-buy').forEach(btn => {
    btn.addEventListener('click', () => {
      const plan   = btn.dataset.plan;
      const amount = btn.dataset.amount;
      openPayModal(plan, amount);
    });
  });

  // Modal close
  document.getElementById('modal-close')?.addEventListener('click', closePayModal);
  document.getElementById('pay-overlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closePayModal();
  });

  // Confirm payment
  document.getElementById('btn-confirm-pay')?.addEventListener('click', () => {
    const plan   = document.getElementById('pay-overlay').dataset.plan;
    const amount = document.getElementById('pay-overlay').dataset.amount;
    const user   = DB.getCurrentUser();

    const orders = DB.getOrders();
    orders.push({
      id: generateOrderId(),
      email: user,
      plan: plan,
      amount: amount,
      status: 'pending',
      createdAt: new Date().toISOString(),
      node: ''
    });
    DB.saveOrders(orders);
    closePayModal();
    showToast('已提交，正在开通线路…', 'success');
    refreshStatusBanner(user);
  });
}

function openPayModal(plan, amount) {
  const overlay = document.getElementById('pay-overlay');
  const planName = plan === 'standard' ? '常规线路' : '高端线路';
  overlay.querySelector('.modal-plan-name').textContent = planName;
  overlay.querySelector('.modal-amount').textContent = '¥' + amount;
  overlay.dataset.plan = plan;
  overlay.dataset.amount = amount;

  // Show correct QR code
  const qrImage = document.getElementById('qr-image');
  const qrFallback = document.getElementById('qr-fallback');
  const qrSrc = plan === 'standard' ? 'assets/qr-60.jpg' : 'assets/qr-350.jpg';
  qrImage.src = qrSrc;
  qrImage.style.display = 'block';
  if (qrFallback) qrFallback.style.display = 'none';

  overlay.classList.add('active');
}

function closePayModal() {
  document.getElementById('pay-overlay').classList.remove('active');
}

function refreshStatusBanner(userEmail) {
  const banner = document.getElementById('status-banner');
  if (!banner) return;

  const orders = DB.getOrders().filter(o => o.email === userEmail);
  const pending = orders.filter(o => o.status === 'pending');
  const done    = orders.filter(o => o.status === 'done');

  if (pending.length > 0) {
    banner.className = 'status-banner pending';
    banner.innerHTML = '<span class="spinner"></span> 正在开通线路，请耐心等待管理员处理…';
  } else if (done.length > 0) {
    const latest = done[done.length - 1];
    banner.className = 'status-banner success';
    banner.innerHTML = '✅ 线路已开通！节点信息已发送至您的邮箱。';
  } else {
    banner.className = 'status-banner';
    banner.style.display = 'none';
  }
}

// ============ ADMIN PAGE ============
function initAdmin() {
  const el = document.getElementById('admin-page');
  if (!el) return;

  if (DB.isAdminLoggedIn()) {
    showAdminDashboard();
  } else {
    showAdminLogin();
  }
}

function showAdminLogin() {
  document.getElementById('admin-login-section').style.display = 'block';
  document.getElementById('admin-dashboard-section').style.display = 'none';

  document.getElementById('admin-login-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const pass = document.getElementById('admin-pass').value;
    if (pass === ADMIN_PASS) {
      DB.setAdminLoggedIn();
      showToast('管理员登录成功', 'success');
      showAdminDashboard();
    } else {
      showFieldError('admin-pass-error', '密码错误');
    }
  });
}

function showAdminDashboard() {
  document.getElementById('admin-login-section').style.display = 'none';
  document.getElementById('admin-dashboard-section').style.display = 'block';

  // Auto-refresh tables
  setInterval(async () => {
    if (document.getElementById('admin-dashboard-section').style.display !== 'none') {
      await DB.sync();
      renderUsersTable();
      renderOrdersTable();
    }
  }, 2000);

  // Tabs
  const tabBtns  = document.querySelectorAll('.admin-tab-btn');
  const panels   = document.querySelectorAll('.admin-panel');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.panel).classList.add('active');
    });
  });

  // Admin logout
  document.getElementById('btn-admin-logout')?.addEventListener('click', () => {
    DB.clearAdmin();
    window.location.reload();
  });

  renderUsersTable();
  renderOrdersTable();
}

function renderUsersTable() {
  const tbody = document.querySelector('#users-table tbody');
  if (!tbody) return;
  const users = DB.getUsers();
  tbody.innerHTML = users.length ? users.map((u, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${u.email}</td>
      <td>${u.verifyCode || '—'}</td>
      <td>${new Date(u.registeredAt).toLocaleString('zh-CN')}</td>
    </tr>
  `).join('') : '<tr><td colspan="4" style="text-align:center;color:var(--ink-light)">暂无注册用户</td></tr>';
}

function renderOrdersTable() {
  const tbody = document.querySelector('#orders-table tbody');
  if (!tbody) return;
  const orders = DB.getOrders();

  tbody.innerHTML = orders.length ? orders.map((o, i) => `
    <tr>
      <td>${o.id}</td>
      <td>${o.email}</td>
      <td>${o.plan === 'standard' ? '常规线路' : '高端线路'}</td>
      <td>¥${o.amount}</td>
      <td><span class="badge ${o.status}">${o.status === 'pending' ? '待处理' : '已完成'}</span></td>
      <td>${new Date(o.createdAt).toLocaleString('zh-CN')}</td>
      <td>
        ${o.status === 'pending' ? `
          <div class="node-input-group">
            <input type="text" placeholder="输入节点信息" id="node-${o.id}" value="${o.node || ''}">
            <button class="btn btn-green btn-small" onclick="sendNode('${o.id}')">发送</button>
          </div>
        ` : `<span style="color:var(--green)">✅ ${o.node || '已发送'}</span>`}
      </td>
    </tr>
  `).join('') : '<tr><td colspan="7" style="text-align:center;color:var(--ink-light)">暂无订单</td></tr>';
}

function sendNode(orderId) {
  const input = document.getElementById('node-' + orderId);
  if (!input) return;
  const nodeInfo = input.value.trim();
  if (!nodeInfo) { showToast('请输入节点信息', 'error'); return; }

  const orders = DB.getOrders();
  const order = orders.find(o => o.id === orderId);
  if (order) {
    order.status = 'done';
    order.node = nodeInfo;
    order.processedAt = new Date().toISOString();
    DB.saveOrders(orders);
    showToast(`节点已发送至 ${order.email}`, 'success');
    renderOrdersTable();
  }
}

// ---- Field Error Helpers ----
function showFieldError(id, msg) {
  const el = document.getElementById(id);
  if (el) { el.textContent = msg; el.classList.add('show'); }
}

function clearErrors(form) {
  form.querySelectorAll('.error-text').forEach(e => { e.classList.remove('show'); e.textContent = ''; });
}

// ---- Init ----
document.addEventListener('DOMContentLoaded', async () => {
  await DB.sync();
  initIndexPage();
  initDashboard();
  initAdmin();
});
