// ── SCAN MODULE — Tesseract.js OCR (100% local, zéro API) ──
let scanFile = null;
let tesseractReady = false;
let workerInstance = null;

// ── INIT TESSERACT (lazy-load depuis CDN) ─────────────────
async function getTesseractWorker() {
  if (workerInstance) return workerInstance;

  showToast('Chargement de l\'OCR... (première fois)', 'info', 5000);

  // Dynamically load Tesseract from CDN if not already loaded
  if (!window.Tesseract) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  const worker = await Tesseract.createWorker('eng', 1, {
    logger: m => {
      if (m.status === 'recognizing text') {
        const pct = Math.round(m.progress * 100);
        const statusEl = document.getElementById('ocr-status');
        if (statusEl) statusEl.textContent = `Lecture OCR : ${pct}%`;
      }
    },
  });

  workerInstance = worker;
  tesseractReady = true;
  return worker;
}

// ── DRAG & DROP SETUP ─────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const dropZone = document.getElementById('scan-drop-zone');
  if (!dropZone) return;

  ['dragover', 'dragenter'].forEach(evt => {
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });
  });
  ['dragleave', 'dragend'].forEach(evt => {
    dropZone.addEventListener(evt, () => dropZone.classList.remove('dragover'));
  });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const file = e.dataTransfer?.files[0];
    if (file && file.type.startsWith('image/')) loadScanPreview(file);
    else showToast('Veuillez déposer une image.', 'error');
  });

  // Paste support (Ctrl+V)
  document.addEventListener('paste', (e) => {
    if (document.getElementById('page-scan')?.classList.contains('hidden')) return;
    const item = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'));
    if (item) loadScanPreview(item.getAsFile());
  });
});

function openCamera() {
  document.getElementById('scan-camera-input').click();
}

function handleScanFile(input) {
  const file = input.files?.[0];
  if (file) loadScanPreview(file);
}

function loadScanPreview(file) {
  scanFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('scan-preview-img').src = e.target.result;
    document.getElementById('scan-drop-zone').classList.add('hidden');
    document.getElementById('scan-preview').classList.remove('hidden');
    document.getElementById('scan-results').classList.add('hidden');
  };
  reader.readAsDataURL(file);
}

function resetScan() {
  scanFile = null;
  document.getElementById('scan-preview').classList.add('hidden');
  document.getElementById('scan-results').classList.add('hidden');
  document.getElementById('scan-drop-zone').classList.remove('hidden');
  document.getElementById('scan-file-input').value = '';
  document.getElementById('scan-camera-input').value = '';
}

// ── MAIN ANALYZE FUNCTION ─────────────────────────────────
async function analyzeCard() {
  if (!scanFile) { showToast('Aucune image sélectionnée.', 'error'); return; }

  const analyzeBtn = document.getElementById('analyze-btn');
  const ocrStatus = document.getElementById('ocr-status');
  analyzeBtn.disabled = true;
  analyzeBtn.textContent = '⏳ Lecture OCR...';
  if (ocrStatus) ocrStatus.style.display = 'block';

  try {
    // Step 1: OCR with Tesseract (runs in the browser, no API call)
    const worker = await getTesseractWorker();
    const imgSrc = document.getElementById('scan-preview-img').src;

    const { data } = await worker.recognize(imgSrc);
    const rawText = data.text;

    // Step 2: Extract card name from OCR text
    const extracted = extractCardInfo(rawText);

    if (!extracted.name) {
      showToast('Impossible de lire le texte. Prenez une photo plus nette.', 'error');
      analyzeBtn.disabled = false;
      analyzeBtn.textContent = '🔍 Analyser la carte';
      if (ocrStatus) ocrStatus.style.display = 'none';
      return;
    }

    if (ocrStatus) ocrStatus.textContent = `Nom détecté : "${extracted.name}" → Recherche...`;

    // Step 3: Search PokéTCG API by name (with server-side cache)
    const res = await API.post('/api/scan/by-name', extracted);
    if (!res) return;
    const data2 = await res.json();

    if (!res.ok) {
      showToast(data2.error || 'Erreur lors de la recherche.', 'error');
      return;
    }

    displayScanResults(data2, rawText, extracted);

  } catch (err) {
    console.error('Scan error:', err);
    showToast('Erreur lors de l\'analyse. Réessayez avec une meilleure photo.', 'error');
  } finally {
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = '🔍 Analyser la carte';
    const ocrStatus = document.getElementById('ocr-status');
    if (ocrStatus) ocrStatus.style.display = 'none';
  }
}

// ── EXTRACT CARD INFO FROM OCR TEXT ──────────────────────
function extractCardInfo(text) {
  // Clean up OCR noise
  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 1);

  // Pokémon card name is usually the FIRST big text line (before HP)
  // Common patterns:
  //   "Pikachu" 
  //   "Charizard ex"
  //   "Pikachu V"
  //   "Mewtwo VMAX"

  let name = null;
  let number = null;

  // Known suffixes to remove from noise
  const noiseWords = /^(trainer|supporter|item|stadium|energy|basic|stage|hp|\d+hp|illus\.|©|pokémon|pokemon|tcg|gx|©\d+)/i;

  for (const line of lines) {
    // Skip very short lines, lines with only numbers/symbols
    if (line.length < 3) continue;
    if (/^\d+$/.test(line)) continue;
    if (noiseWords.test(line)) continue;

    // Card number pattern: "025/264" or "25/264" or "SWSH001"
    if (!number && /^\d{1,4}\/\d{1,4}$/.test(line)) {
      number = line;
      continue;
    }

    // First valid text line is likely the Pokémon name
    if (!name) {
      // Remove trailing HP numbers: "Pikachu 60" → "Pikachu"
      const cleaned = line
        .replace(/\s+\d{2,4}\s*HP?$/i, '')   // Remove HP at end
        .replace(/\bHP\b/gi, '')               // Remove standalone HP
        .replace(/[^\w\s\-é'àâêîôûùèœç]/g, '') // Remove special chars except accents
        .replace(/\s+/g, ' ')
        .trim();

      // Must look like a real name (letters, possibly spaces, possible V/GX/EX suffixes)
      if (cleaned.length >= 3 && /^[A-Za-zÀ-ÿ\s\-']+$/.test(cleaned)) {
        name = cleaned;
      }
    }
  }

  return { name, number };
}

// ── DISPLAY RESULTS ────────────────────────────────────────
function displayScanResults(data, rawText, extracted) {
  const resultsEl = document.getElementById('scan-results');
  const matchesEl = document.getElementById('scan-matches');
  resultsEl.classList.remove('hidden');

  if (!data.matches || data.matches.length === 0) {
    matchesEl.innerHTML = `
      <div class="empty-state">
        <span style="font-size:48px">😔</span>
        <p>Aucune carte trouvée pour "<strong>${data.name}</strong>"</p>
        <p style="margin-top:12px;font-size:13px;color:var(--text-secondary)">
          Essayez avec une photo plus nette, ou utilisez la recherche manuelle.
        </p>
        <button class="btn-pokemon btn-secondary" style="margin-top:16px" 
          onclick="navigate('search'); document.getElementById('search-input').value='${data.name}'; searchCards()">
          🔍 Chercher manuellement
        </button>
      </div>
    `;
    return;
  }

  matchesEl.innerHTML = `
    <div style="grid-column:1/-1;margin-bottom:16px;padding:12px 16px;
      background:rgba(59,76,202,0.12);border:1px solid rgba(59,76,202,0.3);
      border-radius:12px;display:flex;gap:16px;flex-wrap:wrap;align-items:center;font-size:14px">
      <span>🔍 OCR : <strong style="color:var(--poke-yellow)">${extracted.name}</strong></span>
      ${extracted.number ? `<span>🔢 Numéro : <strong>${extracted.number}</strong></span>` : ''}
      <span style="margin-left:auto;font-size:11px;color:var(--text-secondary)">
        ${data.cached ? (data.stale ? '📦 Cache (expiré)' : '📦 Depuis le cache') : '🌐 API'}
      </span>
    </div>
  `;

  data.matches.forEach(card => {
    const el = document.createElement('div');
    el.className = 'pokemon-card';
    const safeCard = {
      id: card.id,
      name: card.name,
      imageSmall: card.image || '',
      set: { name: card.set || '' },
      rarity: card.rarity || '',
      prices: { best: card.price?.market || 0 },
    };
    el.innerHTML = `
      <div class="card-image-wrap">
        ${card.image
          ? `<img src="${card.image}" alt="${card.name}" loading="lazy"
              onerror="this.parentElement.innerHTML='<div class=card-no-image><span>⚡</span></div>'" />`
          : `<div class="card-no-image"><span>⚡</span></div>`
        }
      </div>
      <div class="card-info">
        <div class="card-name">${card.name}</div>
        <div class="card-set-name">${card.set || ''} #${card.number || '?'}</div>
        <div class="card-price">
          ${card.price?.market
            ? `<span class="price-tag">${Number(card.price.market).toFixed(2)} €</span>`
            : `<span class="price-tag no-price">N/A</span>`
          }
          <button class="card-add-btn"
            onclick="event.stopPropagation(); addToCollection(${JSON.stringify(safeCard).replace(/"/g, '&quot;')})">+</button>
        </div>
      </div>
    `;
    matchesEl.appendChild(el);
  });
}
