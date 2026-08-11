import { api, toast, formatDate } from '../api.js';
import {
  shell,
  bindShell,
  openModal,
  closeModal,
  confirmDeleteWithClave,
  navigate,
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

/* ───────────────── Álbumes (lista) ───────────────── */

function albumFormHtml(item = null) {
  const isEdit = !!item;
  return `
    <div class="flex items-start justify-between gap-3 mb-4">
      <div class="min-w-0">
        <h2 class="font-display text-xl font-bold text-brand-900">${isEdit ? 'Editar álbum' : 'Nuevo álbum'}</h2>
        <p class="text-sm text-slate-500">Organiza productos para publicar</p>
      </div>
      <button id="modal-close" class="btn btn-ghost btn-icon shrink-0"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <form id="album-form" class="space-y-3" autocomplete="off">
      <div>
        <label class="label" for="album-nombre">Nombre</label>
        <input id="album-nombre" name="NOMBRE" class="input-field" required maxlength="150"
          autocomplete="off" autofocus value="${esc(item?.NOMBRE || '')}" placeholder="Ej. Promo marzo" />
      </div>
      <div class="flex gap-2 pt-2">
        <button type="button" id="modal-close-2" class="btn btn-ghost flex-1">Cancelar</button>
        <button type="submit" class="btn btn-primary flex-1">${isEdit ? 'Guardar' : 'Crear'}</button>
      </div>
    </form>
  `;
}

function openAlbumEditor(item = null, onSaved) {
  openModal(albumFormHtml(item));
  document.getElementById('modal-close-2')?.addEventListener('click', closeModal);

  document.getElementById('album-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const NOMBRE = form.NOMBRE.value.trim();
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      if (item) {
        await api.albumes.update(item.ID, { NOMBRE });
        toast('Álbum actualizado', 'success');
      } else {
        await api.albumes.create({ NOMBRE });
        toast('Álbum creado', 'success');
      }
      closeModal();
      onSaved?.();
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
    }
  });
}

function albumsListHtml(albums) {
  if (!albums.length) {
    return `<div class="empty-state glass rounded-3xl">
      <i class="fa-solid fa-images text-3xl mb-3 text-brand-500"></i>
      <p>No hay álbumes</p>
      <p class="text-sm mt-1">Crea un álbum con el botón +</p>
    </div>`;
  }

  return albums.map((a) => `
    <article class="data-row p-3 sm:p-4" data-id="${esc(a.ID)}">
      <div class="product-row">
        <button type="button" class="product-row-top album-open w-full text-left" data-id="${esc(a.ID)}">
          <div class="thumb flex items-center justify-center text-brand-700 shrink-0">
            <i class="fa-solid fa-images"></i>
          </div>
          <div class="product-row-info">
            <p class="font-semibold text-slate-800 break-words">${esc(a.NOMBRE)}</p>
            <div class="product-meta">
              <span class="text-sm text-brand-700 font-semibold">${Number(a.TOTAL) || 0} producto(s)</span>
              <span class="text-[10px] text-slate-400">Creado ${formatDate(a.FECHA)}</span>
            </div>
          </div>
          <i class="fa-solid fa-chevron-right text-slate-400 shrink-0 self-center"></i>
        </button>
        <div class="product-row-actions">
          <button class="btn btn-ghost btn-icon btn-album-edit" type="button" title="Editar">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="btn btn-danger btn-icon btn-album-del" type="button" title="Eliminar">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
    </article>
  `).join('');
}

async function paintAlbumes(el) {
  el.innerHTML = shell(`
    <div class="mb-4">
      <h1 class="font-display text-2xl font-bold text-brand-900">Publicaciones</h1>
      <p class="text-sm text-slate-500">Cargando álbumes...</p>
    </div>
    <div class="glass rounded-3xl p-8 text-center text-slate-500">
      <span class="spinner inline-block" style="border-color:rgba(15,118,110,.25);border-top-color:#0f766e"></span>
    </div>
  `, { title: 'Publicaciones', fab: true, active: 'publicaciones' });
  bindShell(() => openAlbumEditor(null, () => paintAlbumes(el)));

  let albums = [];
  try {
    albums = await api.albumes.list();
  } catch (err) {
    toast(err.message, 'error');
    el.innerHTML = shell(`
      <div class="mb-4">
        <h1 class="font-display text-2xl font-bold text-brand-900">Publicaciones</h1>
      </div>
      <div class="empty-state glass rounded-3xl">
        <p class="text-red-600">${esc(err.message)}</p>
        <button id="btn-retry-albums" class="btn btn-primary mt-4">Reintentar</button>
      </div>
    `, { title: 'Publicaciones', fab: true, active: 'publicaciones' });
    bindShell(() => openAlbumEditor(null, () => paintAlbumes(el)));
    document.getElementById('btn-retry-albums')?.addEventListener('click', () => paintAlbumes(el));
    return;
  }

  el.innerHTML = shell(`
    <div class="mb-4">
      <h1 class="font-display text-2xl font-bold text-brand-900">Publicaciones</h1>
      <p class="text-sm text-slate-500">${albums.length} álbum(es)</p>
    </div>
    <div class="space-y-2">${albumsListHtml(albums)}</div>
  `, { title: 'Publicaciones', fab: true, active: 'publicaciones' });

  bindShell(() => openAlbumEditor(null, () => paintAlbumes(el)));

  el.querySelectorAll('.album-open').forEach((btn) => {
    btn.addEventListener('click', () => {
      navigate(`/publicaciones?album=${encodeURIComponent(btn.dataset.id)}`);
    });
  });

  el.querySelectorAll('article[data-id]').forEach((row) => {
    const id = Number(row.dataset.id);
    const album = albums.find((a) => Number(a.ID) === id);
    row.querySelector('.btn-album-edit')?.addEventListener('click', (e) => {
      e.stopPropagation();
      openAlbumEditor(album, () => paintAlbumes(el));
    });
    row.querySelector('.btn-album-del')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const ok = await confirmDeleteWithClave(
        `¿Eliminar el álbum "${album?.NOMBRE || ''}"? También se quitarán sus productos de publicaciones.`
      );
      if (!ok) return;
      try {
        await api.albumes.remove(id);
        toast('Álbum eliminado', 'success');
        paintAlbumes(el);
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });
}

/* ───────────────── Productos del álbum ───────────────── */

function listHtml(items) {
  if (!items.length) {
    return `<div class="empty-state glass rounded-3xl">
      <i class="fa-solid fa-share-nodes text-3xl mb-3 text-brand-500"></i>
      <p>No hay productos en este álbum</p>
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

async function addByCodigo(idalbum, codprod, paint) {
  try {
    await api.publicaciones.create({ CODPROD: codprod, IDALBUM: idalbum });
    toast('Producto agregado al álbum', 'success');
    await paint();
  } catch (err) {
    toast(err.message, 'error');
  }
}

function openBuscarProductoModal(idalbum, paint) {
  openModal(`
    <div class="flex items-start justify-between gap-3 mb-4">
      <div class="min-w-0">
        <h2 class="font-display text-xl font-bold text-brand-900">Agregar al álbum</h2>
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
        await addByCodigo(idalbum, cod, paint);
      });
    });
  }

  input?.focus();
  input?.addEventListener('input', () => renderResults(input.value));
}

async function paintAlbumDetalle(el, albumId) {
  el.innerHTML = shell(`
    <div class="mb-4">
      <button type="button" id="btn-back-albums" class="btn btn-ghost mb-2 px-2 py-1 text-sm">
        <i class="fa-solid fa-arrow-left"></i> Álbumes
      </button>
      <h1 class="font-display text-2xl font-bold text-brand-900">Cargando...</h1>
    </div>
    <div class="glass rounded-3xl p-8 text-center text-slate-500">
      <span class="spinner inline-block" style="border-color:rgba(15,118,110,.25);border-top-color:#0f766e"></span>
    </div>
  `, { title: 'Publicaciones', fab: true, fabCamera: true, active: 'publicaciones' });
  document.getElementById('btn-back-albums')?.addEventListener('click', () => navigate('/publicaciones'));
  bindShell(null);

  let album;
  let items = [];
  try {
    [album, items] = await Promise.all([
      api.albumes.get(albumId),
      api.publicaciones.list(albumId),
    ]);
  } catch (err) {
    toast(err.message, 'error');
    el.innerHTML = shell(`
      <div class="mb-4">
        <button type="button" id="btn-back-albums" class="btn btn-ghost mb-2 px-2 py-1 text-sm">
          <i class="fa-solid fa-arrow-left"></i> Álbumes
        </button>
        <h1 class="font-display text-2xl font-bold text-brand-900">Publicaciones</h1>
      </div>
      <div class="empty-state glass rounded-3xl">
        <p class="text-red-600">${esc(err.message)}</p>
        <button id="btn-retry-pub" class="btn btn-primary mt-4">Reintentar</button>
      </div>
    `, { title: 'Publicaciones', fab: false, active: 'publicaciones' });
    document.getElementById('btn-back-albums')?.addEventListener('click', () => navigate('/publicaciones'));
    document.getElementById('btn-retry-pub')?.addEventListener('click', () => paintAlbumDetalle(el, albumId));
    bindShell(null);
    return;
  }

  const repaint = () => paintAlbumDetalle(el, albumId);

  el.innerHTML = shell(`
    <div class="mb-4">
      <button type="button" id="btn-back-albums" class="btn btn-ghost mb-2 px-2 py-1 text-sm">
        <i class="fa-solid fa-arrow-left"></i> Álbumes
      </button>
      <h1 class="font-display text-2xl font-bold text-brand-900">${esc(album.NOMBRE)}</h1>
      <p class="text-sm text-slate-500">${items.length} producto(s) listos para redes</p>
    </div>
    <div class="space-y-2" id="pub-list">${listHtml(items)}</div>
  `, { title: 'Publicaciones', fab: true, fabCamera: true, active: 'publicaciones' });

  document.getElementById('btn-back-albums')?.addEventListener('click', () => navigate('/publicaciones'));

  bindShell(
    () => openBuscarProductoModal(albumId, repaint),
    null,
    null,
    () => {
      openBarcodeScanner(async (code) => {
        await addByCodigo(albumId, code, repaint);
      });
    }
  );

  el.querySelectorAll('[data-id]').forEach((row) => {
    const id = row.dataset.id;
    row.querySelector('.btn-pub-del')?.addEventListener('click', async () => {
      const ok = await confirmDeleteWithClave('¿Quitar este producto del álbum?');
      if (!ok) return;
      try {
        await api.publicaciones.remove(id);
        toast('Eliminado del álbum', 'success');
        repaint();
      } catch (err) {
        toast(err.message, 'error');
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

export async function renderPublicaciones(el, params = {}) {
  const albumId = Number(params.album);
  if (Number.isFinite(albumId) && albumId > 0) {
    await paintAlbumDetalle(el, albumId);
  } else {
    await paintAlbumes(el);
  }
}
