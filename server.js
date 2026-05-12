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
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(express.json());
app.use(express.static(__dirname)); // Serve static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Create uploads directory if it doesn't exist
if (!fs.existsSync(path.join(__dirname, 'uploads'))) {
  fs.mkdirSync(path.join(__dirname, 'uploads'));
}

// Storage for images
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// Register
app.post('/api/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) return res.status(400).json({ error: 'All fields required' });

  try {
    const hash = await bcrypt.hash(password, 10);
    db.run(`INSERT INTO users (username, email, password) VALUES (?, ?, ?)`, [username, email, hash], function(err) {
      if (err) {
        if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Username already exists' });
        return res.status(500).json({ error: 'Database error' });
      }
      res.json({ success: true, userId: this.lastID, username });
    });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, user) => {
    if (err || !user) return res.status(400).json({ error: 'Invalid credentials' });
    const match = await bcrypt.compare(password, user.password);
    if (match) {
      res.json({ success: true, userId: user.id, username: user.username });
    } else {
      res.status(400).json({ error: 'Invalid credentials' });
    }
  });
});

// Search users
app.get('/api/users/search', (req, res) => {
  const { q, currentUserId } = req.query;
  db.all(`SELECT id, username, profilePic FROM users WHERE username LIKE ? AND id != ?`, [`%${q}%`, currentUserId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Get user profile
app.get('/api/users/:id', (req, res) => {
  db.get(`SELECT id, username, profilePic FROM users WHERE id = ?`, [req.params.id], (err, user) => {
    if (err || !user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  });
});

// Get or Create Chat
app.post('/api/chats', (req, res) => {
  const { user1_id, user2_id } = req.body;
  const u1 = Math.min(user1_id, user2_id);
  const u2 = Math.max(user1_id, user2_id);

  db.get(`SELECT id FROM chats WHERE user1_id = ? AND user2_id = ?`, [u1, u2], (err, chat) => {
    if (chat) {
      return res.json({ chatId: chat.id });
    } else {
      db.run(`INSERT INTO chats (user1_id, user2_id) VALUES (?, ?)`, [u1, u2], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ chatId: this.lastID });
      });
    }
  });
});

// Get User Chats
app.get('/api/chats/:userId', (req, res) => {
  const userId = req.params.userId;
  const query = `
    SELECT c.id as chat_id, c.last_message, c.updated_at, u.id as other_user_id, u.username, u.profilePic
    FROM chats c
    JOIN users u ON (u.id = c.user1_id OR u.id = c.user2_id) AND u.id != ?
    WHERE c.user1_id = ? OR c.user2_id = ?
    ORDER BY c.updated_at DESC
  `;
  db.all(query, [userId, userId, userId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Get Messages
app.get('/api/messages/:chatId', (req, res) => {
  db.all(`SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC`, [req.params.chatId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Upload Image
app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ imageUrl: `/uploads/${req.file.filename}` });
});

// Socket.io
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('joinChat', (chatId) => {
    socket.join(`chat_${chatId}`);
  });

  socket.on('sendMessage', (data) => {
    const { chatId, senderId, content, type } = data;
    db.run(`INSERT INTO messages (chat_id, sender_id, content, type) VALUES (?, ?, ?, ?)`, 
      [chatId, senderId, content, type], 
      function(err) {
        if (!err) {
          const messageId = this.lastID;
          db.run(`UPDATE chats SET last_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, 
            [type === 'image' ? 'Image' : content, chatId]);
            
          const messageObj = {
            id: messageId, chat_id: chatId, sender_id: senderId, content, type, created_at: new Date().toISOString()
          };
          io.to(`chat_${chatId}`).emit('receiveMessage', messageObj);
        }
      }
    );
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
