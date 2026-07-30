import { api, toast } from '../api.js';
import { shell, bindShell, openTipoCambioSync } from '../router.js';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function renderConfiguraciones(el) {
  async function paint() {
    el.innerHTML = shell(`
      <div class="mb-4">
        <h1 class="font-display text-2xl font-bold text-brand-900">Configuraciones</h1>
        <p class="text-sm text-slate-500">Opciones del sistema</p>
      </div>
      <div class="glass rounded-3xl p-8 text-center text-slate-500">
        <span class="spinner inline-block" style="border-color:rgba(15,118,110,.25);border-top-color:#0f766e"></span>
      </div>
    `, { title: 'Configuraciones', fab: false, active: 'configuraciones' });
    bindShell(null);

    let settings = [];
    let geminiModels = [];
    try {
      const [settingsRes, modelsRes] = await Promise.all([
        api.settings.list(),
        api.settings.geminiModels(),
      ]);
      settings = settingsRes;
      geminiModels = modelsRes.models || [];
    } catch (err) {
      toast(err.message, 'error');
      el.innerHTML = shell(`
        <div class="mb-4">
          <h1 class="font-display text-2xl font-bold text-brand-900">Configuraciones</h1>
        </div>
        <div class="empty-state glass rounded-3xl">
          <p class="text-red-600">${esc(err.message)}</p>
          <button id="btn-retry-settings" class="btn btn-primary mt-4">Reintentar</button>
        </div>
      `, { title: 'Configuraciones', fab: false, active: 'configuraciones' });
      bindShell(null);
      document.getElementById('btn-retry-settings')?.addEventListener('click', paint);
      return;
    }

    const cards = settings.length
      ? settings.map((s) => {
        const isSecret = s.OPCION === 'CLAVE VERIFICACIONES' || s.secreta;
        const isGeminiModel = s.OPCION === 'MODELO GEMINI';
        const isFactor = s.OPCION === 'FACTOR CAMBIO MONEDA';

        let controlHtml = '';
        if (isGeminiModel) {
          const options = geminiModels.map((m) => `
            <option value="${esc(m.id)}" ${s.VALOR === m.id ? 'selected' : ''}>
              ${esc(m.label || m.id)}
            </option>`).join('');
          controlHtml = `
            <select name="VALOR" class="input-field flex-1" required autocomplete="off">
              ${options}
            </select>`;
        } else if (isSecret) {
          controlHtml = `
            <input name="setting_secret" class="input-field flex-1 input-secret" type="text"
              autocomplete="off" data-lpignore="true" data-1p-ignore="true"
              placeholder="Nueva clave (no se muestra la actual)"
              required />`;
        } else if (isFactor) {
          controlHtml = `
            <div class="code-with-scan flex-1">
              <input name="VALOR" class="input-field" type="text" autocomplete="off"
                value="${esc(s.VALOR)}" required />
              <button type="button" class="btn-scan btn-sync-factor-setting" title="Consultar tipo de cambio con IA" aria-label="Consultar tipo de cambio">
                <i class="fa-solid fa-arrows-rotate"></i>
              </button>
            </div>`;
        } else {
          controlHtml = `
            <input name="VALOR" class="input-field flex-1"
              type="text"
              autocomplete="off"
              value="${esc(s.VALOR)}"
              required />`;
        }

        return `
        <article class="data-row p-4 sm:p-5" data-opcion="${esc(s.OPCION)}">
          <form class="setting-form space-y-3" autocomplete="off">
            <label class="label">${esc(s.OPCION)}</label>
            ${isGeminiModel ? `<p class="text-xs text-slate-500 -mt-1">Modelo usado en cotizaciones con Gemini</p>` : ''}
            ${isFactor ? `<p class="text-xs text-slate-500 -mt-1">Pesos mexicanos por 1 quetzal (costo ÷ factor)</p>` : ''}
            <div class="flex flex-col sm:flex-row gap-2">
              ${controlHtml}
              <button type="submit" class="btn btn-primary sm:px-5">
                <i class="fa-solid fa-floppy-disk"></i> Actualizar
              </button>
            </div>
          </form>
        </article>`;
      }).join('')
      : `<div class="empty-state glass rounded-3xl"><p>No hay configuraciones</p></div>`;

    el.innerHTML = shell(`
      <div class="mb-4">
        <h1 class="font-display text-2xl font-bold text-brand-900">Configuraciones</h1>
        <p class="text-sm text-slate-500">${settings.length} opción(es)</p>
      </div>
      <div class="space-y-3 max-w-2xl">${cards}</div>
    `, { title: 'Configuraciones', fab: false, active: 'configuraciones' });

    bindShell(null);

    el.querySelectorAll('.btn-sync-factor-setting').forEach((btn) => {
      btn.addEventListener('click', () => {
        openTipoCambioSync((nuevo) => {
          const input = el.querySelector('[data-opcion="FACTOR CAMBIO MONEDA"] input[name="VALOR"]');
          if (input && nuevo != null) input.value = String(nuevo);
        });
      });
    });

    el.querySelectorAll('.setting-form').forEach((form) => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const article = form.closest('[data-opcion]');
        const opcion = article?.dataset.opcion;
        const valorInput = form.VALOR || form.setting_secret;
        const valor = valorInput?.value?.trim() || '';
        const btn = form.querySelector('[type=submit]');
        btn.disabled = true;
        try {
          await api.settings.update(opcion, { VALOR: valor });
          toast(`"${opcion}" actualizado`, 'success');
        } catch (err) {
          toast(err.message, 'error');
        } finally {
          btn.disabled = false;
        }
      });
    });
  }

  await paint();
}
