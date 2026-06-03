// ==================== FIREBASE CONFIG ====================
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyA53CEplqRyHunU_bTFkd1OUC1pJD0qa4o",
  authDomain: "loyy-culture.firebaseapp.com",
  projectId: "loyy-culture",
  storageBucket: "loyy-culture.firebasestorage.app",
  messagingSenderId: "250365697229",
  appId: "1:250365697229:web:7bab40fa88c2af4f39dd84"
};

const CLOUDINARY_CLOUD  = "dismpss5e";
const CLOUDINARY_PRESET = "Loy culture";
const ADMIN_EMAIL       = "admin@loyyculture.com";
const DELIVERY_FEE      = 2.00;

let globalQrPaymentUrl = null;

firebase.initializeApp(FIREBASE_CONFIG);
const auth = firebase.auth();
const db   = firebase.firestore();

// ==================== GLOBAL STATE ====================
let cart = JSON.parse(localStorage.getItem('loyy_cart') || '[]');
let favorites = JSON.parse(localStorage.getItem('loyy_favs') || '[]');
let currentUser = null;
let isAdmin = false;
let allProducts = [];
let checkoutCustomer = {};
let currentEditProductId = null;
let pendingQrFile = null;
let userOrdersUnsub = null;
let adminOrdersUnsub = null;
let prevOrderStatuses = {};

// ==================== HELPERS ====================
function $(id) { return document.getElementById(id); }
function showToast(msg, duration = 2200) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}
function openModal(id) { $(id).classList.add('open'); }
function closeModal(id) { $(id).classList.remove('open'); }
function showLoading(msg = 'Loading…') { const o = $('loadingOverlay'); if (!o) return; o.querySelector('p').textContent = msg; o.classList.add('visible'); }
function hideLoading() { const o = $('loadingOverlay'); if (!o) return; o.classList.remove('visible'); }
function updateBadges() {
  const cc = cart.reduce((s, i) => s + i.qty, 0);
  const cb = $('cartBadge'); cb.textContent = cc; cb.classList.toggle('visible', cc > 0);
  $('favBadge').textContent = favorites.length;
  $('favBadge').classList.toggle('visible', favorites.length > 0);
}
function saveCart() { localStorage.setItem('loyy_cart', JSON.stringify(cart)); updateBadges(); }
function getCatEmoji(cat) { return { 't-shirts': '👕', accessories: '📿', shoes: '👟', clothing: '🧥' }[cat] || '🛍️'; }
function formatDate(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function parseVariants(str) {
  if (!str) return [];
  return str.split(',').map(s => s.trim()).filter(Boolean);
}

// ==================== IN-APP NOTIFICATION BANNER ====================
function showNotifBanner(icon, title, body, onClick) {
  const old = document.getElementById('notifBanner');
  if (old) old.remove();
  const banner = document.createElement('div');
  banner.id = 'notifBanner';
  banner.innerHTML = `
    <div class="notif-banner-icon">${icon}</div>
    <div class="notif-banner-text">
      <div class="notif-banner-title">${title}</div>
      <div class="notif-banner-body">${body}</div>
    </div>
    <button class="notif-banner-close">✕</button>
  `;
  banner.style.cssText = `
    position:fixed;top:calc(var(--nav-h) + 8px);left:12px;right:12px;
    z-index:9998;background:#1e1e1e;border:1px solid var(--accent);
    border-radius:14px;padding:14px 44px 14px 14px;
    display:flex;align-items:center;gap:12px;
    box-shadow:0 8px 32px rgba(0,0,0,0.5);
    cursor:pointer;transform:translateY(-120%);transition:transform 0.4s cubic-bezier(0.34,1.56,0.64,1);
  `;
  banner.querySelector('.notif-banner-icon').style.cssText = 'font-size:28px;flex-shrink:0';
  banner.querySelector('.notif-banner-title').style.cssText = 'font-size:13px;font-weight:700;color:var(--accent);margin-bottom:2px';
  banner.querySelector('.notif-banner-body').style.cssText = 'font-size:12px;color:rgba(245,243,239,0.75);line-height:1.4';
  banner.querySelector('.notif-banner-close').style.cssText = 'position:absolute;top:10px;right:10px;background:none;border:none;color:var(--gray);cursor:pointer;font-size:14px;padding:4px';
  document.body.appendChild(banner);
  requestAnimationFrame(() => { banner.style.transform = 'translateY(0)'; });
  const dismiss = () => { banner.style.transform = 'translateY(-120%)'; setTimeout(() => banner.remove(), 400); };
  banner.addEventListener('click', (e) => { if (e.target.classList.contains('notif-banner-close')) { dismiss(); return; } dismiss(); if (onClick) onClick(); });
  banner.querySelector('.notif-banner-close').addEventListener('click', e => { e.stopPropagation(); dismiss(); });
  setTimeout(dismiss, 6000);
}

// ==================== NAVIGATION ====================
function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.bnav-btn').forEach(b => b.classList.remove('active'));
  $(`page-${page}`)?.classList.add('active');
  document.querySelector(`.bnav-btn[data-page="${page}"]`)?.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (page === 'cart') renderCart();
  if (page === 'favorites') renderFavorites();
  if (page === 'orders') { renderOrderHistory(); markUserNotifsRead(); }
}
document.querySelectorAll('.bnav-btn').forEach(btn => btn.addEventListener('click', () => navigateTo(btn.dataset.page)));
$('goHome').addEventListener('click', () => navigateTo('home'));
$('cartBtn').addEventListener('click', () => navigateTo('cart'));
$('favBtn').addEventListener('click', () => navigateTo('favorites'));
$('ordersNavBtn').addEventListener('click', () => navigateTo('orders'));
document.addEventListener('click', e => {
  const nav = e.target.closest('[data-nav]');
  if (nav) navigateTo(nav.dataset.nav);
  const close = e.target.closest('[data-close]');
  if (close) closeModal(close.dataset.close);
  if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('open');
});

// ==================== SEARCH ====================
$('searchToggle').addEventListener('click', () => { $('searchBar').classList.toggle('open'); if ($('searchBar').classList.contains('open')) $('searchInput').focus(); });
$('searchClose').addEventListener('click', () => { $('searchBar').classList.remove('open'); $('searchInput').value = ''; renderAllProducts('all'); });
$('searchInput').addEventListener('input', function () {
  const q = this.value.toLowerCase().trim();
  if (q) { navigateTo('products'); renderProductGrid('allProductsGrid', allProducts.filter(p => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q))); }
  else renderAllProducts('all');
});

// ==================== PRODUCTS ====================
function loadProducts() {
  db.collection('products').orderBy('createdAt', 'desc').onSnapshot(snap => {
    allProducts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderFeatured();
    renderAllProducts(getActiveCat('productCatFilter'));
    if ($('atab-products')?.classList.contains('active')) renderAdminProducts();
  }, err => { console.warn(err); allProducts = getDemoProducts(); renderFeatured(); renderAllProducts('all'); });
}
function getDemoProducts() {
  return [
    { id: 'd1', name: 'LC Street Tee', category: 't-shirts', price: 29.99, description: 'Premium cotton street tee.', emoji: '👕', featured: true, stock: 20, sizes: 'S,M,L,XL', colors: 'Black,White' },
    { id: 'd2', name: 'Gold Chain Necklace', category: 'accessories', price: 49.99, description: 'Gold-plated chain.', emoji: '📿', featured: true, stock: 15 },
    { id: 'd3', name: 'Air Culture Kicks', category: 'shoes', price: 119.99, description: 'Lightweight runners.', emoji: '👟', featured: true, stock: 10, sizes: '40,41,42,43,44', colors: 'Black,White,Red' },
    { id: 'd4', name: 'Oversized Hoodie', category: 'clothing', price: 69.99, description: 'Heavy fleece hoodie.', emoji: '🧥', featured: false, stock: 8, sizes: 'S,M,L,XL,XXL', colors: 'Black,Gray,Navy' }
  ];
}
function getActiveCat(containerId) { return document.querySelector(`#${containerId} .cat-chip.active`)?.dataset.cat || 'all'; }
function renderFeatured() { const f = allProducts.filter(p => p.featured); renderProductGrid('featuredGrid', f.length ? f : allProducts.slice(0, 4)); }
function renderAllProducts(cat) { const list = cat === 'all' ? allProducts : allProducts.filter(p => p.category === cat); renderProductGrid('allProductsGrid', list); }
function renderProductGrid(gridId, products) {
  const grid = $(gridId);
  if (!grid) return;
  if (!products.length) { grid.innerHTML = '<p style="color:var(--gray);font-size:14px;padding:20px;grid-column:1/-1;text-align:center">No products found.</p>'; return; }
  grid.innerHTML = products.map(p => {
    const isFav = favorites.includes(p.id);
    const outOfStock = (p.stock || 0) <= 0;
    const img = p.imageUrl ? `<img src="${p.imageUrl}" alt="${p.name}" loading="lazy" style="${outOfStock ? 'opacity:0.35;' : ''}"/>` : `<div class="product-img-placeholder" style="${outOfStock ? 'opacity:0.35;' : ''}">${p.emoji || getCatEmoji(p.category)}</div>`;
    const cartBtn = outOfStock
      ? `<button class="add-cart-btn" disabled style="background:#444;color:#888;cursor:not-allowed;opacity:0.5;">Out of Stock</button>`
      : `<button class="add-cart-btn">+ Cart</button>`;
    const stockBadge = outOfStock ? `<div style="position:absolute;top:8px;left:8px;background:rgba(229,62,62,0.85);color:#fff;font-size:10px;font-weight:700;padding:3px 8px;border-radius:100px;letter-spacing:0.5px">OUT OF STOCK</div>` : (p.stock <= 3 ? `<div style="position:absolute;top:8px;left:8px;background:rgba(212,84,26,0.85);color:#fff;font-size:10px;font-weight:700;padding:3px 8px;border-radius:100px;letter-spacing:0.5px">ONLY ${p.stock} LEFT</div>` : '');
    return `<div class="product-card${outOfStock ? ' out-of-stock' : ''}" data-id="${p.id}"><div class="product-card-img" style="position:relative;">${img}${stockBadge}</div><div class="product-card-body"><div class="product-card-cat">${p.category}</div><div class="product-card-name" style="${outOfStock ? 'opacity:0.5;' : ''}">${p.name}</div><div class="product-card-bottom"><div class="product-card-price" style="${outOfStock ? 'opacity:0.5;' : ''}">$${Number(p.price).toFixed(2)}</div><div style="display:flex;gap:6px;"><button class="fav-btn ${isFav ? 'active' : ''}" title="Favorite"><svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></button>${cartBtn}</div></div></div></div>`;
  }).join('');
  grid.querySelectorAll('.product-card').forEach(card => {
    const pid = card.dataset.id;
    card.addEventListener('click', e => { if (!e.target.closest('.fav-btn') && !e.target.closest('.add-cart-btn')) showProductDetail(pid); });
    card.querySelector('.fav-btn')?.addEventListener('click', e => { e.stopPropagation(); toggleFav(pid); });
    const addBtn = card.querySelector('.add-cart-btn');
    if (addBtn && !addBtn.disabled) addBtn.addEventListener('click', e => { e.stopPropagation(); showProductDetail(pid); });
  });
}

function showProductDetail(id) {
  const p = allProducts.find(x => x.id === id);
  if (!p) return;
  const isFav = favorites.includes(p.id);
  const outOfStock = (p.stock || 0) <= 0;
  const img = p.imageUrl ? `<img src="${p.imageUrl}" alt="${p.name}" style="${outOfStock ? 'opacity:0.35;' : ''}"/>` : `<div style="font-size:90px;display:flex;align-items:center;justify-content:center;height:100%;${outOfStock ? 'opacity:0.35;' : ''}">${p.emoji || getCatEmoji(p.category)}</div>`;
  const stockInfo = outOfStock
    ? `<div style="background:rgba(229,62,62,0.12);border:1px solid #e53e3e;border-radius:8px;padding:8px 14px;margin-bottom:14px;font-size:12px;font-weight:700;color:#e53e3e;text-align:center;">❌ Out of Stock</div>`
    : (p.stock <= 3 ? `<div style="background:rgba(212,84,26,0.12);border:1px solid var(--accent2);border-radius:8px;padding:8px 14px;margin-bottom:14px;font-size:12px;font-weight:700;color:var(--accent2);text-align:center;">⚠️ Only ${p.stock} left!</div>` : '');

  const sizes = parseVariants(p.sizes);
  const colors = parseVariants(p.colors);
  const sizeSel = sizes.length ? `<div class="variant-group"><div class="variant-label">Size</div><div class="variant-chips" id="pd-sizes">${sizes.map(s => `<button class="variant-chip" data-val="${s}">${s}</button>`).join('')}</div></div>` : '';
  const colorSel = colors.length ? `<div class="variant-group"><div class="variant-label">Color</div><div class="variant-chips" id="pd-colors">${colors.map(c => `<button class="variant-chip" data-val="${c}">${c}</button>`).join('')}</div></div>` : '';

  const addCartBtn = outOfStock
    ? `<button class="btn-primary" disabled style="flex:1;opacity:0.4;cursor:not-allowed;">Out of Stock</button>`
    : `<button class="btn-primary" id="pdAddCart">Add to Cart</button>`;

  $('productModalContent').innerHTML = `<div class="product-detail-img">${img}</div><div class="product-detail-cat">${p.category}</div><div class="product-detail-name">${p.name}</div><div class="product-detail-price">$${Number(p.price).toFixed(2)}</div>${stockInfo}${sizeSel}${colorSel}<div class="product-detail-desc">${p.description || ''}</div><div class="product-detail-actions">${addCartBtn}<button class="fav-btn ${isFav ? 'active' : ''}" id="pdFav" style="padding:12px;border:1px solid var(--border);border-radius:8px"><svg viewBox="0 0 24 24" width="22"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></button></div>`;

  // Variant chip selection logic
  document.querySelectorAll('#pd-sizes .variant-chip, #pd-colors .variant-chip').forEach(chip => {
    chip.addEventListener('click', function() {
      this.closest('.variant-chips').querySelectorAll('.variant-chip').forEach(c => c.classList.remove('selected'));
      this.classList.add('selected');
    });
  });

  if (!outOfStock) {
    $('pdAddCart').onclick = () => {
      const selectedSize = document.querySelector('#pd-sizes .variant-chip.selected')?.dataset.val || null;
      const selectedColor = document.querySelector('#pd-colors .variant-chip.selected')?.dataset.val || null;
      if (sizes.length && !selectedSize) { showToast('Please select a size'); return; }
      if (colors.length && !selectedColor) { showToast('Please select a color'); return; }
      addToCartWithVariants(p.id, selectedSize, selectedColor);
      closeModal('productModal');
    };
  }
  $('pdFav').onclick = () => toggleFav(p.id);
  openModal('productModal');
}

// ==================== CART ====================
function addToCartWithVariants(productId, size, color) {
  const p = allProducts.find(x => x.id === productId);
  if (!p) return;
  if ((p.stock || 0) <= 0) { showToast('Sorry, this item is out of stock!'); return; }
  // Key includes size+color so same product with different variants = separate line items
  const key = `${productId}__${size || ''}__${color || ''}`;
  const existing = cart.find(x => x.key === key);
  if (existing) {
    if (existing.qty >= p.stock) { showToast(`Only ${p.stock} in stock!`); return; }
    existing.qty++;
  } else {
    cart.push({ key, id: p.id, name: p.name, price: p.price, imageUrl: p.imageUrl, emoji: p.emoji || getCatEmoji(p.category), qty: 1, size: size || null, color: color || null });
  }
  saveCart();
  const variantLabel = [size, color].filter(Boolean).join(' / ');
  showToast(`${p.name}${variantLabel ? ' (' + variantLabel + ')' : ''} added to cart!`);
}

function addToCart(productId) {
  const p = allProducts.find(x => x.id === productId);
  if (!p) return;
  const sizes = parseVariants(p.sizes);
  const colors = parseVariants(p.colors);
  if (sizes.length || colors.length) { showProductDetail(productId); return; }
  addToCartWithVariants(productId, null, null);
}

function renderCart() {
  const list = $('cartItems'), summary = $('cartSummary'), empty = $('cartEmpty');
  if (!cart.length) { list.innerHTML = ''; summary.style.display = 'none'; empty.style.display = 'flex'; return; }
  empty.style.display = 'none'; summary.style.display = 'block';
  list.innerHTML = cart.map(item => {
    const variantBadges = [
      item.size ? `<span class="cart-variant-badge">Size: ${item.size}</span>` : '',
      item.color ? `<span class="cart-variant-badge">Color: ${item.color}</span>` : ''
    ].filter(Boolean).join('');
    return `<div class="cart-item" data-key="${item.key || item.id}"><div class="cart-item-img">${item.imageUrl ? `<img src="${item.imageUrl}"/>` : item.emoji}</div><div class="cart-item-info"><div class="cart-item-name">${item.name}</div>${variantBadges ? `<div class="cart-variant-badges">${variantBadges}</div>` : ''}<div class="cart-item-price">$${(item.price * item.qty).toFixed(2)}</div></div><div class="cart-item-actions"><div class="qty-controls"><button class="qty-btn qty-minus" data-key="${item.key || item.id}">−</button><span class="qty-num">${item.qty}</span><button class="qty-btn qty-plus" data-key="${item.key || item.id}">+</button></div><button class="remove-btn" data-key="${item.key || item.id}">Remove</button></div></div>`;
  }).join('');
  list.querySelectorAll('.qty-plus').forEach(b => b.onclick = () => updateQty(b.dataset.key, 1));
  list.querySelectorAll('.qty-minus').forEach(b => b.onclick = () => updateQty(b.dataset.key, -1));
  list.querySelectorAll('.remove-btn').forEach(b => b.onclick = () => removeFromCart(b.dataset.key));
  const sub = cart.reduce((s, i) => s + i.price * i.qty, 0);
  $('cartSubtotal').textContent = `$${sub.toFixed(2)}`;
  $('cartTotal').textContent = `$${(sub + DELIVERY_FEE).toFixed(2)}`;
}
function updateQty(key, delta) { const idx = cart.findIndex(x => (x.key || x.id) === key); if (idx === -1) return; cart[idx].qty += delta; if (cart[idx].qty <= 0) cart.splice(idx, 1); saveCart(); renderCart(); }
function removeFromCart(key) { cart = cart.filter(x => (x.key || x.id) !== key); saveCart(); renderCart(); }

// ==================== FAVORITES ====================
function toggleFav(productId) {
  const idx = favorites.indexOf(productId);
  if (idx > -1) { favorites.splice(idx, 1); showToast('Removed from favorites'); }
  else { favorites.push(productId); showToast('Added to favorites ❤️'); }
  localStorage.setItem('loyy_favs', JSON.stringify(favorites));
  updateBadges();
  renderFeatured();
  renderAllProducts(getActiveCat('productCatFilter'));
  renderFavorites();
}
function renderFavorites() {
  const favProds = allProducts.filter(p => favorites.includes(p.id));
  if (!favProds.length) { $('favGrid').style.display = 'none'; $('favEmpty').style.display = 'flex'; }
  else { $('favGrid').style.display = 'grid'; $('favEmpty').style.display = 'none'; renderProductGrid('favGrid', favProds); }
}

// ==================== CATEGORY FILTERS ====================
function setupCatFilter(containerId, onSelect) {
  const container = $(containerId);
  if (!container) return;
  container.querySelectorAll('.cat-chip').forEach(chip => chip.addEventListener('click', () => {
    container.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    onSelect(chip.dataset.cat);
  }));
}
setupCatFilter('categoryGrid', cat => {
  const list = cat === 'all' ? allProducts.filter(p => p.featured) : allProducts.filter(p => p.category === cat);
  renderProductGrid('featuredGrid', list.length ? list : allProducts.slice(0, 4));
});
setupCatFilter('productCatFilter', renderAllProducts);

// ==================== AUTH ====================
$('loginBtn').addEventListener('click', () => openModal('loginModal'));
$('showRegister').addEventListener('click', () => { closeModal('loginModal'); openModal('registerModal'); });
$('showLogin').addEventListener('click', () => { closeModal('registerModal'); openModal('loginModal'); });
$('loginSubmit').addEventListener('click', () => {
  const email = $('loginEmail').value.trim(), pass = $('loginPassword').value;
  const err = $('loginError'); err.textContent = '';
  if (!email || !pass) { err.textContent = 'Fill all fields.'; return; }
  auth.signInWithEmailAndPassword(email, pass)
    .then(() => { closeModal('loginModal'); showToast('Welcome back!'); })
    .catch(e => err.textContent = e.message);
});
$('regSubmit').addEventListener('click', () => {
  const name = $('regName').value.trim(), email = $('regEmail').value.trim(), pass = $('regPassword').value;
  const err = $('regError'); err.textContent = '';
  if (!name || !email || !pass) { err.textContent = 'Fill all fields.'; return; }
  if (pass.length < 6) { err.textContent = 'Password min 6 chars.'; return; }
  auth.createUserWithEmailAndPassword(email, pass)
    .then(cred => cred.user.updateProfile({ displayName: name }))
    .then(() => { closeModal('registerModal'); showToast('Account created!'); })
    .catch(e => err.textContent = e.message);
});
$('logoutRow').addEventListener('click', () => auth.signOut());

auth.onAuthStateChanged(user => {
  currentUser = user;
  isAdmin = !!(user && user.email === ADMIN_EMAIL);
  if (user) {
    $('settingsUserName').textContent = user.displayName || 'User';
    $('settingsUserEmail').textContent = user.email;
    $('loginBtn').style.display = 'none';
    $('logoutRow').style.display = 'flex';
    $('goAdminBtn').style.display = isAdmin ? 'block' : 'none';
    $('ordersNavBtn').style.display = 'flex';
    $('ordersNavBnavBtn').style.display = 'flex';
    $('myOrdersRow').style.display = 'flex';
    prevOrderStatuses = {};
    listenUserOrders(user.uid);
    if (isAdmin) listenAdminOrders();
  } else {
    $('settingsUserName').textContent = 'Guest User';
    $('settingsUserEmail').textContent = 'Not logged in';
    $('loginBtn').style.display = 'block';
    $('logoutRow').style.display = 'none';
    $('goAdminBtn').style.display = 'none';
    $('ordersNavBtn').style.display = 'none';
    $('ordersNavBnavBtn').style.display = 'none';
    $('myOrdersRow').style.display = 'none';
    $('ordersBadge').textContent = '0';
    $('ordersBadge').classList.remove('visible');
    if (userOrdersUnsub) { userOrdersUnsub(); userOrdersUnsub = null; }
    if (adminOrdersUnsub) { adminOrdersUnsub(); adminOrdersUnsub = null; }
  }
});

$('goAdminBtn').addEventListener('click', () => {
  if (isAdmin) {
    $('adminPanel').classList.add('open');
    const ab = $('adminOrdersBadge');
    if (ab) { ab.textContent = '0'; ab.classList.remove('visible'); }
  } else showToast('Admin access only');
});
$('closeAdmin').addEventListener('click', () => $('adminPanel').classList.remove('open'));

// ==================== USER ORDER LISTENER ====================
let userOrders = [];
let isFirstUserOrderLoad = true;

function listenUserOrders(uid) {
  if (userOrdersUnsub) { userOrdersUnsub(); userOrdersUnsub = null; }
  isFirstUserOrderLoad = true;
  function applySnapshot(docs) {
    const newOrders = docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => { const ta = a.createdAt?.toMillis?.() || 0; const tb = b.createdAt?.toMillis?.() || 0; return tb - ta; });
    if (!isFirstUserOrderLoad) {
      newOrders.forEach(order => {
        const prev = prevOrderStatuses[order.id];
        const curr = order.status;
        if (prev !== undefined && prev !== curr) handleUserOrderStatusChange(order, prev, curr);
      });
    }
    newOrders.forEach(o => { prevOrderStatuses[o.id] = o.status; });
    userOrders = newOrders;
    isFirstUserOrderLoad = false;
    const unread = userOrders.filter(o => o.notifUnread).length;
    $('ordersBadge').textContent = unread;
    $('ordersBadge').classList.toggle('visible', unread > 0);
    if ($('page-orders').classList.contains('active')) renderOrderHistory();
  }
  userOrdersUnsub = db.collection('orders').where('userId', '==', uid).orderBy('createdAt', 'desc')
    .onSnapshot(snap => applySnapshot(snap.docs), err => {
      console.warn('Order query needs index, falling back:', err.message);
      userOrdersUnsub = db.collection('orders').where('userId', '==', uid)
        .onSnapshot(snap => applySnapshot(snap.docs), err2 => console.error('Orders listener failed:', err2));
    });
}

function handleUserOrderStatusChange(order, prevStatus, newStatus) {
  const shortId = order.id.slice(0, 8).toUpperCase();
  if (newStatus === 'prepare') showNotifBanner('📦', 'Order Being Prepared!', `Order #${shortId} has been approved and is being prepared for you.`, () => navigateTo('orders'));
  else if (newStatus === 'delivery') showNotifBanner('🚚', 'Order Out for Delivery!', `Order #${shortId} is on its way to you. Get ready!`, () => navigateTo('orders'));
  else if (newStatus === 'rejected') showNotifBanner('❌', 'Order Rejected', `Order #${shortId} was rejected. Please contact us via Telegram.`, () => navigateTo('orders'));
}

function markUserNotifsRead() {
  if (!currentUser) return;
  userOrders.forEach(o => { if (o.notifUnread) db.collection('orders').doc(o.id).update({ notifUnread: false }).catch(() => {}); });
  $('ordersBadge').textContent = '0';
  $('ordersBadge').classList.remove('visible');
}

// ==================== ADMIN ORDER LISTENER ====================
let isFirstAdminLoad = true;
function listenAdminOrders() {
  if (adminOrdersUnsub) { adminOrdersUnsub(); adminOrdersUnsub = null; }
  isFirstAdminLoad = true;
  adminOrdersUnsub = db.collection('orders').orderBy('createdAt', 'desc').onSnapshot(snap => {
    const orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const pendingCount = orders.filter(o => o.status === 'pending').length;
    const badge = $('adminOrdersBadge');
    if (badge) { badge.textContent = pendingCount; badge.classList.toggle('visible', pendingCount > 0); }
    if (!isFirstAdminLoad) {
      snap.docChanges().forEach(change => {
        if (change.type === 'added') {
          const o = { id: change.doc.id, ...change.doc.data() };
          if (o.status === 'pending') showNotifBanner('🛒', 'New Order Received!', `${o.customer?.name || 'A customer'} placed an order — $${Number(o.total).toFixed(2)}`, () => { $('adminPanel').classList.add('open'); loadAdminOrders(); });
        }
      });
    }
    isFirstAdminLoad = false;
    if ($('atab-orders')?.classList.contains('active') && $('adminPanel').classList.contains('open')) renderAdminOrdersList(orders);
  }, err => console.warn('Admin orders listener error:', err));
}

// ==================== ORDER HISTORY (User) ====================
function renderOrderHistory() {
  if (!currentUser) { $('orderHistoryList').innerHTML = ''; $('ordersEmpty').style.display = 'flex'; $('ordersEmpty').querySelector('p').textContent = 'Please login to see your orders'; return; }
  if (!userOrders.length) { $('orderHistoryList').innerHTML = ''; $('ordersEmpty').style.display = 'flex'; $('ordersEmpty').querySelector('p').textContent = 'No orders yet'; return; }
  $('ordersEmpty').style.display = 'none';
  $('orderHistoryList').innerHTML = userOrders.map(o => {
    const statusLabel = { pending: 'Pending', prepare: 'Preparing', delivery: 'Delivery', rejected: 'Rejected' }[o.status] || o.status;
    const itemsSummary = (o.items || []).map(i => `${i.name} ×${i.qty}`).join(', ');
    const isUnread = o.notifUnread;
    return `<div class="order-hist-card${isUnread ? ' order-unread' : ''}" data-id="${o.id}">${isUnread ? '<div class="order-unread-dot"></div>' : ''}<div class="order-hist-header"><span class="order-hist-id">#${o.id.slice(0, 8).toUpperCase()}</span><span class="status-badge ${o.status}">${statusLabel}</span></div><div class="order-hist-items">${itemsSummary}</div><div class="order-hist-footer"><span class="order-hist-total">$${Number(o.total).toFixed(2)}</span><span style="font-size:11px;color:var(--gray)">${formatDate(o.createdAt)}</span></div></div>`;
  }).join('');
  document.querySelectorAll('.order-hist-card').forEach(card => {
    card.addEventListener('click', () => {
      const oid = card.dataset.id;
      if (card.classList.contains('order-unread')) db.collection('orders').doc(oid).update({ notifUnread: false }).catch(() => {});
      showOrderHistDetail(oid);
    });
  });
}

function showOrderHistDetail(orderId) {
  const o = userOrders.find(x => x.id === orderId);
  if (!o) return;
  const steps = [{ key: 'pending', label: 'Pending', icon: '📋' }, { key: 'prepare', label: 'Preparing', icon: '📦' }, { key: 'delivery', label: 'Delivery', icon: '🚚' }];
  const statusOrder = ['pending', 'prepare', 'delivery'];
  const currentIdx = statusOrder.indexOf(o.status);
  const timelineHtml = `<div class="order-timeline">${steps.map((s, i) => { const cls = i < currentIdx ? 'done' : (i === currentIdx ? 'active' : ''); const icon = i < currentIdx ? '✓' : s.icon; return `<div class="tl-step"><div class="tl-dot ${cls}">${icon}</div><div class="tl-label ${cls}">${s.icon} ${s.label}</div></div>`; }).join('')}</div>`;
  const rejectedBanner = o.status === 'rejected' ? `<div style="background:rgba(229,62,62,0.1);border:1px solid #e53e3e;border-radius:8px;padding:12px;margin-bottom:12px;font-size:13px;color:#e53e3e;text-align:center">❌ Order was rejected. Please contact support via Telegram.</div>` : '';
  $('orderHistDetailContent').innerHTML = `${rejectedBanner}${o.status !== 'rejected' ? timelineHtml : ''}<div class="order-detail-section"><h4 style="font-size:14px;font-weight:700;margin-bottom:10px;color:var(--accent)">Order Info</h4><div class="order-detail-row"><span>Order ID</span><span>#${o.id.slice(0, 8).toUpperCase()}</span></div><div class="order-detail-row"><span>Status</span><span class="status-badge ${o.status}">${o.status}</span></div><div class="order-detail-row"><span>Date</span><span>${formatDate(o.createdAt)}</span></div><div class="order-detail-row"><span>Subtotal</span><span>$${(Number(o.total) - DELIVERY_FEE).toFixed(2)}</span></div><div class="order-detail-row"><span>Delivery</span><span>$${DELIVERY_FEE.toFixed(2)}</span></div><div class="order-detail-row"><span style="font-weight:700">Total</span><span style="color:var(--accent);font-weight:700">$${Number(o.total).toFixed(2)}</span></div></div><div class="order-detail-section"><h4 style="font-size:14px;font-weight:700;margin-bottom:10px;color:var(--accent)">Delivery To</h4><div class="order-detail-row"><span>Name</span><span>${o.customer?.name || ''}</span></div><div class="order-detail-row"><span>Phone</span><span>${o.customer?.phone || ''}</span></div><div class="order-detail-row"><span>Address</span><span>${o.customer?.address || ''}</span></div></div><div class="order-detail-section"><h4 style="font-size:14px;font-weight:700;margin-bottom:10px;color:var(--accent)">Items</h4>${(o.items || []).map(i => `<div class="order-detail-row"><span>${i.name} ×${i.qty}${i.size ? ' · ' + i.size : ''}${i.color ? ' · ' + i.color : ''}</span><span>$${(i.price * i.qty).toFixed(2)}</span></div>`).join('')}</div>${o.screenshotUrl ? `<div class="order-detail-section"><h4 style="font-size:14px;font-weight:700;margin-bottom:10px">Payment Screenshot</h4><img src="${o.screenshotUrl}" class="order-ss-img"/></div>` : ''}`;
  openModal('orderHistDetailModal');
}

// ==================== CHECKOUT ====================
$('checkoutBtn').addEventListener('click', () => {
  if (!cart.length) { showToast('Cart is empty'); return; }
  if (!currentUser) { showToast('Please login to place an order'); openModal('loginModal'); return; }
  $('step1').style.display = 'block';
  $('step2').style.display = 'none';
  $('step3').style.display = 'none';
  const sub = cart.reduce((s, i) => s + i.price * i.qty, 0);
  $('checkoutSubtotal').textContent = `$${sub.toFixed(2)}`;
  $('checkoutTotal').textContent = `$${(sub + DELIVERY_FEE).toFixed(2)}`;
  openModal('checkoutModal');
});

$('step1Next').addEventListener('click', () => {
  const name = $('co_name').value.trim(), phone = $('co_phone').value.trim(), address = $('co_address').value.trim();
  if (!name || !phone || !address) { showToast('Fill all fields (Name, Phone, Address)'); return; }
  checkoutCustomer = { name, phone, address };
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0) + DELIVERY_FEE;
  $('qrAmount').textContent = `$${total.toFixed(2)}`;
  const qrContainer = $('qrContainer');
  if (globalQrPaymentUrl) qrContainer.innerHTML = `<img src="${globalQrPaymentUrl}" style="width:160px;border-radius:8px"/>`;
  closeModal('checkoutModal');
  openModal('paymentWarningModal');
});

$('warningAgreeBtn').addEventListener('click', () => {
  closeModal('paymentWarningModal');
  $('step1').style.display = 'none';
  $('step2').style.display = 'block';
  $('step3').style.display = 'none';
  openModal('checkoutModal');
});

$('paymentScreenshot').addEventListener('change', function () {
  if (this.files[0]) $('uploadFileName').textContent = '📎 ' + this.files[0].name;
});

$('step2Next').addEventListener('click', async function () {
  const file = $('paymentScreenshot').files[0];
  if (!file) { showToast('Please upload payment screenshot'); return; }
  const btn = this; btn.textContent = 'Submitting...'; btn.disabled = true;
  try {
    let screenshotUrl = null;
    if (CLOUDINARY_PRESET !== "YOUR_UNSIGNED_PRESET") {
      const fd = new FormData(); fd.append('file', file); fd.append('upload_preset', CLOUDINARY_PRESET);
      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, { method: 'POST', body: fd });
      const data = await res.json();
      screenshotUrl = data.secure_url;
    } else { screenshotUrl = 'https://via.placeholder.com/400?text=Payment+Proof'; }
    const total = cart.reduce((s, i) => s + i.price * i.qty, 0) + DELIVERY_FEE;
    const docRef = await db.collection('orders').add({
      customer: checkoutCustomer,
      items: cart.map(i => ({ id: i.id, name: i.name, price: i.price, qty: i.qty, size: i.size || null, color: i.color || null })),
      total, deliveryFee: DELIVERY_FEE, status: 'pending', notifUnread: true,
      screenshotUrl, userId: currentUser.uid, userEmail: currentUser.email,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    $('confirmedOrderId').textContent = docRef.id.slice(0, 8).toUpperCase();
    const batch = db.batch();
    cart.forEach(item => { const ref = db.collection('products').doc(item.id); batch.update(ref, { stock: firebase.firestore.FieldValue.increment(-item.qty) }); });
    batch.commit().catch(e => console.warn('Stock update failed:', e));
    cart = []; saveCart(); renderCart();
    $('step2').style.display = 'none'; $('step3').style.display = 'block';
    showToast('Order placed! 🎉');
  } catch (err) { console.error(err); showToast('Error placing order'); }
  finally { btn.textContent = 'Submit Order'; btn.disabled = false; }
});

// ==================== ADMIN PANEL ====================
function setupAdminTabs() {
  document.querySelectorAll('.atab').forEach(tab => tab.onclick = () => {
    document.querySelectorAll('.atab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.atab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    $(`atab-${tab.dataset.atab}`).classList.add('active');
    if (tab.dataset.atab === 'products') renderAdminProducts();
    if (tab.dataset.atab === 'orders') loadAdminOrders();
    if (tab.dataset.atab === 'settings') loadQrSettingsForDisplay();
  });
}

function loadAdminOrders() {
  const container = $('adminOrdersList');
  container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--gray)">Loading orders...</div>';
  db.collection('orders').orderBy('createdAt', 'desc').get().then(snap => {
    const orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderAdminOrdersList(orders);
  });
}

function renderAdminOrdersList(orders) {
  const container = $('adminOrdersList');
  if (!container) return;
  if (!orders.length) { container.innerHTML = '<p style="color:var(--gray);padding:20px;text-align:center">No orders yet.</p>'; return; }
  container.innerHTML = orders.map(o => {
    const actionBtns = getAdminActionBtns(o);
    return `<div class="admin-order-card"><div class="order-card-header"><span class="order-id">#${o.id.slice(0, 8).toUpperCase()}</span><span class="order-status ${o.status}">${o.status}</span></div><div class="order-card-customer">${o.customer?.name || 'Unknown'} · ${o.customer?.phone || ''}</div><div style="font-size:12px;color:var(--gray);margin-bottom:6px">${o.userEmail || ''}</div><div class="order-card-amount">$${Number(o.total).toFixed(2)}</div><div class="order-card-actions"><button class="view-ss-btn" data-id="${o.id}">View Details</button>${actionBtns}</div></div>`;
  }).join('');
  container.querySelectorAll('.view-ss-btn').forEach(b => b.onclick = () => showOrderDetail(b.dataset.id));
  container.querySelectorAll('.approve-btn').forEach(b => b.onclick = () => updateOrderStatus(b.dataset.id, 'prepare'));
  container.querySelectorAll('.delivery-btn').forEach(b => b.onclick = () => updateOrderStatus(b.dataset.id, 'delivery'));
  container.querySelectorAll('.reject-btn').forEach(b => b.onclick = () => updateOrderStatus(b.dataset.id, 'rejected'));
}

function getAdminActionBtns(o) {
  if (o.status === 'pending') return `<button class="approve-btn" data-id="${o.id}">📦 Prepare</button><button class="reject-btn" data-id="${o.id}">✗ Reject</button>`;
  if (o.status === 'prepare') return `<button class="delivery-btn" data-id="${o.id}">🚚 Send Delivery</button>`;
  return '';
}

function updateOrderStatus(id, status) {
  const updateData = { status };
  if (['prepare', 'delivery', 'rejected'].includes(status)) updateData.notifUnread = true;
  db.collection('orders').doc(id).update(updateData)
    .then(() => { showToast(`Order moved to: ${status}!`); loadAdminOrders(); })
    .catch(() => showToast('Error updating'));
}

function showOrderDetail(id) {
  db.collection('orders').doc(id).get().then(doc => {
    if (!doc.exists) return;
    const o = { id: doc.id, ...doc.data() };
    const actionBtns = getAdminActionBtns(o);
    $('orderDetailContent').innerHTML = `<div class="order-detail-section"><h4 style="margin-bottom:10px;color:var(--accent)">Order Info</h4><div class="order-detail-row"><span>Order ID</span><span>#${o.id.slice(0, 8).toUpperCase()}</span></div><div class="order-detail-row"><span>Status</span><span class="order-status ${o.status}">${o.status}</span></div><div class="order-detail-row"><span>Total</span><span style="color:var(--accent);font-weight:700">$${Number(o.total).toFixed(2)}</span></div></div><div class="order-detail-section"><h4 style="margin-bottom:10px;color:var(--accent)">Customer</h4><div class="order-detail-row"><span>Name</span><span>${o.customer?.name || ''}</span></div><div class="order-detail-row"><span>Phone</span><span>${o.customer?.phone || ''}</span></div><div class="order-detail-row"><span>Address</span><span>${o.customer?.address || ''}</span></div><div class="order-detail-row"><span>Email</span><span>${o.userEmail || ''}</span></div></div><div class="order-detail-section"><h4 style="margin-bottom:10px;color:var(--accent)">Items</h4>${(o.items || []).map(i => `<div class="order-detail-row"><span>${i.name} ×${i.qty}${i.size ? ' · Size: ' + i.size : ''}${i.color ? ' · Color: ' + i.color : ''}</span><span>$${(i.price * i.qty).toFixed(2)}</span></div>`).join('')}<div class="order-detail-row"><span>Delivery Fee</span><span>$${DELIVERY_FEE.toFixed(2)}</span></div></div>${o.screenshotUrl ? `<div class="order-detail-section"><h4 style="margin-bottom:8px">Payment Screenshot</h4><img src="${o.screenshotUrl}" class="order-ss-img"/></div>` : '<p style="color:var(--gray);font-size:13px">No screenshot uploaded</p>'}${actionBtns ? `<div style="display:flex;gap:10px;margin-top:16px">${o.status === 'pending' ? `<button class="approve-btn" id="detailApprove" style="flex:1">📦 Prepare</button><button class="reject-btn" id="detailReject" style="flex:1">✗ Reject</button>` : o.status === 'prepare' ? `<button class="delivery-btn" id="detailDelivery" style="flex:1">🚚 Send Delivery</button>` : ''}</div>` : ''}`;
    openModal('orderDetailModal');
    if ($('detailApprove')) $('detailApprove').onclick = () => { updateOrderStatus(o.id, 'prepare'); closeModal('orderDetailModal'); };
    if ($('detailReject')) $('detailReject').onclick = () => { updateOrderStatus(o.id, 'rejected'); closeModal('orderDetailModal'); };
    if ($('detailDelivery')) $('detailDelivery').onclick = () => { updateOrderStatus(o.id, 'delivery'); closeModal('orderDetailModal'); };
  });
}

function renderAdminProducts() {
  const container = $('adminProductsList');
  if (!allProducts.length) { container.innerHTML = '<p style="color:var(--gray);padding:20px;text-align:center">No products yet.</p>'; return; }
  container.innerHTML = allProducts.map(p => {
    const sizes = parseVariants(p.sizes);
    const colors = parseVariants(p.colors);
    const variantInfo = [sizes.length ? `Sizes: ${sizes.join(', ')}` : '', colors.length ? `Colors: ${colors.join(', ')}` : ''].filter(Boolean).join(' | ');
    return `<div class="admin-product-card"><div class="admin-prod-img">${p.imageUrl ? `<img src="${p.imageUrl}"/>` : (p.emoji || getCatEmoji(p.category))}</div><div class="admin-prod-info"><div class="admin-prod-name">${p.name}</div><div class="admin-prod-meta">${p.category} · Stock: ${p.stock || 0}</div>${variantInfo ? `<div class="admin-prod-meta" style="color:var(--accent);margin-top:2px;font-size:11px">${variantInfo}</div>` : ''}</div><div class="admin-prod-price">$${Number(p.price).toFixed(2)}</div><div class="admin-prod-actions"><button class="edit-btn" data-id="${p.id}">Edit</button><button class="delete-btn" data-id="${p.id}">Delete</button></div></div>`;
  }).join('');
  container.querySelectorAll('.edit-btn').forEach(b => b.onclick = () => startEditProduct(b.dataset.id));
  container.querySelectorAll('.delete-btn').forEach(b => b.onclick = () => deleteProduct(b.dataset.id));
}

function startEditProduct(id) {
  const p = allProducts.find(x => x.id === id); if (!p) return;
  currentEditProductId = id;
  $('ap_name').value = p.name; $('ap_price').value = p.price; $('ap_category').value = p.category;
  $('ap_desc').value = p.description || ''; $('ap_imageUrl').value = p.imageUrl || ''; $('ap_stock').value = p.stock || 0; $('ap_featured').value = String(!!p.featured);
  $('ap_sizes').value = p.sizes || ''; $('ap_colors').value = p.colors || '';
  if (p.imageUrl) { $('ap_imagePreview').src = p.imageUrl; $('ap_imagePreview').style.display = 'block'; }
  $('addProductTitle').textContent = 'Edit Product'; $('cancelEditBtn').style.display = 'block';
  document.querySelectorAll('.atab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.atab-content').forEach(c => c.classList.remove('active'));
  document.querySelector('.atab[data-atab="add"]').classList.add('active');
  $('atab-add').classList.add('active');
}

function clearProductForm() {
  ['ap_name', 'ap_price', 'ap_desc', 'ap_imageUrl', 'ap_stock', 'ap_sizes', 'ap_colors'].forEach(id => $(id).value = '');
  $('ap_category').value = 't-shirts'; $('ap_featured').value = 'false'; $('ap_imagePreview').style.display = 'none'; $('apError').textContent = '';
}
function deleteProduct(id) { if (confirm('Delete product?')) db.collection('products').doc(id).delete().then(() => showToast('Deleted')).catch(() => showToast('Error')); }
$('ap_imageUrl').addEventListener('input', () => { const url = $('ap_imageUrl').value.trim(); $('ap_imagePreview').src = url; $('ap_imagePreview').style.display = url ? 'block' : 'none'; });
$('ap_imageFile').addEventListener('change', async function () {
  const file = this.files[0]; if (!file) return;
  $('uploadProgress').style.display = 'block'; $('progressFill').style.width = '20%'; $('progressText').textContent = 'Uploading...';
  if (CLOUDINARY_PRESET !== "YOUR_UNSIGNED_PRESET") {
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('upload_preset', CLOUDINARY_PRESET);
      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, { method: 'POST', body: fd });
      const data = await res.json();
      $('progressFill').style.width = '100%'; $('progressText').textContent = 'Done!';
      $('ap_imageUrl').value = data.secure_url; $('ap_imagePreview').src = data.secure_url; $('ap_imagePreview').style.display = 'block';
    } catch (e) { $('progressText').textContent = 'Upload failed!'; showToast('Upload failed'); }
  } else showToast('Set CLOUDINARY_PRESET first');
  setTimeout(() => { $('uploadProgress').style.display = 'none'; $('progressFill').style.width = '0%'; }, 1500);
});

$('saveProductBtn').addEventListener('click', async () => {
  const name = $('ap_name').value.trim(), price = parseFloat($('ap_price').value), category = $('ap_category').value,
    description = $('ap_desc').value.trim(), imageUrl = $('ap_imageUrl').value.trim(),
    stock = parseInt($('ap_stock').value) || 0, featured = $('ap_featured').value === 'true',
    sizes = $('ap_sizes').value.trim(), colors = $('ap_colors').value.trim();
  const errEl = $('apError'); errEl.textContent = '';
  if (!name) { errEl.textContent = 'Product name required'; return; }
  if (isNaN(price) || price <= 0) { errEl.textContent = 'Valid price required'; return; }
  const productData = { name, price, category, description, imageUrl, stock, featured, sizes, colors, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
  try {
    if (currentEditProductId) { await db.collection('products').doc(currentEditProductId).update(productData); showToast('Product updated!'); }
    else { productData.createdAt = firebase.firestore.FieldValue.serverTimestamp(); await db.collection('products').add(productData); showToast('Product added!'); }
    clearProductForm(); currentEditProductId = null;
    $('addProductTitle').textContent = 'Add New Product'; $('cancelEditBtn').style.display = 'none';
    document.querySelector('.atab[data-atab="products"]').click();
  } catch (err) { errEl.textContent = 'Save failed: ' + err.message; showToast('Error saving product'); }
});
$('cancelEditBtn').addEventListener('click', () => { currentEditProductId = null; $('addProductTitle').textContent = 'Add New Product'; $('cancelEditBtn').style.display = 'none'; clearProductForm(); });

// ==================== ADMIN QR SETTINGS ====================
async function loadQrSettingsForDisplay() {
  const doc = await db.collection('settings').doc('payment').get();
  if (doc.exists && doc.data().qrUrl) { globalQrPaymentUrl = doc.data().qrUrl; $('qrImagePreview').src = globalQrPaymentUrl; $('qrImagePreview').style.display = 'block'; }
  else { globalQrPaymentUrl = null; $('qrImagePreview').style.display = 'none'; }
}
$('qrImageFile').addEventListener('change', function (e) {
  const file = e.target.files[0];
  if (file) { const reader = new FileReader(); reader.onload = ev => { $('qrImagePreview').src = ev.target.result; $('qrImagePreview').style.display = 'block'; }; reader.readAsDataURL(file); pendingQrFile = file; }
  else { pendingQrFile = null; $('qrImagePreview').style.display = 'none'; }
});
$('saveQrSettingsBtn').addEventListener('click', async () => {
  const file = $('qrImageFile').files[0];
  if (!file && !globalQrPaymentUrl) { showToast('Please select a QR image'); return; }
  if (!file) { showToast('No new image selected'); return; }
  const btn = $('saveQrSettingsBtn'); btn.textContent = 'Uploading...'; btn.disabled = true;
  const progressDiv = $('qrUploadProgress'); progressDiv.style.display = 'block'; $('qrProgressFill').style.width = '20%'; $('qrProgressText').textContent = 'Uploading QR...';
  try {
    if (CLOUDINARY_PRESET === "YOUR_UNSIGNED_PRESET") throw new Error('Cloudinary preset not configured');
    const fd = new FormData(); fd.append('file', file); fd.append('upload_preset', CLOUDINARY_PRESET);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, { method: 'POST', body: fd });
    const data = await res.json();
    $('qrProgressFill').style.width = '100%'; $('qrProgressText').textContent = 'Done!';
    await db.collection('settings').doc('payment').set({ qrUrl: data.secure_url, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    globalQrPaymentUrl = data.secure_url;
    showToast('QR code updated!');
    $('qrImageFile').value = ''; pendingQrFile = null;
  } catch (err) { $('qrSettingsError').textContent = 'Upload failed: ' + err.message; showToast('Error uploading QR'); }
  finally { setTimeout(() => { progressDiv.style.display = 'none'; $('qrProgressFill').style.width = '0%'; }, 1000); btn.textContent = 'Save QR Settings'; btn.disabled = false; }
});

// ==================== INIT ====================
loadProducts();
setupAdminTabs();
db.collection('settings').doc('payment').onSnapshot(doc => {
  globalQrPaymentUrl = (doc.exists && doc.data().qrUrl) ? doc.data().qrUrl : null;
});
