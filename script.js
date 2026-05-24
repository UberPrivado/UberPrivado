/* ========== NAVBAR ========== */
const navbar    = document.getElementById('navbar');
const hamburger = document.getElementById('hamburger');
const mobileNav = document.getElementById('mobileNav');
const navLinks  = document.querySelectorAll('.nav-link');
const sections  = document.querySelectorAll('section[id]');

window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 40);
  highlightNavLink();
});

function highlightNavLink() {
  let current = '';
  sections.forEach(sec => {
    if (window.scrollY >= sec.offsetTop - 120) current = sec.id;
  });
  navLinks.forEach(link => {
    link.classList.toggle('active', link.getAttribute('href') === '#' + current);
  });
}

hamburger.addEventListener('click', () => {
  hamburger.classList.toggle('open');
  mobileNav.classList.toggle('open');
});

document.querySelectorAll('.mobile-link, .mobile-wa').forEach(link => {
  link.addEventListener('click', () => {
    hamburger.classList.remove('open');
    mobileNav.classList.remove('open');
  });
});

document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', e => {
    const target = document.querySelector(anchor.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    window.scrollTo({ top: target.offsetTop - navbar.offsetHeight - 10, behavior: 'smooth' });
  });
});

/* ========== TARIFAS ========== */
const TARIFAS = {
  dia:       { mujer: 800,  hombre: 840  },
  tarde:     { mujer: 900,  hombre: 950  },
  madrugada: { mujer: 1050, hombre: 1150 },
};

const HORARIO_LABEL = {
  dia:       'Día (06:00 - 18:00)',
  tarde:     'Tarde (18:00 - 23:59)',
  madrugada: 'Madrugada (00:00 - 05:59)',
};

/* ========== GEOCODING + AUTOCOMPLETE ========== */
const COORDS = { origin: null, dest: null };

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

async function nominatimSearch(query) {
  try {
    const q = encodeURIComponent(query + ', Antofagasta, Chile');
    const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=6&countrycodes=cl&accept-language=es`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'TransportePrivadoPremium/1.0' }
    });
    return await res.json();
  } catch {
    return [];
  }
}

function renderList(listEl, results, inputEl, coordKey) {
  listEl.innerHTML = '';
  if (!results.length) return;
  results.slice(0, 5).forEach(r => {
    const li = document.createElement('li');
    const parts = r.display_name.split(',');
    li.textContent  = parts.slice(0, 3).join(',').trim();
    li.title        = r.display_name;

    li.addEventListener('mousedown', e => {
      e.preventDefault();
      inputEl.value       = parts.slice(0, 2).join(',').trim();
      COORDS[coordKey]    = { lat: parseFloat(r.lat), lon: parseFloat(r.lon) };
      listEl.innerHTML    = '';
      tryAutoDistance();
    });
    listEl.appendChild(li);
  });
}

function setupAutocomplete(inputId, listId, coordKey) {
  const input = document.getElementById(inputId);
  const list  = document.getElementById(listId);

  const doSearch = debounce(async () => {
    const val = input.value.trim();
    if (val.length < 3) { list.innerHTML = ''; return; }
    const results = await nominatimSearch(val);
    renderList(list, results, input, coordKey);
  }, 420);

  input.addEventListener('input', () => {
    COORDS[coordKey] = null;
    resetKmBadge();
    doSearch();
  });

  input.addEventListener('blur', () => {
    setTimeout(() => { list.innerHTML = ''; }, 180);
  });
}

/* ========== AUTO DISTANCE (OSRM) ========== */
async function tryAutoDistance() {
  if (!COORDS.origin || !COORDS.dest) return;

  const kmInput = document.getElementById('km');
  const badge   = document.getElementById('km-badge');

  kmInput.value       = '';
  kmInput.placeholder = 'Calculando ruta...';
  badge.textContent   = '⏳ Calculando distancia...';
  badge.className     = 'km-badge loading';

  try {
    const { lon: lon1, lat: lat1 } = COORDS.origin;
    const { lon: lon2, lat: lat2 } = COORDS.dest;
    const url = `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=false`;
    const res  = await fetch(url);
    const data = await res.json();

    if (data.code === 'Ok' && data.routes.length) {
      const km = Math.round(data.routes[0].distance / 100) / 10;
      kmInput.value       = km;
      kmInput.placeholder = 'Ej: 12';
      badge.textContent   = `✓ ${km} km — calculado automáticamente (editable)`;
      badge.className     = 'km-badge success';
    } else {
      throw new Error('sin ruta');
    }
  } catch {
    kmInput.placeholder = 'Ingresa los km manualmente';
    badge.textContent   = '⚠ No se pudo calcular. Ingresa los km manualmente.';
    badge.className     = 'km-badge warning';
  }
}

function resetKmBadge() {
  const badge = document.getElementById('km-badge');
  if (badge) { badge.textContent = ''; badge.className = 'km-badge'; }
}

/* ========== CALCULADORA ========== */
function calcular() {
  const km      = parseFloat(document.getElementById('km').value);
  const horario = document.getElementById('horario').value;
  const genero  = document.getElementById('genero').value;
  const origen  = document.getElementById('origen').value.trim();
  const destino = document.getElementById('destino').value.trim();

  const placeholder = document.getElementById('estimacion-content');
  const result      = document.getElementById('estimacion-result');

  if (!km || km <= 0) {
    shakeField('km');
    return;
  }

  const tarifa = TARIFAS[horario][genero];
  const total  = Math.round(km * tarifa);

  const rutaEl = document.getElementById('est-ruta');
  if (origen && destino) {
    rutaEl.textContent   = origen + '  →  ' + destino;
    rutaEl.style.display = 'block';
  } else {
    rutaEl.style.display = 'none';
  }

  document.getElementById('est-price').textContent =
    '$' + total.toLocaleString('es-CL');

  const metaEl = document.getElementById('est-meta');
  if (horario === 'madrugada') {
    metaEl.innerHTML = '<i class="fas fa-user-shield" style="color:#aac0ff;margin-right:6px"></i> Incluye copiloto acompañante obligatorio';
    metaEl.classList.add('visible');
  } else {
    metaEl.classList.remove('visible');
  }

  placeholder.classList.add('hidden');
  result.classList.remove('hidden');

  const waBtn = result.querySelector('.est-wa-btn');
  const msg   = buildWhatsAppMsg({ origen, destino, km, horario, genero, tarifa, total });
  waBtn.href  = 'https://wa.me/56942348184?text=' + encodeURIComponent(msg);

  if (window.innerWidth < 768) {
    result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function buildWhatsAppMsg({ origen, destino, km, horario, genero, tarifa, total }) {
  const g   = genero === 'mujer' ? 'Mujer' : 'Hombre';
  const h   = HORARIO_LABEL[horario];
  let msg   = '¡Hola! Quisiera reservar un viaje.\n\n';
  if (origen)  msg += '📍 Origen: '   + origen  + '\n';
  if (destino) msg += '📍 Destino: '  + destino + '\n';
  msg += '📏 Distancia: ' + km + ' km\n';
  msg += '🕐 Horario: '  + h  + '\n';
  msg += '👤 Pasajero: ' + g  + '\n';
  msg += '💰 Estimación: $' + total.toLocaleString('es-CL') + '\n\n';
  msg += '¿Está disponible?';
  return msg;
}

function shakeField(id) {
  const el = document.getElementById(id);
  el.style.borderColor = '#ff4444';
  el.style.boxShadow   = '0 0 10px rgba(255,68,68,0.4)';
  el.focus();
  setTimeout(() => { el.style.borderColor = ''; el.style.boxShadow = ''; }, 1800);
}

/* ========== SCROLL REVEAL ========== */
const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll(
  '.service-card, .tarifa-card, .confort-card, .seg-card, .gender-card, .strip-item'
).forEach(el => {
  el.classList.add('reveal');
  observer.observe(el);
});

const revealStyle = document.createElement('style');
revealStyle.textContent = `
  .reveal { opacity: 0; transform: translateY(22px); transition: opacity .55s ease, transform .55s ease; }
  .reveal.visible { opacity: 1; transform: translateY(0); }
`;
document.head.appendChild(revealStyle);

/* ========== INIT ========== */
document.addEventListener('DOMContentLoaded', () => {
  setupAutocomplete('origen',  'origen-list',  'origin');
  setupAutocomplete('destino', 'destino-list', 'dest');
});
