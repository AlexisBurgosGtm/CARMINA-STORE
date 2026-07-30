import { api, toast } from '../api.js';
import { shell, bindShell } from '../router.js';

function formatQ(n) {
  return `Q ${Number(n || 0).toLocaleString('es-GT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPesos(n) {
  return `$ ${Number(n || 0).toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

async function loadFactorCambio() {
  try {
    const s = await api.settings.get('FACTOR CAMBIO MONEDA');
    const n = Number(s.VALOR);
    return Number.isFinite(n) && n > 0 ? n : 2.2;
  } catch {
    return 2.2;
  }
}

export async function renderCalcularPrecio(el) {
  let factor = 2.2;

  el.innerHTML = shell(`
    <div class="mb-4">
      <h1 class="font-display text-2xl font-bold text-brand-900">Calcular Precio</h1>
      <p class="text-sm text-slate-500">Cargando factor de cambio...</p>
    </div>
    <div class="glass rounded-3xl p-8 text-center text-slate-500">
      <span class="spinner inline-block" style="border-color:rgba(15,118,110,.25);border-top-color:#0f766e"></span>
    </div>
  `, { title: 'Calcular Precio', fab: false, active: 'calcular-precio' });
  bindShell(null);

  try {
    factor = await loadFactorCambio();
  } catch (err) {
    toast(err.message, 'error');
  }

  el.innerHTML = shell(`
    <div class="mb-4">
      <h1 class="font-display text-2xl font-bold text-brand-900">Calcular Precio</h1>
      <p class="text-sm text-slate-500">Factor de cambio actual: <strong id="calc-factor-label">${factor}</strong></p>
    </div>

    <div class="glass-strong rounded-3xl p-5 sm:p-6 space-y-4 max-w-xl">
      <div>
        <label class="label" for="calc-costo">Costo en Pesos</label>
        <div class="money-input">
          <span class="money-prefix" title="Pesos">$</span>
          <input id="calc-costo" class="input-field" type="number" step="0.01" min="0" value="0" autocomplete="off" />
        </div>
      </div>

      <div>
        <label class="label" for="calc-margen">Margen de Ganancia (%)</label>
        <div class="money-input">
          <span class="money-prefix" title="Porcentaje">%</span>
          <input id="calc-margen" class="input-field" type="number" step="0.1" min="0" max="99.9" value="20" autocomplete="off" />
        </div>
      </div>

      <div class="calc-result-card">
        <p class="text-xs uppercase tracking-wide text-slate-400 font-semibold">Costo en Quetzales</p>
        <p id="calc-costo-qtz" class="font-display text-2xl font-bold text-brand-800 mt-1">${formatQ(0)}</p>
        <p class="text-xs text-slate-500 mt-1">Costo en pesos ÷ factor (${factor})</p>
      </div>

      <div class="calc-result-card calc-result-highlight">
        <p class="text-xs uppercase tracking-wide text-slate-400 font-semibold">Precio venta Quetzales</p>
        <p id="calc-precio-venta" class="font-display text-3xl font-bold text-brand-700 mt-1">${formatQ(0)}</p>
        <p class="text-xs text-slate-500 mt-1">(Costo quetzales × 100) ÷ (100 − margen)</p>
      </div>

      <div class="grid grid-cols-2 gap-3 text-center">
        <div class="rounded-2xl bg-white/50 p-3">
          <p class="text-[10px] uppercase text-slate-400">Utilidad</p>
          <p id="calc-utilidad" class="font-bold text-brand-700">${formatQ(0)}</p>
        </div>
        <div class="rounded-2xl bg-white/50 p-3">
          <p class="text-[10px] uppercase text-slate-400">Costo MXN</p>
          <p id="calc-costo-label" class="font-bold text-slate-700">${formatPesos(0)}</p>
        </div>
      </div>
    </div>
  `, { title: 'Calcular Precio', fab: false, active: 'calcular-precio' });

  bindShell(null, null, (nuevo) => {
    if (!Number.isFinite(nuevo) || nuevo <= 0) return;
    factor = nuevo;
    const label = document.getElementById('calc-factor-label');
    if (label) label.textContent = String(factor);
    const hint = document.querySelector('.calc-result-card .text-xs.text-slate-500');
    if (hint) hint.textContent = `Costo en pesos ÷ factor (${factor})`;
    recalc();
  });

  const costoInput = document.getElementById('calc-costo');
  const margenInput = document.getElementById('calc-margen');
  const costoQtzEl = document.getElementById('calc-costo-qtz');
  const precioEl = document.getElementById('calc-precio-venta');
  const utilidadEl = document.getElementById('calc-utilidad');
  const costoLabelEl = document.getElementById('calc-costo-label');

  const recalc = () => {
    const costo = Number(costoInput?.value) || 0;
    const margen = Number(margenInput?.value);
    const margenPct = Number.isFinite(margen) ? margen : 20;
    const costoQtz = factor > 0 ? costo / factor : 0;
    const denom = 100 - margenPct;
    const precioVenta = denom > 0 ? (costoQtz * 100) / denom : 0;
    const utilidad = precioVenta - costoQtz;

    if (costoQtzEl) costoQtzEl.textContent = formatQ(costoQtz);
    if (precioEl) {
      precioEl.textContent = denom > 0 ? formatQ(precioVenta) : '—';
      precioEl.style.color = denom > 0 ? '' : '#dc2626';
    }
    if (utilidadEl) utilidadEl.textContent = denom > 0 ? formatQ(utilidad) : '—';
    if (costoLabelEl) costoLabelEl.textContent = formatPesos(costo);
  };

  costoInput?.addEventListener('input', recalc);
  margenInput?.addEventListener('input', recalc);
  recalc();
}
