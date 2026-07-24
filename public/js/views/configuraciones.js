import { api, toast } from '../api.js';
import { shell, bindShell } from '../router.js';

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
    try {
      settings = await api.settings.list();
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
        return `
        <article class="data-row p-4 sm:p-5" data-opcion="${esc(s.OPCION)}">
          <form class="setting-form space-y-3" autocomplete="off">
            <label class="label">${esc(s.OPCION)}</label>
            <div class="flex flex-col sm:flex-row gap-2">
              <input name="VALOR" class="input-field flex-1"
                type="${isSecret ? 'password' : 'text'}"
                autocomplete="${isSecret ? 'new-password' : 'off'}"
                placeholder="${isSecret ? 'Nueva clave (no se muestra la actual)' : ''}"
                value="${isSecret ? '' : esc(s.VALOR)}"
                required />
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

    el.querySelectorAll('.setting-form').forEach((form) => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const article = form.closest('[data-opcion]');
        const opcion = article?.dataset.opcion;
        const valor = form.VALOR.value.trim();
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
