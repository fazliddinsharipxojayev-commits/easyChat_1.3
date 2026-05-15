/* ═══════════════════════════════════════════════════════════════
   EasyChat — script.js
   Full frontend logic: device select, auth, chats, posts, settings
═══════════════════════════════════════════════════════════════ */

const API = '';
let socket;
let currentUser = null;       // { userId, username, profilePic }
let currentChat = null;       // { chatId, otherUser }
let activeTab = 'home';
let typingTimer = null;
let activePostId = null;      // for comments modal
let onlineUserIds = [];
let currentLang = 'en';

const i18n = {
  en: {
    suggested: 'People you may know',
    dark_mode: 'Dark Mode',
    theme_desc: 'Switch between dark and light',
    language: 'Language',
    chats: 'Chats',
    search: 'Search',
    posts: 'Posts',
    profile: 'My Profile',
    settings: 'Settings',
    friends: 'Friends',
    message: 'Message',
    be_friends: 'Be Friends',
    remove: 'Remove',
    copy_link: 'Copy Link',
    no_chats: 'No conversations yet',
    no_chats_sub: 'Start a new chat below',
    no_posts: 'No posts yet',
    no_posts_sub: 'Be the first to share a photo!',
    online: '● Online',
    offline: '○ Offline',
    share_photo: 'Share a Photo',
    create_new_account: 'Create New Account',
    create_new_sub: 'Register a different account',
    log_into_other: 'Log Into Other Account',
    log_into_sub: 'Switch to a different account',
    log_out: 'Log Out',
    log_out_sub: 'Sign out of this account',
    search_users: 'Search users...',
    add_comment: 'Add a comment…',
    login: 'Sign In',
    register: 'Create Account',
    create_account: 'Create one'
  },
  uz: {
    suggested: 'Siz tanishingiz mumkin',
    dark_mode: 'Tungi rejim',
    theme_desc: 'Yorug\' va tungi rejimni almashtirish',
    language: 'Til',
    chats: 'Chatlar',
    search: 'Qidiruv',
    posts: 'Postlar',
    profile: 'Mening profilim',
    settings: 'Sozlamalar',
    friends: 'Do\'stlar',
    message: 'Xabar',
    be_friends: 'Do\'stlashish',
    remove: 'O\'chirish',
    copy_link: 'Nusxa olish',
    no_chats: 'Hali suhbatlar yo\'q',
    no_chats_sub: 'Quyida yangi suhbat boshlang',
    no_posts: 'Hali postlar yo\'q',
    no_posts_sub: 'Birinchi bo\'lib rasm ulashing!',
    online: '● Onlayn',
    offline: '○ Oflayn',
    share_photo: 'Rasm ulashish',
    create_new_account: 'Yangi hisob ochish',
    create_new_sub: 'Boshqa hisob ro\'yxatdan o\'tkazish',
    log_into_other: 'Boshqa hisobga kirish',
    log_into_sub: 'Boshqa hisobga almashtirish',
    log_out: 'Chiqish',
    log_out_sub: 'Bu hisobdan chiqish',
    search_users: 'Foydalanuvchilarni qidirish...',
    add_comment: 'Fikr bildirish…',
    login: 'Kirish',
    register: 'Ro\'yxatdan o\'tish',
    create_account: 'Hisob ochish'
  }
};

/* ─── INIT ──────────────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', () => {
  applyStoredTheme();
  applyStoredLang();

  const device = localStorage.getItem('ec_device');
  if (device) {
    applyDevice(device);
    // Force login every time by not calling checkSession() automatically
    // or by clearing the stored user session on load.
    localStorage.removeItem('ec_user'); 
    show('view-auth'); 
  } else {
    show('device-overlay');
  }
});

/* ─── DEVICE SELECTION ──────────────────────────────────────── */
function selectDevice(type) {
  localStorage.setItem('ec_device', type);
  applyDevice(type);
  hide('device-overlay');
  checkSession();
}

function applyDevice(type) {
  const app = document.getElementById('app');
  app.classList.remove('mode-mobile', 'mode-pc');
  app.classList.add(type === 'mobile' ? 'mode-mobile' : 'mode-pc');
}

/* ─── SESSION ───────────────────────────────────────────────── */
function checkSession() {
  const saved = localStorage.getItem('ec_user');
  if (saved) {
    currentUser = JSON.parse(saved);
    bootApp();
  } else {
    showAuth('login');
  }
}

function bootApp() {
  hide('auth-screen');
  hide('device-overlay');
  show('app');
  initSocket();
  updateSettingsProfile();
  
  // Check for deep link
  const urlParams = new URLSearchParams(window.location.search);
  const postId = urlParams.get('post');
  if (postId) {
    navigate('posts');
    openSinglePost(postId);
  } else {
    navigate('home');
  }
}

/* ─── AUTH ──────────────────────────────────────────────────── */
function showAuth(form) {
  hide('app');
  show('auth-screen');
  switchForm(form);
}

function switchForm(form) {
  if (form === 'login') {
    show('login-form'); hide('register-form');
    hide('login-error');
  } else {
    show('register-form'); hide('login-form');
    hide('reg-error');
  }
}

async function handleLogin() {
  const username = val('login-username').trim();
  const password = val('login-password');
  if (!username || !password) return showFormError('login-error', 'Please fill in all fields.');

  setButtonLoading('login-btn', true);
  try {
    const res = await post('/api/login', { username, password });
    if (res.error) return showFormError('login-error', res.error);
    currentUser = { userId: res.userId, username: res.username, profilePic: res.profilePic };
    localStorage.setItem('ec_user', JSON.stringify(currentUser));
    bootApp();
  } catch { showFormError('login-error', 'Network error. Try again.'); }
  finally { setButtonLoading('login-btn', false); }
}

async function handleRegister() {
  const username = val('reg-username').trim();
  const email = val('reg-email').trim();
  const password = val('reg-password');
  if (!username || !email || !password) return showFormError('reg-error', 'Please fill in all fields.');

  setButtonLoading('reg-btn', true);
  try {
    const res = await post('/api/register', { username, email, password });
    if (res.error) return showFormError('reg-error', res.error);
    currentUser = { userId: res.userId, username: res.username, profilePic: null };
    localStorage.setItem('ec_user', JSON.stringify(currentUser));
    bootApp();
  } catch { showFormError('reg-error', 'Network error. Try again.'); }
  finally { setButtonLoading('reg-btn', false); }
}

function handleLogout() {
  if (socket) socket.disconnect();
  currentUser = null;
  localStorage.removeItem('ec_user');
  closeChat();
  closeComments();
  showAuth('login');
  toast('Logged out');
}

function goCreateAccount() {
  if (socket) socket.disconnect();
  currentUser = null;
  localStorage.removeItem('ec_user');
  closeChat();
  closeComments();
  showAuth('register');
}

function goSwitchAccount() {
  if (socket) socket.disconnect();
  currentUser = null;
  localStorage.removeItem('ec_user');
  closeChat();
  closeComments();
  showAuth('login');
}

/* ─── SOCKET.IO ─────────────────────────────────────────────── */
function initSocket() {
  socket = io();
  socket.emit('userOnline', currentUser.userId);

  socket.on('onlineUsers', (ids) => {
    onlineUserIds = ids.map(String);
    updateOnlineStatus();
  });

  socket.on('receiveMessage', (msg) => {
    if (msg.type === 'system' && msg.content.startsWith('MSG_DELETED:')) {
      const msgId = msg.content.split(':')[1];
      const el = document.getElementById(`msg-${msgId}`);
      if (el) el.remove();
      return;
    }
    if (currentChat && msg.chat_id === currentChat.chatId) {
      appendMessage(msg);
      scrollMessages();
    } else {
      // Show in-app notification if message is from someone else
      showInAppNotification(msg.sender_name || 'Someone');
    }
    loadChats(); // refresh chat list preview
  });

  socket.on('typing', ({ username }) => {
    if (currentChat) {
      const el = document.getElementById('typing-indicator');
      el.classList.remove('hidden');
      scrollMessages();
    }
  });

  socket.on('stopTyping', () => {
    document.getElementById('typing-indicator').classList.add('hidden');
  });
}

/* ─── NAVIGATION ─────────────────────────────────────────────── */
function navigate(tab) {
  activeTab = tab;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  const view = document.getElementById(`view-${tab}`);
  const btn = document.getElementById(`nav-${tab}`);
  if (view) view.classList.add('active');
  if (btn) btn.classList.add('active');

  // Top bar title + actions
  const titles = { 
    home: t('chats'), 
    search: t('search'), 
    posts: t('posts'), 
    profile: t('profile'), 
    settings: t('settings') 
  };
  document.getElementById('top-title').textContent = titles[tab] || '';
  renderTopActions(tab);

  if (tab === 'home') { loadChats(); loadSuggestedUsers(); }
  if (tab === 'search') {
    document.getElementById('search-input').focus();
    loadSearchSuggestions();
  }
  if (tab === 'posts') loadPosts();
  if (tab === 'profile') loadMyProfile();
  if (tab === 'settings') updateSettingsProfile();
}

function renderTopActions(tab) {
  const wrap = document.getElementById('top-actions');
  wrap.innerHTML = '';
  if (tab === 'posts') {
    wrap.innerHTML = `<button class="top-icon-btn" onclick="triggerPostUpload()" title="New post"><i class="fas fa-plus"></i></button>`;
  }
  if (tab === 'profile') {
    wrap.innerHTML = `<button class="top-icon-btn" onclick="triggerAvatarUploadProfile()" title="Change photo"><i class="fas fa-camera"></i></button>`;
  }
}

/* ─── CHATS LIST ─────────────────────────────────────────────── */
async function loadChats() {
  if (!currentUser) return;
  try {
    const chats = await get(`/api/chats/${currentUser.userId}`);
    const list = document.getElementById('chat-list');
    const empty = document.getElementById('chats-empty');
    list.innerHTML = '';
    
    if (!chats.length) { 
      show('chats-empty'); 
      return; 
    }
    
    hide('chats-empty');
    chats.forEach(c => {
      const isOnline = onlineUserIds.includes(String(c.other_user_id));
      const li = document.createElement('li');
      li.className = 'chat-item';
      li.onclick = () => openChat(c.chat_id, { userId: c.other_user_id, username: c.username, profilePic: c.profilePic });
      
      // Long press / right click to delete chat
      li.oncontextmenu = (e) => {
        e.preventDefault();
        if (confirm('Delete this chat? (Only for you)')) {
          deleteChat(c.chat_id);
        }
      };

      li.innerHTML = `
        <div class="chat-avatar" onclick="event.stopPropagation(); viewOtherProfile(${c.other_user_id},'${esc(c.username)}','${c.profilePic||''}')">
          <img src="${avatarSrc(c.profilePic, c.username)}" alt="${c.username}">
          ${isOnline ? '<div class="online-dot"></div>' : ''}
        </div>
        <div class="chat-info">
          <div class="chat-name">${esc(c.username)}</div>
          <div class="chat-preview">${esc(c.last_message || 'Start chatting…')}</div>
        </div>
        <div class="chat-meta"><span>${timeAgo(c.updated_at)}</span></div>`;
      list.appendChild(li);
    });
  } catch(e) { console.error(e); }
}

async function loadSuggestedUsers() {
  const container = document.getElementById('suggested-list');
  container.innerHTML = '';
  try {
    const suggested = await get(`/api/users/suggested/${currentUser.userId}`);
    suggested.forEach(u => {
      const div = document.createElement('div');
      div.className = 'user-item';
      div.innerHTML = `
        <div class="user-avatar" onclick="viewOtherProfile(${u.id},'${esc(u.username)}','${u.profilePic||''}')" style="cursor:pointer">
          <img src="${avatarSrc(u.profilePic, u.username)}" alt="${u.username}">
        </div>
        <div class="user-info" onclick="viewOtherProfile(${u.id},'${esc(u.username)}','${u.profilePic||''}')" style="cursor:pointer">
          <strong>${esc(u.username)}</strong>
          <small>Suggested</small>
        </div>
        <button class="msg-user-btn" onclick="startChatWith(${u.id},'${esc(u.username)}','${u.profilePic||''}')">
          <i class="fas fa-paper-plane"></i>
        </button>`;
      container.appendChild(div);
    });
  } catch(e) { console.error(e); }
}

function handleHomeSearch() {
  const q = document.getElementById('home-search-input').value.trim();
  if (q.length > 0) {
    navigate('search');
    const searchInput = document.getElementById('search-input');
    searchInput.value = q;
    handleSearch();
  }
}

function updateOnlineStatus() {
  document.querySelectorAll('.chat-item').forEach(item => {
    // re-render dots on next loadChats
  });
}

/* ─── OPEN / CLOSE CHAT ─────────────────────────────────────── */
async function openChat(chatId, otherUser) {
  currentChat = { chatId, otherUser };
  const room = document.getElementById('chat-room');
  room.classList.remove('hidden');
  setTimeout(() => room.classList.add('open'), 10);

  document.getElementById('chat-header-name').textContent = otherUser.username;
  const pic = document.getElementById('chat-header-pic');
  pic.src = avatarSrc(otherUser.profilePic, otherUser.username);
  pic.onclick = () => { closeChat(); viewOtherProfile(otherUser.userId, esc(otherUser.username), otherUser.profilePic); };
  pic.style.cursor = 'pointer';

  const statusEl = document.getElementById('chat-status');
  const isOnline = onlineUserIds.includes(String(otherUser.userId));
  statusEl.textContent = isOnline ? '● Online' : '○ Offline';
  statusEl.className = 'chat-status-dot' + (isOnline ? ' online' : '');

  socket.emit('joinChat', chatId);
  document.getElementById('chat-messages').innerHTML = '';
  document.getElementById('typing-indicator').classList.add('hidden');

  try {
    const msgs = await get(`/api/messages/${chatId}?userId=${currentUser.userId}`);
    msgs.forEach(m => appendMessage(m));
    scrollMessages();
  } catch(e) { console.error(e); }

  document.getElementById('msg-input').focus();
}

function closeChat() {
  const room = document.getElementById('chat-room');
  room.classList.remove('open');
  setTimeout(() => {
    room.classList.add('hidden');
    if (currentChat && socket) {
      socket.emit('leaveChat', currentChat.chatId);
      socket.emit('stopTyping', { chatId: currentChat.chatId });
    }
    currentChat = null;
    document.getElementById('chat-messages').innerHTML = '';
  }, 310);
}

/* ─── MESSAGES ──────────────────────────────────────────────── */
function appendMessage(msg) {
  const wrap = document.createElement('div');
  const isMe = String(msg.sender_id) === String(currentUser.userId);
  wrap.className = `msg-wrap ${isMe ? 'me' : 'them'}`;
  wrap.id = `msg-${msg.id}`;

  // Long press / right click to delete message
  wrap.oncontextmenu = (e) => {
    e.preventDefault();
    showDeleteMessageMenu(msg.id, isMe);
  };

  const clickAttr = isMe ? `onclick="navigate('profile')"` : `onclick="viewOtherProfile(${currentChat.otherUser.userId},'${esc(currentChat.otherUser.username)}','${currentChat.otherUser.profilePic}')"`;
  const avatar = `<img class="msg-avatar" src="${isMe ? avatarSrc(currentUser.profilePic, currentUser.username) : avatarSrc(currentChat.otherUser.profilePic, currentChat.otherUser.username)}" alt="avatar" style="cursor:pointer" ${clickAttr}>`;

  let content = '';
  if (msg.type === 'image') {
    if (msg.content.startsWith('FWD:')) {
      const parts = msg.content.substring(4).split('|');
      const url = parts[0];
      const posterId = parts[1];
      const posterName = parts[2];
      const posterPic = parts[3];
      content = `
        <img class="msg-image" src="${url}" alt="image" onclick="openImageFull('${url}')">
        <div class="fwd-poster-wrap" onclick="viewOtherProfile(${posterId},'${esc(posterName)}','${posterPic}')">
          <img class="fwd-poster-avatar" src="${avatarSrc(posterPic, posterName)}" alt="poster">
          <div class="fwd-poster-info">By <strong>${esc(posterName)}</strong></div>
        </div>`;
    } else {
      content = `<img class="msg-image" src="${msg.content}" alt="image" onclick="openImageFull('${msg.content}')">`;
    }
  } else {
    content = `<div class="msg-bubble">${esc(msg.content)}</div>`;
  }

  wrap.innerHTML = `
    ${avatar}
    <div class="msg-content-wrap">
      <div class="msg-bubble-container">
        ${content}
      </div>
      <span class="msg-time">${formatTime(msg.created_at)}</span>
    </div>`;
  document.getElementById('chat-messages').appendChild(wrap);
}

function showDeleteMessageMenu(msgId, isMe) {
  const options = ['Delete for me'];
  if (isMe) options.push('Delete for both');
  
  const choice = prompt(`Select deletion option for this message:\n1. Delete for me${isMe ? '\n2. Delete for both' : ''}`);
  if (choice === '1') {
    deleteMessage(msgId, false);
  } else if (choice === '2' && isMe) {
    deleteMessage(msgId, true);
  }
}

async function deleteMessage(msgId, forBoth) {
  try {
    await post(`/api/messages/${msgId}/delete`, { userId: currentUser.userId, forBoth });
    const el = document.getElementById(`msg-${msgId}`);
    if (el) el.remove();
    toast('Message deleted', 'success');
    if (forBoth) socket.emit('sendMessage', { chatId: currentChat.chatId, senderId: currentUser.userId, content: 'MSG_DELETED:' + msgId, type: 'system' });
  } catch(e) { toast('Could not delete message', 'error'); }
}

async function deleteChat(chatId) {
  try {
    await post(`/api/chats/${chatId}/delete`, { userId: currentUser.userId });
    loadChats();
    toast('Chat deleted', 'success');
  } catch(e) { toast('Could not delete chat', 'error'); }
}

function scrollMessages() {
  const el = document.getElementById('chat-messages');
  el.scrollTop = el.scrollHeight;
}

function handleMsgKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
}

function handleTyping() {
  if (!currentChat) return;
  socket.emit('typing', { chatId: currentChat.chatId, username: currentUser.username });
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => socket.emit('stopTyping', { chatId: currentChat.chatId }), 1500);
}

function sendMessage() {
  const input = document.getElementById('msg-input');
  const text = input.value.trim();
  if (!text || !currentChat) return;
  socket.emit('sendMessage', { chatId: currentChat.chatId, senderId: currentUser.userId, content: text, type: 'text' });
  input.value = '';
  socket.emit('stopTyping', { chatId: currentChat.chatId });
}

async function handleChatImageUpload(input) {
  if (!input.files[0] || !currentChat) return;
  const formData = new FormData();
  formData.append('image', input.files[0]);
  try {
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.imageUrl) {
      socket.emit('sendMessage', { chatId: currentChat.chatId, senderId: currentUser.userId, content: data.imageUrl, type: 'image' });
    } else { toast('Upload failed', 'error'); }
  } catch { toast('Upload failed', 'error'); }
  input.value = '';
}

/* ─── SEARCH ─────────────────────────────────────────────────── */
let searchDebounce = null;
async function handleSearch() {
  const q = document.getElementById('search-input').value.trim();
  const clearBtn = document.getElementById('clear-search');
  clearBtn.classList.toggle('hidden', !q);
  clearTimeout(searchDebounce);
  if (!q) { document.getElementById('search-results').innerHTML = ''; show('search-empty'); return; }
  hide('search-empty');
  searchDebounce = setTimeout(async () => {
    try {
      const users = await get(`/api/users/search?q=${encodeURIComponent(q)}&currentUserId=${currentUser.userId}`);
      renderSearchResults(users);
    } catch(e) { console.error(e); }
  }, 300);
}

function renderSearchResults(users) {
  const container = document.getElementById('search-results');
  container.innerHTML = '';
  if (!users.length) {
    container.innerHTML = `<div class="empty-state" style="height:200px"><i class="fas fa-user-slash"></i><p>No users found</p></div>`;
    return;
  }
  users.forEach(u => {
    const div = document.createElement('div');
    div.className = 'user-item';
    div.innerHTML = `
      <div class="user-avatar" onclick="viewOtherProfile(${u.id},'${esc(u.username)}','${u.profilePic||''}')" style="cursor:pointer">
        <img src="${avatarSrc(u.profilePic, u.username)}" alt="${u.username}">
      </div>
      <div class="user-info" onclick="viewOtherProfile(${u.id},'${esc(u.username)}','${u.profilePic||''}')" style="cursor:pointer">
        <strong>${esc(u.username)}</strong>
        <small>View profile</small>
      </div>
      <button class="msg-user-btn" onclick="startChatWith(${u.id},'${esc(u.username)}','${u.profilePic||''}')">
        <i class="fas fa-paper-plane"></i> Chat
      </button>`;
    container.appendChild(div);
  });
}

async function startChatWith(userId, username, profilePic) {
  try {
    const data = await post('/api/chats', { user1_id: currentUser.userId, user2_id: userId });
    navigate('home');
    await openChat(data.chatId, { userId, username, profilePic });
  } catch(e) { toast('Could not open chat', 'error'); }
}

/* ─── OTHER USER PROFILE ─────────────────────────────────────── */
let viewingUserId = null;

async function viewOtherProfile(userId, username, profilePic) {
  closeChat(); // Close chat if navigating from one
  if (String(userId) === String(currentUser.userId)) {
    navigate('profile');
    return;
  }
  viewingUserId = { userId, username, profilePic };

  // Switch to other-profile view
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-other-profile').classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('top-title').textContent = username;
  document.getElementById('top-actions').innerHTML = '';

  document.getElementById('other-profile-avatar').src = avatarSrc(profilePic, username);
  document.getElementById('other-profile-username').textContent = username;

  // Load friends count and status
  try {
    const fRes = await get(`/api/friends/${userId}`);
    document.getElementById('other-friends-count').textContent = fRes.length;
    document.getElementById('other-friends-stat').onclick = () => showFriendsList(userId);
    
    const check = await get(`/api/friends/check/${currentUser.userId}/${userId}`);
    const fBtn = document.getElementById('other-profile-friend-btn');
    if (check.friends) {
      fBtn.innerHTML = `<i class="fas fa-check"></i> <span data-t="friends">${t('friends')}</span>`;
      fBtn.style.background = 'var(--bg3)';
      fBtn.style.color = 'var(--text)';
    } else {
      fBtn.innerHTML = `<i class="fas fa-user-plus"></i> <span data-t="be_friends">${t('be_friends')}</span>`;
      fBtn.style.background = 'linear-gradient(135deg,var(--accent),var(--accent2))';
      fBtn.style.color = '#fff';
    }
  } catch(e) { console.error(e); }

  // Load their posts
  const grid = document.getElementById('other-posts-grid');
  const empty = document.getElementById('other-posts-empty');
  grid.innerHTML = '';
  hide('other-posts-empty');

  try {
    const posts = await get(`/api/posts?userId=${currentUser.userId}`);
    const userPosts = posts.filter(p => p.user_id === userId);
    document.getElementById('other-post-count').textContent = userPosts.length;
    if (!userPosts.length) { show('other-posts-empty'); return; }
    userPosts.forEach(p => grid.appendChild(buildGridItem(p)));
  } catch(e) { console.error(e); }
}

async function toggleFriendFromProfile() {
  if (!viewingUserId) return;
  const friendId = viewingUserId.userId;
  try {
    const check = await get(`/api/friends/check/${currentUser.userId}/${friendId}`);
    if (check.friends) {
      // Remove friend
      await post('/api/friends', { user1: currentUser.userId, user2: friendId }, 'DELETE');
    } else {
      // Add friend
      await post('/api/friends', { user1: currentUser.userId, user2: friendId });
    }
    // Refresh
    viewOtherProfile(viewingUserId.userId, viewingUserId.username, viewingUserId.profilePic);
  } catch(e) { console.error(e); }
}

async function startChatFromProfile() {
  if (!viewingUserId) return;
  const { userId, username, profilePic } = viewingUserId;
  try {
    const data = await post('/api/chats', { user1_id: currentUser.userId, user2_id: userId });
    navigate('home');
    await openChat(data.chatId, { userId, username, profilePic });
  } catch(e) { toast('Could not open chat', 'error'); }
}

/* ─── MY PROFILE PAGE ────────────────────────────────────────── */
async function loadMyProfile() {
  if (!currentUser) return;
  document.getElementById('profile-page-username').textContent = currentUser.username;
  document.getElementById('profile-page-avatar').src = avatarSrc(currentUser.profilePic, currentUser.username);

  try {
    const fRes = await get(`/api/friends/${currentUser.userId}`);
    document.getElementById('my-friends-count').textContent = fRes.length;
  } catch(e) {}

  const grid = document.getElementById('my-posts-grid');
  const empty = document.getElementById('my-posts-empty');
  grid.innerHTML = '';
  hide('my-posts-empty');

  try {
    const posts = await get(`/api/posts?userId=${currentUser.userId}`);
    const myPosts = posts.filter(p => p.user_id === currentUser.userId);
    document.getElementById('my-post-count').textContent = myPosts.length;
    if (!myPosts.length) { show('my-posts-empty'); return; }
    myPosts.forEach(p => grid.appendChild(buildGridItem(p)));
  } catch(e) { console.error(e); }
}

function buildGridItem(p) {
  const div = document.createElement('div');
  div.className = 'profile-grid-item';
  div.innerHTML = `
    <img src="${p.image_url}" alt="post" loading="lazy">
    <div class="grid-overlay">
      <span><i class="fas fa-heart"></i> ${p.like_count || 0}</span>
      <span><i class="fas fa-comment"></i> ${p.comment_count || 0}</span>
    </div>`;
  div.onclick = () => openImageFull(p.image_url);
  return div;
}

function triggerAvatarUploadProfile() {
  document.getElementById('avatar-upload-profile').click();
}

async function loadSearchSuggestions() {
  const container = document.getElementById('search-results');
  container.innerHTML = '';
  const q = document.getElementById('search-input').value.trim();
  if (q.length > 0) return; // Don't show suggestions if user is typing

  try {
    const users = await get(`/api/users/search?q=a&currentUserId=${currentUser.userId}`);
    // Show 5 random users
    const suggested = users.sort(() => 0.5 - Math.random()).slice(0, 5);
    
    if (suggested.length > 0) {
      const label = document.createElement('div');
      label.className = 'suggested-label';
      label.style.padding = '0 12px 10px';
      label.innerHTML = `<span>People you may know</span>`;
      container.appendChild(label);
      renderSearchResults(suggested);
    }
  } catch(e) { console.error(e); }
}

function clearSearch() {
  document.getElementById('search-input').value = '';
  document.getElementById('search-results').innerHTML = '';
  document.getElementById('clear-search').classList.add('hidden');
  loadSearchSuggestions();
}

/* ─── FRIENDS MODAL ──────────────────────────────────────────── */
async function showFriendsList(userId) {
  show('friends-modal');
  const list = document.getElementById('friends-list');
  list.innerHTML = '';
  try {
    const friends = await get(`/api/friends/${userId}`);
    if (!friends.length) {
      list.innerHTML = `<div style="text-align:center;color:var(--text3);padding:20px">No friends yet.</div>`;
      return;
    }
    const isMe = String(userId) === String(currentUser.userId);
    friends.forEach(f => {
      const div = document.createElement('div');
      div.className = 'user-item';
      div.innerHTML = `
        <div class="user-avatar" onclick="closeFriends(); viewOtherProfile(${f.id},'${esc(f.username)}','${f.profilePic||''}')" style="cursor:pointer">
          <img src="${avatarSrc(f.profilePic, f.username)}" alt="${f.username}">
        </div>
        <div class="user-info" onclick="closeFriends(); viewOtherProfile(${f.id},'${esc(f.username)}','${f.profilePic||''}')" style="cursor:pointer">
          <strong>${esc(f.username)}</strong>
        </div>
        ${isMe ? `<button class="remove-friend-btn" onclick="removeFriend(${f.id})"><span data-t="remove">${t('remove')}</span></button>` : ''}`;
      list.appendChild(div);
    });
  } catch(e) { console.error(e); }
}

function closeFriends() { hide('friends-modal'); }
function closeFriendsIfOutside(e) { if (e.target.id === 'friends-modal') closeFriends(); }

async function removeFriend(friendId) {
  if(!confirm('Remove friend?')) return;
  try {
    await post('/api/friends', { user1: currentUser.userId, user2: friendId }, 'DELETE');
    showFriendsList(currentUser.userId);
    loadMyProfile();
  } catch(e) { console.error(e); }
}

/* ─── POSTS ──────────────────────────────────────────────────── */
async function loadPosts() {
  try {
    const posts = await get(`/api/posts?userId=${currentUser.userId}`);
    const feed = document.getElementById('posts-feed');
    const empty = document.getElementById('posts-empty');
    feed.innerHTML = '';
    if (!posts.length) { show('posts-empty'); return; }
    hide('posts-empty');
    posts.forEach(p => feed.appendChild(buildPostCard(p)));
  } catch(e) { console.error(e); }
}

async function openSinglePost(postId) {
  try {
    const post = await get(`/api/posts/single/${postId}?userId=${currentUser?.userId||0}`);
    const feed = document.getElementById('posts-feed');
    feed.innerHTML = '';
    hide('posts-empty');
    feed.appendChild(buildPostCard(post));
  } catch(e) { toast('Post not found', 'error'); }
}

function buildPostCard(p) {
  const div = document.createElement('div');
  div.className = 'post-card';
  div.id = `post-${p.id}`;
  const liked = p.my_reaction === 'like';
  const disliked = p.my_reaction === 'dislike';
  div.innerHTML = `
    <div class="post-header">
      <div class="post-avatar"><img src="${avatarSrc(p.profilePic, p.username)}" alt="${p.username}"></div>
      <div class="post-user-info">
        <strong>${esc(p.username)}</strong>
        <small>${timeAgo(p.created_at)}</small>
      </div>
    </div>
    <div class="post-image" onclick="openImageFull('${p.image_url}')">
      <img src="${p.image_url}" alt="post" loading="lazy">
    </div>
    <div class="post-actions">
      <button class="post-action-btn ${liked ? 'liked' : ''}" onclick="reactPost(${p.id},'like')">
        <i class="fas fa-heart"></i> <span id="likes-${p.id}">${p.like_count}</span>
      </button>
      <button class="post-action-btn ${disliked ? 'disliked' : ''}" onclick="reactPost(${p.id},'dislike')">
        <i class="fas fa-thumbs-down"></i> <span id="dislikes-${p.id}">${p.dislike_count}</span>
      </button>
      <button class="post-action-btn post-comment-btn" onclick="openComments(${p.id})">
        <i class="fas fa-comment"></i> <span id="comments-count-${p.id}">${p.comment_count}</span>
      </button>
      <button class="post-action-btn" onclick="openForwardModal(${p.id}, '${p.image_url}', ${p.user_id}, '${esc(p.username)}', '${p.profilePic||''}')" style="margin-left:auto">
        <i class="fas fa-paper-plane"></i>
      </button>
    </div>
    ${p.caption ? `<div class="post-caption"><strong>${esc(p.username)}</strong>${esc(p.caption)}</div>` : ''}`;
  return div;
}

let activeForwardData = null;
async function openForwardModal(postId, imageUrl, posterId, posterName, posterPic) {
  activeForwardData = { imageUrl, posterId, posterName, posterPic };
  show('forward-modal');
  const list = document.getElementById('forward-list');
  list.innerHTML = '';
  try {
    const chats = await get(`/api/chats/${currentUser.userId}`);
    const friends = await get(`/api/friends/${currentUser.userId}`);
    const friendIds = friends.map(f => String(f.id));
    
    const friendChats = chats.filter(c => friendIds.includes(String(c.other_user_id)));

    if (!friendChats.length) {
      list.innerHTML = `<div style="text-align:center;color:var(--text3);padding:20px">You can only send posts to your friends.</div>`;
      return;
    }
    friendChats.forEach(c => {
      const div = document.createElement('div');
      div.className = 'user-item';
      div.innerHTML = `
        <div class="user-avatar">
          <img src="${avatarSrc(c.profilePic, c.username)}" alt="${c.username}">
        </div>
        <div class="user-info">
          <strong>${esc(c.username)}</strong>
        </div>
        <button class="forward-send-btn" onclick="forwardPostToChat(${c.chat_id}, ${c.other_user_id})">Send</button>`;
      list.appendChild(div);
    });
  } catch(e) { console.error(e); }
}

function closeForward() { hide('forward-modal'); }
function closeForwardIfOutside(e) { if (e.target.id === 'forward-modal') closeForward(); }

function forwardPostToChat(chatId, otherUserId) {
  if (!activeForwardData || !socket) return;
  const content = `FWD:${activeForwardData.imageUrl}|${activeForwardData.posterId}|${activeForwardData.posterName}|${activeForwardData.posterPic}`;
  socket.emit('sendMessage', { chatId, senderId: currentUser.userId, content: content, type: 'image' });
  closeForward();
  toast('Post sent!', 'success');
}

function triggerPostUpload() {
  document.getElementById('post-image-input').click();
}

async function handlePostUpload(input) {
  if (!input.files[0]) return;
  const caption = prompt('Add a caption (optional):') || '';
  const formData = new FormData();
  formData.append('image', input.files[0]);
  formData.append('userId', currentUser.userId);
  formData.append('caption', caption);
  try {
    const res = await fetch('/api/posts', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.success) { toast('Post shared! 🎉', 'success'); loadPosts(); }
    else toast(data.error || 'Upload failed', 'error');
  } catch { toast('Upload failed', 'error'); }
  input.value = '';
}

async function reactPost(postId, type) {
  try {
    const res = await post(`/api/posts/${postId}/like`, { userId: currentUser.userId, type });
    // Refresh counts
    const updated = await get(`/api/posts?userId=${currentUser.userId}`);
    const p = updated.find(x => x.id === postId);
    if (!p) return;
    document.getElementById(`likes-${postId}`).textContent = p.like_count;
    document.getElementById(`dislikes-${postId}`).textContent = p.dislike_count;
    // Update button states
    const card = document.getElementById(`post-${postId}`);
    const likeBtns = card.querySelectorAll('.post-action-btn');
    likeBtns[0].className = `post-action-btn ${p.my_reaction === 'like' ? 'liked' : ''}`;
    likeBtns[1].className = `post-action-btn ${p.my_reaction === 'dislike' ? 'disliked' : ''}`;
  } catch(e) { console.error(e); }
}

/* ─── COMMENTS ──────────────────────────────────────────────── */
async function openComments(postId) {
  activePostId = postId;
  show('comments-modal');
  document.getElementById('comments-list').innerHTML = '';
  document.getElementById('comment-input').value = '';
  try {
    const comments = await get(`/api/posts/${postId}/comments`);
    renderComments(comments);
  } catch(e) { console.error(e); }
  document.getElementById('comment-input').focus();
}

function renderComments(comments) {
  const list = document.getElementById('comments-list');
  list.innerHTML = '';
  if (!comments.length) {
    list.innerHTML = `<div style="text-align:center;color:var(--text3);padding:24px;font-size:13px">No comments yet. Be first!</div>`;
    return;
  }
  comments.forEach(c => {
    const div = document.createElement('div');
    div.className = 'comment-item';
    div.innerHTML = `
      <div class="comment-avatar"><img src="${avatarSrc(c.profilePic, c.username)}" alt="${c.username}"></div>
      <div class="comment-bubble">
        <strong>${esc(c.username)}</strong>
        <p>${esc(c.content)}</p>
      </div>`;
    list.appendChild(div);
  });
}

function closeComments() { hide('comments-modal'); activePostId = null; }
function closeCommentsIfOutside(e) { if (e.target.id === 'comments-modal') closeComments(); }

function handleCommentKey(e) { if (e.key === 'Enter') submitComment(); }

async function submitComment() {
  if (!activePostId) return;
  const input = document.getElementById('comment-input');
  const content = input.value.trim();
  if (!content) return;
  try {
    const comment = await post(`/api/posts/${activePostId}/comments`, { userId: currentUser.userId, content });
    if (comment.id) {
      const list = document.getElementById('comments-list');
      if (list.querySelector('[style]')) list.innerHTML = '';
      const div = document.createElement('div');
      div.className = 'comment-item';
      div.innerHTML = `
        <div class="comment-avatar"><img src="${avatarSrc(comment.profilePic, comment.username)}" alt="${comment.username}"></div>
        <div class="comment-bubble">
          <strong>${esc(comment.username)}</strong>
          <p>${esc(comment.content)}</p>
        </div>`;
      list.appendChild(div);
      input.value = '';
      // update count
      const el = document.getElementById(`comments-count-${activePostId}`);
      if (el) el.textContent = parseInt(el.textContent || 0) + 1;
    }
  } catch(e) { toast('Failed to post comment', 'error'); }
}

/* ─── SETTINGS ──────────────────────────────────────────────── */
function updateSettingsProfile() {
  if (!currentUser) return;
  document.getElementById('settings-username').textContent = currentUser.username;
  document.getElementById('settings-avatar').src = avatarSrc(currentUser.profilePic, currentUser.username);
  // Also update profile tab avatar if visible
  const profileAvatar = document.getElementById('profile-page-avatar');
  if (profileAvatar) profileAvatar.src = avatarSrc(currentUser.profilePic, currentUser.username);
}

function triggerAvatarUpload() { document.getElementById('avatar-upload-input').click(); }

async function handleAvatarUpload(input) {
  if (!input.files[0]) return;
  const formData = new FormData();
  formData.append('avatar', input.files[0]);
  try {
    const res = await fetch(`/api/users/${currentUser.userId}/avatar`, { method: 'POST', body: formData });
    const data = await res.json();
    if (data.profilePic) {
      currentUser.profilePic = data.profilePic;
      localStorage.setItem('ec_user', JSON.stringify(currentUser));
      updateSettingsProfile();
      // Refresh profile page avatar
      const pa = document.getElementById('profile-page-avatar');
      if (pa) pa.src = data.profilePic;
      toast('Profile picture updated! 🎉', 'success');
    } else { toast(data.error || 'Upload failed', 'error'); }
  } catch { toast('Failed to update avatar', 'error'); }
  input.value = '';
}

/* ─── THEME ──────────────────────────────────────────────────── */
function applyStoredTheme() {
  const theme = localStorage.getItem('ec_theme') || 'dark';
  if (theme === 'light') {
    document.body.classList.add('light-mode');
    document.getElementById('theme-toggle')?.classList.add('on');
    const icon = document.getElementById('theme-icon');
    if (icon) icon.className = 'fas fa-sun';
  }
}

function toggleTheme() {
  const body = document.body;
  const toggle = document.getElementById('theme-toggle');
  const icon = document.getElementById('theme-icon');
  const isLight = body.classList.toggle('light-mode');
  toggle.classList.toggle('on', isLight);
  icon.className = isLight ? 'fas fa-sun' : 'fas fa-moon';
  localStorage.setItem('ec_theme', isLight ? 'light' : 'dark');
}

/* ─── LANGUAGE ───────────────────────────────────────────────── */
function applyStoredLang() {
  const lang = localStorage.getItem('ec_lang') || 'en';
  changeLanguage(lang);
  const select = document.getElementById('lang-select');
  if (select) select.value = lang;
}

function changeLanguage(lang) {
  currentLang = lang;
  localStorage.setItem('ec_lang', lang);
  document.querySelectorAll('[data-t]').forEach(el => {
    const key = el.getAttribute('data-t');
    el.textContent = t(key);
  });
  
  // Update placeholders
  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.placeholder = t('search_users');
  const commentInput = document.getElementById('comment-input');
  if (commentInput) commentInput.placeholder = t('add_comment');

  // Update nav labels
  document.querySelector('#nav-home span').textContent = t('chats');
  document.querySelector('#nav-search span').textContent = t('search');
  document.querySelector('#nav-posts span').textContent = t('posts');
  document.querySelector('#nav-profile span').textContent = t('profile');
  document.querySelector('#nav-settings span').textContent = t('settings');
}

function t(key) {
  return i18n[currentLang][key] || key;
}

/* ─── PASSWORD TOGGLE ────────────────────────────────────────── */
function togglePassword(inputId, btn) {
  const input = document.getElementById(inputId);
  const isText = input.type === 'text';
  input.type = isText ? 'password' : 'text';
  btn.querySelector('i').className = isText ? 'fas fa-eye' : 'fas fa-eye-slash';
}

/* ─── IMAGE FULLSCREEN ───────────────────────────────────────── */
function openImageFull(src) {
  const overlay = document.createElement('div');
  overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:zoom-out`;
  const img = document.createElement('img');
  img.src = src;
  img.style.cssText = `max-width:95%;max-height:95%;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.8)`;
  overlay.appendChild(img);
  overlay.onclick = () => overlay.remove();
  document.getElementById('app-inner').appendChild(overlay);
}

/* ─── HELPERS ────────────────────────────────────────────────── */
function avatarSrc(pic, username) {
  if (pic) return pic;
  const initials = encodeURIComponent((username || 'U').charAt(0).toUpperCase());
  return `https://ui-avatars.com/api/?background=7c6eff&color=fff&name=${initials}&size=128`;
}

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  // Append UTC if not present to ensure correct parsing of SQLite timestamps
  const cleanDate = dateStr.includes(' ') && !dateStr.includes('Z') ? dateStr + ' UTC' : dateStr;
  const diff = (Date.now() - new Date(cleanDate).getTime()) / 1000;
  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff/60)}m`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h`;
  return `${Math.floor(diff/86400)}d`;
}

function formatTime(dateStr) {
  if (!dateStr) return '';
  const cleanDate = dateStr.includes(' ') && !dateStr.includes('Z') ? dateStr + ' UTC' : dateStr;
  const d = new Date(cleanDate);
  // Ensure we show the correct time by using toLocaleTimeString properly
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

let notifTimer;
function showInAppNotification(username) {
  const el = document.getElementById('in-app-notif');
  const text = document.getElementById('notif-text');
  text.textContent = `${username} sent u a message`;
  
  // Reset animation
  el.classList.remove('show');
  void el.offsetWidth; // force reflow
  el.classList.add('show');
  
  clearTimeout(notifTimer);
  notifTimer = setTimeout(() => {
    el.classList.remove('show');
  }, 2500);
}

function val(id) { return document.getElementById(id)?.value || ''; }
function show(id) { document.getElementById(id)?.classList.remove('hidden'); }
function hide(id) { document.getElementById(id)?.classList.add('hidden'); }

function showFormError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
}

function setButtonLoading(id, loading) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.disabled = loading;
  btn.style.opacity = loading ? '0.7' : '1';
}

let toastTimer;
function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.className = 'toast hidden', 2800);
}

async function get(url) {
  const res = await fetch(API + url);
  return res.json();
}

async function post(url, body, method = 'POST') {
  const res = await fetch(API + url, {
    method: method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return res.json();
}
