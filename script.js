// EasyChat - Frontend Only Implementation using LocalStorage

// --- LocalStorage "Database" Helpers ---
function getDb() {
  const db = localStorage.getItem('easychat_db');
  return db ? JSON.parse(db) : { users: [], chats: [], messages: [] };
}

function saveDb(db) {
  localStorage.setItem('easychat_db', JSON.stringify(db));
  // Dispatch an event so other tabs can sync
  window.dispatchEvent(new Event('localDbUpdate'));
}

// State
let currentUser = null;
let currentChatId = null;

// DOM Elements
const authView = document.getElementById('auth-view');
const appContainer = document.getElementById('app-container');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const topBarTitle = document.getElementById('top-bar-title');
const chatRoom = document.getElementById('chat-room');
const chatMessages = document.getElementById('chat-messages');

// Initialize
window.onload = () => {
  const savedUser = sessionStorage.getItem('currentUser');
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
    showApp();
  }
};

// Toggle Auth Mode
function toggleAuth() {
  if (loginForm.style.display === 'none') {
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
  } else {
    loginForm.style.display = 'none';
    registerForm.style.display = 'block';
  }
}

// Login
document.getElementById('login-btn').addEventListener('click', () => {
  const username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;
  
  if (!username || !password) return alert('Enter username and password');

  const db = getDb();
  const user = db.users.find(u => u.username === username && u.password === password);
  
  if (user) {
    currentUser = { id: user.id, username: user.username, profilePic: user.profilePic };
    sessionStorage.setItem('currentUser', JSON.stringify(currentUser));
    showApp();
  } else {
    alert('Invalid credentials');
  }
});

// Register
document.getElementById('reg-btn').addEventListener('click', () => {
  const username = document.getElementById('reg-username').value;
  const email = document.getElementById('reg-email').value;
  const password = document.getElementById('reg-password').value;
  
  if (!username || !email || !password) return alert('Enter all fields');

  const db = getDb();
  if (db.users.some(u => u.username === username)) {
    return alert('Username already exists');
  }

  const newUser = {
    id: Date.now().toString(),
    username,
    email,
    password,
    profilePic: 'https://via.placeholder.com/150'
  };

  db.users.push(newUser);
  saveDb(db);

  currentUser = { id: newUser.id, username: newUser.username, profilePic: newUser.profilePic };
  sessionStorage.setItem('currentUser', JSON.stringify(currentUser));
  showApp();
});

// Logout
document.getElementById('logout-btn').addEventListener('click', () => {
  sessionStorage.removeItem('currentUser');
  currentUser = null;
  appContainer.style.display = 'none';
  authView.style.display = 'flex';
});

function showApp() {
  authView.style.display = 'none';
  appContainer.style.display = 'flex';
  document.getElementById('my-username').innerText = currentUser.username;
  document.getElementById('my-profile-pic').src = currentUser.profilePic || 'https://via.placeholder.com/150';
  loadChats();
}

// Navigation Tabs
window.showTab = function(tabId) {
  document.querySelectorAll('.tab-view').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
  
  document.getElementById(tabId).classList.add('active');
  
  if(tabId === 'messages-view') {
    topBarTitle.innerText = 'Messages';
    document.querySelectorAll('.nav-btn')[1].classList.add('active');
    loadChats();
  } else if(tabId === 'search-view') {
    topBarTitle.innerText = 'Search';
    document.querySelectorAll('.nav-btn')[2].classList.add('active');
  } else if(tabId === 'profile-view') {
    topBarTitle.innerText = 'Profile';
    document.querySelectorAll('.nav-btn')[0].classList.add('active');
  }
}

// Search Users
document.getElementById('search-input').addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase();
  const resultsDiv = document.getElementById('search-results');
  
  if (q.length < 1) {
    resultsDiv.innerHTML = '';
    return;
  }
  
  const db = getDb();
  const users = db.users.filter(u => u.username.toLowerCase().includes(q) && u.id !== currentUser.id);
  
  resultsDiv.innerHTML = '';
  users.forEach(u => {
    const div = document.createElement('div');
    div.className = 'search-result-item';
    div.innerHTML = `
      <img src="${u.profilePic}" onerror="this.src='https://via.placeholder.com/150'" class="profile-avatar medium">
      <span>${u.username}</span>
    `;
    div.onclick = () => showOtherProfile(u);
    resultsDiv.appendChild(div);
  });
});

let currentViewedUser = null;

window.showOtherProfile = function(user) {
  currentViewedUser = user;
  document.getElementById('other-username').innerText = user.username;
  document.getElementById('other-profile-pic').src = user.profilePic;
  
  document.querySelectorAll('.tab-view').forEach(t => t.classList.remove('active'));
  document.getElementById('other-profile-view').classList.add('active');
  topBarTitle.innerText = user.username;
}

// Start Chat
document.getElementById('message-user-btn').addEventListener('click', () => {
  const db = getDb();
  let chat = db.chats.find(c => 
    (c.user1_id === currentUser.id && c.user2_id === currentViewedUser.id) || 
    (c.user1_id === currentViewedUser.id && c.user2_id === currentUser.id)
  );

  if (!chat) {
    chat = {
      id: Date.now().toString(),
      user1_id: currentUser.id,
      user2_id: currentViewedUser.id,
      last_message: '',
      updated_at: Date.now()
    };
    db.chats.push(chat);
    saveDb(db);
  }

  openChatRoom(chat.id, currentViewedUser.username, currentViewedUser.profilePic);
});

// Load Chats
function loadChats() {
  if (!currentUser) return;
  const db = getDb();
  const myChats = db.chats.filter(c => c.user1_id === currentUser.id || c.user2_id === currentUser.id);
  
  // Sort by recent
  myChats.sort((a, b) => b.updated_at - a.updated_at);
  
  const chatList = document.getElementById('chat-list');
  chatList.innerHTML = '';
  
  myChats.forEach(c => {
    const otherUserId = c.user1_id === currentUser.id ? c.user2_id : c.user1_id;
    const otherUser = db.users.find(u => u.id === otherUserId);
    
    if (otherUser) {
      const div = document.createElement('div');
      div.className = 'chat-item';
      div.innerHTML = `
        <img src="${otherUser.profilePic}" onerror="this.src='https://via.placeholder.com/150'" class="profile-avatar medium">
        <div class="chat-info">
          <div class="chat-name">${otherUser.username}</div>
          <div class="chat-last-msg">${c.last_message || 'New Chat'}</div>
        </div>
      `;
      div.onclick = () => openChatRoom(c.id, otherUser.username, otherUser.profilePic);
      chatList.appendChild(div);
    }
  });
}

// Chat Room Logic
function openChatRoom(chatId, username, pic) {
  currentChatId = chatId;
  document.getElementById('chat-header-name').innerText = username;
  document.getElementById('chat-header-pic').src = pic;
  chatRoom.classList.add('open');
  
  loadMessages();
}

function loadMessages() {
  if (!currentChatId) return;
  const db = getDb();
  const messages = db.messages.filter(m => m.chat_id === currentChatId);
  
  chatMessages.innerHTML = '';
  messages.forEach(msg => appendMessage(msg));
  scrollToBottom();
}

document.getElementById('close-chat-btn').addEventListener('click', () => {
  chatRoom.classList.remove('open');
  currentChatId = null;
  loadChats();
});

// Send Message
document.getElementById('send-btn').addEventListener('click', () => {
  const input = document.getElementById('message-input');
  const content = input.value.trim();
  if (content && currentChatId) {
    sendMessage(content, 'text');
    input.value = '';
  }
});

document.getElementById('message-input').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    document.getElementById('send-btn').click();
  }
});

// Send Image
document.getElementById('image-upload').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file || !currentChatId) return;
  
  const reader = new FileReader();
  reader.onload = function(event) {
    sendMessage(event.target.result, 'image');
  };
  reader.readAsDataURL(file);
});

function sendMessage(content, type) {
  const db = getDb();
  
  const newMsg = {
    id: Date.now().toString(),
    chat_id: currentChatId,
    sender_id: currentUser.id,
    content,
    type,
    created_at: Date.now()
  };
  
  db.messages.push(newMsg);
  
  const chatIndex = db.chats.findIndex(c => c.id === currentChatId);
  if (chatIndex > -1) {
    db.chats[chatIndex].last_message = type === 'image' ? 'Image message' : content;
    db.chats[chatIndex].updated_at = Date.now();
  }
  
  saveDb(db);
  appendMessage(newMsg);
  scrollToBottom();
}

function appendMessage(msg) {
  const div = document.createElement('div');
  div.className = `message ${msg.sender_id === currentUser.id ? 'sent' : 'received'}`;
  
  if (msg.type === 'image') {
    div.innerHTML = `<img src="${msg.content}">`;
  } else {
    div.innerText = msg.content;
  }
  
  chatMessages.appendChild(div);
}

function scrollToBottom() {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Cross-tab Synchronization (Real-time Simulation)
window.addEventListener('storage', (e) => {
  if (e.key === 'easychat_db') {
    handleDbUpdate();
  }
});

window.addEventListener('localDbUpdate', () => {
  handleDbUpdate();
});

function handleDbUpdate() {
  if (currentUser) {
    if (currentChatId) {
      loadMessages();
    } else {
      loadChats();
    }
  }
}
