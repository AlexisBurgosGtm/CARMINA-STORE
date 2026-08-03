import { api, toast, formatDate } from '../api.js';
import {
  shell,
  bindShell,
  openModal,
  closeModal,
  confirmDeleteWithClave,
} from '../router.js';
import { openBarcodeScanner } from '../barcode-scanner.js';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatQ(n) {
  return `Q ${Number(n || 0).toLocaleString('es-GT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function listHtml(items) {
  if (!items.length) {
    return `<div class="empty-state glass rounded-3xl">
      <i class="fa-solid fa-share-nodes text-3xl mb-3 text-brand-500"></i>
      <p>No hay productos para publicar</p>
      <p class="text-sm mt-1">Usa + o la cámara para agregar del catálogo</p>
    </div>`;
  }

  return items.map((item) => `
    <article class="data-row p-3 sm:p-4" data-id="${esc(item.ID)}" data-cod="${esc(item.CODPROD)}">
      <div class="product-row">
        <div class="product-row-top">
          <div class="thumb flex items-center justify-center text-brand-700 shrink-0">
            ${item.FOTO
              ? `<img class="thumb" src="${api.productos.fotoUrl(item.CODPROD)}" alt="" onerror="this.outerHTML='<div class=\\'thumb flex items-center justify-center text-brand-700\\'><i class=\\'fa-solid fa-box\\'></i></div>'" />`
              : `<i class="fa-solid fa-box"></i>`}
          </div>
          <div class="product-row-info">
            <p class="font-semibold text-slate-800 break-words">${esc(item.DESPROD)}</p>
            <p class="text-xs text-slate-500 truncate">${esc(item.CODPROD)}</p>
            <div class="product-meta">
              <span class="text-sm font-bold text-brand-700">${formatQ(item.PRECIO)}</span>
              <span class="text-[10px] text-slate-400">Agregado ${formatDate(item.FECHA)}</span>
            </div>
          </div>
        </div>
        <div class="product-row-actions">
          <button class="btn btn-primary btn-pub-share" type="button" title="Publicar">
            <i class="fa-solid fa-share-nodes"></i> Publicar
          </button>
          <button class="btn btn-wa btn-pub-wa" type="button" title="Publicar WhatsApp">
            <i class="fa-brands fa-whatsapp"></i> Publicar WhatsApp
          </button>
          <button class="btn btn-ghost btn-pub-download" type="button" title="Descargar imagen con logo y precio">
            <i class="fa-solid fa-download"></i> Descargar
          </button>
          <button class="btn btn-danger btn-icon btn-pub-del" type="button" title="Eliminar">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
    </article>
  `).join('');
}

async function addByCodigo(codprod, paint) {
  try {
    await api.publicaciones.create({ CODPROD: codprod });
    toast('Producto agregado a publicaciones', 'success');
    await paint();
  } catch (err) {
    toast(err.message, 'error');
  }
}

function openBuscarProductoModal(paint) {
  openModal(`
    <div class="flex items-start justify-between gap-3 mb-4">
      <div class="min-w-0">
        <h2 class="font-display text-xl font-bold text-brand-900">Agregar a publicaciones</h2>
        <p class="text-sm text-slate-500">Busca un producto del catálogo</p>
      </div>
      <button id="modal-close" class="btn btn-ghost btn-icon shrink-0"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="space-y-3">
      <div class="catalog-search-wrap">
        <i class="fa-solid fa-magnifying-glass catalog-search-icon" aria-hidden="true"></i>
        <input id="pub-search-input" class="input-field catalog-search-input" type="search"
          placeholder="Código o descripción..." autocomplete="off" />
      </div>
      <div id="pub-search-results" class="space-y-2 max-h-[50vh] overflow-y-auto">
        <p class="text-sm text-slate-500 text-center py-6">Escribe para buscar...</p>
      </div>
    </div>
  `);

  const input = document.getElementById('pub-search-input');
  const results = document.getElementById('pub-search-results');
  let productos = [];
  let loading = true;

  api.productos.list()
    .then((list) => {
      productos = list || [];
      loading = false;
      renderResults(input?.value || '');
    })
    .catch((err) => {
      loading = false;
      if (results) results.innerHTML = `<p class="text-red-600 text-sm">${esc(err.message)}</p>`;
    });

  function renderResults(q) {
    if (!results) return;
    if (loading) {
      results.innerHTML = `<div class="text-center py-6"><span class="spinner inline-block" style="border-color:rgba(15,118,110,.25);border-top-color:#0f766e"></span></div>`;
      return;
    }
    const query = String(q || '').trim().toLowerCase();
    const filtered = !query
      ? productos.slice(0, 40)
      : productos.filter((p) => {
        const hay = `${p.CODPROD} ${p.DESPROD}`.toLowerCase();
        return hay.includes(query);
      }).slice(0, 40);

    if (!filtered.length) {
      results.innerHTML = `<p class="text-sm text-slate-500 text-center py-6">Sin resultados</p>`;
      return;
    }

    results.innerHTML = filtered.map((p) => `
      <button type="button" class="data-row p-3 w-full text-left pub-pick-item" data-cod="${esc(p.CODPROD)}">
        <p class="font-semibold text-slate-800 break-words">${esc(p.DESPROD)}</p>
        <p class="text-xs text-slate-500 mt-0.5">${esc(p.CODPROD)}</p>
        <p class="text-sm font-bold text-brand-700 mt-1">${formatQ(p.PRECIO)}</p>
      </button>
    `).join('');

    results.querySelectorAll('.pub-pick-item').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const cod = btn.dataset.cod;
        closeModal();
        await addByCodigo(cod, paint);
      });
    });
  }

  input?.focus();
  input?.addEventListener('input', () => renderResults(input.value));
}

export async function renderPublicaciones(el) {
  async function paint() {
    el.innerHTML = shell(`
      <div class="mb-4">
        <h1 class="font-display text-2xl font-bold text-brand-900">Publicaciones</h1>
        <p class="text-sm text-slate-500">Cargando...</p>
      </div>
      <div class="glass rounded-3xl p-8 text-center text-slate-500">
        <span class="spinner inline-block" style="border-color:rgba(15,118,110,.25);border-top-color:#0f766e"></span>
      </div>
    `, { title: 'Publicaciones', fab: true, fabCamera: true, active: 'publicaciones' });
    bindShell(() => openBuscarProductoModal(paint), null, null, () => {
      openBarcodeScanner(async (code) => {
        await addByCodigo(code, paint);
      });
    });

    let items = [];
    try {
      items = await api.publicaciones.list();
    } catch (err) {
      toast(err.message, 'error');
      el.innerHTML = shell(`
        <div class="mb-4">
          <h1 class="font-display text-2xl font-bold text-brand-900">Publicaciones</h1>
        </div>
        <div class="empty-state glass rounded-3xl">
          <p class="text-red-600">${esc(err.message)}</p>
          <button id="btn-retry-pub" class="btn btn-primary mt-4">Reintentar</button>
        </div>
      `, { title: 'Publicaciones', fab: true, fabCamera: true, active: 'publicaciones' });
      bindShell(() => openBuscarProductoModal(paint), null, null, () => {
        openBarcodeScanner(async (code) => addByCodigo(code, paint));
      });
      document.getElementById('btn-retry-pub')?.addEventListener('click', paint);
      return;
    }

    el.innerHTML = shell(`
      <div class="mb-4">
        <h1 class="font-display text-2xl font-bold text-brand-900">Publicaciones</h1>
        <p class="text-sm text-slate-500">${items.length} producto(s) listos para redes</p>
      </div>
      <div class="space-y-2" id="pub-list">${listHtml(items)}</div>
    `, { title: 'Publicaciones', fab: true, fabCamera: true, active: 'publicaciones' });

    bindShell(
      () => openBuscarProductoModal(paint),
      null,
      null,
      () => {
        openBarcodeScanner(async (code) => {
          await addByCodigo(code, paint);
        });
      }
    );

    el.querySelectorAll('[data-id]').forEach((row) => {
      const id = row.dataset.id;
      row.querySelector('.btn-pub-del')?.addEventListener('click', async () => {
        const ok = await confirmDeleteWithClave('¿Quitar este producto de publicaciones?');
        if (!ok) return;
        try {
          await api.publicaciones.remove(id);
          toast('Eliminado de publicaciones', 'success');
          paint();
        } catch (err) {
          toast(err.message, 'error');
        }
      });

      row.querySelector('.btn-pub-share')?.addEventListener('click', async () => {
        try {
          await api.publicaciones.publicar(id);
          toast('Publicado', 'success');
        } catch (err) {
          toast(err.message || 'Publicar aún no está implementado', 'info');
        }
      });

      row.querySelector('.btn-pub-wa')?.addEventListener('click', async () => {
        const btn = row.querySelector('.btn-pub-wa');
        if (btn) btn.disabled = true;
        try {
          await api.publicaciones.publicarWhatsapp(id);
          toast('Publicado en Estado de WhatsApp', 'success');
        } catch (err) {
          toast(err.message || 'No se pudo publicar en WhatsApp', 'error');
        } finally {
          if (btn) btn.disabled = false;
        }
      });

      row.querySelector('.btn-pub-download')?.addEventListener('click', async () => {
        const btn = row.querySelector('.btn-pub-download');
        const cod = row.dataset.cod || id;
        if (btn) btn.disabled = true;
        try {
          await api.publicaciones.downloadImagen(id, cod);
          toast('Imagen descargada', 'success');
        } catch (err) {
          toast(err.message || 'No se pudo descargar la imagen', 'error');
        } finally {
          if (btn) btn.disabled = false;
        }
      });
    });
  }

  await paint();
}
