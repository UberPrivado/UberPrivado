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

// Bounding box de Antofagasta: lon_min,lat_min,lon_max,lat_max
const ANT_BOX = '-70.60,-23.85,-70.10,-23.35';
const NOM_BASE = 'https://nominatim.openstreetmap.org/search?';
const NOM_HDR  = { 'User-Agent': 'TransportePrivadoPremium/1.0' };

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

async function nominatimSearch(query) {
  // Limpiar si el usuario ya escribió "antofagasta" al final
  const clean = query.replace(/,?\s*antofagasta\s*$/i, '').trim();
  if (clean.length < 2) return [];

  try {
    // Búsqueda 1: estructurada — street + city (mejor para "Calle 123")
    const p1 = new URLSearchParams({
      street: clean, city: 'Antofagasta', countrycodes: 'cl',
      format: 'json', limit: '5', addressdetails: '1', 'accept-language': 'es'
    });

    // Búsqueda 2: libre dentro del área de Antofagasta
    const p2 = new URLSearchParams({
      q: clean + ', Antofagasta', countrycodes: 'cl',
      format: 'json', limit: '5', addressdetails: '1',
      viewbox: ANT_BOX, bounded: '1', 'accept-language': 'es'
    });

    const [r1, r2] = await Promise.allSettled([
      fetch(NOM_BASE + p1, { headers: NOM_HDR }).then(r => r.json()),
      fetch(NOM_BASE + p2, { headers: NOM_HDR }).then(r => r.json())
    ]);

    const res1 = r1.status === 'fulfilled' && Array.isArray(r1.value) ? r1.value : [];
    const res2 = r2.status === 'fulfilled' && Array.isArray(r2.value) ? r2.value : [];

    // Unir y deduplicar por place_id
    const seen = new Set();
    return [...res1, ...res2].filter(r => {
      if (seen.has(r.place_id)) return false;
      seen.add(r.place_id);
      return true;
    }).slice(0, 6);
  } catch {
    return [];
  }
}

function buildLabel(r) {
  const a = r.address || {};
  // Armar etiqueta limpia: "Calle 123, Sector"
  let street = '';
  if (a.road) {
    street = a.house_number ? `${a.road} ${a.house_number}` : a.road;
  } else {
    street = r.display_name.split(',')[0].trim();
  }
  const sector = a.suburb || a.neighbourhood || a.city_district || a.quarter || '';
  return sector ? `${street}, ${sector}` : street;
}

function renderList(listEl, results, inputEl, coordKey) {
  listEl.innerHTML = '';
  if (!results.length) {
    const li = document.createElement('li');
    li.textContent = 'Sin resultados — intenta ser más específico';
    li.style.cssText = 'color:rgba(255,255,255,0.3);cursor:default;font-style:italic;';
    listEl.appendChild(li);
    return;
  }
  results.forEach(r => {
    const li    = document.createElement('li');
    const label = buildLabel(r);
    li.textContent = label;
    li.title       = r.display_name;

    li.addEventListener('mousedown', e => {
      e.preventDefault();
      inputEl.value    = label;
      COORDS[coordKey] = { lat: parseFloat(r.lat), lon: parseFloat(r.lon) };
      listEl.innerHTML = '';
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
    if (val.length < 2) { list.innerHTML = ''; return; }
    const results = await nominatimSearch(val);
    renderList(list, results, input, coordKey);
  }, 400);

  input.addEventListener('input', () => {
    COORDS[coordKey] = null;
    resetKmBadge();
    doSearch();
  });

  input.addEventListener('blur', () => {
    setTimeout(() => { list.innerHTML = ''; }, 200);
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
  if (genero === 'hombre') {
    metaEl.innerHTML =
      '<i class="fas fa-male" style="color:#85ff00;margin-right:6px"></i>' +
      '<strong style="color:#85ff00">Solo Hombres:</strong>' +
      '&nbsp;Incluye copiloto acompañante obligatorio en todos los horarios.';
    metaEl.classList.add('visible');
  } else if (horario === 'madrugada') {
    metaEl.innerHTML =
      '<i class="fas fa-user-shield" style="color:#aac0ff;margin-right:6px"></i>' +
      'Madrugada: copiloto acompañante obligatorio para todos los pasajeros.';
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
