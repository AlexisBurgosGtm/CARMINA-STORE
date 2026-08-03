import { api, toast } from '../api.js';
import { shell, bindShell, openTipoCambioSync } from '../router.js';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function logoCardHtml(s) {
  const preview = s.hasLogo
    ? `<img id="logo-preview" class="logo-preview" src="/api/settings/logo?t=${Date.now()}" alt="Logo de empresa" />`
    : `<div id="logo-preview-empty" class="logo-preview-empty">
         <i class="fa-regular fa-image"></i>
         <span>Sin logo</span>
       </div>
       <img id="logo-preview" class="logo-preview hidden" alt="Logo de empresa" />`;

  return `
    <article class="data-row p-4 sm:p-5" data-opcion="${esc(s.OPCION)}" data-logo="1">
      <form id="logo-form" class="space-y-3" autocomplete="off">
        <label class="label">${esc(s.OPCION)}</label>
        <p class="text-xs text-slate-500 -mt-1">
          PNG o WebP recomendados (soportan transparencias). Máx. 2 MB.
        </p>
        <div class="logo-setting-row">
          <div class="logo-preview-wrap">
            ${preview}
          </div>
          <div class="logo-setting-controls space-y-2 flex-1 min-w-0">
            <input id="logo-file" name="logo" type="file" accept="image/png,image/webp,image/gif,image/jpeg"
              class="input-field" />
            <p id="logo-file-hint" class="text-xs text-slate-500"></p>
            <div class="flex flex-wrap gap-2">
              <button type="submit" class="btn btn-primary">
                <i class="fa-solid fa-floppy-disk"></i> Guardar logo
              </button>
              ${s.hasLogo ? `
              <button type="button" id="btn-logo-remove" class="btn btn-danger">
                <i class="fa-solid fa-trash"></i> Quitar
              </button>` : ''}
            </div>
          </div>
        </div>
      </form>
    </article>`;
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
    let badgeOpts = { colores: [], formas: [] };
    try {
      const [settingsRes, modelsRes, badgeRes] = await Promise.all([
        api.settings.list(),
        api.settings.geminiModels(),
        api.settings.badgePrecioOptions().catch(() => ({ colores: [], formas: [] })),
      ]);
      settings = [...settingsRes].sort((a, b) => {
        const key = (op) => {
          if (op === 'FORMA BADGE PRECIO') return 'COLOR BADGE PRECIO\u0000';
          if (op === 'COLOR BADGE PRECIO') return 'COLOR BADGE PRECIO\u0001';
          return op;
        };
        return key(a.OPCION).localeCompare(key(b.OPCION), 'es');
      });
      geminiModels = modelsRes.models || [];
      badgeOpts = badgeRes || badgeOpts;
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
        if (s.OPCION === 'LOGO EMPRESA' || s.isLogo) {
          return logoCardHtml(s);
        }

        const isSecret = s.OPCION === 'CLAVE VERIFICACIONES' || s.secreta;
        const isGeminiModel = s.OPCION === 'MODELO GEMINI';
        const isFactor = s.OPCION === 'FACTOR CAMBIO MONEDA';
        const isColorBadge = s.OPCION === 'COLOR BADGE PRECIO';
        const isFormaBadge = s.OPCION === 'FORMA BADGE PRECIO';

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
        } else if (isColorBadge) {
          const options = (badgeOpts.colores || []).map((c) => `
            <option value="${esc(c.id)}" ${String(s.VALOR).toUpperCase() === c.id ? 'selected' : ''}>
              ${esc(c.label)}
            </option>`).join('');
          controlHtml = `
            <div class="badge-color-control flex-1">
              <select name="VALOR" class="input-field" required autocomplete="off" id="select-color-badge">
                ${options}
              </select>
              <span class="badge-color-swatch" id="swatch-color-badge"
                style="background:${esc((badgeOpts.colores || []).find((c) => c.id === String(s.VALOR).toUpperCase())?.bg || '#16a34a')}"></span>
            </div>`;
        } else if (isFormaBadge) {
          const options = (badgeOpts.formas || []).map((f) => `
            <option value="${esc(f.id)}" ${String(s.VALOR).toUpperCase() === f.id ? 'selected' : ''}>
              ${esc(f.label)}
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
            ${isFactor ? `<p class="text-xs text-slate-500 -mt-1">Pesos mexicanos por 1 quetzal · fuente: Google Finance (GTQ/MXN)</p>` : ''}
            ${isColorBadge ? `<p class="text-xs text-slate-500 -mt-1">Color de fondo del precio en imágenes para publicar (blanco = texto negro)</p>` : ''}
            ${isFormaBadge ? `<p class="text-xs text-slate-500 -mt-1">Forma del badge del precio en imágenes para publicar</p>` : ''}
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

    const colorSelect = document.getElementById('select-color-badge');
    const colorSwatch = document.getElementById('swatch-color-badge');
    const colorMap = Object.fromEntries((badgeOpts.colores || []).map((c) => [c.id, c.bg]));
    colorSelect?.addEventListener('change', () => {
      if (colorSwatch) colorSwatch.style.background = colorMap[colorSelect.value] || '#16a34a';
    });

    const logoFile = document.getElementById('logo-file');
    const logoHint = document.getElementById('logo-file-hint');
    const logoPreview = document.getElementById('logo-preview');
    const logoEmpty = document.getElementById('logo-preview-empty');

    logoFile?.addEventListener('change', () => {
      const file = logoFile.files?.[0];
      if (!file) {
        if (logoHint) logoHint.textContent = '';
        return;
      }
      if (logoHint) logoHint.textContent = `${file.name} · ${(file.size / 1024).toFixed(0)} KB`;
      const reader = new FileReader();
      reader.onload = () => {
        if (logoPreview) {
          logoPreview.src = reader.result;
          logoPreview.classList.remove('hidden');
        }
        logoEmpty?.classList.add('hidden');
      };
      reader.readAsDataURL(file);
    });

    document.getElementById('logo-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const file = logoFile?.files?.[0];
      if (!file) {
        toast('Selecciona una imagen de logo', 'error');
        return;
      }
      const btn = e.target.querySelector('[type=submit]');
      if (btn) btn.disabled = true;
      try {
        const fd = new FormData();
        fd.append('logo', file);
        await api.settings.uploadLogo(fd);
        toast('Logo de empresa guardado', 'success');
        paint();
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        if (btn) btn.disabled = false;
      }
    });

    document.getElementById('btn-logo-remove')?.addEventListener('click', async () => {
      const ask = await window.Swal?.fire({
        icon: 'warning',
        title: '¿Quitar logo?',
        text: 'Se eliminará el logo de empresa de la configuración.',
        showCancelButton: true,
        confirmButtonText: 'Quitar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#dc2626',
      });
      if (!ask?.isConfirmed) return;
      try {
        await api.settings.removeLogo();
        toast('Logo eliminado', 'success');
        paint();
      } catch (err) {
        toast(err.message, 'error');
      }
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
