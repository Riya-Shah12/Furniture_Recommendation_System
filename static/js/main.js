/* ============================================================
   main.js  —  FurniFind
   Features:
     • Autocomplete (categories first, then titles)
     • AJAX search + filters + pagination
     • Product card rendering (NO FBT on cards)
     • Modal: open with full details + FBT + favourites
   ============================================================ */
(function () {
  'use strict';

  // ── DOM ──────────────────────────────────────────────────
  const searchInput  = document.getElementById('search-input');
  const acList       = document.getElementById('autocomplete-list');
  const searchForm   = document.getElementById('search-form');
  const gridEl       = document.getElementById('products-grid');
  const paginationEl = document.getElementById('pagination');
  const countBadge   = document.getElementById('count-badge');
  const sectionTitle = document.getElementById('section-title');
  const toast        = document.getElementById('toast');

  // Modal
  const overlay    = document.getElementById('modal-overlay');
  const modalClose = document.getElementById('modal-close');
  const btnFav     = document.getElementById('btn-favourite');

  // Favourites Panel
  const favPanel      = document.getElementById('fav-panel');
  const favItemsList  = document.getElementById('fav-items-list');
  const navFav        = document.getElementById('nav-fav');
  const closeFav      = document.getElementById('close-fav');
  const navFavCount   = document.getElementById('fav-count');

  // ── State ─────────────────────────────────────────────────
  let currentPage  = 1;
  let currentQuery = '';
  let loading      = false;
  let favourites   = new Set(JSON.parse(localStorage.getItem('ff_favs') || '[]'));
  let currentModalId = null;

  // ══════════════════════════════════════════════════════════
  // FAVOURITES PANEL LOGIC
  // ══════════════════════════════════════════════════════════
  function updateFavUI() {
    if (navFavCount) navFavCount.textContent = favourites.size;
  }

  async function openFavPanel() {
    favPanel.classList.add('open');
    renderFavList();
  }

  function closeFavPanel() {
    favPanel.classList.remove('open');
  }

  async function renderFavList() {
    favItemsList.innerHTML = '<div class="empty-fav">Loading your collection...</div>';
    
    if (favourites.size === 0) {
      favItemsList.innerHTML = '<div class="empty-fav">No pieces saved yet.</div>';
      return;
    }

    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(favourites) })
      });
      const items = await res.json();
      
      favItemsList.innerHTML = '';
      if (items.length === 0) {
        favItemsList.innerHTML = '<div class="empty-fav">No pieces saved yet.</div>';
        return;
      }

      items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'fav-item';
        div.innerHTML = `
          <img src="${esc(item.image_url)}" alt="${esc(item.title)}" onerror="this.src='https://placehold.co/80x64/f0ebe3/9e8a72?text=?'">
          <div class="fav-item-info">
            <div class="fav-item-name">${esc(item.title)}</div>
            <div class="fav-item-price">${esc(item.price_display)}</div>
            <button class="btn-remove-fav" data-id="${item.id}">Remove</button>
          </div>
        `;
        // Click on info to open modal
        div.querySelector('.fav-item-info').style.cursor = 'pointer';
        div.querySelector('.fav-item-info').onclick = (e) => {
          if (e.target.classList.contains('btn-remove-fav')) return;
          closeFavPanel();
          openModal(item.id);
        };
        
        div.querySelector('.btn-remove-fav').onclick = (e) => {
          e.stopPropagation();
          toggleFavourite(item.id);
          renderFavList();
        };
        
        favItemsList.appendChild(div);
      });
    } catch (_) {
      favItemsList.innerHTML = '<div class="empty-fav">Error loading favourites.</div>';
    }
  }

  function toggleFavourite(id) {
    if (favourites.has(id)) {
      favourites.delete(id);
      showToast('Removed from favourites');
    } else {
      favourites.add(id);
      showToast('Added to favourites!');
    }
    localStorage.setItem('ff_favs', JSON.stringify([...favourites]));
    updateFavUI();
    
    // Sync modal button if open
    if (currentModalId === id) {
      if (favourites.has(id)) btnFav.classList.add('active');
      else btnFav.classList.remove('active');
    }
  }

  navFav.addEventListener('click', (e) => {
    e.preventDefault();
    if (favPanel.classList.contains('open')) closeFavPanel();
    else openFavPanel();
  });

  closeFav.addEventListener('click', closeFavPanel);

  // Initial UI sync
  updateFavUI();

  // ══════════════════════════════════════════════════════════
  // AUTOCOMPLETE
  // ══════════════════════════════════════════════════════════
  let acTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(acTimer);
    const q = searchInput.value.trim();
    if (q.length < 2) { closeAC(); return; }
    acTimer = setTimeout(() => fetchSuggestions(q), 200);
  });

  async function fetchSuggestions(q) {
    try {
      const res  = await fetch(`/autocomplete?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      renderAC(data, q.toLowerCase());
    } catch (_) { closeAC(); }
  }

  function renderAC(items, q) {
    acList.innerHTML = '';
    if (!items.length) { closeAC(); return; }

    items.forEach(text => {
      const isCategory = text.length < 60 && !text.includes(',');  // rough heuristic
      const div = document.createElement('div');
      div.className = `ac-item ${isCategory ? 'is-category' : 'is-title'}`;

      // Icon: tag for category, magnifier for title
      const iconSvg = isCategory
        ? `<svg class="ac-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`
        : `<svg class="ac-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`;

      // Highlight matching portion
      const idx  = text.toLowerCase().indexOf(q);
      let label  = esc(text);
      if (idx !== -1) {
        label = esc(text.slice(0, idx))
              + `<strong>${esc(text.slice(idx, idx + q.length))}</strong>`
              + esc(text.slice(idx + q.length));
      }

      div.innerHTML = `${iconSvg}<span>${label}</span>`;
      div.addEventListener('mousedown', e => {
        e.preventDefault();
        searchInput.value = text;
        closeAC();
        doSearch(1);
      });
      acList.appendChild(div);
    });
    acList.classList.add('open');
  }

  function closeAC() { acList.classList.remove('open'); acList.innerHTML = ''; }
  document.addEventListener('click', e => {
    if (!e.target.closest('.autocomplete-wrapper')) closeAC();
  });
  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeAC();
  });

  // ══════════════════════════════════════════════════════════
  // SEARCH
  // ══════════════════════════════════════════════════════════
  searchForm.addEventListener('submit', e => { e.preventDefault(); doSearch(1); });

  // live filter changes
  ['filter-category', 'filter-rating'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => doSearch(1));
  });

  function buildPayload(page) {
    currentQuery = searchInput.value.trim();
    return {
      query:      currentQuery,
      min_price:  parseFloat(document.getElementById('filter-min-price').value) || 0,
      max_price:  parseFloat(document.getElementById('filter-max-price').value) || 1e6,
      category:   document.getElementById('filter-category').value || '',
      min_rating: parseFloat(document.getElementById('filter-rating').value) || 0,
      page,
    };
  }

  async function doSearch(page) {
    if (loading) return;
    loading = true;
    currentPage = page;
    showSkeletons();
    paginationEl.innerHTML = '';

    try {
      const res  = await fetch('/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(page)),
      });
      renderResults(await res.json());
    } catch (_) {
      gridEl.innerHTML = emptyState('Something went wrong', 'Please try again.');
    } finally {
      loading = false;
    }
  }

  // ══════════════════════════════════════════════════════════
  // RENDER CARDS  (NO FBT on cards — moved to modal)
  // ══════════════════════════════════════════════════════════
  function renderResults(data) {
    const { results, total, page, total_pages } = data;
    currentPage = page;
    if (countBadge) countBadge.textContent = `${total} items`;
    if (sectionTitle) {
      sectionTitle.textContent = currentQuery
        ? `Results for "${currentQuery}"`
        : 'Top Picks for You';
    }

    gridEl.innerHTML = '';
    if (!results.length) {
      gridEl.innerHTML = emptyState('No products found', 'Try adjusting your filters.');
      return;
    }

    results.forEach(p => gridEl.appendChild(createCard(p)));
    renderPagination(total_pages, page);
  }

  function createCard(p) {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.setAttribute('data-id', p.id);
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');

    const styleTag = p.style
      ? `<span class="card-badge-style">${esc(p.style.slice(0, 16))}</span>` : '';

    card.innerHTML = `
      <div class="card-img-wrap">
        ${styleTag}
        <img src="${esc(p.image_url)}" alt="${esc(p.title)}" loading="lazy"
             onerror="this.src='https://placehold.co/320x240/f0ebe3/9e8a72?text=No+Image'">
      </div>
      <div class="card-body">
        <div class="card-meta">
          <span>${esc(p.brand || 'Unknown')}</span>
          <span class="dot"></span>
          <span>${esc(p.category)}</span>
        </div>
        <div class="card-title">${esc(p.title)}</div>
        <div class="stars">
          <span class="stars-fill">${starStr(p.rating)}</span>
          <span>${p.rating} (${p.review_count})</span>
        </div>
        <div class="card-price-row">
          <span class="card-price">${esc(p.price_display)}</span>
          <div class="btn-view">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </div>
        </div>
      </div>`;

    // click → open modal
    card.addEventListener('click',  () => openModal(p.id));
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') openModal(p.id); });
    return card;
  }

  // ══════════════════════════════════════════════════════════
  // MODAL
  // ══════════════════════════════════════════════════════════
  async function openModal(productId) {
    currentModalId = productId;
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';

    // Reset modal content while loading
    document.getElementById('modal-img').src           = '';
    document.getElementById('modal-title').textContent = 'Loading…';
    document.getElementById('modal-category').textContent = '';
    document.getElementById('modal-stars').innerHTML   = '';
    document.getElementById('modal-desc').textContent  = '';
    document.getElementById('modal-price').textContent = '';
    document.getElementById('modal-link').href         = '#';
    document.getElementById('modal-fbt').style.display = 'none';
    btnFav.classList.remove('active');

    try {
      const res = await fetch(`/product/${productId}`);
      const p   = await res.json();
      populateModal(p);
    } catch (_) {
      document.getElementById('modal-title').textContent = 'Could not load product.';
    }
  }

  function populateModal(p) {
    document.getElementById('modal-img').src              = p.image_url || '';
    document.getElementById('modal-img').alt              = p.title;
    document.getElementById('modal-title').textContent    = p.title;
    document.getElementById('modal-category').textContent = p.category;
    document.getElementById('modal-desc').textContent     = p.description || '';
    document.getElementById('modal-price').textContent    = p.price_display;
    document.getElementById('modal-link').href            = p.product_url;

    // Stars + reviews
    document.getElementById('modal-stars').innerHTML =
      `<span class="stars-fill">${starStr(p.rating)}</span>
       <span>${p.rating} (${p.review_count} reviews)</span>`;

    // Favourites state
    if (favourites.has(p.id)) btnFav.classList.add('active');
    else                       btnFav.classList.remove('active');

    // FBT
    const fbtWrap  = document.getElementById('modal-fbt');
    const fbtList  = document.getElementById('modal-fbt-list');
    fbtList.innerHTML = '';
    if (p.fbt && p.fbt.length) {
      fbtWrap.style.display = 'block';
      p.fbt.forEach(f => {
        const a = document.createElement('a');
        a.className  = 'fbt-row';
        a.href       = f.product_url;
        a.target     = '_blank';
        a.rel        = 'noopener';
        a.innerHTML  = `
          <img src="${esc(f.image_url)}" alt="${esc(f.title)}"
               onerror="this.src='https://placehold.co/52x44/f0ebe3/9e8a72?text=?'">
          <div class="fbt-info">
            <div class="fbt-row-name">${esc(f.title)}</div>
            <div class="fbt-row-price">${esc(f.price_display)}</div>
          </div>
          <span class="fbt-ext">↗</span>`;
        fbtList.appendChild(a);
      });
    } else {
      fbtWrap.style.display = 'none';
    }
  }

  function closeModal() {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
    currentModalId = null;
  }

  modalClose.addEventListener('click', closeModal);
  overlay.addEventListener('click',   e => { if (e.target === overlay) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  // Favourites toggle
  btnFav.addEventListener('click', () => {
    if (currentModalId !== null) toggleFavourite(currentModalId);
  });

  // ══════════════════════════════════════════════════════════
  // PAGINATION
  // ══════════════════════════════════════════════════════════
  function renderPagination(totalPages, current) {
    paginationEl.innerHTML = '';
    if (totalPages <= 1) return;

    paginationEl.appendChild(mkPageBtn('‹', current > 1, () => doSearch(current - 1)));
    visiblePages(current, totalPages).forEach(p => {
      if (p === '…') {
        const s = document.createElement('span');
        s.textContent = '…'; s.style.cssText = 'padding:0 6px;color:var(--text-muted)';
        paginationEl.appendChild(s);
      } else {
        const btn = mkPageBtn(p, true, () => doSearch(p));
        if (p === current) btn.classList.add('active');
        paginationEl.appendChild(btn);
      }
    });
    paginationEl.appendChild(mkPageBtn('›', current < totalPages, () => doSearch(current + 1)));
  }

  function mkPageBtn(label, enabled, onClick) {
    const btn = document.createElement('button');
    btn.className = 'page-btn';
    btn.textContent = label;
    btn.disabled = !enabled;
    if (enabled) btn.addEventListener('click', onClick);
    return btn;
  }

  function visiblePages(c, t) {
    if (t <= 7) return Array.from({ length: t }, (_, i) => i + 1);
    if (c <= 4) return [1, 2, 3, 4, 5, '…', t];
    if (c >= t - 3) return [1, '…', t-4, t-3, t-2, t-1, t];
    return [1, '…', c-1, c, c+1, '…', t];
  }

  // ══════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════
  function showSkeletons(n = 8) {
    gridEl.innerHTML = Array.from({ length: n }, () =>
      `<div class="skeleton-card">
        <div class="skeleton skel-img"></div>
        <div class="skel-body">
          <div class="skeleton skel-line w-60"></div>
          <div class="skeleton skel-line w-80"></div>
          <div class="skeleton skel-line w-40"></div>
        </div>
      </div>`).join('');
  }

  function emptyState(h, p) {
    return `<div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
      </svg>
      <h3>${h}</h3><p>${p}</p>
    </div>`;
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2800);
  }

  function starStr(rating) {
    const full = Math.floor(rating);
    const half = rating - full >= 0.5 ? 1 : 0;
    return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(5 - full - half);
  }

  function esc(str) {
    return String(str || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ══════════════════════════════════════════════════════════
  // INIT — render server-injected initial data
  // ══════════════════════════════════════════════════════════
  try {
    const data = JSON.parse(document.getElementById('initial-data').textContent);
    renderResults(data);
  } catch (_) { /* no-op */ }

})();
