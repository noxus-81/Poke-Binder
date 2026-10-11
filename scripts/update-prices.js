const db = require('../db/database');
const axios = require('axios');

const TCGDEX_API = 'https://api.tcgdex.net/v2/fr';

async function updateCollectionPrices() {
  console.log('🔄 [Cron/Daily] Début de la mise à jour quotidienne des prix...');

  await db.initDB();

  // 1. Vider le cache de recherche expiré pour forcer le rechargement des cotes à jour
  db.run("DELETE FROM api_cache WHERE cached_at < datetime('now', '-1 day')");
  console.log('🧹 Cache expiré nettoyé.');

  // 2. Mettre à jour les prix de toutes les cartes enregistrées dans les classeurs des utilisateurs
  const userCards = db.all('SELECT DISTINCT card_id, card_name FROM user_collection');
  console.log(`📦 ${userCards.length} carte(s) unique(s) trouvée(s) dans les classeurs.`);

  let updatedCount = 0;

  for (const card of userCards) {
    try {
      if (card.card_id.includes('-')) {
        // TCGDex card
        const res = await axios.get(`${TCGDEX_API}/cards/${card.card_id}`, { timeout: 6000 });
        const c = res.data;
        const newPrice = c.pricing?.cardmarket?.avg 
          || c.pricing?.cardmarket?.trend 
          || c.variants_detailed?.[0]?.pricing?.cardmarket?.avg 
          || null;

        if (newPrice != null) {
          db.run('UPDATE user_collection SET card_price = ? WHERE card_id = ?', [newPrice, card.card_id]);
          updatedCount++;
        }
      }
    } catch (err) {
      console.warn(`⚠️ Impossible de mettre à jour ${card.card_name} (${card.card_id}):`, err.message);
    }
  }

  console.log(`✅ Mise à jour terminée : ${updatedCount} carte(s) actualisée(s) avec les nouveaux prix.`);
}

if (require.main === module) {
  updateCollectionPrices().then(() => process.exit(0)).catch(e => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { updateCollectionPrices };
