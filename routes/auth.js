const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/database');
const { generateAccessToken, generateRefreshToken } = require('../middleware/auth');
const jwt = require('jsonwebtoken');

const router = express.Router();
const SALT_ROUNDS = 12;

// Cookie options - HttpOnly prevents JS/F12 access
const cookieOptions = {
  httpOnly: true,       // Cannot be accessed via document.cookie or F12 JS console
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/',
};

// ── REGISTER ──────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { username, email, phone, password } = req.body;

    if (!password || password.length < 8)
      return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères.' });
    if (!username && !email && !phone)
      return res.status(400).json({ error: 'Un identifiant (nom, email ou téléphone) est requis.' });

    if (email && db.get('SELECT id FROM users WHERE email = ?', [email]))
      return res.status(409).json({ error: 'Cet email est déjà utilisé.' });
    if (username && db.get('SELECT id FROM users WHERE username = ?', [username]))
      return res.status(409).json({ error: 'Ce nom d\'utilisateur est déjà pris.' });
    if (phone && db.get('SELECT id FROM users WHERE phone = ?', [phone]))
      return res.status(409).json({ error: 'Ce numéro est déjà utilisé.' });

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const result = db.run(
      'INSERT INTO users (username, email, phone, password_hash) VALUES (?, ?, ?, ?)',
      [username || null, email || null, phone || null, passwordHash]
    );

    const userId = result.lastInsertRowid;
    const accessToken = generateAccessToken(userId);
    const refreshToken = generateRefreshToken(userId);

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    db.run('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
      [userId, refreshToken, expiresAt]);

    // HttpOnly cookies — invisible in F12!
    res.cookie('accessToken', accessToken, { ...cookieOptions, maxAge: 15 * 60 * 1000 });
    res.cookie('refreshToken', refreshToken, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000, path: '/api/auth' });

    const user = db.get('SELECT id, username, email, phone, avatar, trainer_level, created_at FROM users WHERE id = ?', [userId]);
    res.status(201).json({ success: true, user });

  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Erreur lors de l\'inscription.' });
  }
});

// ── LOGIN ──────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password)
      return res.status(400).json({ error: 'Identifiant et mot de passe requis.' });

    const user = db.get(
      'SELECT * FROM users WHERE email = ? OR username = ? OR phone = ?',
      [identifier, identifier, identifier]
    );

    if (!user) return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect.' });

    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect.' });

    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

    // Cleanup old expired tokens
    db.run('DELETE FROM refresh_tokens WHERE user_id = ? AND expires_at < ?', [user.id, new Date().toISOString()]);

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    db.run('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
      [user.id, refreshToken, expiresAt]);

    res.cookie('accessToken', accessToken, { ...cookieOptions, maxAge: 15 * 60 * 1000 });
    res.cookie('refreshToken', refreshToken, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000, path: '/api/auth' });

    const { password_hash, ...safeUser } = user;
    res.json({ success: true, user: safeUser });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Erreur lors de la connexion.' });
  }
});

// ── REFRESH TOKEN ──────────────────────────────────────────
router.post('/refresh', (req, res) => {
  const refreshToken = req.cookies?.refreshToken;
  if (!refreshToken) return res.status(401).json({ error: 'Refresh token manquant.' });

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    if (decoded.type !== 'refresh') throw new Error('Invalid type');

    const stored = db.get(
      'SELECT * FROM refresh_tokens WHERE token = ? AND user_id = ? AND expires_at > ?',
      [refreshToken, decoded.userId, new Date().toISOString()]
    );
    if (!stored) return res.status(401).json({ error: 'Token invalide ou expiré.' });

    const newAccessToken = generateAccessToken(decoded.userId);
    res.cookie('accessToken', newAccessToken, { ...cookieOptions, maxAge: 15 * 60 * 1000 });
    res.json({ success: true });

  } catch {
    res.status(401).json({ error: 'Token invalide.' });
  }
});

// ── LOGOUT ────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  const refreshToken = req.cookies?.refreshToken;
  if (refreshToken) db.run('DELETE FROM refresh_tokens WHERE token = ?', [refreshToken]);
  res.clearCookie('accessToken', { path: '/' });
  res.clearCookie('refreshToken', { path: '/api/auth' });
  res.json({ success: true });
});

// ── ME ────────────────────────────────────────────────────
router.get('/me', (req, res) => {
  const token = req.cookies?.accessToken;
  if (!token) return res.status(401).json({ error: 'Non connecté.' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = db.get(
      'SELECT id, username, email, phone, avatar, trainer_level, created_at FROM users WHERE id = ?',
      [decoded.userId]
    );
    if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé.' });
    res.json({ user });
  } catch {
    res.status(401).json({ error: 'Non connecté.' });
  }
});

module.exports = router;
