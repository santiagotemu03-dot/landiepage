// ===== Enviar eventos a Google Tag Manager =====
window.dataLayer = window.dataLayer || [];
function track(eventName, params) {
  window.dataLayer.push(Object.assign({ event: eventName }, params || {}));
}

// ===== API: OpenStreetMap (Overpass), sin llave =====
const BBOX = "4.45,-74.22,4.83,-73.99"; // Bogotá
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const CATEGORIAS = {
  restaurante: '["amenity"="restaurant"]',
  cafe: '["amenity"="cafe"]',
  bar: '["amenity"="bar"]',
  museo: '["tourism"="museum"]',
  parque: '["leisure"="park"]',
  atraccion: '["tourism"="attraction"]'
};

// ===== Estado =====
let categoriaActual = "restaurante";
let sitios = [];
let favoritos = [];
try {
  favoritos = JSON.parse(localStorage.getItem("favoritos_citas") || "[]");
} catch (e) {
  favoritos = [];
}

// ===== Elementos =====
const estado = document.getElementById("estado");
const tarjetas = document.getElementById("tarjetas");
const buscador = document.getElementById("buscador");
const listaFavoritos = document.getElementById("favoritos");
const favoritosVacio = document.getElementById("favoritos-vacio");

// ===== Servidores de respaldo (si uno está saturado, probamos el siguiente) =====
const SERVIDORES = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter"
];

// ===== Sitios recomendados (por si todos los servidores fallan) =====
const RESPALDO = {
  restaurante: [
    { nombre: "Andrés D.C.", direccion: "Zona T" },
    { nombre: "Harry Sasson", direccion: "Chapinero" },
    { nombre: "Leo Cocina y Cava", direccion: "Chapinero" },
    { nombre: "Mini-mal", direccion: "Quinta Camacho" }
  ],
  cafe: [
    { nombre: "Azahar Café", direccion: "Chapinero" },
    { nombre: "Amor Perfecto", direccion: "Chapinero" },
    { nombre: "Café Pergamino", direccion: "Chapinero" },
    { nombre: "Devoción", direccion: "Usaquén" }
  ],
  bar: [
    { nombre: "Armando Records", direccion: "Zona T" },
    { nombre: "Bogotá Beer Company", direccion: "Zona T" },
    { nombre: "Theatron", direccion: "Chapinero" },
    { nombre: "Octava", direccion: "La Candelaria" }
  ],
  museo: [
    { nombre: "Museo del Oro", direccion: "La Candelaria" },
    { nombre: "Museo Botero", direccion: "La Candelaria" },
    { nombre: "Museo Nacional de Colombia", direccion: "Centro" },
    { nombre: "Planetario de Bogotá", direccion: "Parque de la Independencia" }
  ],
  parque: [
    { nombre: "Parque de la 93", direccion: "Chicó" },
    { nombre: "Parque Simón Bolívar", direccion: "Teusaquillo" },
    { nombre: "Parque El Virrey", direccion: "Chicó" },
    { nombre: "Jardín Botánico de Bogotá", direccion: "Engativá" }
  ],
  atraccion: [
    { nombre: "Monserrate", direccion: "Cerro de Monserrate" },
    { nombre: "Plaza de Bolívar", direccion: "La Candelaria" },
    { nombre: "Chorro de Quevedo", direccion: "La Candelaria" },
    { nombre: "Plaza de Usaquén", direccion: "Usaquén" }
  ]
};

// Enlace a Google Maps: con coordenadas si las hay, si no por nombre
function urlMapa(s) {
  if (s.lat && s.lon) {
    return "https://www.google.com/maps/search/?api=1&query=" + s.lat + "," + s.lon;
  }
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(s.nombre + ", Bogotá, Colombia");
}

// Pide datos a un servidor, con límite de 12 segundos
async function pedirOverpass(servidor, query) {
  const control = new AbortController();
  const temporizador = setTimeout(function () { control.abort(); }, 12000);
  try {
    const resp = await fetch(servidor, {
      method: "POST",
      body: "data=" + encodeURIComponent(query),
      signal: control.signal
    });
    if (!resp.ok) throw new Error("Error " + resp.status);
    return await resp.json();
  } finally {
    clearTimeout(temporizador);
  }
}

function leerCache(cat) {
  try {
    const c = JSON.parse(localStorage.getItem("sitios_" + cat) || "null");
    if (c && Date.now() - c.fecha < 24 * 60 * 60 * 1000 && c.datos.length) return c.datos;
  } catch (e) { /* sin cache */ }
  return null;
}

function guardarCache(cat, datos) {
  try {
    localStorage.setItem("sitios_" + cat, JSON.stringify({ fecha: Date.now(), datos: datos }));
  } catch (e) { /* sin almacenamiento */ }
}

// ===== Cargar sitios =====
async function cargarSitios() {
  const cat = categoriaActual;
  estado.textContent = "Cargando sitios...";
  tarjetas.innerHTML = "";
  sitios = [];

  // 1) Si ya los cargamos hoy, los usamos al instante
  const guardados = leerCache(cat);
  if (guardados) {
    sitios = guardados;
    estado.textContent = sitios.length + " sitios encontrados";
    renderTarjetas();
    return;
  }

  const query = '[out:json][timeout:20];nw' + CATEGORIAS[cat] +
    '["name"](' + BBOX + ');out center 60;';

  // 2) Probamos cada servidor hasta que uno responda
  for (let i = 0; i < SERVIDORES.length; i++) {
    try {
      const data = await pedirOverpass(SERVIDORES[i], query);
      if (cat !== categoriaActual) return; // el usuario cambió de categoría

      const lista = data.elements
        .map(function (el) {
          return {
            id: el.type + el.id,
            nombre: el.tags.name,
            direccion: el.tags["addr:street"] || "",
            telefono: el.tags.phone || "",
            web: el.tags.website || "",
            lat: el.lat || (el.center && el.center.lat),
            lon: el.lon || (el.center && el.center.lon),
            categoria: cat
          };
        })
        .filter(function (s) { return s.lat && s.lon; });

      if (lista.length === 0) continue;
      sitios = lista;
      guardarCache(cat, lista);
      estado.textContent = sitios.length + " sitios encontrados";
      renderTarjetas();
      return;
    } catch (err) {
      console.warn("Servidor falló: " + SERVIDORES[i], err);
    }
  }

  // 3) Si todos fallan, mostramos sitios recomendados
  if (cat !== categoriaActual) return;
  sitios = (RESPALDO[cat] || []).map(function (s, i) {
    return { id: "resp-" + cat + "-" + i, nombre: s.nombre, direccion: s.direccion, categoria: cat };
  });
  estado.textContent = "El mapa está ocupado, te mostramos sitios recomendados.";
  renderTarjetas();
}

// ===== Tarjetas =====
function renderTarjetas() {
  const filtro = buscador.value.trim().toLowerCase();
  tarjetas.innerHTML = "";

  sitios
    .filter(function (s) { return s.nombre.toLowerCase().includes(filtro); })
    .slice(0, 30)
    .forEach(function (s) {
      const art = document.createElement("article");
      art.className = "tarjeta";

      const h3 = document.createElement("h3");
      h3.textContent = s.nombre;

      const p = document.createElement("p");
      p.textContent = s.direccion || "Bogotá";

      const mapa = document.createElement("a");
      mapa.href = urlMapa(s);
      mapa.target = "_blank";
      mapa.rel = "noopener";
      mapa.textContent = "Ver en el mapa";
      mapa.addEventListener("click", function () {
        track("place_click", { place_name: s.nombre, category: s.categoria });
      });

      const guardar = document.createElement("button");
      guardar.type = "button";
      guardar.textContent = "Guardar para nuestra cita";
      guardar.addEventListener("click", function () { guardarFavorito(s); });

      art.append(h3, p, mapa, guardar);
      tarjetas.appendChild(art);
    });
}

// ===== Favoritos =====
function guardarFavorito(sitio) {
  if (favoritos.some(function (f) { return f.id === sitio.id; })) return;
  favoritos.push(sitio);
  persistir();
  renderFavoritos();
  track("save_place", { place_name: sitio.nombre, category: sitio.categoria });
}

function quitarFavorito(id) {
  favoritos = favoritos.filter(function (f) { return f.id !== id; });
  persistir();
  renderFavoritos();
}

function persistir() {
  try {
    localStorage.setItem("favoritos_citas", JSON.stringify(favoritos));
  } catch (e) { /* sin almacenamiento */ }
}

function renderFavoritos() {
  listaFavoritos.innerHTML = "";
  favoritosVacio.hidden = favoritos.length > 0;

  favoritos.forEach(function (f) {
    const li = document.createElement("li");

    const enlace = document.createElement("a");
    enlace.href = urlMapa(f);
    enlace.target = "_blank";
    enlace.rel = "noopener";
    enlace.textContent = f.nombre;

    const quitar = document.createElement("button");
    quitar.type = "button";
    quitar.textContent = "Quitar";
    quitar.addEventListener("click", function () { quitarFavorito(f.id); });

    li.append(enlace, quitar);
    listaFavoritos.appendChild(li);
  });
}

// ===== Eventos de la interfaz =====
document.querySelectorAll(".filtro").forEach(function (btn) {
  btn.addEventListener("click", function () {
    document.querySelectorAll(".filtro").forEach(function (b) { b.classList.remove("activo"); });
    btn.classList.add("activo");
    categoriaActual = btn.dataset.cat;
    track("filter_category", { category: categoriaActual });
    cargarSitios();
  });
});

buscador.addEventListener("input", renderTarjetas);

// CTAs (Hero, CTA 1, CTA 2)
document.querySelectorAll("[data-cta]").forEach(function (el) {
  el.addEventListener("click", function () {
    track("cta_click", { cta_location: el.dataset.cta, cta_text: el.textContent.trim() });
  });
});

// FAQ
document.querySelectorAll("details[data-faq]").forEach(function (d) {
  d.addEventListener("toggle", function () {
    if (d.open) track("faq_open", { faq_question: d.dataset.faq });
  });
});

// ===== Inicio =====
renderFavoritos();
cargarSitios();

/* ===================================================================
   FX: Dark Luxury x Y2K x Light Ripple (shader WebGL)
   Todo se inyecta desde aquí, no hace falta tocar el index.html
   =================================================================== */
(function () {
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- 1) Fondo de rayos de luz (shader WebGL) ----------
  function iniciarRipple(host) {
    var canvas = document.createElement("canvas");
    canvas.id = "ripple-canvas";
    canvas.setAttribute("aria-hidden", "true");
    host.prepend(canvas);

    var gl = canvas.getContext("webgl");
    if (!gl) { canvas.remove(); return; }

    var vs = "attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }";
    var fs = [
      "#ifdef GL_FRAGMENT_PRECISION_HIGH",
      "precision highp float;",
      "#else",
      "precision mediump float;",
      "#endif",
      "uniform vec2 resolution;",
      "uniform float time;",
      "uniform float uLineWidth;",
      "uniform float uDispersion;",
      "uniform vec3 uTint;",
      "uniform float uBrightness;",
      "float chan(float j, vec2 uv, float t){",
      "  float s = 0.0;",
      "  for (int i = 0; i < 5; i++) {",
      "    float fi = float(i);",
      "    s += uLineWidth * fi * fi / abs(fract(t - uDispersion * j + fi * 0.01) * 5.0 - length(uv) + mod(uv.x + uv.y, 0.2));",
      "  }",
      "  return s;",
      "}",
      "void main(){",
      "  vec2 uv = (gl_FragCoord.xy * 2.0 - resolution.xy) / min(resolution.x, resolution.y);",
      "  float t = time * 0.05;",
      "  vec3 c = vec3(chan(0.0, uv, t), chan(1.0, uv, t), chan(2.0, uv, t));",
      "  float mono = (c.r + c.g + c.b) / 3.0;",
      "  gl_FragColor = vec4(mono * uTint * uBrightness, 1.0);",
      "}"
    ].join("\n");

    function compilar(tipo, src) {
      var s = gl.createShader(tipo);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    }
    var v = compilar(gl.VERTEX_SHADER, vs);
    var f = compilar(gl.FRAGMENT_SHADER, fs);
    if (!v || !f) { canvas.remove(); return; }

    var prog = gl.createProgram();
    gl.attachShader(prog, v);
    gl.attachShader(prog, f);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { canvas.remove(); return; }
    gl.useProgram(prog);

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    function u(n) { return gl.getUniformLocation(prog, n); }
    gl.uniform1f(u("uLineWidth"), 0.0022);
    gl.uniform1f(u("uDispersion"), 0.01);
    gl.uniform3f(u("uTint"), 1.0, 0.7, 0.25); // preset "Solar" (ámbar)
    gl.uniform1f(u("uBrightness"), 0.95);

    var tiempo = 1, ultimo = performance.now(), visible = true, raf = 0;

    function ajustar() {
      var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      var w = Math.max(1, Math.floor(host.clientWidth * dpr * 0.75));
      var h = Math.max(1, Math.floor(host.clientHeight * dpr * 0.75));
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(u("resolution"), w, h);
    }

    function dibujar(ahora) {
      var dt = Math.min((ahora - ultimo) / 1000, 0.1);
      ultimo = ahora;
      tiempo += 3 * dt;
      gl.uniform1f(u("time"), tiempo);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (visible && !reduce) raf = requestAnimationFrame(dibujar);
    }

    ajustar();
    dibujar(performance.now());

    window.addEventListener("resize", function () {
      ajustar();
      if (reduce) dibujar(performance.now());
    });

    // Pausar cuando el hero no se ve (ahorra batería)
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible && !reduce) {
        cancelAnimationFrame(raf);
        ultimo = performance.now();
        raf = requestAnimationFrame(dibujar);
      }
    }).observe(host);
  }

  // ---------- 2) Hero convertido en ventana Y2K ----------
  function armarHero() {
    var hero = document.getElementById("hero");
    if (!hero) return;

    iniciarRipple(hero);

    var hijos = Array.prototype.filter.call(hero.children, function (c) { return c.tagName !== "CANVAS"; });
    var cuerpo = document.createElement("div");
    cuerpo.className = "hero-contenido";
    hijos.forEach(function (h) { cuerpo.appendChild(h); });
    hero.appendChild(cuerpo);

    // Titular con contraste de color + palabra que cambia
    var h1 = cuerpo.querySelector("h1");
    if (h1) {
      h1.innerHTML = '<span class="hl-muted">Los mejores planes para una cita</span> <span class="hl-bright cycling-word">en Bogotá.</span>';
      var palabras = ["en Bogotá.", "romántica.", "diferente.", "inolvidable."];
      var idx = 0;
      var cw = h1.querySelector(".cycling-word");
      if (cw && !reduce) {
        setInterval(function () {
          cw.style.cssText = "opacity:0;transform:translateY(-8px);transition:opacity 300ms ease,transform 300ms ease";
          setTimeout(function () {
            idx = (idx + 1) % palabras.length;
            cw.textContent = palabras[idx];
            cw.style.cssText = "opacity:0;transform:translateY(10px);transition:none";
            requestAnimationFrame(function () {
              cw.style.cssText = "opacity:1;transform:translateY(0);transition:opacity 350ms ease,transform 350ms ease";
            });
          }, 320);
        }, 2600);
      }
    }

  }

  // ---------- 4) Aparecer al hacer scroll ----------
  function armarReveal() {
    var els = document.querySelectorAll(
      "main > section > h2, #beneficios li, #testimonios blockquote, #faq details, #explorar ol li, #hubspot-form"
    );
    if (reduce || !("IntersectionObserver" in window)) return;

    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var el = e.target;
        obs.unobserve(el);
        el.classList.add("visible");
        // al terminar, quitar clases para que el hover vuelva a funcionar
        setTimeout(function () {
          el.classList.remove("reveal", "visible");
          el.style.transitionDelay = "";
        }, 1000);
      });
    }, { threshold: 0.08 });

    els.forEach(function (el) {
      var hermanos = Array.prototype.slice.call(el.parentElement.children);
      el.style.transitionDelay = (hermanos.indexOf(el) % 4) * 90 + "ms";
      el.classList.add("reveal");
      obs.observe(el);
    });
  }

  // ---------- 5) Barra de progreso estilo Y2K ----------
  function armarProgreso() {
    var barra = document.createElement("div");
    barra.id = "scroll-progress";
    document.body.appendChild(barra);
    function actualizar() {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      var pct = max > 0 ? (window.scrollY / max) * 100 : 0;
      barra.style.width = pct + "%";
    }
    window.addEventListener("scroll", actualizar, { passive: true });
    actualizar();
  }

  armarHero();
  armarReveal();
  armarProgreso();
})();