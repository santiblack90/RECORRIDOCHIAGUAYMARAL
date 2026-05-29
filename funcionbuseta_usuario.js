(() => {
  const $tbody = document.getElementById('historial');
  const $info = document.getElementById('info');
  // Solicitud de bus

  const $barras = document.getElementById('barrasSalidas');

  const KEY = 'bus_salida_historial_v1';
  const DURACION_MS = 25 * 60 * 1000;

  function escapeHtml(str) {
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '<')
      .replaceAll('>', '>')
      .replaceAll('"', '"')
      .replaceAll("'", '&#039;');
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      const data = raw ? JSON.parse(raw) : [];
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
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

  // --- Barras por cada salida (misma estructura visual que lasjuntas.html/funcionbuseta.js) ---
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

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function updateBars() {
    if (!$barras) return;

    const records = load();
    const byTs = new Map(records.filter(r => typeof r.ts === 'number').map(r => [r.ts, r]));
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

  const KEY_SOLICITUD = 'bus_salida_solicitudes_v1';
  const KEY_SOLICITO_UNA_VEZ = 'bus_salida_solicitud_hecha_v1';
  const KEY_SOLICITUD_RESET_TS = 'bus_salida_solicitud_reset_ts_v1';



  function loadSolicitudes() {
    try {
      const raw = localStorage.getItem(KEY_SOLICITUD);
      const val = raw ? Number(raw) : 0;
      return Number.isFinite(val) && val > 0 ? val : 0;
    } catch {
      return 0;
    }
  }

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

  function init() {
    resetSolicitudesIfNeeded();

    const records = load();
    const ordered = render(records);

    if ($info) {
      $info.textContent = records.length ? `Total: ${records.length} salida(s)` : '';
    }

    renderBars(ordered);
    updateBars();

    setInterval(updateBars, 1000);

    const btn = document.getElementById('btnSolicitarBus');
    if (btn) {
      actualizarEstadoSolicitudes();
      btn.addEventListener('click', solicitarBus);
    }
  }

  init();
})();







