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
let userOrdersUnsub = null; // firestore listener for user orders

// ==================== HELPERS ====================
function $(id) { return document.getElementById(id); }
function showToast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2200); }
function openModal(id) { $(id).classList.add('open'); }
function closeModal(id) { $(id).classList.remove('open'); }
function showLoading(msg = 'Loading…') { const o = $('loadingOverlay'); if (!o) return; o.querySelector('p').textContent = msg; o.classList.add('visible'); }
function hideLoading() { const o = $('loadingOverlay'); if (!o) return; o.classList.remove('visible'); }
function updateBadges() {
  const cc = cart.reduce((s, i) => s + i.qty, 0);
  const cb = $('cartBadge'); cb.textContent = cc; cb.classList.toggle('visible', cc > 0);
  favorites.length > 0 ? $('favBadge').classList.add('visible') : $('favBadge').classList.remove('visible');
  $('favBadge').textContent = favorites.length;
}
function saveCart() { localStorage.setItem('loyy_cart', JSON.stringify(cart)); updateBadges(); }
function getCatEmoji(cat) { return { 't-shirts': '👕', accessories: '📿', shoes: '👟', clothing: '🧥' }[cat] || '🛍️'; }
function formatDate(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
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
  if (page === 'orders') renderOrderHistory();
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
    { id: 'd1', name: 'LC Street Tee', category: 't-shirts', price: 29.99, description: 'Premium cotton street tee.', emoji: '👕', featured: true, stock: 20 },
    { id: 'd2', name: 'Gold Chain Necklace', category: 'accessories', price: 49.99, description: 'Gold-plated chain.', emoji: '📿', featured: true, stock: 15 },
    { id: 'd3', name: 'Air Culture Kicks', category: 'shoes', price: 119.99, description: 'Lightweight runners.', emoji: '👟', featured: true, stock: 10 },
    { id: 'd4', name: 'Oversized Hoodie', category: 'clothing', price: 69.99, description: 'Heavy fleece hoodie.', emoji: '🧥', featured: false, stock: 8 }
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
    const img = p.imageUrl ? `<img src="${p.imageUrl}" alt="${p.name}" loading="lazy"/>` : `<div class="product-img-placeholder">${p.emoji || getCatEmoji(p.category)}</div>`;
    return `<div class="product-card" data-id="${p.id}"><div class="product-card-img">${img}</div><div class="product-card-body"><div class="product-card-cat">${p.category}</div><div class="product-card-name">${p.name}</div><div class="product-card-bottom"><div class="product-card-price">$${Number(p.price).toFixed(2)}</div><div style="display:flex;gap:6px;"><button class="fav-btn ${isFav ? 'active' : ''}" title="Favorite"><svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></button><button class="add-cart-btn">+ Cart</button></div></div></div></div>`;
  }).join('');
  grid.querySelectorAll('.product-card').forEach(card => {
    const pid = card.dataset.id;
    card.addEventListener('click', e => { if (!e.target.closest('.fav-btn') && !e.target.closest('.add-cart-btn')) showProductDetail(pid); });
    card.querySelector('.fav-btn')?.addEventListener('click', e => { e.stopPropagation(); toggleFav(pid); });
    card.querySelector('.add-cart-btn')?.addEventListener('click', e => { e.stopPropagation(); addToCart(pid); });
  });
}
function showProductDetail(id) {
  const p = allProducts.find(x => x.id === id);
  if (!p) return;
  const isFav = favorites.includes(p.id);
  const img = p.imageUrl ? `<img src="${p.imageUrl}" alt="${p.name}"/>` : `<div style="font-size:90px;display:flex;align-items:center;justify-content:center;height:100%">${p.emoji || getCatEmoji(p.category)}</div>`;
  $('productModalContent').innerHTML = `<div class="product-detail-img">${img}</div><div class="product-detail-cat">${p.category}</div><div class="product-detail-name">${p.name}</div><div class="product-detail-price">$${Number(p.price).toFixed(2)}</div><div class="product-detail-desc">${p.description || ''}</div><div class="product-detail-actions"><button class="btn-primary" id="pdAddCart">Add to Cart</button><button class="fav-btn ${isFav ? 'active' : ''}" id="pdFav" style="padding:12px;border:1px solid var(--border);border-radius:8px"><svg viewBox="0 0 24 24" width="22"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></button></div>`;
  $('pdAddCart').onclick = () => { addToCart(p.id); closeModal('productModal'); };
  $('pdFav').onclick = () => toggleFav(p.id);
  openModal('productModal');
}

// ==================== CART ====================
function addToCart(productId) {
  const p = allProducts.find(x => x.id === productId);
  if (!p) return;
  const existing = cart.find(x => x.id === productId);
  if (existing) existing.qty++;
  else cart.push({ id: p.id, name: p.name, price: p.price, imageUrl: p.imageUrl, emoji: p.emoji || getCatEmoji(p.category), qty: 1 });
  saveCart();
  showToast(`${p.name} added to cart!`);
}
function renderCart() {
  const list = $('cartItems'), summary = $('cartSummary'), empty = $('cartEmpty');
  if (!cart.length) { list.innerHTML = ''; summary.style.display = 'none'; empty.style.display = 'flex'; return; }
  empty.style.display = 'none'; summary.style.display = 'block';
  list.innerHTML = cart.map(item => `<div class="cart-item" data-id="${item.id}"><div class="cart-item-img">${item.imageUrl ? `<img src="${item.imageUrl}"/>` : item.emoji}</div><div class="cart-item-info"><div class="cart-item-name">${item.name}</div><div class="cart-item-price">$${(item.price * item.qty).toFixed(2)}</div></div><div class="cart-item-actions"><div class="qty-controls"><button class="qty-btn qty-minus" data-id="${item.id}">−</button><span class="qty-num">${item.qty}</span><button class="qty-btn qty-plus" data-id="${item.id}">+</button></div><button class="remove-btn" data-id="${item.id}">Remove</button></div></div>`).join('');
  list.querySelectorAll('.qty-plus').forEach(b => b.onclick = () => updateQty(b.dataset.id, 1));
  list.querySelectorAll('.qty-minus').forEach(b => b.onclick = () => updateQty(b.dataset.id, -1));
  list.querySelectorAll('.remove-btn').forEach(b => b.onclick = () => removeFromCart(b.dataset.id));
  const sub = cart.reduce((s, i) => s + i.price * i.qty, 0);
  $('cartSubtotal').textContent = `$${sub.toFixed(2)}`;
  $('cartTotal').textContent = `$${(sub + DELIVERY_FEE).toFixed(2)}`;
}
function updateQty(id, delta) { const idx = cart.findIndex(x => x.id === id); if (idx === -1) return; cart[idx].qty += delta; if (cart[idx].qty <= 0) cart.splice(idx, 1); saveCart(); renderCart(); }
function removeFromCart(id) { cart = cart.filter(x => x.id !== id); saveCart(); renderCart(); }

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
    listenUserOrders(user.uid);
  } else {
    $('settingsUserName').textContent = 'Guest User';
    $('settingsUserEmail').textContent = 'Not logged in';
    $('loginBtn').style.display = 'block';
    $('logoutRow').style.display = 'none';
    $('goAdminBtn').style.display = 'none';
    $('ordersNavBtn').style.display = 'none';
    $('ordersNavBnavBtn').style.display = 'none';
    $('myOrdersRow').style.display = 'none';
    $('ordersBadge').classList.remove('visible');
    if (userOrdersUnsub) { userOrdersUnsub(); userOrdersUnsub = null; }
  }
});
$('goAdminBtn').addEventListener('click', () => { if (isAdmin) $('adminPanel').classList.add('open'); else showToast('Admin access only'); });
$('closeAdmin').addEventListener('click', () => $('adminPanel').classList.remove('open'));

// ==================== ORDER HISTORY (User) ====================
let userOrders = [];

function listenUserOrders(uid) {
  if (userOrdersUnsub) userOrdersUnsub();
  userOrdersUnsub = db.collection('orders')
    .where('userId', '==', uid)
    .orderBy('createdAt', 'desc')
    .onSnapshot(snap => {
      userOrders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const pending = userOrders.filter(o => o.status === 'pending').length;
      $('ordersBadge').textContent = pending;
      $('ordersBadge').classList.toggle('visible', pending > 0);
      // Re-render if on orders page
      if ($('page-orders').classList.contains('active')) renderOrderHistory();
    }, err => console.warn('Orders listener error:', err));
}

function renderOrderHistory() {
  if (!currentUser) {
    $('orderHistoryList').innerHTML = '';
    $('ordersEmpty').style.display = 'flex';
    $('ordersEmpty').querySelector('p').textContent = 'Please login to see your orders';
    return;
  }
  if (!userOrders.length) {
    $('orderHistoryList').innerHTML = '';
    $('ordersEmpty').style.display = 'flex';
    $('ordersEmpty').querySelector('p').textContent = 'No orders yet';
    return;
  }
  $('ordersEmpty').style.display = 'none';
  $('orderHistoryList').innerHTML = userOrders.map(o => {
    const statusLabel = { pending: 'Pending', prepare: 'Preparing', delivery: 'Delivery', rejected: 'Rejected' }[o.status] || o.status;
    const itemsSummary = (o.items || []).map(i => `${i.name} ×${i.qty}`).join(', ');
    return `<div class="order-hist-card" data-id="${o.id}">
      <div class="order-hist-header">
        <span class="order-hist-id">#${o.id.slice(0, 8).toUpperCase()}</span>
        <span class="status-badge ${o.status}">${statusLabel}</span>
      </div>
      <div class="order-hist-items">${itemsSummary}</div>
      <div class="order-hist-footer">
        <span class="order-hist-total">$${Number(o.total).toFixed(2)}</span>
        <span style="font-size:11px;color:var(--gray)">${formatDate(o.createdAt)}</span>
      </div>
    </div>`;
  }).join('');
  document.querySelectorAll('.order-hist-card').forEach(card => {
    card.addEventListener('click', () => showOrderHistDetail(card.dataset.id));
  });
}

function showOrderHistDetail(orderId) {
  const o = userOrders.find(x => x.id === orderId);
  if (!o) return;
  // Status timeline: pending → prepare → delivery
  const steps = [
    { key: 'pending', label: '📋 Pending', icon: '📋' },
    { key: 'prepare', label: '📦 Preparing', icon: '📦' },
    { key: 'delivery', label: '🚚 Delivery', icon: '🚚' },
  ];
  const statusOrder = ['pending', 'prepare', 'delivery'];
  const currentIdx = statusOrder.indexOf(o.status);
  const timelineHtml = `<div class="order-timeline">
    ${steps.map((s, i) => {
      const cls = i < currentIdx ? 'done' : (i === currentIdx ? 'active' : '');
      const icon = i < currentIdx ? '✓' : s.icon;
      return `<div class="tl-step">
        <div class="tl-dot ${cls}">${icon}</div>
        <div class="tl-label ${cls}">${s.label}</div>
      </div>`;
    }).join('')}
  </div>`;

  const rejectedBanner = o.status === 'rejected'
    ? `<div style="background:rgba(229,62,62,0.1);border:1px solid #e53e3e;border-radius:8px;padding:12px;margin-bottom:12px;font-size:13px;color:#e53e3e;text-align:center">❌ Order was rejected. Please contact support.</div>`
    : '';

  $('orderHistDetailContent').innerHTML = `
    ${rejectedBanner}
    ${o.status !== 'rejected' ? timelineHtml : ''}
    <div class="order-detail-section">
      <h4 style="font-size:14px;font-weight:700;margin-bottom:10px;color:var(--accent)">Order Info</h4>
      <div class="order-detail-row"><span>Order ID</span><span>#${o.id.slice(0, 8).toUpperCase()}</span></div>
      <div class="order-detail-row"><span>Status</span><span class="status-badge ${o.status}">${o.status}</span></div>
      <div class="order-detail-row"><span>Date</span><span>${formatDate(o.createdAt)}</span></div>
      <div class="order-detail-row"><span>Subtotal</span><span>$${(Number(o.total) - DELIVERY_FEE).toFixed(2)}</span></div>
      <div class="order-detail-row"><span>Delivery</span><span>$${DELIVERY_FEE.toFixed(2)}</span></div>
      <div class="order-detail-row"><span style="font-weight:700">Total</span><span style="color:var(--accent);font-weight:700">$${Number(o.total).toFixed(2)}</span></div>
    </div>
    <div class="order-detail-section">
      <h4 style="font-size:14px;font-weight:700;margin-bottom:10px;color:var(--accent)">Delivery To</h4>
      <div class="order-detail-row"><span>Name</span><span>${o.customer?.name || ''}</span></div>
      <div class="order-detail-row"><span>Phone</span><span>${o.customer?.phone || ''}</span></div>
      <div class="order-detail-row"><span>Address</span><span>${o.customer?.address || ''}</span></div>
    </div>
    <div class="order-detail-section">
      <h4 style="font-size:14px;font-weight:700;margin-bottom:10px;color:var(--accent)">Items</h4>
      ${(o.items || []).map(i => `<div class="order-detail-row"><span>${i.name} ×${i.qty}</span><span>$${(i.price * i.qty).toFixed(2)}</span></div>`).join('')}
    </div>
    ${o.screenshotUrl ? `<div class="order-detail-section"><h4 style="font-size:14px;font-weight:700;margin-bottom:10px">Payment Screenshot</h4><img src="${o.screenshotUrl}" class="order-ss-img"/></div>` : ''}
  `;
  openModal('orderHistDetailModal');
}

// ==================== CHECKOUT ====================
$('checkoutBtn').addEventListener('click', () => {
  if (!cart.length) { showToast('Cart is empty'); return; }
  // Must be logged in to order
  if (!currentUser) {
    showToast('Please login to place an order');
    openModal('loginModal');
    return;
  }
  // Reset steps
  $('step1').style.display = 'block';
  $('step2').style.display = 'none';
  $('step3').style.display = 'none';
  // Show totals in step 1
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
  // Close checkout, show warning modal first
  closeModal('checkoutModal');
  openModal('paymentWarningModal');
});

// Warning modal agree button → open checkout step 2
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
    } else { screenshotUrl = 'https://via.placeholder.com/400?text=Payment+Proof'; showToast('Cloudinary preset not set, using placeholder.'); }
    const total = cart.reduce((s, i) => s + i.price * i.qty, 0) + DELIVERY_FEE;
    const docRef = await db.collection('orders').add({
      customer: checkoutCustomer,
      items: cart.map(i => ({ id: i.id, name: i.name, price: i.price, qty: i.qty })),
      total: total,
      deliveryFee: DELIVERY_FEE,
      status: 'pending',
      screenshotUrl: screenshotUrl,
      userId: currentUser.uid,
      userEmail: currentUser.email,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    $('confirmedOrderId').textContent = docRef.id.slice(0, 8).toUpperCase();
    cart = []; saveCart(); renderCart();
    $('step2').style.display = 'none';
    $('step3').style.display = 'block';
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
  db.collection('orders').orderBy('createdAt', 'desc').onSnapshot(snap => {
    if (snap.empty) { container.innerHTML = '<p style="color:var(--gray);padding:20px;text-align:center">No orders yet.</p>'; return; }
    container.innerHTML = snap.docs.map(d => {
      const o = { id: d.id, ...d.data() };
      const actionBtns = getAdminActionBtns(o);
      return `<div class="admin-order-card">
        <div class="order-card-header">
          <span class="order-id">#${o.id.slice(0, 8).toUpperCase()}</span>
          <span class="order-status ${o.status}">${o.status}</span>
        </div>
        <div class="order-card-customer">${o.customer?.name || 'Unknown'} · ${o.customer?.phone || ''}</div>
        <div class="order-card-amount">$${Number(o.total).toFixed(2)}</div>
        <div class="order-card-actions">
          <button class="view-ss-btn" data-id="${o.id}">View Details</button>
          ${actionBtns}
        </div>
      </div>`;
    }).join('');
    container.querySelectorAll('.view-ss-btn').forEach(b => b.onclick = () => showOrderDetail(b.dataset.id));
    container.querySelectorAll('.approve-btn').forEach(b => b.onclick = () => updateOrderStatus(b.dataset.id, 'prepare'));
    container.querySelectorAll('.delivery-btn').forEach(b => b.onclick = () => updateOrderStatus(b.dataset.id, 'delivery'));
    container.querySelectorAll('.reject-btn').forEach(b => b.onclick = () => updateOrderStatus(b.dataset.id, 'rejected'));
  });
}

function getAdminActionBtns(o) {
  if (o.status === 'pending') {
    return `<button class="approve-btn" data-id="${o.id}">📦 Prepare</button><button class="reject-btn" data-id="${o.id}">✗ Reject</button>`;
  } else if (o.status === 'prepare') {
    return `<button class="delivery-btn" data-id="${o.id}">🚚 Send Delivery</button>`;
  }
  return '';
}

function updateOrderStatus(id, status) {
  db.collection('orders').doc(id).update({ status })
    .then(() => showToast(`Order moved to: ${status}!`))
    .catch(() => showToast('Error updating'));
}

function showOrderDetail(id) {
  db.collection('orders').doc(id).get().then(doc => {
    if (!doc.exists) return;
    const o = { id: doc.id, ...doc.data() };
    const actionBtns = getAdminActionBtns(o);
    $('orderDetailContent').innerHTML = `
      <div class="order-detail-section">
        <h4 style="margin-bottom:10px;color:var(--accent)">Order Info</h4>
        <div class="order-detail-row"><span>Order ID</span><span>#${o.id.slice(0, 8).toUpperCase()}</span></div>
        <div class="order-detail-row"><span>Status</span><span class="order-status ${o.status}">${o.status}</span></div>
        <div class="order-detail-row"><span>Total</span><span style="color:var(--accent);font-weight:700">$${Number(o.total).toFixed(2)}</span></div>
      </div>
      <div class="order-detail-section">
        <h4 style="margin-bottom:10px;color:var(--accent)">Customer</h4>
        <div class="order-detail-row"><span>Name</span><span>${o.customer?.name || ''}</span></div>
        <div class="order-detail-row"><span>Phone</span><span>${o.customer?.phone || ''}</span></div>
        <div class="order-detail-row"><span>Address</span><span>${o.customer?.address || ''}</span></div>
        <div class="order-detail-row"><span>Email</span><span>${o.userEmail || ''}</span></div>
      </div>
      <div class="order-detail-section">
        <h4 style="margin-bottom:10px;color:var(--accent)">Items</h4>
        ${(o.items || []).map(i => `<div class="order-detail-row"><span>${i.name} ×${i.qty}</span><span>$${(i.price * i.qty).toFixed(2)}</span></div>`).join('')}
        <div class="order-detail-row"><span>Delivery Fee</span><span>$${DELIVERY_FEE.toFixed(2)}</span></div>
      </div>
      ${o.screenshotUrl ? `<div class="order-detail-section"><h4 style="margin-bottom:8px">Payment Screenshot</h4><img src="${o.screenshotUrl}" class="order-ss-img"/></div>` : '<p style="color:var(--gray);font-size:13px">No screenshot uploaded</p>'}
      ${actionBtns ? `<div style="display:flex;gap:10px;margin-top:16px">${
        o.status === 'pending'
          ? `<button class="approve-btn" id="detailApprove" style="flex:1" data-id="${o.id}">📦 Prepare</button><button class="reject-btn" id="detailReject" style="flex:1" data-id="${o.id}">✗ Reject</button>`
          : o.status === 'prepare'
          ? `<button class="delivery-btn" id="detailDelivery" style="flex:1" data-id="${o.id}">🚚 Send Delivery</button>`
          : ''
      }</div>` : ''}`;
    openModal('orderDetailModal');
    if ($('detailApprove')) $('detailApprove').onclick = () => { updateOrderStatus(o.id, 'prepare'); closeModal('orderDetailModal'); };
    if ($('detailReject')) $('detailReject').onclick = () => { updateOrderStatus(o.id, 'rejected'); closeModal('orderDetailModal'); };
    if ($('detailDelivery')) $('detailDelivery').onclick = () => { updateOrderStatus(o.id, 'delivery'); closeModal('orderDetailModal'); };
  });
}

function renderAdminProducts() {
  const container = $('adminProductsList');
  if (!allProducts.length) { container.innerHTML = '<p style="color:var(--gray);padding:20px;text-align:center">No products yet.</p>'; return; }
  container.innerHTML = allProducts.map(p => `<div class="admin-product-card"><div class="admin-prod-img">${p.imageUrl ? `<img src="${p.imageUrl}"/>` : (p.emoji || getCatEmoji(p.category))}</div><div class="admin-prod-info"><div class="admin-prod-name">${p.name}</div><div class="admin-prod-meta">${p.category} · Stock: ${p.stock || 0}</div></div><div class="admin-prod-price">$${Number(p.price).toFixed(2)}</div><div class="admin-prod-actions"><button class="edit-btn" data-id="${p.id}">Edit</button><button class="delete-btn" data-id="${p.id}">Delete</button></div></div>`).join('');
  container.querySelectorAll('.edit-btn').forEach(b => b.onclick = () => startEditProduct(b.dataset.id));
  container.querySelectorAll('.delete-btn').forEach(b => b.onclick = () => deleteProduct(b.dataset.id));
}
function startEditProduct(id) {
  const p = allProducts.find(x => x.id === id); if (!p) return;
  currentEditProductId = id;
  $('ap_name').value = p.name; $('ap_price').value = p.price; $('ap_category').value = p.category;
  $('ap_desc').value = p.description || ''; $('ap_imageUrl').value = p.imageUrl || ''; $('ap_stock').value = p.stock || 0; $('ap_featured').value = String(!!p.featured);
  if (p.imageUrl) { $('ap_imagePreview').src = p.imageUrl; $('ap_imagePreview').style.display = 'block'; }
  $('addProductTitle').textContent = 'Edit Product'; $('cancelEditBtn').style.display = 'block';
  document.querySelectorAll('.atab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.atab-content').forEach(c => c.classList.remove('active'));
  document.querySelector('.atab[data-atab="add"]').classList.add('active');
  $('atab-add').classList.add('active');
}
function clearProductForm() { ['ap_name', 'ap_price', 'ap_desc', 'ap_imageUrl', 'ap_stock'].forEach(id => $(id).value = ''); $('ap_category').value = 't-shirts'; $('ap_featured').value = 'false'; $('ap_imagePreview').style.display = 'none'; $('apError').textContent = ''; }
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
    stock = parseInt($('ap_stock').value) || 0, featured = $('ap_featured').value === 'true';
  const errEl = $('apError'); errEl.textContent = '';
  if (!name) { errEl.textContent = 'Product name required'; return; }
  if (isNaN(price) || price <= 0) { errEl.textContent = 'Valid price required'; return; }
  const productData = { name, price, category, description, imageUrl, stock, featured, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
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
  if (doc.exists && doc.data().qrUrl) {
    globalQrPaymentUrl = doc.data().qrUrl;
    $('qrImagePreview').src = globalQrPaymentUrl;
    $('qrImagePreview').style.display = 'block';
  } else { globalQrPaymentUrl = null; $('qrImagePreview').style.display = 'none'; }
}
$('qrImageFile').addEventListener('change', function (e) {
  const file = e.target.files[0];
  if (file) { const reader = new FileReader(); reader.onload = ev => { $('qrImagePreview').src = ev.target.result; $('qrImagePreview').style.display = 'block'; }; reader.readAsDataURL(file); pendingQrFile = file; }
  else { pendingQrFile = null; $('qrImagePreview').style.display = 'none'; }
});
$('saveQrSettingsBtn').addEventListener('click', async () => {
  const file = $('qrImageFile').files[0];
  if (!file && !globalQrPaymentUrl) { showToast('Please select a QR image to upload'); return; }
  if (!file) { showToast('No new image selected'); return; }
  const btn = $('saveQrSettingsBtn'); btn.textContent = 'Uploading...'; btn.disabled = true;
  const progressDiv = $('qrUploadProgress'); progressDiv.style.display = 'block'; $('qrProgressFill').style.width = '20%'; $('qrProgressText').textContent = 'Uploading QR...';
  try {
    if (CLOUDINARY_PRESET === "YOUR_UNSIGNED_PRESET") throw new Error('Cloudinary preset not configured');
    const fd = new FormData(); fd.append('file', file); fd.append('upload_preset', CLOUDINARY_PRESET);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, { method: 'POST', body: fd });
    const data = await res.json();
    $('qrProgressFill').style.width = '100%'; $('qrProgressText').textContent = 'Done!';
    const qrUrl = data.secure_url;
    await db.collection('settings').doc('payment').set({ qrUrl, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    globalQrPaymentUrl = qrUrl;
    showToast('QR code updated successfully!');
    $('qrImageFile').value = ''; pendingQrFile = null;
  } catch (err) { console.error(err); $('qrSettingsError').textContent = 'Upload failed: ' + err.message; showToast('Error uploading QR'); }
  finally { setTimeout(() => { progressDiv.style.display = 'none'; $('qrProgressFill').style.width = '0%'; }, 1000); btn.textContent = 'Save QR Settings'; btn.disabled = false; }
});

// ==================== INIT ====================
loadProducts();
setupAdminTabs();
db.collection('settings').doc('payment').onSnapshot(doc => {
  globalQrPaymentUrl = (doc.exists && doc.data().qrUrl) ? doc.data().qrUrl : null;
});