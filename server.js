const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const bcrypt = require('bcrypt');
const path = require('path');
const db = require('./database');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.json());
app.use(express.static(__dirname));
const UPLOADS_DIR = process.env.VERCEL ? '/tmp/uploads' : path.join(__dirname, 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

app.use('/uploads', express.static(UPLOADS_DIR));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.random().toString(36).substr(2, 9) + path.extname(file.originalname))
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    if (allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// ─── AUTH ─────────────────────────────────────────────────────────────────────

app.post('/api/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) return res.status(400).json({ error: 'All fields are required' });
  if (username.length < 3) return res.status(400).json({ error: 'Username must be at least 3 characters' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  try {
    const hash = await bcrypt.hash(password, 10);
    db.run(`INSERT INTO users (username, email, password) VALUES (?, ?, ?)`, [username, email, hash], function(err) {
      if (err) {
        if (err.message.includes('UNIQUE')) {
          if (err.message.includes('username')) return res.status(400).json({ error: 'Username already taken' });
          if (err.message.includes('email')) return res.status(400).json({ error: 'Email already registered' });
        }
        return res.status(500).json({ error: 'Registration failed' });
      }
      res.json({ success: true, userId: this.lastID, username });
    });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'All fields are required' });

  db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, user) => {
    if (err || !user) return res.status(400).json({ error: 'Invalid username or password' });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: 'Invalid username or password' });
    res.json({ success: true, userId: user.id, username: user.username, profilePic: user.profilePic });
  });
});

// ─── USERS ────────────────────────────────────────────────────────────────────

app.get('/api/users/search', (req, res) => {
  const { q, currentUserId } = req.query;
  if (!q) return res.json([]);
  db.all(
    `SELECT id, username, profilePic FROM users WHERE username LIKE ? AND id != ? LIMIT 20`,
    [`%${q}%`, currentUserId || 0],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

app.get('/api/users/:id', (req, res) => {
  db.get(`SELECT id, username, profilePic FROM users WHERE id = ?`, [req.params.id], (err, user) => {
    if (err || !user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  });
});

app.post('/api/users/:id/avatar', upload.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const url = `/uploads/${req.file.filename}`;
  db.run(`UPDATE users SET profilePic = ? WHERE id = ?`, [url, req.params.id], err => {
    if (err) return res.status(500).json({ error: 'Failed to update avatar' });
    res.json({ profilePic: url });
  });
});

// ─── CHATS ────────────────────────────────────────────────────────────────────

app.post('/api/chats', (req, res) => {
  const { user1_id, user2_id } = req.body;
  const u1 = Math.min(user1_id, user2_id);
  const u2 = Math.max(user1_id, user2_id);
  db.get(`SELECT id FROM chats WHERE user1_id = ? AND user2_id = ?`, [u1, u2], (err, chat) => {
    if (chat) return res.json({ chatId: chat.id });
    db.run(`INSERT INTO chats (user1_id, user2_id) VALUES (?, ?)`, [u1, u2], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ chatId: this.lastID });
    });
  });
});

app.get('/api/chats/:userId', (req, res) => {
  const userId = req.params.userId;
  db.all(
    `SELECT c.id as chat_id, c.last_message, c.updated_at,
            u.id as other_user_id, u.username, u.profilePic
     FROM chats c
     JOIN users u ON (u.id = c.user1_id OR u.id = c.user2_id) AND u.id != ?
     WHERE c.user1_id = ? OR c.user2_id = ?
     ORDER BY c.updated_at DESC`,
    [userId, userId, userId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

// ─── MESSAGES ─────────────────────────────────────────────────────────────────

app.get('/api/messages/:chatId', (req, res) => {
  db.all(
    `SELECT m.*, u.username as sender_name FROM messages m
     JOIN users u ON u.id = m.sender_id
     WHERE m.chat_id = ? ORDER BY m.created_at ASC`,
    [req.params.chatId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ imageUrl: `/uploads/${req.file.filename}` });
});

// ─── POSTS ────────────────────────────────────────────────────────────────────

app.post('/api/posts', upload.single('image'), (req, res) => {
  const { userId, caption } = req.body;
  if (!req.file) return res.status(400).json({ error: 'Image is required' });
  if (!userId) return res.status(400).json({ error: 'userId is required' });
  const imageUrl = `/uploads/${req.file.filename}`;
  db.run(`INSERT INTO posts (user_id, image_url, caption) VALUES (?, ?, ?)`, [userId, imageUrl, caption || ''], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, postId: this.lastID });
  });
});

app.get('/api/posts', (req, res) => {
  const { userId } = req.query;
  db.all(
    `SELECT p.id, p.image_url, p.caption, p.created_at,
            u.id as user_id, u.username, u.profilePic,
            (SELECT COUNT(*) FROM post_likes WHERE post_id = p.id AND type='like') as like_count,
            (SELECT COUNT(*) FROM post_likes WHERE post_id = p.id AND type='dislike') as dislike_count,
            (SELECT COUNT(*) FROM post_comments WHERE post_id = p.id) as comment_count,
            (SELECT type FROM post_likes WHERE post_id = p.id AND user_id = ?) as my_reaction
     FROM posts p
     JOIN users u ON u.id = p.user_id
     ORDER BY p.created_at DESC`,
    [userId || 0],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

app.post('/api/posts/:id/like', (req, res) => {
  const { userId, type } = req.body;
  if (!userId || !type) return res.status(400).json({ error: 'userId and type required' });
  // Toggle: if same type exists, remove it; otherwise upsert
  db.get(`SELECT type FROM post_likes WHERE post_id = ? AND user_id = ?`, [req.params.id, userId], (err, row) => {
    if (row && row.type === type) {
      // Remove reaction
      db.run(`DELETE FROM post_likes WHERE post_id = ? AND user_id = ?`, [req.params.id, userId], err => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ action: 'removed' });
      });
    } else {
      db.run(`INSERT OR REPLACE INTO post_likes (post_id, user_id, type) VALUES (?, ?, ?)`, [req.params.id, userId, type], err => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ action: 'set', type });
      });
    }
  });
});

app.get('/api/posts/:id/comments', (req, res) => {
  db.all(
    `SELECT c.*, u.username, u.profilePic FROM post_comments c
     JOIN users u ON u.id = c.user_id
     WHERE c.post_id = ? ORDER BY c.created_at ASC`,
    [req.params.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

app.post('/api/posts/:id/comments', (req, res) => {
  const { userId, content } = req.body;
  if (!userId || !content) return res.status(400).json({ error: 'userId and content required' });
  db.run(`INSERT INTO post_comments (post_id, user_id, content) VALUES (?, ?, ?)`, [req.params.id, userId, content], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    db.get(`SELECT c.*, u.username, u.profilePic FROM post_comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?`, [this.lastID], (err, row) => {
      res.json(row);
    });
  });
});

// ─── SOCKET.IO ────────────────────────────────────────────────────────────────

const onlineUsers = new Map(); // userId -> socketId

io.on('connection', (socket) => {
  socket.on('userOnline', (userId) => {
    onlineUsers.set(String(userId), socket.id);
    io.emit('onlineUsers', Array.from(onlineUsers.keys()));
  });

  socket.on('joinChat', (chatId) => {
    socket.join(`chat_${chatId}`);
  });

  socket.on('leaveChat', (chatId) => {
    socket.leave(`chat_${chatId}`);
  });

  socket.on('typing', ({ chatId, username }) => {
    socket.to(`chat_${chatId}`).emit('typing', { username });
  });

  socket.on('stopTyping', ({ chatId }) => {
    socket.to(`chat_${chatId}`).emit('stopTyping');
  });

  socket.on('sendMessage', (data) => {
    const { chatId, senderId, content, type } = data;
    db.run(
      `INSERT INTO messages (chat_id, sender_id, content, type) VALUES (?, ?, ?, ?)`,
      [chatId, senderId, content, type || 'text'],
      function(err) {
        if (err) return;
        const msgId = this.lastID;
        db.run(`UPDATE chats SET last_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [type === 'image' ? '📷 Image' : content, chatId]);
        db.get(`SELECT m.*, u.username as sender_name FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ?`, [msgId], (err, msg) => {
          if (msg) io.to(`chat_${chatId}`).emit('receiveMessage', msg);
        });
      }
    );
  });

  socket.on('disconnect', () => {
    for (const [userId, sid] of onlineUsers) {
      if (sid === socket.id) {
        onlineUsers.delete(userId);
        break;
      }
    }
    io.emit('onlineUsers', Array.from(onlineUsers.keys()));
  });
});

const PORT = process.env.PORT || 3000;
if (!process.env.VERCEL) {
  server.listen(PORT, () => console.log(`✅ EasyChat running on http://localhost:${PORT}`));
}

module.exports = app;
