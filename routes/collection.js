const express = require('express');
const db = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// ── GET MY COLLECTION ──────────────────────────────────────
router.get('/', (req, res) => {
  try {
    const { sort = 'added_at', order = 'DESC', search } = req.query;
    const allowedSorts = ['added_at', 'card_name', 'card_price', 'card_rarity', 'card_set'];
    const sortCol = allowedSorts.includes(sort) ? sort : 'added_at';
    const sortOrder = order === 'ASC' ? 'ASC' : 'DESC';

    let query = `SELECT * FROM user_collection WHERE user_id = ?`;
    const params = [req.userId];

    if (search) {
      query += ` AND (card_name LIKE ? OR card_set LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }
    query += ` ORDER BY ${sortCol} ${sortOrder}`;

    const cards = db.all(query, params);

    const statsRow = db.get(`
      SELECT 
        COUNT(*) as total_cards,
        SUM(quantity) as total_quantity,
        SUM(card_price * quantity) as total_value,
        COUNT(DISTINCT card_set) as total_sets
      FROM user_collection WHERE user_id = ?
    `, [req.userId]);

    res.json({ cards, stats: statsRow || {} });
  } catch (err) {
    console.error('Collection fetch error:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération de la collection.' });
  }
});

// ── ADD CARD ───────────────────────────────────────────────
router.post('/add', (req, res) => {
  try {
    const { card_id, card_name, card_image, card_set, card_rarity, card_price, quantity = 1, condition = 'Near Mint', notes } = req.body;

    if (!card_id || !card_name)
      return res.status(400).json({ error: 'ID et nom de la carte requis.' });

    const existing = db.get(
      'SELECT * FROM user_collection WHERE user_id = ? AND card_id = ?',
      [req.userId, card_id]
    );

    if (existing) {
      db.run(
        'UPDATE user_collection SET quantity = quantity + ? WHERE user_id = ? AND card_id = ?',
        [quantity, req.userId, card_id]
      );
      const updated = db.get('SELECT * FROM user_collection WHERE user_id = ? AND card_id = ?', [req.userId, card_id]);
      return res.json({ success: true, card: updated, message: 'Quantité mise à jour.' });
    }

    const result = db.run(
      `INSERT INTO user_collection (user_id, card_id, card_name, card_image, card_set, card_rarity, card_price, quantity, condition, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.userId, card_id, card_name, card_image || null, card_set || null, card_rarity || null, card_price || 0, quantity, condition, notes || null]
    );

    const card = db.get('SELECT * FROM user_collection WHERE id = ?', [result.lastInsertRowid]);
    res.status(201).json({ success: true, card, message: 'Carte ajoutée à votre classeur !' });

  } catch (err) {
    console.error('Add card error:', err);
    res.status(500).json({ error: 'Erreur lors de l\'ajout de la carte.' });
  }
});

// ── UPDATE CARD ────────────────────────────────────────────
router.put('/:cardId', (req, res) => {
  try {
    const { quantity, condition, notes } = req.body;
    const { cardId } = req.params;

    const existing = db.get('SELECT * FROM user_collection WHERE user_id = ? AND card_id = ?', [req.userId, cardId]);
    if (!existing) return res.status(404).json({ error: 'Carte non trouvée dans votre collection.' });

    if (quantity !== undefined) db.run('UPDATE user_collection SET quantity = ? WHERE user_id = ? AND card_id = ?', [quantity, req.userId, cardId]);
    if (condition !== undefined) db.run('UPDATE user_collection SET condition = ? WHERE user_id = ? AND card_id = ?', [condition, req.userId, cardId]);
    if (notes !== undefined) db.run('UPDATE user_collection SET notes = ? WHERE user_id = ? AND card_id = ?', [notes, req.userId, cardId]);

    const updated = db.get('SELECT * FROM user_collection WHERE user_id = ? AND card_id = ?', [req.userId, cardId]);
    res.json({ success: true, card: updated });
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors de la mise à jour.' });
  }
});

// ── REMOVE CARD ────────────────────────────────────────────
router.delete('/:cardId', (req, res) => {
  try {
    const result = db.run(
      'DELETE FROM user_collection WHERE user_id = ? AND card_id = ?',
      [req.userId, req.params.cardId]
    );
    if (result.changes === 0) return res.status(404).json({ error: 'Carte non trouvée.' });
    res.json({ success: true, message: 'Carte retirée du classeur.' });
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors de la suppression.' });
  }
});

// ── CHECK IF IN COLLECTION ─────────────────────────────────
router.get('/check/:cardId', (req, res) => {
  const card = db.get(
    'SELECT id, quantity FROM user_collection WHERE user_id = ? AND card_id = ?',
    [req.userId, req.params.cardId]
  );
  res.json({ inCollection: !!card, quantity: card?.quantity || 0 });
});

module.exports = router;
