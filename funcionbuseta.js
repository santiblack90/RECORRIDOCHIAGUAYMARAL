(() => {
  const $fecha = document.getElementById('fecha');
  const $hora = document.getElementById('hora');
  const $btn = document.getElementById('btnRegistrar');
  const $mensaje = document.getElementById('mensaje');
  const $tbody = document.getElementById('historial');
  const $btnBorrar = document.getElementById('btnBorrar');
  const $sentido = document.getElementById('sentido');

  const KEY = 'bus_salida_historial_v1';
  const KEY_SOLICITUD = 'bus_salida_solicitudes_v1';

  function resetSolicitudesIfNeeded(now = Date.now()) {
    try {
      const KEY_SOLICITUD_RESET_TS = 'bus_salida_solicitud_reset_ts_v1';
      const DURACION_MS = 25 * 60 * 1000;
      const lastResetRaw = localStorage.getItem(KEY_SOLICITUD_RESET_TS);
      const lastReset = lastResetRaw ? Number(lastResetRaw) : 0;
      if (!Number.isFinite(lastReset) || lastReset <= 0) {
        localStorage.setItem(KEY_SOLICITUD_RESET_TS, String(now));
        return;
      }
      if (now - lastReset >= DURACION_MS) {
        localStorage.setItem(KEY_SOLICITUD, '0');
        localStorage.setItem('bus_salida_solicitud_hecha_v1', '0');
        localStorage.setItem(KEY_SOLICITUD_RESET_TS, String(now));
      }
    } catch {}
  }

  function loadSolicitudes() {
    resetSolicitudesIfNeeded();
    try {
      const raw = localStorage.getItem(KEY_SOLICITUD);
      const val = raw ? Number(raw) : 0;
      return Number.isFinite(val) && val > 0 ? val : 0;
    } catch {
      return 0;
    }
  }


  function renderSolicitudes() {
    const el = document.getElementById('solicitudEstado');
    if (!el) return;
    const n = loadSolicitudes();
    el.textContent = `${n} solicitudes registradas (usuario_salida)`;
  }




  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function setNowToInputs() {
    const now = new Date();

    // YYYY-MM-DD
    const yyyy = now.getFullYear();
    const mm = pad2(now.getMonth() + 1);
    const dd = pad2(now.getDate());
    $fecha.value = `${yyyy}-${mm}-${dd}`;

    // HH:MM
    const hh = pad2(now.getHours());
    const min = pad2(now.getMinutes());
    $hora.value = `${hh}:${min}`;

    return { fecha: $fecha.value, hora: $hora.value };
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

  function save(records) {
    localStorage.setItem(KEY, JSON.stringify(records));
  }

  function render(records) {
    $tbody.innerHTML = '';
    if (!records.length) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td colspan="3" style="text-align:center; opacity:.75;">No hay registros</td>
      `;
      $tbody.appendChild(tr);
      return;
    }

    // Mostrar más reciente arriba
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
  }


  function escapeHtml(str) {
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '<')
      .replaceAll('>', '>')
      .replaceAll('"', '"')
      .replaceAll("'", '&#039;');
  }

  function showMessage(text, isError = false) {
    $mensaje.textContent = text;
    $mensaje.classList.toggle('mensaje--error', isError);
  }

  function registrar() {
    try {
      const { fecha, hora } = setNowToInputs();
      const records = load();
      const sentido = $sentido ? $sentido.value : undefined;
      records.push({ fecha, hora, sentido, ts: Date.now() });


      save(records);

      render(records);
      renderBars(records);
      showMessage('Salida registrada correctamente.');
    } catch {
      showMessage('Error al registrar la salida.', true);
    }
  }


  function borrar() {
    if (!confirm('¿Seguro que deseas borrar el historial?')) return;
    save([]);
    render([]);
    showMessage('Historial borrado.');
    setNowToInputs();
  }

  // --- Barra(s) por cada salida (contador 25 minutos) ---
  const $barras = document.getElementById('barrasSalidas');
  const DURACION_MS = 25 * 60 * 1000;

  function createSalidaBar(record) {
    const wrapper = document.createElement('div');
    wrapper.className = 'salidaBar';
    wrapper.dataset.ts = String(record.ts);

    const sentido = record.sentido ? ` • ${record.sentido}` : '';

    wrapper.innerHTML = `
      <div class="salidaMeta">
        <div class="salidaTitle">Salida ${record.fecha} ${record.hora}${sentido}</div>
        <div class="salidaTiempo" data-tiempo>—</div>
      </div>
      <div class="progressTrack" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
        <div class="progressFill" data-fill style="width: 0%;"></div>
      </div>
    `;

    return wrapper;
  }


  function renderBars(records) {
    if (!$barras) return;
    $barras.innerHTML = '';

    const ordered = [...records].sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
    for (const r of ordered) {
      $barras.appendChild(createSalidaBar(r));
    }
  }

  function updateBars() {
    if (!$barras) return;
    const records = load();
    const byTs = new Map(records.map(r => [r.ts, r]));

    const bars = $barras.querySelectorAll('.salidaBar');
    const now = Date.now();

    bars.forEach(bar => {
      const ts = Number(bar.dataset.ts);
      const record = byTs.get(ts);
      const fill = bar.querySelector('[data-fill]');
      const tiempo = bar.querySelector('[data-tiempo]');
      if (!record) return;

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
      if (tiempo) tiempo.textContent = `faltan ${minutes}m ${String(seconds).padStart(2, '0')}s`;
    });
  }

  // Init
  const initial = load();
  render(initial);
  renderBars(initial);
  renderSolicitudes();
  setNowToInputs();
  setInterval(updateBars, 1000);

  // actualizar solicitudes también cada tanto
  setInterval(renderSolicitudes, 2000);


  $btn.addEventListener('click', registrar);
  $btnBorrar.addEventListener('click', borrar);

  // Notas: al registrar/borrar también actualizamos las barras
  function registrar() {
    try {
      const { fecha, hora } = setNowToInputs();
      const records = load();
      const sentido = $sentido ? $sentido.value : undefined;
      records.push({ fecha, hora, sentido, ts: Date.now() });

      save(records);
      render(records);
      renderBars(records);
      showMessage('Salida registrada correctamente.');
    } catch {
      showMessage('Error al registrar la salida.', true);
    }
  }

  function borrar() {
    if (!confirm('¿Seguro que deseas borrar el historial?')) return;
    save([]);
    render([]);
    renderBars([]);
    showMessage('Historial borrado.');
    setNowToInputs();
  }

})();


