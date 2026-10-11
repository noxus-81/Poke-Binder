require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path');
const { initDB } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// Initialize DB first, then start routes
initDB().then(() => {
  const authRoutes = require('./routes/auth');
  const cardsRoutes = require('./routes/cards');
  const collectionRoutes = require('./routes/collection');
  const scanRoutes = require('./routes/scan');

  app.use('/api/auth', authRoutes);
  app.use('/api/cards', cardsRoutes);
  app.use('/api/collection', collectionRoutes);
  app.use('/api/scan', scanRoutes);

  // SPA fallback
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  // Error handler
  app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Une erreur interne est survenue.' });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🎮 Poké Binder en ligne !`);
    console.log(`💻 Sur ton PC :       http://localhost:${PORT}`);
    console.log(`📱 Sur ton téléphone : http://192.168.1.94:${PORT}`);

    // Mise à jour automatique des prix et cartes toutes les 24h (86400000 ms)
    const { updateCollectionPrices } = require('./scripts/update-prices');
    setInterval(() => {
      updateCollectionPrices().catch(console.error);
    }, 24 * 60 * 60 * 1000);
  });
}).catch(err => {
  console.error('❌ Failed to initialize database:', err);
  process.exit(1);
});
