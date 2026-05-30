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
// Always force login on fresh load - move to top level for maximum effect
localStorage.removeItem('ec_user');
currentUser = null;

window.addEventListener('DOMContentLoaded', () => {
  applyStoredTheme();
  applyStoredLang();

  const device = localStorage.getItem('ec_device');
  if (device) {
    applyDevice(device);
    checkSession();
  } else {
    show('device-overlay');
  }
});

function handleLogout() {
  localStorage.removeItem('ec_user');
  location.reload();
}

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
  showAuth('register');
}

function goSwitchAccount() {
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
    if (msg.type === 'system') {
      if (msg.content.startsWith('MSG_DELETED:')) {
        const msgId = msg.content.split(':')[1];
        const el = document.getElementById(`msg-${msgId}`);
        if (el) el.remove();
        return;
      }
      if (msg.content.startsWith('MSG_SAVE_STATE:')) {
        const parts = msg.content.split(':');
        const msgId = parts[1];
        const saved = parts[2] === '1';
        const el = document.getElementById(`msg-${msgId}`);
        if (el) {
          el.dataset.saved = saved ? "1" : "0";
          const icon = document.getElementById(`msg-saved-icon-${msgId}`);
          if (icon) {
            if (saved) {
              icon.classList.remove('hidden');
            } else {
              icon.classList.add('hidden');
            }
          }
        }
        return;
      }
    }

    // Prevent duplicate processing (since messages now come via both chat room and user room)
    if (document.getElementById(`msg-${msg.id}`)) return;
    if (currentChat && String(msg.chat_id) === String(currentChat.chatId)) {
      appendMessage(msg);
      scrollMessages();
    } else {
      // Show in-app notification if message is from someone else and NOT in the active chat
      if (String(msg.sender_id) !== String(currentUser.userId)) {
        showInAppNotification(msg.sender_name || 'Someone');
      }
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

  if (tab === 'home') { loadChats(); }
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
    } else {
      hide('chats-empty');
    }
    loadSuggestedUsers();
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
  const container = document.getElementById('home-suggestions-list');
  if (!container) return;
  container.innerHTML = '';
  try {
    const suggested = await get(`/api/users/suggested/${currentUser.userId}`);
    if (suggested.length > 0) {
      show('home-suggestions');
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
    } else {
      hide('home-suggestions');
    }
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
  originalMessages.clear();
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
  if (document.getElementById(`msg-${msg.id}`)) return;
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
  } else if (msg.type === 'audio') {
    content = `<div class="msg-bubble voice-msg-bubble"><i class="fas fa-headphones" style="font-size:18px;margin-right:4px;"></i><audio controls src="${msg.content}" preload="metadata"></audio></div>`;
  } else {
    content = `<div class="msg-bubble">${esc(msg.content)}</div>`;
  }

  wrap.dataset.saved = msg.is_saved ? "1" : "0";

  wrap.innerHTML = `
    ${avatar}
    <div class="msg-content-wrap">
      <div class="msg-bubble-container">
        ${content}
      </div>
      <span class="msg-time">
        ${formatTime(msg.created_at)}
        <i class="fas fa-bookmark msg-saved-indicator ${msg.is_saved ? '' : 'hidden'}" id="msg-saved-icon-${msg.id}"></i>
      </span>
    </div>`;
  document.getElementById('chat-messages').appendChild(wrap);
}

let activeCtxMsgId = null;
let originalMessages = new Map();

function showDeleteMessageMenu(msgId, isMe) {
  activeCtxMsgId = msgId;
  const deleteBothBtn = document.getElementById('ctx-delete-both');
  if (isMe) {
    deleteBothBtn.style.display = 'flex';
  } else {
    deleteBothBtn.style.display = 'none';
  }

  const el = document.getElementById(`msg-${msgId}`);
  if (el) {
    const isSaved = el.dataset.saved === "1";
    document.getElementById('ctx-save-text').textContent = isSaved ? "Unsave this" : "Save this";
    const icon = document.querySelector('#ctx-save-msg i');
    if (icon) {
      icon.className = isSaved ? "fas fa-bookmark" : "far fa-bookmark";
    }
  }

  show('message-context-modal');
}

function closeMessageContext() {
  hide('message-context-modal');
}

function handleCtxDelete(forBoth) {
  if (activeCtxMsgId) {
    deleteMessage(activeCtxMsgId, forBoth);
    closeMessageContext();
  }
}

function openTranslationSettings() {
  closeMessageContext();
  switchAiTab('translate');
  show('ai-helper-modal');
}

function openAiHelperModal() {
  switchAiTab('translate');
  const outputEl = document.getElementById('ai-assistant-output');
  outputEl.innerHTML = `
    <div class="ai-placeholder">
      <i class="fas fa-comments"></i>
      <p>Output from AI assistant will appear here...</p>
    </div>`;
  show('ai-helper-modal');
}

function closeAiHelperModal() {
  hide('ai-helper-modal');
}

function switchAiTab(tab) {
  const translateBtn = document.getElementById('tab-translate-btn');
  const assistantBtn = document.getElementById('tab-assistant-btn');
  const translateContent = document.getElementById('ai-tab-translate');
  const assistantContent = document.getElementById('ai-tab-assistant');

  if (tab === 'translate') {
    translateBtn.classList.add('active');
    assistantBtn.classList.remove('active');
    translateContent.classList.remove('hidden');
    assistantContent.classList.add('hidden');
  } else {
    translateBtn.classList.remove('active');
    assistantBtn.classList.add('active');
    translateContent.classList.add('hidden');
    assistantContent.classList.remove('hidden');
  }
}

async function translateAllMessages() {
  if (!currentChat) return;

  const sourceLang = document.getElementById('translate-source').value;
  const targetLang = document.getElementById('translate-target').value;
  const translateBtn = document.getElementById('start-translation-btn');

  const msgElements = document.querySelectorAll('.msg-wrap');
  const textMessages = [];

  msgElements.forEach(el => {
    const bubble = el.querySelector('.msg-bubble');
    if (bubble) {
      const msgId = el.id.replace('msg-', '');
      if (!originalMessages.has(msgId)) {
        originalMessages.set(msgId, bubble.textContent.trim());
      }
      textMessages.push({
        id: msgId,
        content: originalMessages.get(msgId)
      });
    }
  });

  if (textMessages.length === 0) {
    toast('No text messages to translate', 'error');
    return;
  }

  translateBtn.disabled = true;
  translateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Translating…';

  try {
    const res = await fetch('/api/ai/translate-batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: textMessages,
        sourceLang,
        targetLang
      })
    });

    const translations = await res.json();
    if (translations.error) {
      toast(translations.error, 'error');
      return;
    }

    translations.forEach(t => {
      const el = document.getElementById(`msg-${t.id}`);
      if (el) {
        const bubble = el.querySelector('.msg-bubble');
        if (bubble) {
          bubble.innerHTML = `
            ${esc(t.translated)}
            <br>
            <span class="translation-badge">
              <i class="fas fa-robot"></i> Translated to ${targetLang}
              <span class="translation-revert-btn" onclick="event.stopPropagation(); revertMessage('${t.id}')">Revert</span>
            </span>
          `;
        }
      }
    });

    toast('Translation completed! 🎉', 'success');
    closeAiHelperModal();
  } catch (e) {
    console.error(e);
    toast('Translation failed', 'error');
  } finally {
    translateBtn.disabled = false;
    translateBtn.innerHTML = '<i class="fas fa-magic"></i> Translate Chat';
  }
}

function revertMessage(msgId) {
  const el = document.getElementById(`msg-${msgId}`);
  if (el && originalMessages.has(msgId)) {
    const bubble = el.querySelector('.msg-bubble');
    if (bubble) {
      bubble.textContent = originalMessages.get(msgId);
    }
  }
}

async function triggerAiAction(action) {
  if (!currentChat) return;

  const outputEl = document.getElementById('ai-assistant-output');
  outputEl.innerHTML = `
    <div class="ai-placeholder">
      <i class="fas fa-spinner fa-spin"></i>
      <p>AI is thinking...</p>
    </div>`;

  const msgElements = document.querySelectorAll('.msg-wrap');
  const chatHistory = [];
  msgElements.forEach(el => {
    const bubble = el.querySelector('.msg-bubble');
    const isMe = el.classList.contains('me');
    if (bubble) {
      const originalText = originalMessages.get(el.id.replace('msg-', '')) || bubble.textContent.trim();
      chatHistory.push({
        sender: isMe ? 'Me' : currentChat.otherUser.username,
        text: originalText.split('Translated to')[0].trim()
      });
    }
  });

  try {
    const res = await fetch('/api/ai/chat-helper', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action,
        chatHistory: chatHistory.slice(-20)
      })
    });

    const data = await res.json();
    if (data.error) {
      outputEl.innerHTML = `<div style="color:#ff6b6b; padding: 10px;">Error: ${esc(data.error)}</div>`;
      return;
    }

    outputEl.innerHTML = `<div class="ai-response-text" style="color:var(--text); font-size:13px; line-height:1.6; white-space:pre-wrap; text-align:left;">${esc(data.response)}</div>`;
  } catch(e) {
    console.error(e);
    outputEl.innerHTML = `<div style="color:#ff6b6b; padding: 10px;">Failed to get AI response.</div>`;
  }
}

async function askAiAssistant() {
  const inputEl = document.getElementById('ai-assistant-input');
  const promptText = inputEl.value.trim();
  if (!promptText) return;

  const outputEl = document.getElementById('ai-assistant-output');
  outputEl.innerHTML = `
    <div class="ai-placeholder">
      <i class="fas fa-spinner fa-spin"></i>
      <p>AI is thinking...</p>
    </div>`;

  const msgElements = document.querySelectorAll('.msg-wrap');
  const chatHistory = [];
  msgElements.forEach(el => {
    const bubble = el.querySelector('.msg-bubble');
    const isMe = el.classList.contains('me');
    if (bubble) {
      const originalText = originalMessages.get(el.id.replace('msg-', '')) || bubble.textContent.trim();
      chatHistory.push({
        sender: isMe ? 'Me' : currentChat.otherUser.username,
        text: originalText.split('Translated to')[0].trim()
      });
    }
  });

  try {
    const res = await fetch('/api/ai/chat-helper', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userPrompt: promptText,
        chatHistory: chatHistory.slice(-20)
      })
    });

    const data = await res.json();
    if (data.error) {
      outputEl.innerHTML = `<div style="color:#ff6b6b; padding: 10px;">Error: ${esc(data.error)}</div>`;
      return;
    }

    outputEl.innerHTML = `<div class="ai-response-text" style="color:var(--text); font-size:13px; line-height:1.6; white-space:pre-wrap; text-align:left;">${esc(data.response)}</div>`;
    inputEl.value = '';
  } catch(e) {
    console.error(e);
    outputEl.innerHTML = `<div style="color:#ff6b6b; padding: 10px;">Failed to get AI response.</div>`;
  }
}

function handleAiInputKey(e) {
  if (e.key === 'Enter') {
    askAiAssistant();
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

/* Voice Recording State */
let mediaRecorder = null;
let recordedBlob = null;
let recordingTimerInterval = null;
let recordingStartTime = null;

function startVoiceRecording() {
  if (!currentChat) return toast('Select a chat first', 'error');
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];
      mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
      mediaRecorder.onstop = () => {
        recordedBlob = new Blob(audioChunks, { type: 'audio/webm' });
        // Show recorded UI
        document.getElementById('chat-input-bar-recording').classList.add('hidden');
        document.getElementById('chat-input-bar-recorded').classList.remove('hidden');
        // Reset timer UI
        document.getElementById('recording-timer').textContent = '00:00';
        clearInterval(recordingTimerInterval);
      };
      mediaRecorder.start();
      // Switch UI to recording bar
      document.getElementById('chat-input-bar-default').classList.add('hidden');
      document.getElementById('chat-input-bar-recording').classList.remove('hidden');
      // Start timer
      recordingStartTime = Date.now();
      recordingTimerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
        const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const secs = String(elapsed % 60).padStart(2, '0');
        document.getElementById('recording-timer').textContent = `${mins}:${secs}`;
      }, 500);
    })
    .catch(err => {
      console.error('Microphone access denied', err);
      toast('Unable to access microphone', 'error');
    });
}

function cancelVoiceRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(t => t.stop());
  }
  // Reset UI
  document.getElementById('chat-input-bar-recording').classList.add('hidden');
  document.getElementById('chat-input-bar-recorded').classList.add('hidden');
  document.getElementById('chat-input-bar-default').classList.remove('hidden');
  clearInterval(recordingTimerInterval);
  document.getElementById('recording-timer').textContent = '00:00';
  recordedBlob = null;
}

function stopVoiceRecording() {
  if (!mediaRecorder) return;
  mediaRecorder.stop();
  mediaRecorder.stream.getTracks().forEach(t => t.stop());
  // UI will be switched in onstop handler
}

async function sendVoiceMessage() {
  if (!recordedBlob) return toast('No recording available', 'error');
  const formData = new FormData();
  formData.append('audio', recordedBlob, 'voice_message.webm');
  try {
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.audioUrl) {
      socket.emit('sendMessage', { chatId: currentChat.chatId, senderId: currentUser.userId, content: data.audioUrl, type: 'audio' });
      toast('Voice message sent', 'success');
    } else {
      toast('Upload failed', 'error');
    }
  } catch (e) {
    console.error(e);
    toast('Upload error', 'error');
  }
  // Reset UI back to default
  document.getElementById('chat-input-bar-recorded').classList.add('hidden');
  document.getElementById('chat-input-bar-default').classList.remove('hidden');
  recordedBlob = null;
}

async function transcribeVoiceMessage() {
  if (!recordedBlob) return toast('No recording to transcribe', 'error');
  const formData = new FormData();
  formData.append('audio', recordedBlob, 'voice_message.webm');
  try {
    const res = await fetch('/api/ai/transcribe', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.text) {
      const input = document.getElementById('msg-input');
      input.value = data.text;
      toast('Transcription loaded', 'success');
    } else {
      toast('Transcription failed', 'error');
    }
  } catch (e) {
    console.error(e);
    toast('Transcription error', 'error');
  }
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
    <img src="${p.image_url}" alt="post" loading="lazy" onclick="openImageFull('${p.image_url}')">
    <div class="post-stats-below">
      <span><i class="fas fa-heart"></i> ${p.like_count || 0}</span>
      <span><i class="fas fa-thumbs-down"></i> ${p.dislike_count || 0}</span>
      <span><i class="fas fa-comment"></i> ${p.comment_count || 0}</span>
      ${p.user_id === currentUser.userId ? `<button class="delete-post-btn" onclick="event.stopPropagation(); deletePost(${p.id})"><i class="fas fa-trash"></i></button>` : ''}
    </div>`;
  return div;
}

async function deletePost(postId) {
  if (!confirm('Are you sure you want to delete this post?')) return;
  try {
    const res = await post(`/api/posts/${postId}/delete`, { userId: currentUser.userId });
    if (res.success) {
      toast('Post deleted', 'success');
      // Refresh profile posts
      if (activeTab === 'profile') renderProfile();
      else if (activeTab === 'home') loadHomePosts();
    } else {
      toast(res.error || 'Failed to delete post', 'error');
    }
  } catch (e) {
    console.error(e);
    toast('Error deleting post', 'error');
  }
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
      <div class="post-avatar" onclick="viewOtherProfile(${p.user_id},'${esc(p.username)}','${p.profilePic||''}')" style="cursor:pointer">
        <img src="${avatarSrc(p.profilePic, p.username)}" alt="${p.username}">
      </div>
      <div class="post-user-info" onclick="viewOtherProfile(${p.user_id},'${esc(p.username)}','${p.profilePic||''}')" style="cursor:pointer">
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

let pendingUploadFile = null;
let pendingUploadType = 'chat'; // 'chat' or 'post'

async function handlePostUpload(input) {
  if (!input.files[0]) return;
  pendingUploadFile = input.files[0];
  pendingUploadType = 'post';
  
  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('image-preview-img').src = e.target.result;
    document.getElementById('preview-title').textContent = 'New Post';
    document.getElementById('confirm-btn-text').textContent = 'Share Post';
    document.getElementById('caption-wrap').classList.remove('hidden');
    show('image-preview-modal');
  };
  reader.readAsDataURL(pendingUploadFile);
}

function handleChatImageUpload(input) {
  if (!input.files[0]) return;
  pendingUploadFile = input.files[0];
  pendingUploadType = 'chat';
  
  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('image-preview-img').src = e.target.result;
    document.getElementById('preview-title').textContent = 'Send Photo';
    document.getElementById('confirm-btn-text').textContent = 'Send to Chat';
    document.getElementById('caption-wrap').classList.add('hidden');
    show('image-preview-modal');
  };
  reader.readAsDataURL(pendingUploadFile);
}

function closeImagePreview() {
  hide('image-preview-modal');
  pendingUploadFile = null;
  document.getElementById('post-image-input').value = '';
  document.getElementById('chat-image-input').value = '';
}

async function confirmImageUpload() {
  if (!pendingUploadFile) return;
  const btn = document.getElementById('confirm-upload-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading…';

  try {
    const formData = new FormData();
    formData.append('image', pendingUploadFile);

    if (pendingUploadType === 'post') {
      const caption = document.getElementById('post-caption-input').value.trim();
      formData.append('userId', currentUser.userId);
      formData.append('caption', caption);
      const res = await fetch('/api/posts', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) { 
        toast('Post shared! 🎉', 'success'); 
        loadPosts(); 
        closeImagePreview();
        document.getElementById('post-caption-input').value = '';
      } else {
        toast(data.error || 'Upload failed', 'error');
      }
    } else {
      // Chat upload
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.imageUrl) {
        socket.emit('sendMessage', { 
          chatId: currentChat.chatId, 
          senderId: currentUser.userId, 
          content: data.imageUrl, 
          type: 'image' 
        });
        closeImagePreview();
      } else {
        toast('Failed to upload image', 'error');
      }
    }
  } catch (e) {
    console.error(e);
    toast('Upload failed', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fas fa-paper-plane"></i> <span id="confirm-btn-text">${pendingUploadType === 'post' ? 'Share Post' : 'Send to Chat'}</span>`;
  }
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
      <div class="comment-avatar" onclick="closeComments(); viewOtherProfile(${c.user_id},'${esc(c.username)}','${c.profilePic||''}')" style="cursor:pointer">
        <img src="${avatarSrc(c.profilePic, c.username)}" alt="${c.username}">
      </div>
      <div class="comment-bubble">
        <strong onclick="closeComments(); viewOtherProfile(${c.user_id},'${esc(c.username)}','${c.profilePic||''}')" style="cursor:pointer">${esc(c.username)}</strong>
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
        <div class="comment-avatar" onclick="closeComments(); viewOtherProfile(${comment.user_id},'${esc(comment.username)}','${comment.profilePic||''}')" style="cursor:pointer">
          <img src="${avatarSrc(comment.profilePic, comment.username)}" alt="${comment.username}">
        </div>
        <div class="comment-bubble">
          <strong onclick="closeComments(); viewOtherProfile(${comment.user_id},'${esc(comment.username)}','${comment.profilePic||''}')" style="cursor:pointer">${esc(comment.username)}</strong>
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

/* ─── SAVED MESSAGES ────────────────────────────────────────── */
async function handleCtxSave() {
  if (!activeCtxMsgId) return;
  const el = document.getElementById(`msg-${activeCtxMsgId}`);
  if (!el) return;

  const isSaved = el.dataset.saved === "1";
  const newSavedState = !isSaved;

  try {
    const res = await post(`/api/messages/${activeCtxMsgId}/save`, { saved: newSavedState });
    if (res.success) {
      el.dataset.saved = newSavedState ? "1" : "0";
      const icon = document.getElementById(`msg-saved-icon-${activeCtxMsgId}`);
      if (icon) {
        if (newSavedState) {
          icon.classList.remove('hidden');
        } else {
          icon.classList.add('hidden');
        }
      }
      closeMessageContext();
      toast(newSavedState ? 'Message saved!' : 'Message unsaved', 'success');
      
      // Let other clients know via socket
      socket.emit('broadcastSaveState', {
        chatId: currentChat.chatId,
        msgId: activeCtxMsgId,
        saved: newSavedState
      });
    }
  } catch(e) {
    console.error(e);
    toast('Failed to update message save state', 'error');
  }
}

function openSavedMessagesModal() {
  if (!currentChat) return;
  show('saved-messages-modal');
  loadSavedMessages();
}

function closeSavedMessagesModal() {
  hide('saved-messages-modal');
}

async function loadSavedMessages() {
  const container = document.getElementById('saved-messages-list');
  container.innerHTML = `<div class="ai-placeholder"><i class="fas fa-spinner fa-spin"></i><p>Loading saved messages...</p></div>`;

  try {
    const messages = await get(`/api/messages/saved/${currentChat.chatId}?userId=${currentUser.userId}`);
    container.innerHTML = '';
    
    if (messages.length === 0) {
      container.innerHTML = `
        <div class="ai-placeholder">
          <i class="far fa-bookmark"></i>
          <p>No saved messages in this chat yet.</p>
        </div>`;
      return;
    }

    messages.forEach(msg => {
      const wrap = document.createElement('div');
      const isMe = String(msg.sender_id) === String(currentUser.userId);
      wrap.className = `msg-wrap ${isMe ? 'me' : 'them'}`;
      wrap.id = `saved-msg-${msg.id}`;

      const avatar = `<img class="msg-avatar" src="${isMe ? avatarSrc(currentUser.profilePic, currentUser.username) : avatarSrc(currentChat.otherUser.profilePic, currentChat.otherUser.username)}" alt="avatar">`;

      let content = '';
      if (msg.type === 'image') {
        if (msg.content.startsWith('FWD:')) {
          const parts = msg.content.substring(4).split('|');
          const url = parts[0];
          const posterName = parts[2];
          const posterPic = parts[3];
          content = `
            <img class="msg-image" src="${url}" alt="image" onclick="openImageFull('${url}')">
            <div class="fwd-poster-wrap">
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
          <span class="msg-time">
            ${formatTime(msg.created_at)}
            <span class="translation-revert-btn" onclick="unsaveFromModal(${msg.id})" style="margin-left: 8px; color: #ff6b6b; text-decoration: none;"><i class="fas fa-trash-alt"></i> Unsave</span>
          </span>
        </div>`;
      container.appendChild(wrap);
    });
  } catch(e) {
    console.error(e);
    container.innerHTML = `<div style="color:#ff6b6b; text-align:center; padding:20px;">Failed to load saved messages.</div>`;
  }
}

async function unsaveFromModal(msgId) {
  try {
    const res = await post(`/api/messages/${msgId}/save`, { saved: false });
    if (res.success) {
      const modalEl = document.getElementById(`saved-msg-${msgId}`);
      if (modalEl) modalEl.remove();

      const mainEl = document.getElementById(`msg-${msgId}`);
      if (mainEl) {
        mainEl.dataset.saved = "0";
        const icon = document.getElementById(`msg-saved-icon-${msgId}`);
        if (icon) icon.classList.add('hidden');
      }

      const container = document.getElementById('saved-messages-list');
      if (container.children.length === 0) {
        container.innerHTML = `
          <div class="ai-placeholder">
            <i class="far fa-bookmark"></i>
            <p>No saved messages in this chat yet.</p>
          </div>`;
      }
      toast('Message unsaved', 'success');
      
      // Let other clients know via socket
      socket.emit('broadcastSaveState', {
        chatId: currentChat.chatId,
        msgId: msgId,
        saved: false
      });
    }
  } catch (e) {
    console.error(e);
    toast('Failed to unsave message', 'error');
  }
}

/* ─── VOICE MESSAGES ─────────────────────────────────────────── */
let mediaRecorder;
let audioChunks = [];
let recordingTimerInterval;
let recordingSeconds = 0;
let recordedAudioBlob = null;

async function startVoiceRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
        sampleRate: 48000
      } 
    });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    recordedAudioBlob = null;
    
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };
    
    mediaRecorder.onstop = () => {
      recordedAudioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      stream.getTracks().forEach(track => track.stop());
    };
    
    mediaRecorder.start();
    
    // UI updates
    document.getElementById('chat-input-bar-default').classList.add('hidden');
    document.getElementById('chat-input-bar-recording').classList.remove('hidden');
    recordingSeconds = 0;
    updateRecordingTimer();
    recordingTimerInterval = setInterval(() => {
      recordingSeconds++;
      updateRecordingTimer();
    }, 1000);
    
  } catch(e) {
    console.error(e);
    toast('Microphone access denied', 'error');
  }
}

function updateRecordingTimer() {
  const mins = String(Math.floor(recordingSeconds / 60)).padStart(2, '0');
  const secs = String(recordingSeconds % 60).padStart(2, '0');
  document.getElementById('recording-timer').textContent = `${mins}:${secs}`;
}

function stopVoiceRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    clearInterval(recordingTimerInterval);
    document.getElementById('chat-input-bar-recording').classList.add('hidden');
    document.getElementById('chat-input-bar-recorded').classList.remove('hidden');
  }
}

function cancelVoiceRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  clearInterval(recordingTimerInterval);
  resetVoiceUI();
}

function resetVoiceUI() {
  recordedAudioBlob = null;
  document.getElementById('chat-input-bar-recorded').classList.add('hidden');
  document.getElementById('chat-input-bar-recording').classList.add('hidden');
  document.getElementById('chat-input-bar-default').classList.remove('hidden');
}

async function sendVoiceMessage() {
  if (!recordedAudioBlob) return;
  const formData = new FormData();
  formData.append('audio', recordedAudioBlob, 'voice.webm'); 

  try {
    const res = await fetch('/api/upload-audio', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.audioUrl) {
      socket.emit('sendMessage', { 
        chatId: currentChat.chatId, 
        senderId: currentUser.userId, 
        content: data.audioUrl, 
        type: 'audio' 
      });
      resetVoiceUI();
    } else {
      toast('Failed to upload audio', 'error');
    }
  } catch(e) {
    console.error(e);
    toast('Upload error', 'error');
  }
}

async function transcribeVoiceMessage() {
  if (!recordedAudioBlob) return;
  toast('Transcribing...', 'success');
  const formData = new FormData();
  formData.append('file', recordedAudioBlob, 'voice.webm');
  
  try {
    const res = await fetch('/api/ai/transcribe', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.text) {
      resetVoiceUI();
      document.getElementById('msg-input').value = data.text;
      document.getElementById('msg-input').focus();
    } else {
      toast(data.error || 'Failed to transcribe', 'error');
    }
  } catch(e) {
    console.error(e);
    toast('Transcription error', 'error');
  }
}

/* ─── GROUP CREATION ────────────────────────────────────────────── */
let selectedGroupFriends = new Set();

async function openGroupModal() {
  if (!currentUser) return;
  document.getElementById('group-name-input').value = '';
  selectedGroupFriends.clear();
  show('group-modal');
  
  const container = document.getElementById('group-friends-list');
  container.innerHTML = '<div class="ai-placeholder"><i class="fas fa-spinner fa-spin"></i></div>';
  
  try {
    const friends = await get(`/api/friends/${currentUser.userId}`);
    container.innerHTML = '';
    if (!friends || friends.length === 0) {
      container.innerHTML = '<p style="text-align:center;color:var(--text-muted);font-size:14px;padding:12px;">No friends found to add.</p>';
      return;
    }
    
    friends.forEach(f => {
      const wrap = document.createElement('div');
      wrap.className = 'group-friend-item';
      wrap.style.display = 'flex';
      wrap.style.alignItems = 'center';
      wrap.style.justifyContent = 'space-between';
      wrap.style.padding = '8px';
      wrap.style.borderBottom = '1px solid var(--border)';
      
      const left = document.createElement('div');
      left.style.display = 'flex';
      left.style.alignItems = 'center';
      left.style.gap = '8px';
      
      left.innerHTML = `
        <img src="${avatarSrc(f.profilePic, f.username)}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;">
        <span style="font-weight:600;font-size:14px;">${esc(f.username)}</span>
      `;
      
      const btn = document.createElement('button');
      btn.className = 'secondary-btn';
      btn.style.padding = '4px 12px';
      btn.style.fontSize = '12px';
      btn.textContent = 'Add';
      
      btn.onclick = () => {
        if (selectedGroupFriends.has(f.id)) {
          selectedGroupFriends.delete(f.id);
          btn.textContent = 'Add';
          btn.style.background = '';
          btn.style.color = '';
        } else {
          selectedGroupFriends.add(f.id);
          btn.textContent = 'Added';
          btn.style.background = 'var(--primary)';
          btn.style.color = '#fff';
        }
      };
      
      wrap.appendChild(left);
      wrap.appendChild(btn);
      container.appendChild(wrap);
    });
    
  } catch (e) {
    console.error(e);
    container.innerHTML = '<p style="text-align:center;color:#ff6b6b;font-size:14px;padding:12px;">Error loading friends.</p>';
  }
}

function closeGroupModal(e) {
  if (e && e.target.id !== 'group-modal' && e.target.className !== 'modal-close' && !e.target.closest('.modal-close')) {
    if (e.target.closest('.modal-content')) return;
  }
  hide('group-modal');
}

async function createGroup() {
  const name = document.getElementById('group-name-input').value.trim();
  if (!name) return toast('Please enter a group name', 'error');
  if (selectedGroupFriends.size === 0) return toast('Select at least one friend', 'error');
  
  const memberIds = Array.from(selectedGroupFriends);
  memberIds.push(currentUser.userId); // Add creator to group
  
  try {
    const res = await post('/api/create-group', {
      groupName: name,
      members: memberIds
    });
    if (res.success) {
      toast('Group created!', 'success');
      closeGroupModal();
      loadChats();
    } else {
      toast(res.error || 'Failed to create group', 'error');
    }
  } catch (e) {
    console.error(e);
    toast('Error creating group', 'error');
  }
}
