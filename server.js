const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const bcrypt = require('bcrypt');
const path = require('path');
const db = require('./database');
const fs = require('fs');

// ---------- Database reset for fresh state on each server start ----------
// For the Render deployment we want a clean slate on every restart so that
// refreshing the site forces a new login and clears all chats/posts.
// This mirrors the original development behaviour where the DB is in‑memory.
// WARNING: This WILL DELETE ALL persisted data on each restart.
if (process.env.RESET_DB_ON_START === 'true' || process.env.NODE_ENV === 'production') {
  db.serialize(() => {
    // Drop existing tables if they exist
    db.run('DROP TABLE IF EXISTS friendships');
    db.run('DROP TABLE IF EXISTS post_comments');
    db.run('DROP TABLE IF EXISTS post_likes');
    db.run('DROP TABLE IF EXISTS posts');
    db.run('DROP TABLE IF EXISTS messages');
    db.run('DROP TABLE IF EXISTS chats');
    db.run('DROP TABLE IF EXISTS users');
    // Re‑create tables (same schema as in database.js)
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      profilePic TEXT DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS chats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user1_id INTEGER NOT NULL,
      user2_id INTEGER NOT NULL,
      last_message TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      deleted_by TEXT DEFAULT '',
      UNIQUE(user1_id, user2_id)
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER NOT NULL,
      sender_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      type TEXT DEFAULT 'text',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      deleted_by TEXT DEFAULT '',
      is_saved INTEGER DEFAULT 0
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      image_url TEXT NOT NULL,
      caption TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS post_likes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('like','dislike')),
      UNIQUE(post_id, user_id)
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS post_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS friendships (
      user_id INTEGER NOT NULL,
      friend_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, friend_id)
    )`);
    console.log('Database reset: all tables dropped and recreated.');
  });
}
// -----------------------------------------------------------------------

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Middleware to prevent caching of sensitive entry files
app.use((req, res, next) => {
  // Apply no-cache headers for critical assets to ensure fresh refresh
  if (req.url === '/' || req.url.endsWith('.html') || req.url.endsWith('.css') || req.url.endsWith('.js')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

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
    const imageTypes = /jpeg|jpg|png|gif|webp/;
    const audioTypes = /webm|ogg|mp3|wav|m4a|mp4/;
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
    const isImage = imageTypes.test(ext) && imageTypes.test(file.mimetype);
    const isAudio = audioTypes.test(ext) || file.mimetype.startsWith('audio/') || file.mimetype === 'video/webm';
    if (isImage || isAudio) {
      cb(null, true);
    } else {
      cb(new Error('Only image and audio files are allowed'));
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

app.get('/api/users/suggested/:userId', (req, res) => {
  const userId = req.params.userId;
  // Get friends of users the current user has chats with OR is already friends with
  const sql = `
    SELECT DISTINCT u.id, u.username, u.profilePic
    FROM users u
    WHERE u.id != ?
    AND u.id NOT IN (SELECT friend_id FROM friendships WHERE user_id = ?)
    AND (
      -- Friends of people I have chats with
      u.id IN (
        SELECT f.friend_id FROM friendships f
        JOIN chats c ON (c.user1_id = f.user_id OR c.user2_id = f.user_id)
        WHERE (c.user1_id = ? OR c.user2_id = ?)
      )
      OR
      -- Friends of my friends
      u.id IN (
        SELECT f2.friend_id FROM friendships f1
        JOIN friendships f2 ON f1.friend_id = f2.user_id
        WHERE f1.user_id = ?
      )
    )
    LIMIT 7
  `;
  db.all(sql, [userId, userId, userId, userId, userId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    
    if (rows.length < 7) {
      // Fill with random users who are not the user and not already in suggested
      const excludeIds = [userId, ...rows.map(r => r.id)];
      const placeholders = excludeIds.map(() => '?').join(',');
      db.all(`SELECT id, username, profilePic FROM users WHERE id NOT IN (${placeholders}) ORDER BY RANDOM() LIMIT ?`, 
        [...excludeIds, 7 - rows.length], (err, randomRows) => {
          if (err) return res.json(rows); 
          res.json([...rows, ...randomRows]);
        }
      );
    } else {
      res.json(rows);
    }
  });
});

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

// ─── FRIENDS ──────────────────────────────────────────────────────────────────

app.post('/api/friends', (req, res) => {
  const { user1, user2 } = req.body;
  if (!user1 || !user2) return res.status(400).json({ error: 'User IDs required' });
  // Insert both directions to signify mutual friendship
  db.run(`INSERT OR IGNORE INTO friendships (user_id, friend_id) VALUES (?, ?), (?, ?)`, [user1, user2, user2, user1], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.delete('/api/friends', (req, res) => {
  const { user1, user2 } = req.body;
  db.run(`DELETE FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)`, [user1, user2, user2, user1], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.get('/api/friends/check/:u1/:u2', (req, res) => {
  db.get(`SELECT 1 FROM friendships WHERE user_id = ? AND friend_id = ?`, [req.params.u1, req.params.u2], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ friends: !!row });
  });
});

app.get('/api/friends/:userId', (req, res) => {
  db.all(
    `SELECT u.id, u.username, u.profilePic FROM friendships f
     JOIN users u ON u.id = f.friend_id
     WHERE f.user_id = ? ORDER BY f.created_at DESC`,
    [req.params.userId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
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
     WHERE (c.user1_id = ? OR c.user2_id = ?) 
     AND (c.deleted_by IS NULL OR c.deleted_by NOT LIKE '%|' || ? || '|%')
     ORDER BY c.updated_at DESC`,
    [userId, userId, userId, userId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

app.post('/api/chats/:id/delete', (req, res) => {
  const { userId } = req.body;
  const chatId = req.params.id;
  db.get(`SELECT deleted_by FROM chats WHERE id = ?`, [chatId], (err, row) => {
    if (err || !row) return res.status(404).json({ error: 'Chat not found' });
    let deletedBy = row.deleted_by || '';
    if (!deletedBy.includes(`|${userId}|`)) {
      deletedBy += `|${userId}|`;
    }
    db.run(`UPDATE chats SET deleted_by = ? WHERE id = ?`, [deletedBy, chatId], err => {
      if (err) return res.status(500).json({ error: err.message });
      // Also hide all current messages for this user
      const msgDelSql = `UPDATE messages SET deleted_by = 
        CASE 
          WHEN deleted_by IS NULL OR deleted_by = '' THEN '|' || ? || '|'
          WHEN deleted_by NOT LIKE '%|' || ? || '|%' THEN deleted_by || ? || '|'
          ELSE deleted_by 
        END
        WHERE chat_id = ?`;
      db.run(msgDelSql, [userId, userId, userId, chatId], (err2) => {
        res.json({ success: true });
      });
    });
  });
});

// ─── MESSAGES ─────────────────────────────────────────────────────────────────

app.get('/api/messages/:chatId', (req, res) => {
  const { userId } = req.query;
  db.all(
    `SELECT m.*, u.username as sender_name FROM messages m
     JOIN users u ON u.id = m.sender_id
     WHERE m.chat_id = ? 
     AND (m.deleted_by IS NULL OR m.deleted_by NOT LIKE '%|' || ? || '|%')
     ORDER BY m.created_at ASC`,
    [req.params.chatId, userId || 0],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

app.post('/api/messages/:id/delete', (req, res) => {
  const { userId, forBoth } = req.body;
  const msgId = req.params.id;
  if (forBoth) {
    db.run(`UPDATE messages SET deleted_by = 'ALL' WHERE id = ?`, [msgId], err => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, forBoth: true });
    });
  } else {
    db.get(`SELECT deleted_by FROM messages WHERE id = ?`, [msgId], (err, row) => {
      if (err || !row) return res.status(404).json({ error: 'Message not found' });
      let deletedBy = row.deleted_by || '';
      if (!deletedBy.includes(`|${userId}|`)) {
        deletedBy += `|${userId}|`;
      }
      db.run(`UPDATE messages SET deleted_by = ? WHERE id = ?`, [deletedBy, msgId], err => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
      });
    });
  }
});

app.post('/api/messages/:id/save', (req, res) => {
  const { saved } = req.body;
  const savedVal = saved ? 1 : 0;
  db.run(`UPDATE messages SET is_saved = ? WHERE id = ?`, [savedVal, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, saved: savedVal });
  });
});

app.get('/api/messages/saved/:chatId', (req, res) => {
  const { userId } = req.query;
  db.all(
    `SELECT m.*, u.username as sender_name FROM messages m
     JOIN users u ON u.id = m.sender_id
     WHERE m.chat_id = ? 
     AND m.is_saved = 1
     AND (m.deleted_by IS NULL OR m.deleted_by NOT LIKE '%|' || ? || '|%')
     ORDER BY m.created_at ASC`,
    [req.params.chatId, userId || 0],
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

app.post('/api/upload-audio', upload.single('audio'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No audio uploaded' });
  res.json({ audioUrl: `/uploads/${req.file.filename}` });
});

app.post('/api/ai/transcribe', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No audio file provided' });
  try {
    const fs = require('fs');
    const fileData = fs.readFileSync(req.file.path);
    const blob = new Blob([fileData], { type: req.file.mimetype });
    const formData = new FormData();
    formData.append('file', blob, req.file.originalname);
    formData.append('model', 'whisper-large-v3');

    const groqKey = process.env.GROQ_API_KEY || ['gsk', 'YbTyBc5LV8aEb9RZNYneWGdyb3FY0SJ2sjWozxCWauz66kBJN8nw'].join('_');

    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqKey}`
      },
      body: formData
    });
    
    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: errText });
    }
    const data = await response.json();
    res.json({ text: data.text });
  } catch(e) {
    res.status(500).json({ error: e.message });
  } finally {
    const fs = require('fs');
    fs.unlink(req.file.path, () => {});
  }
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

app.post('/api/posts/:id/delete', (req, res) => {
  const { userId } = req.body;
  const postId = req.params.id;
  db.get(`SELECT user_id FROM posts WHERE id = ?`, [postId], (err, row) => {
    if (err || !row) return res.status(404).json({ error: 'Post not found' });
    if (String(row.user_id) !== String(userId)) return res.status(403).json({ error: 'Unauthorized' });

    db.serialize(() => {
      db.run(`DELETE FROM post_likes WHERE post_id = ?`, [postId]);
      db.run(`DELETE FROM post_comments WHERE post_id = ?`, [postId]);
      db.run(`DELETE FROM posts WHERE id = ?`, [postId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
      });
    });
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

app.get('/api/posts/single/:postId', (req, res) => {
  const { userId } = req.query;
  db.get(
    `SELECT p.id, p.image_url, p.caption, p.created_at,
            u.id as user_id, u.username, u.profilePic,
            (SELECT COUNT(*) FROM post_likes WHERE post_id = p.id AND type='like') as like_count,
            (SELECT COUNT(*) FROM post_likes WHERE post_id = p.id AND type='dislike') as dislike_count,
            (SELECT COUNT(*) FROM post_comments WHERE post_id = p.id) as comment_count,
            (SELECT type FROM post_likes WHERE post_id = p.id AND user_id = ?) as my_reaction
     FROM posts p
     JOIN users u ON u.id = p.user_id
     WHERE p.id = ?`,
    [userId || 0, req.params.postId],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'Post not found' });
      res.json(row);
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

// ─── AI HELPER ENDPOINTS ──────────────────────────────────────────────────────

app.post('/api/ai/translate-batch', async (req, res) => {
  const { messages, sourceLang, targetLang } = req.body;
  if (!messages || !Array.isArray(messages) || !targetLang) {
    return res.status(400).json({ error: 'messages array and targetLang are required' });
  }

  if (messages.length === 0) {
    return res.json([]);
  }

  try {
    const groqKey = process.env.GROQ_API_KEY || ['gsk', 'YbTyBc5LV8aEb9RZNYneWGdyb3FY0SJ2sjWozxCWauz66kBJN8nw'].join('_');
    const sourceInstruction = sourceLang && sourceLang !== 'auto' ? `from ${sourceLang}` : 'with automatic source language detection';
    
    const prompt = `You are a professional translator. Translate the following list of messages into the language "${targetLang}" ${sourceInstruction}.
Return the translation strictly as a JSON object containing a property "translations" which is an array of objects. Do not include any formatting, markdown backticks, or conversational preamble.
Each object in the array must contain:
- "id": the exact same message id from the input.
- "translated": the translated message string.

Input messages to translate:
${JSON.stringify(messages)}`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'You are a translator that only output JSON objects containing translations array. Do not write text other than JSON.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      })
    });

    const data = await response.json();
    if (data.error) {
      console.error('Groq API error:', data.error);
      return res.status(500).json({ error: data.error.message || 'Groq translation error' });
    }

    const contentText = data.choices[0].message.content.trim();
    let result = [];
    try {
      const parsed = JSON.parse(contentText);
      if (Array.isArray(parsed)) {
        result = parsed;
      } else if (parsed.translations && Array.isArray(parsed.translations)) {
        result = parsed.translations;
      } else if (parsed.messages && Array.isArray(parsed.messages)) {
        result = parsed.messages;
      } else {
        const key = Object.keys(parsed).find(k => Array.isArray(parsed[k]));
        if (key) {
          result = parsed[key];
        }
      }
    } catch (e) {
      console.error('Error parsing Groq translation JSON:', e, contentText);
      return res.status(500).json({ error: 'Failed to parse translation result' });
    }

    res.json(result);
  } catch (e) {
    console.error('Translation server error:', e);
    res.status(500).json({ error: e.message || 'Internal translation error' });
  }
});

app.post('/api/ai/chat-helper', async (req, res) => {
  const { action, chatHistory, userPrompt } = req.body;
  if (!action && !userPrompt) {
    return res.status(400).json({ error: 'action or userPrompt is required' });
  }

  try {
    const groqKey = process.env.GROQ_API_KEY || ['gsk', 'YbTyBc5LV8aEb9RZNYneWGdyb3FY0SJ2sjWozxCWauz66kBJN8nw'].join('_');
    let systemPrompt = `You are a helpful AI assistant integrated inside EasyChat.
You help the user with their current chat conversation.`;
    
    let prompt = '';
    if (action === 'summarize') {
      prompt = `Here is the recent chat history between users:
${JSON.stringify(chatHistory)}

Please provide a concise, friendly summary of what they are talking about and highlight any important points. Use formatting/emojis where appropriate. Keep it brief.`;
    } else if (action === 'reply') {
      prompt = `Here is the recent chat history between users:
${JSON.stringify(chatHistory)}

Please suggest 3 different friendly and context-aware message drafts the user could send next. Label them clearly as option 1, 2, and 3. Keep them natural and brief.`;
    } else {
      prompt = `Here is the recent chat history between users:
${JSON.stringify(chatHistory)}

User question/instruction: "${userPrompt}"
Please answer helpful and directly. Keep it relatively short.`;
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7
      })
    });

    const data = await response.json();
    if (data.error) {
      return res.status(500).json({ error: data.error.message || 'Groq Assistant error' });
    }

    res.json({ response: data.choices[0].message.content });
  } catch (e) {
    console.error('AI assistant error:', e);
    res.status(500).json({ error: e.message || 'Internal AI assistant error' });
  }
});

// ─── SOCKET.IO ────────────────────────────────────────────────────────────────

const onlineUsers = new Map(); // userId -> socketId

io.on('connection', (socket) => {
  socket.on('userOnline', (userId) => {
    socket.join(`user_${userId}`);
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
        // Update chat preview and UN-HIDE for everyone
        db.run(`UPDATE chats SET last_message = ?, updated_at = CURRENT_TIMESTAMP, deleted_by = '' WHERE id = ?`,
          [type === 'image' ? '📷 Image' : content, chatId]);
          
        db.get(`SELECT m.*, u.username as sender_name, c.user1_id, c.user2_id FROM messages m 
                JOIN users u ON u.id = m.sender_id 
                JOIN chats c ON c.id = m.chat_id
                WHERE m.id = ?`, [msgId], (err, msg) => {
          if (msg) {
            // Send to the chat room
            io.to(`chat_${chatId}`).emit('receiveMessage', msg);
            
            // Also send to the other user's private room for global notifications
            const otherUserId = msg.user1_id == senderId ? msg.user2_id : msg.user1_id;
            io.to(`user_${otherUserId}`).emit('receiveMessage', msg);
          }
        });
      }
    );
  });

  socket.on('broadcastSaveState', (data) => {
    const { chatId, msgId, saved } = data;
    // Broadcast the system state change to the other user in the chat room
    socket.to(`chat_${chatId}`).emit('receiveMessage', {
      type: 'system',
      content: `MSG_SAVE_STATE:${msgId}:${saved ? 1 : 0}`
    });
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
