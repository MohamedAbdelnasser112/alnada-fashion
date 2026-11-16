import './styles.css';

const state = {
  cart: JSON.parse(localStorage.getItem('alnada-cart') || '[]'),
  favorites: JSON.parse(localStorage.getItem('alnada-favorites') || '[]'),
  modalProduct: null,
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const money = (value) => `${new Intl.NumberFormat('ar-SA').format(value)} ر.س`;
const imageMap = {
  'طقم لينن هادئ': 'https://alnada-a6eirdjj.manus.space/manus-storage/async-images/XuqnR6s4huHdPuEZdrz6ow/image-1.webp',
  'فستان سُهاد': 'https://alnada-a6eirdjj.manus.space/manus-storage/async-images/XuqnR6s4huHdPuEZdrz6ow/image-2.webp',
  'معطف غيمة': 'https://alnada-a6eirdjj.manus.space/manus-storage/async-images/XuqnR6s4huHdPuEZdrz6ow/image-3.webp',
  'تنورة نُور': 'https://alnada-a6eirdjj.manus.space/manus-storage/async-images/XuqnR6s4huHdPuEZdrz6ow/image-4.webp',
  'بليزر ليان': 'https://alnada-a6eirdjj.manus.space/manus-storage/async-images/XuqnR6s4huHdPuEZdrz6ow/image-5.webp',
};
const descriptions = {
  'طقم لينن هادئ': 'قميص واسع وبنطلون مستقيم من لينن خفيف، مصمم ليتحرك مع يومكِ بسهولة وأناقة.',
  'فستان سُهاد': 'فستان ساتان مطفي بقصة ميدي ناعمة، ينساب بخفة من الصباح إلى الموعد المسائي.',
  'معطف غيمة': 'معطف صوف ناعم بقصة ملفوفة وحزام يحدد الخصر، لدفء أنيق لا يثقل إطلالتكِ.',
  'تنورة نُور': 'تنورة بكسرات ناعمة وخصر عالٍ، قطعة مرنة تضيف حركة خفيفة لأي إطلالة.',
  'بليزر ليان': 'بليزر مفصل بعناية، بقصة نظيفة وتفاصيل تمنحكِ حضوراً هادئاً وواثقاً.',
};

function persist() {
  localStorage.setItem('alnada-cart', JSON.stringify(state.cart));
  localStorage.setItem('alnada-favorites', JSON.stringify(state.favorites));
}

function showToast(message) {
  const toast = $('[data-toast]');
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.remove('is-visible'), 2800);
}

function updateIndicators() {
  const cartCount = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  const favoriteCount = state.favorites.length;
  const cartBadge = $('.cart-count');
  const favoriteBadge = $('.favorite-count');
  cartBadge.textContent = cartCount;
  favoriteBadge.textContent = favoriteCount;
  cartBadge.classList.toggle('visible', cartCount > 0);
  favoriteBadge.classList.toggle('visible', favoriteCount > 0);
  $('.panel-count', $('[data-panel="cart"]')).textContent = `(${new Intl.NumberFormat('ar-SA').format(cartCount)})`;
  $('.favorites-panel-count').textContent = `(${new Intl.NumberFormat('ar-SA').format(favoriteCount)})`;
}

function renderCart() {
  const list = $('.cart-items');
  const empty = $('.cart-empty');
  const footer = $('.cart-footer');
  list.innerHTML = '';
  let total = 0;
  state.cart.forEach((item, index) => {
    total += item.price * item.quantity;
    const row = document.createElement('div');
    row.className = 'cart-item';
    row.innerHTML = `<img src="${item.image}" alt="${item.name}" /><div><h4>${item.name}</h4><p>الكمية: ${item.quantity}</p></div><div><strong>${money(item.price * item.quantity)}</strong><button class="remove-item" data-cart-index="${index}" aria-label="حذف ${item.name}">×</button></div>`;
    list.appendChild(row);
  });
  empty.style.display = state.cart.length ? 'none' : 'block';
  footer.style.display = state.cart.length ? 'flex' : 'none';
  $('.cart-total').textContent = money(total);
  updateIndicators();
}

function renderFavorites() {
  const list = $('.favorites-items');
  const empty = $('.favorites-empty');
  list.innerHTML = '';
  state.favorites.forEach((name) => {
    const row = document.createElement('div');
    row.className = 'favorite-item';
    row.innerHTML = `<img src="${imageMap[name]}" alt="${name}" /><div><h4>${name}</h4><p>قطعة مختارة لكِ</p></div><strong>${money({ 'طقم لينن هادئ': 290, 'فستان سُهاد': 345, 'معطف غيمة': 420, 'تنورة نُور': 265, 'بليزر ليان': 380 }[name] || 290)}</strong>`;
    list.appendChild(row);
  });
  empty.style.display = state.favorites.length ? 'none' : 'block';
  updateIndicators();
}

function syncFavoriteButtons() {
  $$('.favorite-toggle').forEach((button) => {
    const name = button.closest('.product-card')?.querySelector('h3')?.textContent;
    const active = state.favorites.includes(name);
    button.classList.toggle('is-favorite', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function addToCart(name, price) {
  const existing = state.cart.find((item) => item.name === name);
  if (existing) existing.quantity += 1;
  else state.cart.push({ name, price: Number(price), quantity: 1, image: imageMap[name] });
  persist();
  renderCart();
  showToast(`أضيفت «${name}» إلى حقيبتكِ`);
}

function toggleFavorite(button) {
  const name = button.closest('.product-card')?.querySelector('h3')?.textContent;
  if (!name) return;
  if (state.favorites.includes(name)) {
    state.favorites = state.favorites.filter((item) => item !== name);
    showToast(`أزيلت «${name}» من المفضلة`);
  } else {
    state.favorites.push(name);
    showToast(`حُفظت «${name}» في المفضلة`);
  }
  persist();
  syncFavoriteButtons();
  renderFavorites();
}

function openPanel(name) {
  $$('.side-panel').forEach((panel) => panel.classList.toggle('is-open', panel.dataset.panel === name));
  $('.overlay').classList.add('is-visible');
  document.body.classList.add('panel-open');
  if (name === 'cart') renderCart();
  if (name === 'favorites') renderFavorites();
}

function closePanels() {
  $$('.side-panel').forEach((panel) => panel.classList.remove('is-open'));
  $('.overlay').classList.remove('is-visible');
  document.body.classList.remove('panel-open');
}

function openModal(card) {
  const title = card.querySelector('h3').textContent;
  const price = card.querySelector('.price strong').textContent;
  state.modalProduct = { name: title, price: Number(card.querySelector('[data-price]')?.dataset.price || 290), image: card.querySelector('.product-media img').src };
  $('[data-modal-image]').src = state.modalProduct.image;
  $('[data-modal-image]').alt = title;
  $('[data-modal-title]').textContent = title;
  $('[data-modal-description]').textContent = descriptions[title] || 'قطعة صُممت لتمنح يومكِ مزيداً من الراحة والأناقة.';
  $('[data-modal-price]').textContent = price;
  $('[data-modal]').classList.add('is-open');
  document.body.classList.add('panel-open');
}

function closeModal() {
  $('[data-modal]').classList.remove('is-open');
  document.body.classList.remove('panel-open');
}

function filterProducts(category) {
  $$('.filter-chip').forEach((chip) => chip.classList.toggle('active', chip.dataset.filter === category));
  $$('.product-card').forEach((card) => {
    card.hidden = category !== 'الكل' && card.dataset.category !== category;
  });
}

function handleSearch(query) {
  const normalized = query.trim().toLowerCase();
  closePanels();
  if (!normalized) return;
  const cards = $$('.product-card');
  let count = 0;
  cards.forEach((card) => {
    const matches = card.textContent.toLowerCase().includes(normalized);
    card.hidden = !matches;
    if (matches) count += 1;
  });
  document.querySelector('#new-arrivals').scrollIntoView({ behavior: 'smooth' });
  showToast(count ? `وجدنا ${new Intl.NumberFormat('ar-SA').format(count)} قطع تناسب بحثكِ` : 'لم نجد هذه القطعة بعد، جربي كلمة أخرى');
  if (!count) setTimeout(() => $$('.product-card').forEach((card) => { card.hidden = false; }), 2800);
}

document.addEventListener('click', (event) => {
  const trigger = event.target.closest('[data-action]');
  if (!trigger) return;
  const action = trigger.dataset.action;
  if (action === 'toggle-menu') $('.mobile-nav').classList.toggle('is-open');
  if (action === 'open-search') openPanel('search');
  if (action === 'open-cart') openPanel('cart');
  if (action === 'open-favorites') openPanel('favorites');
  if (action === 'close-panels') closePanels();
  if (action === 'close-modal') closeModal();
  if (action === 'toggle-favorite') toggleFavorite(trigger);
  if (action === 'add-to-cart') addToCart(trigger.dataset.product, trigger.dataset.price);
  if (action === 'quick-view') openModal(trigger.closest('.product-card'));
  if (action === 'checkout') showToast('الدفع متاح قريباً — شكراً لاختياركِ الندى');
  if (action === 'modal-add' && state.modalProduct) {
    addToCart(state.modalProduct.name, state.modalProduct.price);
    closeModal();
  }
  if (trigger.dataset.filter) {
    filterProducts(trigger.dataset.filter);
    document.querySelector('#new-arrivals').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});

document.addEventListener('click', (event) => {
  const removeButton = event.target.closest('[data-cart-index]');
  if (!removeButton) return;
  state.cart.splice(Number(removeButton.dataset.cartIndex), 1);
  persist();
  renderCart();
  showToast('أزيلت القطعة من حقيبتكِ');
});

$('.overlay').addEventListener('click', closePanels);
$('[data-modal]').addEventListener('click', (event) => { if (event.target === $('[data-modal]')) closeModal(); });

$('[data-action="search"]').addEventListener('submit', (event) => {
  event.preventDefault();
  handleSearch($('[data-action="search"] input').value);
});

$('[data-action="newsletter"]').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = $('#email');
  if (!input.value) return;
  input.value = '';
  showToast('أهلاً بكِ في رسائل الندى');
});

$$('.mobile-nav a').forEach((link) => link.addEventListener('click', () => $('.mobile-nav').classList.remove('is-open')));

renderCart();
renderFavorites();
syncFavoriteButtons();
