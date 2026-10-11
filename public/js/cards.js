// ── CARDS MODULE ───────────────────────────────────────────
let searchPage = 1;
let searchTotal = 0;
let searchQuery = '';
let userCollectionIds = new Set();

function getRarityClass(rarity) {
  if (!rarity) return '';
  const r = rarity.toLowerCase();
  if (r.includes('holo') || r.includes('ultra') || r.includes('secret') || r.includes('rainbow') || r.includes('gold')) return 'rarity-holo';
  if (r.includes('rare')) return 'rarity-rare';
  if (r.includes('uncommon')) return 'rarity-uncommon';
  return '';
}

function getTypeClass(type) {
  return `type-${(type || 'normal').toLowerCase().replace(' ', '')}`;
}

function formatPrice(price, currency = 'EUR') {
  if (price == null) return null;
  return `${Number(price).toFixed(2)} €`;
}

function createCardElement(card, inCollection = false) {
  const price = card.prices?.best || card.prices?.normal || card.prices?.holofoil;
  const rarityClass = getRarityClass(card.rarity);

  const el = document.createElement('div');
  el.className = 'pokemon-card';
  el.dataset.cardId = card.id;
  el.innerHTML = `
    <div class="card-image-wrap">
      ${card.image 
        ? `<img src="${card.image}" alt="${card.name}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=card-no-image><span>⚡</span><span>${card.name}</span></div>'" />`
        : `<div class="card-no-image"><span>⚡</span><span style="font-size:11px;padding:0 8px;text-align:center">${card.name}</span></div>`
      }
      ${rarityClass ? `<div class="card-rarity-badge ${rarityClass}">${card.rarity}</div>` : ''}
      ${card.isOriginalFrScan ? `<div class="card-lang-badge lang-fr" title="Scan officiel en français">🇫🇷 FR</div>` : (card.image ? `<div class="card-lang-badge lang-en" title="Scan international / anglais (carte officielle française)">🇬🇧 Illu. EN</div>` : '')}
      ${inCollection ? '<div class="in-collection-badge">✓ Collectée</div>' : ''}
    </div>
    <div class="card-info">
      <div class="card-name">${card.name}</div>
      <div class="card-set-name">${card.set?.name || 'Set inconnu'}</div>
      <div class="card-price">
        ${price 
          ? `<span class="price-tag">${formatPrice(price)}</span>`
          : `<span class="price-tag no-price">Prix N/A</span>`
        }
        <button class="card-add-btn ${inCollection ? 'in-col' : ''}" 
          onclick="event.stopPropagation(); addToCollection(${JSON.stringify(card).replace(/"/g, '&quot;')})">
          ${inCollection ? '✓' : '+'}
        </button>
      </div>
    </div>
  `;
  el.addEventListener('click', () => openCardModal(card));
  return el;
}

async function searchCards(page = 1) {
  const q = document.getElementById('search-input').value.trim();
  const order = document.getElementById('search-order')?.value || '-set.releaseDate';
  const langFilter = document.getElementById('search-scan-lang')?.value || 'all';

  if (!q || q.length < 2) {
    showToast('Tapez au moins 2 caractères pour rechercher.', 'info');
    return;
  }

  searchQuery = q;
  searchPage = page;
  const resultsEl = document.getElementById('search-results');
  resultsEl.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px"><div class="pokeball" style="margin:auto"></div></div>';

  try {
    const res = await API.get(`/api/cards/search?q=${encodeURIComponent(q)}&page=${page}&pageSize=24&orderBy=${order}&scanLang=${langFilter}`);
    if (!res) return;
    const data = await res.json();

    if (!res.ok) { showToast(data.error, 'error'); return; }

    searchTotal = data.total;
    resultsEl.innerHTML = '';

    if (data.cards.length === 0) {
      resultsEl.innerHTML = '<div class="empty-state"><span class="search-emoji">😔</span><p>Aucune carte trouvée pour cette recherche.</p></div>';
      return;
    }

    // Fetch user's collection IDs for indicators
    await refreshCollectionIds();

    data.cards.forEach(card => {
      resultsEl.appendChild(createCardElement(card, userCollectionIds.has(card.id)));
    });

    renderPagination(data.total, page, data.pageSize);

  } catch (err) {
    showToast('Erreur lors de la recherche.', 'error');
    console.error(err);
  }
}

function renderPagination(total, currentPage, pageSize) {
  const paginationEl = document.getElementById('search-pagination');
  const totalPages = Math.ceil(total / pageSize);
  
  if (totalPages <= 1) { paginationEl.classList.add('hidden'); return; }
  paginationEl.classList.remove('hidden');
  paginationEl.innerHTML = '';

  const addBtn = (label, page, active = false, disabled = false) => {
    const btn = document.createElement('button');
    btn.className = `page-btn ${active ? 'active' : ''}`;
    btn.textContent = label;
    btn.disabled = disabled;
    if (!disabled) btn.onclick = () => searchCards(page);
    paginationEl.appendChild(btn);
  };

  addBtn('◀', currentPage - 1, false, currentPage === 1);
  
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, currentPage + 2);
  if (start > 1) addBtn('1', 1);
  if (start > 2) paginationEl.appendChild(Object.assign(document.createElement('span'), { textContent: '…', style: 'padding:0 8px;color:rgba(255,255,255,0.4)' }));
  for (let i = start; i <= end; i++) addBtn(i, i, i === currentPage);
  if (end < totalPages - 1) paginationEl.appendChild(Object.assign(document.createElement('span'), { textContent: '…', style: 'padding:0 8px;color:rgba(255,255,255,0.4)' }));
  if (end < totalPages) addBtn(totalPages, totalPages);

  addBtn('▶', currentPage + 1, false, currentPage === totalPages);
}

async function refreshCollectionIds() {
  try {
    const res = await API.get('/api/collection');
    if (!res || !res.ok) return;
    const data = await res.json();
    userCollectionIds = new Set(data.cards.map(c => c.card_id));
  } catch {}
}

async function addToCollection(card) {
  try {
    const res = await API.post('/api/collection/add', {
      card_id: card.id,
      card_name: card.name,
      card_image: card.imageSmall || card.image,
      card_set: card.set?.name,
      card_rarity: card.rarity,
      card_price: card.prices?.best || card.prices?.normal || 0,
    });
    if (!res) return;
    const data = await res.json();

    if (res.ok) {
      showToast(`${card.name} ajouté au classeur ! 📖`, 'success');
      userCollectionIds.add(card.id);
      // Update the button in the grid
      document.querySelectorAll(`[data-card-id="${card.id}"] .card-add-btn`).forEach(btn => {
        btn.textContent = '✓';
        btn.classList.add('in-col');
      });
      // Update home stats
      loadHomeStats();
    } else {
      showToast(data.error, 'error');
    }
  } catch {
    showToast('Erreur lors de l\'ajout.', 'error');
  }
}

function openCardModal(card) {
  const price = card.prices?.best || card.prices?.normal || card.prices?.holofoil;
  const inCol = userCollectionIds.has(card.id);

  const modal = document.getElementById('card-modal');
  const body = document.getElementById('modal-body');

  const typeChips = (card.types || []).map(t => `<span class="type-chip ${getTypeClass(t)}">${t}</span>`).join('');

  body.innerHTML = `
    ${card.imageLarge || card.image 
      ? `<img src="${card.imageLarge || card.image}" alt="${card.name}" class="modal-card-image" />`
      : `<div style="height:200px;display:flex;align-items:center;justify-content:center;font-size:80px">⚡</div>`
    }
    <div class="modal-card-name">${card.name}</div>
    <div class="modal-card-set">${card.set?.name || ''} — ${card.set?.series || ''}</div>
    ${card.isOriginalFrScan 
      ? `<div style="text-align:center;font-size:12px;color:#81c784;margin-bottom:12px">🇫🇷 Carte et scan officiels français</div>`
      : `<div style="text-align:center;font-size:12px;color:rgba(255,203,5,0.8);margin-bottom:12px">🇫🇷 Version française officielle (illustration d'archive anglaise)</div>`
    }
    ${typeChips ? `<div class="type-chips" style="justify-content:center;margin-bottom:16px">${typeChips}</div>` : ''}
    
    <div class="modal-stats">
      ${card.hp ? `<div class="modal-stat"><div class="modal-stat-label">❤️ HP</div><div class="modal-stat-value">${card.hp}</div></div>` : ''}
      ${card.rarity ? `<div class="modal-stat"><div class="modal-stat-label">✨ Rareté</div><div class="modal-stat-value" style="font-size:13px">${card.rarity}</div></div>` : ''}
      ${card.number ? `<div class="modal-stat"><div class="modal-stat-label">🔢 Numéro</div><div class="modal-stat-value">${card.number}</div></div>` : ''}
      ${card.artist ? `<div class="modal-stat"><div class="modal-stat-label">🎨 Artiste</div><div class="modal-stat-value" style="font-size:13px">${card.artist}</div></div>` : ''}
      ${card.set?.releaseDate ? `<div class="modal-stat"><div class="modal-stat-label">📅 Sortie</div><div class="modal-stat-value" style="font-size:13px">${card.set.releaseDate}</div></div>` : ''}
    </div>

    <div class="modal-prices">
      <h4>💰 Prix du marché (CardMarket / TCG)</h4>
      ${card.prices?.normal != null ? `<div class="price-row"><span class="label">Prix moyen</span><span class="value">${Number(card.prices.normal).toFixed(2)} €</span></div>` : ''}
      ${card.prices?.holofoil != null ? `<div class="price-row"><span class="label">Holographique</span><span class="value">${Number(card.prices.holofoil).toFixed(2)} €</span></div>` : ''}
      ${card.prices?.reverseHolofoil != null ? `<div class="price-row"><span class="label">Reverse Holo</span><span class="value">${Number(card.prices.reverseHolofoil).toFixed(2)} €</span></div>` : ''}
      ${card.prices?.firstEditionHolofoil != null ? `<div class="price-row"><span class="label">1ère Édition Holo</span><span class="value">${Number(card.prices.firstEditionHolofoil).toFixed(2)} €</span></div>` : ''}
      ${card.cardmarket?.price != null && card.cardmarket?.price !== card.prices?.normal ? `<div class="price-row"><span class="label">CardMarket</span><span class="value">${Number(card.cardmarket.price).toFixed(2)} €</span></div>` : ''}
      ${!price && !card.cardmarket?.price ? '<div class="price-row"><span class="label" style="width:100%;text-align:center;color:rgba(255,255,255,0.4)">Prix non disponible</span></div>' : ''}
    </div>

    <div class="modal-actions">
      <button class="btn-pokemon btn-primary" onclick="addToCollection(${JSON.stringify(card).replace(/"/g, '&quot;')}); closeModal()">
        ${inCol ? '✓ Déjà dans le classeur' : '+ Ajouter au classeur'}
      </button>
      ${card.cardmarket?.url ? `<a href="${card.cardmarket.url}" target="_blank" class="btn-pokemon btn-secondary">🛒 Voir sur CardMarket</a>` : ''}
    </div>
  `;

  modal.classList.remove('hidden');
}

function closeModal() {
  document.getElementById('card-modal').classList.add('hidden');
}
