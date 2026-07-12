'use strict';

/* ============================================================
   Green Heart Family – App Script
   ============================================================ */

// ── Service Worker ────────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/Green-heart-family/sw.js')
      .then(r => console.log('[GHF] SW registered:', r.scope))
      .catch(e => console.warn('[GHF] SW error:', e));
  });
}

// ── PWA Install Prompt ────────────────────────────────────────────────────────
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const banner = document.getElementById('install-banner');
  if (banner) banner.classList.add('show');
});

function installApp() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  deferredInstallPrompt.userChoice.then(() => {
    deferredInstallPrompt = null;
    const banner = document.getElementById('install-banner');
    if (banner) banner.classList.remove('show');
  });
}

// ── App State ─────────────────────────────────────────────────────────────────
const GHF = { currentUser: null, darkMode: false };

// ── Storage helpers ───────────────────────────────────────────────────────────
function lsGet(key, fallback = null) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function lsSet(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }

// ── Sanitize ──────────────────────────────────────────────────────────────────
function sanitize(str) {
  const d = document.createElement('div');
  d.textContent = String(str || '');
  return d.innerHTML;
}

// ── Format time ───────────────────────────────────────────────────────────────
function formatTime(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000)    return 'just now';
  if (diff < 3600000)  return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  return Math.floor(diff / 86400000) + 'd ago';
}

// ── Seed demo data ────────────────────────────────────────────────────────────
function seedData() {
  if (lsGet('ghf_seeded')) return;
  lsSet('ghf_users', {
    'founder@ghf.com': {
      uid: 'u0', name: 'Green Heart Founder', email: 'founder@ghf.com',
      password: 'founder123', bio: 'Founder of Green Heart Family 💚',
      badges: ['founder', 'verified'], avatar: '', followers: 128, following: 12
    },
    'demo@ghf.com': {
      uid: 'u1', name: 'Alex Green', email: 'demo@ghf.com',
      password: 'demo1234', bio: 'Proud member of Green Heart Family.',
      badges: ['member'], avatar: '', followers: 34, following: 22
    }
  });
  lsSet('ghf_posts', [
    {
      id: 'p1', uid: 'u0', author: 'Green Heart Founder', badges: ['founder'],
      text: '💚 Welcome to Green Heart Family! This is our home — where family, loyalty, and respect live.',
      image: '', likes: ['u1'],
      comments: [{ uid: 'u1', author: 'Alex Green', text: 'So happy to be here! 💚', time: Date.now() - 3600000 }],
      time: Date.now() - 86400000
    },
    {
      id: 'p2', uid: 'u1', author: 'Alex Green', badges: ['member'],
      text: 'Nobody walks alone here. Reach out if you need someone to talk to. We are always here. 🤝',
      image: '', likes: [], comments: [], time: Date.now() - 43200000
    }
  ]);
  lsSet('ghf_messages', {
    'u0_u1': [
      { from: 'u0', text: 'Welcome to the family! 💚', time: Date.now() - 7200000 },
      { from: 'u1', text: 'Thank you! Happy to be here.', time: Date.now() - 7100000 }
    ]
  });
  lsSet('ghf_notifications', [
    { id: 'n1', text: '<span>Green Heart Founder</span> welcomed you to the family!', icon: '💚', time: Date.now() - 3600000, read: false },
    { id: 'n2', text: '<span>Alex Green</span> liked your post.', icon: '❤️', time: Date.now() - 1800000, read: false }
  ]);
  lsSet('ghf_seeded', true);
}

// ── Auth ──────────────────────────────────────────────────────────────────────
function login(email, password) {
  const users = lsGet('ghf_users', {});
  const u = users[email.toLowerCase()];
  if (!u) return 'No account found with that email.';
  if (u.password !== password) return 'Incorrect password.';
  GHF.currentUser = { ...u };
  lsSet('ghf_session', email.toLowerCase());
  onLogin();
  return null;
}

function register(name, email, password) {
  if (!name.trim() || !email.trim() || !password.trim()) return 'All fields are required.';
  if (password.length < 6) return 'Password must be at least 6 characters.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid email address.';
  const users = lsGet('ghf_users', {});
  if (users[email.toLowerCase()]) return 'An account with that email already exists.';
  const uid = 'u' + Date.now();
  users[email.toLowerCase()] = {
    uid, name, email: email.toLowerCase(), password,
    bio: '', badges: ['member'], avatar: '', followers: 0, following: 0
  };
  lsSet('ghf_users', users);
  return login(email, password);
}

function logout() {
  GHF.currentUser = null;
  lsSet('ghf_session', null);
  updateNavbar();
  showPage('home');
  showModal('auth-modal');
}

function restoreSession() {
  const email = lsGet('ghf_session');
  if (!email) return false;
  const users = lsGet('ghf_users', {});
  const u = users[email];
  if (!u) return false;
  GHF.currentUser = { ...u };
  return true;
}

function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-pass').value;
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';
  const err = login(email, pass);
  if (err) errEl.textContent = err;
}

function handleRegister() {
  const name  = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const pass  = document.getElementById('reg-pass').value;
  const errEl = document.getElementById('reg-error');
  errEl.textContent = '';
  const err = register(name, email, pass);
  if (err) errEl.textContent = err;
}

function switchAuthTab(tab) {
  document.getElementById('login-form').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('reg-form').style.display   = tab === 'register' ? 'block' : 'none';
  document.getElementById('tab-login').classList.toggle('btn-primary', tab === 'login');
  document.getElementById('tab-register').classList.toggle('btn-primary', tab === 'register');
}

// ── Page routing ──────────────────────────────────────────────────────────────
function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const el = document.getElementById('page-' + pageId);
  if (el) el.classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const nb = document.querySelector('.nav-btn[data-page="' + pageId + '"]');
  if (nb) nb.classList.add('active');
  if (pageId === 'community')     loadPosts();
  if (pageId === 'messages')      loadConversationList();
  if (pageId === 'notifications') loadNotifications();
  if (pageId === 'profile')       loadProfile();
  if (pageId === 'settings')      loadSettings();
  window.scrollTo(0, 0);
}

// ── Modals ────────────────────────────────────────────────────────────────────
function showModal(id)  { const el = document.getElementById(id); if (el) el.classList.add('open'); }
function closeModal(id) { const el = document.getElementById(id); if (el) el.classList.remove('open'); }

// ── Navbar ────────────────────────────────────────────────────────────────────
function updateNavbar() {
  const loginBtn   = document.getElementById('btn-login-top');
  const logoutBtn  = document.getElementById('btn-logout-top');
  const userDisplay= document.getElementById('topbar-user');
  if (GHF.currentUser) {
    if (loginBtn)    loginBtn.style.display  = 'none';
    if (logoutBtn)   logoutBtn.style.display = 'inline-flex';
    if (userDisplay) userDisplay.textContent = GHF.currentUser.name.split(' ')[0];
  } else {
    if (loginBtn)    loginBtn.style.display  = 'inline-flex';
    if (logoutBtn)   logoutBtn.style.display = 'none';
    if (userDisplay) userDisplay.textContent = '';
  }
  updateNotifBadge();
}

function updateNotifBadge() {
  const badge = document.getElementById('notif-badge');
  if (!badge) return;
  const unread = lsGet('ghf_notifications', []).filter(n => !n.read).length;
  badge.textContent = unread;
  badge.style.display = unread > 0 ? 'flex' : 'none';
}

function onLogin() {
  closeModal('auth-modal');
  updateNavbar();
  loadPosts();
}

// ── Posts ─────────────────────────────────────────────────────────────────────
function renderBadges(badges = []) {
  const labels = { founder: '👑 Founder', member: '💚 Member', trusted: '🔵 Trusted', verified: '✅ Verified' };
  return badges.map(b => `<span class="badge ${b}">${labels[b] || b}</span>`).join(' ');
}

function renderComment(c) {
  const initials = (c.author || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  return `<div class="comment">
    <div class="avatar">${initials}</div>
    <div class="comment-body">
      <div class="comment-author">${sanitize(c.author)}</div>
      <div class="comment-text">${sanitize(c.text)}</div>
      <div class="comment-time">${formatTime(c.time)}</div>
    </div>
  </div>`;
}

function renderPost(p) {
  const liked = GHF.currentUser && p.likes.includes(GHF.currentUser.uid);
  const initials = (p.author || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const imageHtml = p.image ? `<img src="${p.image}" class="post-image" alt="Post image" loading="lazy" />` : '';
  const ownPost = GHF.currentUser && GHF.currentUser.uid === p.uid;
  return `<div class="card" id="post-${p.id}">
    <div class="post-header">
      <div class="avatar">${initials}</div>
      <div class="post-meta">
        <div class="post-author">${sanitize(p.author)} ${renderBadges(p.badges)}</div>
        <div class="post-time">${formatTime(p.time)}</div>
      </div>
    </div>
    <div class="post-body">${sanitize(p.text)}</div>
    ${imageHtml}
    <div class="post-actions">
      <button class="action-btn ${liked ? 'liked' : ''}" onclick="toggleLike('${p.id}')">💚 ${p.likes.length}</button>
      <button class="action-btn" onclick="toggleComments('${p.id}')">💬 ${p.comments.length}</button>
      ${ownPost ? `<button class="action-btn" onclick="deletePost('${p.id}')">🗑</button>` : ''}
    </div>
    <div id="comments-${p.id}" style="display:none;margin-top:14px;">
      ${p.comments.map(renderComment).join('')}
      ${GHF.currentUser
        ? `<div class="comment-input-row">
             <input type="text" id="ci-${p.id}" placeholder="Write a comment…" maxlength="300"
               onkeydown="if(event.key==='Enter')addComment('${p.id}')" />
             <button class="btn btn-sm" onclick="addComment('${p.id}')">Post</button>
           </div>`
        : '<p style="color:#666;font-size:0.8rem;margin-top:8px;">Sign in to comment</p>'}
    </div>
  </div>`;
}

function loadPosts(filter = '') {
  const container = document.getElementById('posts-container');
  if (!container) return;
  let posts = lsGet('ghf_posts', []);
  if (filter) posts = posts.filter(p =>
    p.text.toLowerCase().includes(filter.toLowerCase()) ||
    p.author.toLowerCase().includes(filter.toLowerCase())
  );
  posts = posts.slice().reverse();
  container.innerHTML = posts.length === 0
    ? '<div class="empty-state"><div class="empty-icon">📭</div>No posts yet. Be the first!</div>'
    : posts.map(renderPost).join('');
}

function toggleComments(postId) {
  const el = document.getElementById('comments-' + postId);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function toggleLike(postId) {
  if (!GHF.currentUser) { showModal('auth-modal'); return; }
  const posts = lsGet('ghf_posts', []);
  const p = posts.find(x => x.id === postId);
  if (!p) return;
  const idx = p.likes.indexOf(GHF.currentUser.uid);
  if (idx === -1) p.likes.push(GHF.currentUser.uid);
  else p.likes.splice(idx, 1);
  lsSet('ghf_posts', posts);
  loadPosts(document.getElementById('post-search') ? document.getElementById('post-search').value : '');
}

function addComment(postId) {
  if (!GHF.currentUser) { showModal('auth-modal'); return; }
  const input = document.getElementById('ci-' + postId);
  const text = input ? input.value.trim() : '';
  if (!text) return;
  const posts = lsGet('ghf_posts', []);
  const p = posts.find(x => x.id === postId);
  if (!p) return;
  p.comments.push({ uid: GHF.currentUser.uid, author: GHF.currentUser.name, text, time: Date.now() });
  lsSet('ghf_posts', posts);
  if (input) input.value = '';
  loadPosts();
}

function deletePost(postId) {
  if (!GHF.currentUser) return;
  const posts = lsGet('ghf_posts', []).filter(p => !(p.id === postId && p.uid === GHF.currentUser.uid));
  lsSet('ghf_posts', posts);
  loadPosts();
}

function submitPost() {
  if (!GHF.currentUser) { showModal('auth-modal'); return; }
  const textarea = document.getElementById('post-text');
  const text = textarea ? textarea.value.trim() : '';
  if (!text) return;
  const imgPreview = document.getElementById('image-preview');
  const image = imgPreview && imgPreview.style.display !== 'none' ? imgPreview.src : '';
  const posts = lsGet('ghf_posts', []);
  posts.push({
    id: 'p' + Date.now(), uid: GHF.currentUser.uid,
    author: GHF.currentUser.name, badges: GHF.currentUser.badges || ['member'],
    text, image, likes: [], comments: [], time: Date.now()
  });
  lsSet('ghf_posts', posts);
  if (textarea) textarea.value = '';
  if (imgPreview) { imgPreview.src = ''; imgPreview.style.display = 'none'; }
  loadPosts();
}

function handleImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { alert('Please select an image file.'); return; }
  if (file.size > 5 * 1024 * 1024) { alert('Image must be under 5MB.'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    const preview = document.getElementById('image-preview');
    if (preview) { preview.src = e.target.result; preview.style.display = 'block'; }
  };
  reader.readAsDataURL(file);
}

// ── Messaging ─────────────────────────────────────────────────────────────────
function loadConversationList() {
  const container = document.getElementById('chat-list');
  if (!container) return;
  if (!GHF.currentUser) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">💬</div>Sign in to view messages</div>';
    return;
  }
  const messages = lsGet('ghf_messages', {});
  const users    = lsGet('ghf_users', {});
  const myUid    = GHF.currentUser.uid;
  const convos   = [];
  for (const key of Object.keys(messages)) {
    if (!key.includes(myUid)) continue;
    const parts    = key.split('_');
    const otherUid = parts[0] === myUid ? parts[1] : parts[0];
    const other    = Object.values(users).find(u => u.uid === otherUid);
    if (!other) continue;
    const msgs = messages[key];
    convos.push({ key, other, last: msgs[msgs.length - 1] });
  }
  if (convos.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">💬</div>No conversations yet.</div>';
    return;
  }
  container.innerHTML = convos.map(c => {
    const initials = c.other.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    return `<div class="chat-list-item" onclick="openChat('${c.key}','${c.other.uid}')">
      <div class="avatar">${initials}</div>
      <div class="info">
        <div class="name">${sanitize(c.other.name)}</div>
        <div class="preview">${sanitize(c.last ? c.last.text.slice(0, 40) : '')}</div>
      </div>
      <div class="time">${c.last ? formatTime(c.last.time) : ''}</div>
    </div>`;
  }).join('');
}

function openChat(convoKey, otherUid) {
  const other = Object.values(lsGet('ghf_users', {})).find(u => u.uid === otherUid);
  if (!other) return;
  document.getElementById('chat-list-view').style.display = 'none';
  const win = document.getElementById('chat-window-view');
  win.classList.add('open');
  win.dataset.convoKey = convoKey;
  document.getElementById('chat-partner-name').textContent = other.name;
  renderChatMessages(convoKey);
}

function closeChat() {
  document.getElementById('chat-list-view').style.display = 'block';
  document.getElementById('chat-window-view').classList.remove('open');
}

function renderChatMessages(convoKey) {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  const msgs = (lsGet('ghf_messages', {}))[convoKey] || [];
  if (msgs.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding:20px">Say hello! 👋</div>';
    return;
  }
  container.innerHTML = msgs.map(m => {
    const isMine = GHF.currentUser && m.from === GHF.currentUser.uid;
    return `<div class="message-bubble ${isMine ? 'sent' : 'received'}">${sanitize(m.text)}</div>`;
  }).join('');
  container.scrollTop = container.scrollHeight;
}

function sendMessage() {
  if (!GHF.currentUser) return;
  const win   = document.getElementById('chat-window-view');
  const input = document.getElementById('chat-input');
  if (!win || !input) return;
  const text = input.value.trim();
  if (!text) return;
  const convoKey = win.dataset.convoKey;
  const messages = lsGet('ghf_messages', {});
  if (!messages[convoKey]) messages[convoKey] = [];
  messages[convoKey].push({ from: GHF.currentUser.uid, text, time: Date.now() });
  lsSet('ghf_messages', messages);
  input.value = '';
  renderChatMessages(convoKey);
}

// ── Notifications ─────────────────────────────────────────────────────────────
function loadNotifications() {
  const container = document.getElementById('notif-list');
  if (!container) return;
  if (!GHF.currentUser) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">🔔</div>Sign in to view notifications</div>';
    return;
  }
  const notes = lsGet('ghf_notifications', []);
  if (notes.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">🔔</div>No notifications yet</div>';
    return;
  }
  lsSet('ghf_notifications', notes.map(n => ({ ...n, read: true })));
  updateNotifBadge();
  container.innerHTML = notes.slice().reverse().map(n => `
    <div class="notif-item ${n.read ? '' : 'unread'}">
      <div class="notif-icon">${n.icon}</div>
      <div>
        <div class="notif-text">${n.text}</div>
        <div class="notif-time">${formatTime(n.time)}</div>
      </div>
    </div>`).join('');
}

// ── Profile ───────────────────────────────────────────────────────────────────
function loadProfile() {
  const container = document.getElementById('profile-content');
  if (!container) return;
  if (!GHF.currentUser) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">👤</div>Sign in to view your profile</div>';
    return;
  }
  const u = GHF.currentUser;
  const posts = lsGet('ghf_posts', []).filter(p => p.uid === u.uid);
  const initials = u.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  container.innerHTML = `
    <div class="profile-header">
      <div class="profile-avatar" onclick="changeAvatar()">${u.avatar ? `<img src="${u.avatar}" alt="avatar" />` : initials}</div>
      <div class="profile-name">${sanitize(u.name)}</div>
      <div class="profile-bio">${sanitize(u.bio || 'No bio yet.')}</div>
      <div class="badge-row">${renderBadges(u.badges)}</div>
      <div class="profile-stats">
        <div class="stat"><div class="num">${posts.length}</div><div class="label">Posts</div></div>
        <div class="stat"><div class="num">${u.followers}</div><div class="label">Followers</div></div>
        <div class="stat"><div class="num">${u.following}</div><div class="label">Following</div></div>
      </div>
      <button class="btn btn-sm" onclick="showModal('edit-profile-modal')">Edit Profile</button>
    </div>
    <h3 style="color:#00C853;text-align:center;margin:10px 0 16px;">My Posts</h3>
    ${posts.length === 0 ? '<div class="empty-state">No posts yet</div>' : posts.slice().reverse().map(renderPost).join('')}`;
  document.getElementById('edit-name').value = u.name;
  document.getElementById('edit-bio').value  = u.bio || '';
}

function changeAvatar() {
  if (!GHF.currentUser) { showModal('auth-modal'); return; }
  document.getElementById('avatar-upload').click();
}

function handleAvatarUpload(event) {
  const file = event.target.files[0];
  if (!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = e => {
    const users = lsGet('ghf_users', {});
    users[GHF.currentUser.email].avatar = e.target.result;
    lsSet('ghf_users', users);
    GHF.currentUser.avatar = e.target.result;
    loadProfile();
  };
  reader.readAsDataURL(file);
}

function saveProfile() {
  if (!GHF.currentUser) return;
  const name = document.getElementById('edit-name').value.trim();
  const bio  = document.getElementById('edit-bio').value.trim();
  if (!name) { document.getElementById('edit-profile-error').textContent = 'Name cannot be empty.'; return; }
  const users = lsGet('ghf_users', {});
  users[GHF.currentUser.email].name = name;
  users[GHF.currentUser.email].bio  = bio;
  lsSet('ghf_users', users);
  GHF.currentUser.name = name;
  GHF.currentUser.bio  = bio;
  closeModal('edit-profile-modal');
  updateNavbar();
  loadProfile();
}

// ── Settings ──────────────────────────────────────────────────────────────────
function loadSettings() {
  const t = document.getElementById('toggle-dark');
  if (t) t.checked = GHF.darkMode;
}

function toggleDarkMode(val) {
  GHF.darkMode = val;
  document.body.classList.toggle('dark-mode', val);
  lsSet('ghf_darkmode', val);
}

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  seedData();
  GHF.darkMode = lsGet('ghf_darkmode', false);
  if (GHF.darkMode) document.body.classList.add('dark-mode');

  if (restoreSession()) {
    onLogin();
  } else {
    updateNavbar();
    setTimeout(() => showModal('auth-modal'), 4200);
  }

  showPage('home');

  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('open'); });
  });

  const chatInput = document.getElementById('chat-input');
  if (chatInput) chatInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });
});
