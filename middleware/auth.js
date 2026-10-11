const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '15m'; // Short-lived access token

function generateAccessToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function generateRefreshToken(userId) {
  return jwt.sign({ userId, type: 'refresh' }, JWT_SECRET, { expiresIn: '7d' });
}

function authenticateToken(req, res, next) {
  // Try cookie first, then Authorization header
  const token = req.cookies?.accessToken || 
    (req.headers.authorization?.startsWith('Bearer ') 
      ? req.headers.authorization.slice(7) 
      : null);

  if (!token) {
    return res.status(401).json({ error: 'Authentification requise.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expiré.', code: 'TOKEN_EXPIRED' });
    }
    return res.status(403).json({ error: 'Token invalide.' });
  }
}

module.exports = { generateAccessToken, generateRefreshToken, authenticateToken };
