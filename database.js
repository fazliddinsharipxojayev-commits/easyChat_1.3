const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Vercel is serverless and read-only. We use /tmp for the database.
// NOTE: Data will reset when the function sleeps. 
const dbPath = process.env.VERCEL ? '/tmp/easychat.db' : './easychat.db';
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
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

  db.run(`ALTER TABLE messages ADD COLUMN is_saved INTEGER DEFAULT 0`, (err) => {
    // Ignore error if column already exists
  });

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
});

module.exports = db;
