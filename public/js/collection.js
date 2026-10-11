// ── COLLECTION MODULE ──────────────────────────────────────
let collectionData = [];

async function loadCollection() {
  const sort = document.getElementById('collection-sort')?.value || 'added_at';
  const grid = document.getElementById('collection-grid');
  grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px"><div class="pokeball" style="margin:auto"></div></div>';

  try {
    const res = await API.get(`/api/collection?sort=${sort}&order=DESC`);
    if (!res) return;
    const data = await res.json();
    if (!res.ok) { showToast(data.error, 'error'); return; }

    collectionData = data.cards;
    userCollectionIds = new Set(data.cards.map(c => c.card_id));
    renderCollection(data.cards);

  } catch (err) {
    console.error(err);
    showToast('Erreur chargement collection.', 'error');
  }
}

function renderCollection(cards) {
  const grid = document.getElementById('collection-grid');
  grid.innerHTML = '';

  if (!cards || cards.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-pokeball"></div>
        <p>Votre classeur est vide. Commencez à collecter !</p>
        <button class="btn-pokemon btn-primary" onclick="navigate('search')" style="margin-top:16px">
          🔍 Rechercher des cartes
        </button>
      </div>
    `;
    return;
  }

  cards.forEach(card => {
    const el = document.createElement('div');
    el.className = 'pokemon-card';
    el.dataset.cardId = card.card_id;
    el.innerHTML = `
      <div class="card-image-wrap">
        ${card.card_image 
          ? `<img src="${card.card_image}" alt="${card.card_name}" loading="lazy" 
              onerror="this.parentElement.innerHTML='<div class=card-no-image><span>⚡</span></div>'" />`
          : `<div class="card-no-image"><span>⚡</span><span style="font-size:11px;padding:0 8px;text-align:center">${card.card_name}</span></div>`
        }
        <div class="in-collection-badge">✓ x${card.quantity}</div>
        ${getRarityClass(card.card_rarity) ? `<div class="card-rarity-badge ${getRarityClass(card.card_rarity)}">${card.card_rarity}</div>` : ''}
      </div>
      <div class="card-info">
        <div class="card-name">${card.card_name}</div>
        <div class="card-set-name">${card.card_set || 'Set inconnu'}</div>
        <div class="card-price">
          ${card.card_price 
            ? `<span class="price-tag">${Number(card.card_price).toFixed(2)} €</span>`
            : `<span class="price-tag no-price">N/A</span>`
          }
          <button class="card-add-btn" style="background:rgba(227,53,13,0.5);color:white"
            onclick="event.stopPropagation(); removeFromCollection('${card.card_id}', '${card.card_name.replace(/'/g, "\\'")}')">
            🗑️
          </button>
        </div>
      </div>
    `;
    el.addEventListener('click', () => openCollectionCardModal(card));
    grid.appendChild(el);
  });
}

function filterCollection(search) {
  if (!collectionData) return;
  const filtered = collectionData.filter(c =>
    c.card_name.toLowerCase().includes(search.toLowerCase()) ||
    (c.card_set || '').toLowerCase().includes(search.toLowerCase())
  );
  renderCollection(filtered);
}

async function removeFromCollection(cardId, cardName) {
  if (!confirm(`Retirer "${cardName}" du classeur ?`)) return;
  try {
    const res = await API.delete(`/api/collection/${cardId}`);
    if (!res) return;
    const data = await res.json();
    if (res.ok) {
      showToast(`${cardName} retiré du classeur.`, 'info');
      userCollectionIds.delete(cardId);
      // Update indicators in search page
      document.querySelectorAll(`[data-card-id="${cardId}"] .card-add-btn`).forEach(btn => {
        btn.textContent = '+';
        btn.classList.remove('in-col');
      });
      loadCollection();
      loadHomeStats();
    } else {
      showToast(data.error, 'error');
    }
  } catch {
    showToast('Erreur lors de la suppression.', 'error');
  }
}

function openCollectionCardModal(card) {
  const modal = document.getElementById('card-modal');
  const body = document.getElementById('modal-body');

  body.innerHTML = `
    ${card.card_image 
      ? `<img src="${card.card_image}" alt="${card.card_name}" class="modal-card-image" />`
      : `<div style="height:160px;display:flex;align-items:center;justify-content:center;font-size:80px">⚡</div>`
    }
    <div class="modal-card-name">${card.card_name}</div>
    <div class="modal-card-set">${card.card_set || 'Set inconnu'}</div>
    
    <div class="modal-stats">
      ${card.card_rarity ? `<div class="modal-stat"><div class="modal-stat-label">✨ Rareté</div><div class="modal-stat-value" style="font-size:13px">${card.card_rarity}</div></div>` : ''}
      <div class="modal-stat"><div class="modal-stat-label">📦 Quantité</div><div class="modal-stat-value">${card.quantity}</div></div>
      ${card.condition ? `<div class="modal-stat"><div class="modal-stat-label">⭐ Condition</div><div class="modal-stat-value" style="font-size:13px">${card.condition}</div></div>` : ''}
      ${card.card_price ? `<div class="modal-stat"><div class="modal-stat-label">💰 Valeur unit.</div><div class="modal-stat-value">${Number(card.card_price).toFixed(2)} €</div></div>` : ''}
    </div>

    ${card.card_price ? `
    <div class="modal-prices">
      <div class="price-row">
        <span class="label">Valeur totale (x${card.quantity})</span>
        <span class="value">${(Number(card.card_price) * card.quantity).toFixed(2)} €</span>
      </div>
      <div class="price-row">
        <span class="label">Ajouté le</span>
        <span class="value">${new Date(card.added_at).toLocaleDateString('fr-FR')}</span>
      </div>
    </div>` : ''}

    ${card.notes ? `<div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:12px;margin-bottom:20px;font-size:13px;color:var(--text-secondary)">📝 ${card.notes}</div>` : ''}

    <div class="modal-actions">
      <button class="btn-pokemon btn-danger" onclick="removeFromCollection('${card.card_id}', '${card.card_name.replace(/'/g, "\\'")}'); closeModal()">
        🗑️ Retirer du classeur
      </button>
    </div>
  `;

  modal.classList.remove('hidden');
}

async function loadHomeStats() {
  try {
    const res = await API.get('/api/collection');
    if (!res || !res.ok) return;
    const data = await res.json();
    const s = data.stats;
    document.getElementById('stat-cards').textContent = s.total_cards || 0;
    document.getElementById('stat-qty').textContent = s.total_quantity || 0;
    document.getElementById('stat-value').textContent = s.total_value ? `${Number(s.total_value).toFixed(0)} €` : '0 €';
    document.getElementById('stat-sets').textContent = s.total_sets || 0;

    // Recent cards
    const recentEl = document.getElementById('recent-cards');
    const recent = data.cards.slice(0, 8);
    if (recent.length > 0) {
      recentEl.innerHTML = '';
      recent.forEach(card => {
        const el = document.createElement('div');
        el.className = 'pokemon-card';
        el.innerHTML = `
          <div class="card-image-wrap">
            ${card.card_image 
              ? `<img src="${card.card_image}" alt="${card.card_name}" loading="lazy" />`
              : `<div class="card-no-image"><span>⚡</span></div>`
            }
          </div>
          <div class="card-info">
            <div class="card-name">${card.card_name}</div>
            <div class="card-set-name">${card.card_set || ''}</div>
            <div class="card-price">
              ${card.card_price ? `<span class="price-tag">${Number(card.card_price).toFixed(2)} €</span>` : '<span class="price-tag no-price">N/A</span>'}
            </div>
          </div>
        `;
        el.onclick = () => openCollectionCardModal(card);
        recentEl.appendChild(el);
      });
    }
  } catch (err) {
    console.error('Stats error:', err);
  }
}
