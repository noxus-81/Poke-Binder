const express = require('express');
const axios = require('axios');
const { authenticateToken } = require('../middleware/auth');
const db = require('../db/database');

const router = express.Router();

const POKEMON_TCG_API = 'https://api.pokemontcg.io/v2';
const apiHeaders = process.env.POKEMON_TCG_API_KEY
  ? { 'X-Api-Key': process.env.POKEMON_TCG_API_KEY }
  : {};

// Cache TTL for scan results: 3 days
const SCAN_CACHE_TTL = 3;

// ── SEARCH BY NAME (called after client-side OCR) ──────────
// The client does OCR with Tesseract.js, extracts the card name,
// and sends it here. No Gemini needed!
router.post('/by-name', authenticateToken, async (req, res) => {
  try {
    const { name, number, set } = req.body;
    if (!name || name.trim().length < 2)
      return res.status(400).json({ error: 'Nom de carte trop court.' });

    const cleanName = name.trim();
    const cacheKey = `scan:name:${cleanName.toLowerCase()}:${number || ''}`;

    // Check cache
    const cached = db.get(
      `SELECT data FROM api_cache WHERE cache_key = ? AND cached_at > datetime('now', '-${SCAN_CACHE_TTL} days')`,
      [cacheKey]
    );
    if (cached) {
      return res.json({ ...JSON.parse(cached.data), cached: true });
    }

    // Build search query
    let query = `name:"${cleanName}"`;
    if (number) {
      const num = number.split('/')[0].trim();
      if (num) query += ` number:${num}`;
    }

    const response = await axios.get(`${POKEMON_TCG_API}/cards`, {
      headers: apiHeaders,
      params: { q: query, pageSize: 8, orderBy: '-set.releaseDate' },
      timeout: 10000,
    });

    const matches = response.data.data.map(card => ({
      id: card.id,
      name: card.name,
      image: card.images?.large || card.images?.small,
      set: card.set?.name,
      rarity: card.rarity,
      number: card.number,
      types: card.types || [],
      price: {
        market: card.tcgplayer?.prices?.holofoil?.market
          || card.tcgplayer?.prices?.normal?.market
          || card.cardmarket?.prices?.averageSellPrice
          || null,
        cardmarket: card.cardmarket?.prices?.averageSellPrice || null,
      },
    }));

    const result = { identified: true, name: cleanName, matches };

    // Cache the result to avoid re-fetching same names
    try {
      const exists = db.get('SELECT cache_key FROM api_cache WHERE cache_key = ?', [cacheKey]);
      if (exists) {
        db.run("UPDATE api_cache SET data = ?, cached_at = datetime('now') WHERE cache_key = ?",
          [JSON.stringify(result), cacheKey]);
      } else {
        db.run('INSERT INTO api_cache (cache_key, data) VALUES (?, ?)',
          [cacheKey, JSON.stringify(result)]);
      }
    } catch {}

    res.json(result);

  } catch (err) {
    // Fallback to cached even if expired
    const cacheKey = `scan:name:${req.body?.name?.trim().toLowerCase()}:${req.body?.number || ''}`;
    const fallback = db.get('SELECT data FROM api_cache WHERE cache_key = ?', [cacheKey]);
    if (fallback) return res.json({ ...JSON.parse(fallback.data), cached: true, stale: true });

    console.error('Scan by name error:', err.message);
    res.status(503).json({ error: 'Service indisponible. Vérifiez votre connexion.' });
  }
});

module.exports = router;
