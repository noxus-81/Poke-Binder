const express = require('express');
const axios = require('axios');
const db = require('../db/database');

const router = express.Router();

const POKEMON_TCG_API = 'https://api.pokemontcg.io/v2';
const TCGDEX_API = 'https://api.tcgdex.net/v2/fr';
const headers = process.env.POKEMON_TCG_API_KEY
  ? { 'X-Api-Key': process.env.POKEMON_TCG_API_KEY }
  : {};

const CACHE_TTL_DAYS = 7;

// ── RECHERCHE DE CARTES (avec fallback multi-sources pour images & prix en €) ──
router.get('/search', async (req, res) => {
  try {
    const { q, page = 1, pageSize = 20, orderBy = '-set.releaseDate', scanLang = 'all' } = req.query;

    if (!q || q.trim().length < 2)
      return res.status(400).json({ error: 'Recherche trop courte (min 2 caractères).' });

    const cleanQ = q.trim();
    const cacheKey = `search:${cleanQ.toLowerCase()}:${page}:${pageSize}:${orderBy}:${scanLang}`;

    // 1. Regarder dans le cache local SQLite d'abord
    const cached = db.get(
      `SELECT data FROM api_cache WHERE cache_key = ? AND cached_at > datetime('now', '-${CACHE_TTL_DAYS} days')`,
      [cacheKey]
    );
    if (cached) {
      return res.json({ ...JSON.parse(cached.data), cached: true });
    }

    // 2. Recherche TCGDex FR avec filtre de scan optionnel
    const tcgdexResult = await searchTcgdex(cleanQ, Number(page), Number(pageSize), scanLang);
    upsertCache(cacheKey, JSON.stringify(tcgdexResult));
    return res.json(tcgdexResult);

  } catch (err) {
    const fallback = db.get('SELECT data FROM api_cache WHERE cache_key LIKE ?', [`search:${req.query.q?.trim().toLowerCase()}%`]);
    if (fallback) {
      return res.json({ ...JSON.parse(fallback.data), cached: true, stale: true });
    }
    console.error('Erreur recherche cartes:', err.message);
    res.status(503).json({ error: 'Impossible de joindre le serveur de cartes. Vérifiez votre connexion.' });
  }
});

// ── DÉTAIL D'UNE CARTE ────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const cacheKey = `card:${id}`;

    const cached = db.get(`SELECT data FROM api_cache WHERE cache_key = ?`, [cacheKey]);
    if (cached) return res.json({ card: JSON.parse(cached.data), cached: true });

    // Si ID TCGDex
    if (id.includes('-')) {
      try {
        const response = await axios.get(`${TCGDEX_API}/cards/${id}`, { timeout: 8000 });
        const card = formatTcgdexCard(response.data);
        upsertCache(cacheKey, JSON.stringify(card));
        return res.json({ card });
      } catch (e) {}
    }

    // Sinon PokéTCG
    const response = await axios.get(`${POKEMON_TCG_API}/cards/${id}`, { headers, timeout: 8000 });
    const card = formatPokeTcgCard(response.data.data);
    upsertCache(cacheKey, JSON.stringify(card));
    res.json({ card });

  } catch (err) {
    if (err.response?.status === 404) return res.status(404).json({ error: 'Carte non trouvée.' });
    res.status(503).json({ error: 'Erreur lors de la récupération de la carte.' });
  }
});

// ── RECHERCHE TCGDEX AVEC MULTI-RÉSOLUTIONS D'IMAGES ET PRIX EN € ──
async function searchTcgdex(q, page = 1, pageSize = 20, scanLang = 'all') {
  const res = await axios.get(`${TCGDEX_API}/cards`, {
    params: { name: q },
    timeout: 10000,
  });

  let allCards = res.data || [];

  // Si l'utilisateur demande UNIQUEMENT les vrais scans français
  if (scanLang === 'fr') {
    // Si déjà dans le cache, on peut pré-filtrer
    const candidates = [];
    for (const c of allCards) {
      const cardCache = db.get('SELECT data FROM api_cache WHERE cache_key = ?', [`card:${c.id}`]);
      if (cardCache) {
        const parsed = JSON.parse(cardCache.data);
        if (parsed.isOriginalFrScan) candidates.push(c);
      } else {
        candidates.push(c); // Sera vérifié au chargement du détail
      }
    }
    allCards = candidates;
  }

  const start = (page - 1) * pageSize;
  const pageSlice = allCards.slice(start, start + pageSize);

  let cards = await Promise.all(
    pageSlice.map(async (c) => {
      try {
        const cardCache = db.get('SELECT data FROM api_cache WHERE cache_key = ?', [`card:${c.id}`]);
        if (cardCache) return JSON.parse(cardCache.data);

        const detailRes = await axios.get(`${TCGDEX_API}/cards/${c.id}`, { timeout: 6000 });
        const formatted = formatTcgdexCard(detailRes.data);
        upsertCache(`card:${c.id}`, JSON.stringify(formatted));
        return formatted;
      } catch {
        return {
          id: c.id,
          name: c.name,
          image: null,
          imageLarge: null,
          imageSmall: null,
          set: { name: 'Pokémon' },
          rarity: 'Common',
          prices: { best: null, currency: 'EUR' },
        };
      }
    })
  );

  if (scanLang === 'fr') {
    cards = cards.filter(c => c.isOriginalFrScan);
  }

  return { cards, total: allCards.length, page, pageSize };
}

function resolveCardImage(card) {
  // 1. Image directe fournie par TCGDex
  if (card.image) {
    return {
      large: `${card.image}/high.webp`,
      small: `${card.image}/low.webp`,
    };
  }

  // 2. Fallback via TCGPlayer Product CDN
  const tcgPlayerId = card.variants_detailed?.[0]?.thirdParty?.tcgplayer
    || card.thirdParty?.tcgplayer;
  if (tcgPlayerId) {
    const tcgUrl = `https://product-images.tcgplayer.com/fit-in/437x437/${tcgPlayerId}.jpg`;
    return { large: tcgUrl, small: tcgUrl };
  }

  // 3. Fallback via PokéTCG CDN standard (ex: base1/4.png, sm75/3.png)
  if (card.set?.id && card.localId) {
    const cleanSetId = card.set.id.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const cleanNum = card.localId;
    const cdnUrl = `https://images.pokemontcg.io/${cleanSetId}/${cleanNum}.png`;
    return {
      large: `https://images.pokemontcg.io/${cleanSetId}/${cleanNum}_hires.png`,
      small: cdnUrl,
    };
  }

  return { large: null, small: null };
}

function formatTcgdexCard(card) {
  // Prix Cardmarket en Euros
  const cardmarketPrice = card.pricing?.cardmarket?.avg 
    || card.pricing?.cardmarket?.trend 
    || card.variants_detailed?.[0]?.pricing?.cardmarket?.avg 
    || null;

  // Si pas de prix CardMarket, convertir le prix TCGPlayer (USD -> EUR approximatif: 1 USD ≈ 0.92 EUR)
  const tcgplayerPriceUsd = card.pricing?.tcgplayer?.holofoil?.marketPrice 
    || card.pricing?.tcgplayer?.normal?.marketPrice 
    || null;
  const tcgplayerPriceEur = tcgplayerPriceUsd ? Math.round(tcgplayerPriceUsd * 0.92 * 100) / 100 : null;

  const bestPrice = cardmarketPrice || tcgplayerPriceEur || null;
  const images = resolveCardImage(card);
  const isOriginalFrScan = Boolean(card.image && card.image.includes('/fr/'));

  return {
    id: card.id,
    name: card.name,
    image: images.large || images.small,
    imageLarge: images.large,
    imageSmall: images.small,
    isOriginalFrScan,
    set: {
      id: card.set?.id,
      name: card.set?.name || 'Set inconnu',
      series: card.set?.series || '',
    },
    rarity: card.rarity || 'Common',
    types: card.types || [],
    hp: card.hp,
    number: card.localId,
    artist: card.illustrator,
    prices: {
      best: bestPrice,
      cardmarket: cardmarketPrice,
      normal: cardmarketPrice || tcgplayerPriceEur,
      currency: 'EUR',
    },
    cardmarket: {
      price: cardmarketPrice,
    },
  };
}

function formatPokeTcgCard(card) {
  // Conversion USD en EUR (1 USD ≈ 0.92 EUR)
  const toEur = (usd) => (usd != null ? Math.round(usd * 0.92 * 100) / 100 : null);

  const bestUsd = card.tcgplayer?.prices?.holofoil?.market || card.tcgplayer?.prices?.normal?.market || null;
  const cardmarketPrice = card.cardmarket?.prices?.averageSellPrice ?? null;
  const bestPrice = cardmarketPrice || toEur(bestUsd);

  return {
    id: card.id,
    name: card.name,
    image: card.images?.large || card.images?.small || null,
    imageLarge: card.images?.large || null,
    imageSmall: card.images?.small || null,
    set: {
      id: card.set?.id,
      name: card.set?.name,
      series: card.set?.series,
      releaseDate: card.set?.releaseDate,
      logo: card.set?.images?.logo,
    },
    rarity: card.rarity || 'Common',
    types: card.types || [],
    hp: card.hp,
    number: card.number,
    artist: card.artist,
    supertype: card.supertype,
    subtypes: card.subtypes || [],
    prices: {
      normal: toEur(card.tcgplayer?.prices?.normal?.market),
      holofoil: toEur(card.tcgplayer?.prices?.holofoil?.market),
      reverseHolofoil: toEur(card.tcgplayer?.prices?.reverseHolofoil?.market),
      firstEditionHolofoil: toEur(card.tcgplayer?.prices?.firstEditionHolofoil?.market),
      unlimited: toEur(card.tcgplayer?.prices?.unlimited?.market),
      best: bestPrice,
      currency: 'EUR',
    },
    cardmarket: {
      url: card.cardmarket?.url,
      price: cardmarketPrice,
    },
  };
}

function upsertCache(key, data) {
  try {
    const exists = db.get('SELECT cache_key FROM api_cache WHERE cache_key = ?', [key]);
    if (exists) {
      db.run("UPDATE api_cache SET data = ?, cached_at = datetime('now') WHERE cache_key = ?", [data, key]);
    } else {
      db.run('INSERT INTO api_cache (cache_key, data) VALUES (?, ?)', [key, data]);
    }
  } catch (e) {
    console.error('Cache write error:', e.message);
  }
}

module.exports = router;
