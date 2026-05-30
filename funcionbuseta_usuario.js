import { getDatabase, ref, remove, onValue } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-database.js";
import { app } from "./firebase-init.js";

(() => {
  const $tbody = document.getElementById('historial');
  const $info = document.getElementById('info');
  const $barras = document.getElementById('barrasSalidas');

  const KEY_SOLICITUD = 'bus_salida_solicitudes_v1';
  const DURACION_MS = 25 * 60 * 1000;

  // Firebase Realtime Database (lee salidas en /salidas)
  const db = getDatabase(app);
  const SALIDAS_REF = ref(db, "salidas");
  let recordsCache = [];

  function escapeHtml(str) {
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '<')
      .replaceAll('>', '>')
      .replaceAll('"', '"')
      .replaceAll("'", '&#039;');
  }

  function loadSolicitudes() {
    try {
      const raw = localStorage.getItem(KEY_SOLICITUD);
      const val = raw ? Number(raw) : 0;
      return Number.isFinite(val) && val > 0 ? val : 0;
    } catch {
      return 0;
    }
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function render(records) {
    $tbody.innerHTML = '';

    if (!records.length) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td colspan="3" style="text-align:center; opacity:.75;">Aún no hay salidas registradas</td>
      `;
      $tbody.appendChild(tr);
      return [];
    }

    const ordered = [...records].sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
    for (let i = 0; i < ordered.length; i++) {
      const r = ordered[i];
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${i + 1}</td>
        <td>${escapeHtml(r.fecha)}</td>
        <td>${escapeHtml(r.hora)}</td>
      `;
      $tbody.appendChild(tr);
    }

    return ordered;
  }

  function createSalidaBar(record) {
    const wrapper = document.createElement('div');
    wrapper.className = 'salidaBar';
    wrapper.dataset.ts = String(record.ts);

    wrapper.innerHTML = `
      <div class="salidaMeta">
        <div class="salidaTitle">Salida ${record.fecha} ${record.hora}${record.sentido ? ` • ${record.sentido}` : ''}</div>
        <div class="salidaTiempo" data-tiempo>—</div>
      </div>

      <div class="progressWrap">
        <div class="progressLabels">
          <span class="progressLabel progressLabel--start">Inicio recorrido 🚐​​🟢​</span>
          <span class="progressLabel progressLabel--end">Final recorrido 🚐🔴​</span>
        </div>

        <div class="progressTrack" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
          <div class="progressFill" data-fill style="width: 0%;"></div>
        </div>
      </div>
    `;

    return wrapper;
  }

  function renderBars(records) {
    if (!$barras) return;
    $barras.innerHTML = '';

    const ordered = [...records].sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
    for (const r of ordered) {
      if (typeof r.ts !== 'number') continue;
      $barras.appendChild(createSalidaBar(r));
    }
  }

  function updateBars() {
    if (!$barras) return;

    const byTs = new Map(recordsCache.map(r => [r.ts, r]));
    const bars = $barras.querySelectorAll('.salidaBar');

    const now = Date.now();

    bars.forEach(bar => {
      const ts = Number(bar.dataset.ts);
      const record = byTs.get(ts);
      if (!record) return;

      const fill = bar.querySelector('[data-fill]');
      const tiempo = bar.querySelector('[data-tiempo]');

      const elapsed = now - record.ts;

      if (elapsed < 0) {
        if (fill) fill.style.width = '0%';
        if (tiempo) tiempo.textContent = 'pendiente';
        return;
      }

      const clamped = Math.min(elapsed, DURACION_MS);
      const pct = (clamped / DURACION_MS) * 100;
      if (fill) fill.style.width = `${pct}%`;

      const remaining = Math.max(0, DURACION_MS - elapsed);
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      if (tiempo) tiempo.textContent = `faltan ${minutes}m ${pad2(seconds)}s`;
    });
  }

  // Solicitud de bus (se mantiene en localStorage)
  const KEY_SOLICITO_UNA_VEZ = 'bus_salida_solicitud_hecha_v1';
  const KEY_SOLICITUD_RESET_TS = 'bus_salida_solicitud_reset_ts_v1';

  function saveSolicitudes(n) {
    localStorage.setItem(KEY_SOLICITUD, String(n));
  }

  function setSolicitado() {
    localStorage.setItem(KEY_SOLICITO_UNA_VEZ, '1');
  }

  function yaSolicito() {
    return localStorage.getItem(KEY_SOLICITO_UNA_VEZ) === '1';
  }

  function actualizarEstadoSolicitudes() {
    const el = document.getElementById('solicitudEstado');
    if (!el) return;
    const n = loadSolicitudes();
    el.textContent = `${n} solicitudes registradas`;
  }

  function solicitarBus() {
    if (yaSolicito()) {
      alert('Ya solicitaste el bus una vez en esta pantalla.');
      return;
    }

    const actuales = loadSolicitudes();
    saveSolicitudes(actuales + 1);
    setSolicitado();
    actualizarEstadoSolicitudes();

    alert('Solicitud registrada.');
  }

  function resetSolicitudesIfNeeded(now = Date.now()) {
    try {
      const lastResetRaw = localStorage.getItem(KEY_SOLICITUD_RESET_TS);
      const lastReset = lastResetRaw ? Number(lastResetRaw) : 0;
      if (!Number.isFinite(lastReset) || lastReset <= 0) {
        localStorage.setItem(KEY_SOLICITUD_RESET_TS, String(now));
        return;
      }

      if (now - lastReset >= DURACION_MS) {
        saveSolicitudes(0);
        localStorage.setItem(KEY_SOLICITO_UNA_VEZ, '0');
        localStorage.setItem(KEY_SOLICITUD_RESET_TS, String(now));
      }
    } catch {}
  }

  function initRealtime() {
    onValue(SALIDAS_REF, snapshot => {
      const raw = snapshot.val();
      const arr = [];
      if (raw && typeof raw === 'object') {
        for (const [, value] of Object.entries(raw)) {
          if (!value || typeof value !== 'object') continue;
          const fecha = value.fecha;
          const hora = value.hora;
          const sentido = value.sentido;
          const ts = typeof value.ts === 'number' ? value.ts : Number(value.ts);
          if (!Number.isFinite(ts)) continue;
          arr.push({ fecha, hora, sentido, ts });
        }
      }

      recordsCache = arr;
      const ordered = render(recordsCache);

      if ($info) {
        $info.textContent = recordsCache.length ? `Total: ${recordsCache.length} salida(s)` : '';
      }

      renderBars(ordered);
      updateBars();
    });
  }

  function init() {
    resetSolicitudesIfNeeded();

    initRealtime();

    setInterval(updateBars, 1000);

    const btn = document.getElementById('btnSolicitarBus');
    if (btn) {
      actualizarEstadoSolicitudes();
      btn.addEventListener('click', solicitarBus);
    }

    // Mantener el texto de solicitudes refrescado
    setInterval(actualizarEstadoSolicitudes, 2000);
  }

  init();
})();

