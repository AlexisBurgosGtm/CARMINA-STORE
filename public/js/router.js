import { isAuthenticated, isAdmin, getUser, clearSession, api } from './api.js';

const routes = {};

export function register(path, handler) {
  routes[path] = handler;
}

export function navigate(path) {
  location.hash = path.startsWith('#') ? path : `#${path}`;
}

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, query = ''] = raw.split('?');
  const params = Object.fromEntries(new URLSearchParams(query));
  return { path: path.startsWith('/') ? path : `/${path}`, params };
}

export async function startRouter(mountEl) {
  let navigating = false;

  async function resolve() {
    if (navigating) return;
    navigating = true;

    const { path } = parseHash();
    const publicPaths = ['/login'];

    if (!isAuthenticated() && !publicPaths.includes(path)) {
      if (location.hash !== '#/login') {
        location.hash = '#/login';
      }
    }

    const current = parseHash();
    let routePath = current.path;
    let routeParams = current.params;

    if (!isAuthenticated() && !publicPaths.includes(routePath)) {
      routePath = '/login';
    }

    if (isAuthenticated() && routePath === '/login') {
      if (location.hash !== '#/catalogo') location.hash = '#/catalogo';
      routePath = '/catalogo';
    }

    if (routePath === '/usuarios' && !isAdmin()) {
      if (location.hash !== '#/catalogo') location.hash = '#/catalogo';
      routePath = '/catalogo';
    }

    if (routePath === '/configuraciones' && !isAdmin()) {
      if (location.hash !== '#/catalogo') location.hash = '#/catalogo';
      routePath = '/catalogo';
    }

    const handler = routes[routePath] || routes['/404'];
    if (!handler) {
      mountEl.innerHTML = `<div class="p-8 text-center">Ruta no encontrada</div>`;
      navigating = false;
      return;
    }

    try {
      const previous = mountEl.firstElementChild;
      if (previous) {
        previous.classList.remove('page-slide-in');
        previous.classList.add('page-slide-out');
        await new Promise((r) => setTimeout(r, 200));
      }

      await handler(mountEl, routeParams);

      const next = mountEl.firstElementChild;
      if (next) {
        next.classList.add('page-slide-in');
      }
    } catch (err) {
      console.error(err);
      mountEl.innerHTML = `
        <div class="min-h-screen grid place-items-center p-6 page-slide-in">
          <div class="glass-strong rounded-3xl p-8 text-center max-w-md">
            <p class="font-display text-xl font-bold text-red-700 mb-2">Error al cargar</p>
            <p class="text-slate-600 text-sm mb-4">${String(err.message || err)}</p>
            <a href="#/login" class="btn btn-primary">Ir al login</a>
          </div>
        </div>
      `;
    } finally {
      navigating = false;
    }
  }

  window.addEventListener('hashchange', () => {
    resolve();
  });

  if (!location.hash || location.hash === '#' || location.hash === '#/') {
    location.hash = isAuthenticated() ? '#/catalogo' : '#/login';
  }

  await resolve();
}

export function shell(contentHtml, { title = '', fab = null, fabSearch = false, fabCamera = false, active = '' } = {}) {
  const user = getUser();
  const admin = isAdmin();

  return `
    <div class="page-shell">
      <header class="sticky top-0 z-30 px-4 pt-4 pb-2 page-header-inner">
        <div class="glass-strong rounded-2xl px-4 py-3 flex items-center justify-between gap-3 max-w-full overflow-hidden">
          <div class="header-brand min-w-0 flex-1 overflow-hidden">
            <button id="btn-sync-factor" type="button" class="btn-sync-header" title="Actualizar tipo de cambio" aria-label="Actualizar tipo de cambio">
              <i class="fa-solid fa-arrows-rotate"></i>
            </button>
            <div class="min-w-0 overflow-hidden">
              <p class="font-display text-xl font-bold text-brand-800 tracking-tight truncate">Carmina Store</p>
              <p class="text-xs text-slate-500 truncate">${title}</p>
            </div>
          </div>
          <div class="header-user shrink-0">
            <div class="header-user-info text-right min-w-0">
              <p class="text-sm font-semibold text-slate-700 truncate">${user?.USER || ''}</p>
              <p class="text-[10px] uppercase tracking-wide text-brand-700 truncate">${user?.TIPO || ''}</p>
            </div>
            <button id="btn-logout-header" type="button" class="btn-logout-header" title="Cerrar sesión" aria-label="Cerrar sesión">
              <i class="fa-solid fa-power-off"></i>
            </button>
          </div>
        </div>
      </header>

      <main class="page-main pt-3">
        ${contentHtml}
      </main>

      ${fabSearch ? `<button id="fab-search" class="fab-search" type="button" title="Cotizar con IA" aria-label="Cotizar con IA"><i class="fa-solid fa-magnifying-glass"></i></button>` : ''}
      ${fabCamera ? `<button id="fab-camera" class="fab-camera" type="button" title="Escanear código" aria-label="Escanear código de barras"><i class="fa-solid fa-camera"></i></button>` : ''}
      ${fab ? `<button id="fab-new" class="fab" title="Nuevo" aria-label="Nuevo registro"><i class="fa-solid fa-plus"></i></button>` : ''}

      <button id="fab-menu" class="fab-menu" type="button" aria-label="Abrir menú">
        <i class="fa-solid fa-bars"></i> Menu
      </button>

      <div id="drawer-overlay" class="drawer-overlay"></div>
      <aside id="drawer" class="drawer glass-strong rounded-l-3xl p-5 flex flex-col">
        <div class="flex items-center justify-between mb-6">
          <div>
            <p class="font-display text-lg font-bold text-brand-800">Menú</p>
            <p class="text-xs text-slate-500">${user?.USER || ''}</p>
          </div>
          <button id="btn-close-menu" class="btn btn-ghost btn-icon" aria-label="Cerrar">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <nav class="flex flex-col gap-1 flex-1">
          <a href="#/catalogo" class="menu-item ${active === 'catalogo' ? 'active' : ''}">
            <i class="fa-solid fa-box-open"></i> Catálogo
          </a>
          <a href="#/publicaciones" class="menu-item ${active === 'publicaciones' ? 'active' : ''}">
            <i class="fa-solid fa-share-nodes"></i> Publicaciones
          </a>
          <a href="#/calcular-precio" class="menu-item ${active === 'calcular-precio' ? 'active' : ''}">
            <i class="fa-solid fa-calculator"></i> Calcular Precio
          </a>
          <a href="#/proveedores" class="menu-item ${active === 'proveedores' ? 'active' : ''}">
            <i class="fa-solid fa-truck-field"></i> Proveedores
          </a>
          ${admin ? `
          <a href="#/usuarios" class="menu-item ${active === 'usuarios' ? 'active' : ''}">
            <i class="fa-solid fa-users-gear"></i> Usuarios
          </a>
          <a href="#/configuraciones" class="menu-item ${active === 'configuraciones' ? 'active' : ''}">
            <i class="fa-solid fa-sliders"></i> Configuraciones
          </a>` : ''}
        </nav>
        <button id="btn-logout" class="btn btn-danger w-full mt-4">
          <i class="fa-solid fa-right-from-bracket"></i> Cerrar sesión
        </button>
      </aside>

      <div id="modal-root"></div>
    </div>
  `;
}

export function bindShell(onFab, onFabSearch, onFactorUpdated, onFabCamera) {
  const overlay = document.getElementById('drawer-overlay');
  const drawer = document.getElementById('drawer');
  const open = () => {
    overlay?.classList.add('open');
    drawer?.classList.add('open');
  };
  const close = () => {
    overlay?.classList.remove('open');
    drawer?.classList.remove('open');
  };

  document.getElementById('fab-menu')?.addEventListener('click', open);
  document.getElementById('btn-close-menu')?.addEventListener('click', close);
  overlay?.addEventListener('click', close);
  drawer?.querySelectorAll('a').forEach((a) => a.addEventListener('click', close));

  document.getElementById('btn-logout')?.addEventListener('click', () => {
    confirmLogout();
  });
  document.getElementById('btn-logout-header')?.addEventListener('click', () => {
    confirmLogout();
  });
  document.getElementById('btn-sync-factor')?.addEventListener('click', () => {
    openTipoCambioSync(onFactorUpdated);
  });

  if (onFab) {
    document.getElementById('fab-new')?.addEventListener('click', onFab);
  }

  if (onFabSearch) {
    document.getElementById('fab-search')?.addEventListener('click', onFabSearch);
  }

  if (onFabCamera) {
    document.getElementById('fab-camera')?.addEventListener('click', onFabCamera);
  }
}

async function confirmLogout() {
  if (window.Swal) {
    const result = await window.Swal.fire({
      icon: 'question',
      title: '¿Cerrar sesión?',
      text: 'Se cerrará tu sesión y volverás al login.',
      showCancelButton: true,
      confirmButtonText: 'Salir',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#94a3b8',
      reverseButtons: false,
    });
    if (!result.isConfirmed) return;
  } else if (!window.confirm('¿Cerrar sesión?')) {
    return;
  }
  clearSession();
  navigate('/login');
}

/** Consulta Gemini el tipo de cambio GTQ→MXN y ofrece actualizar FACTOR CAMBIO MONEDA */
export async function openTipoCambioSync(onUpdated) {
  openModal(`
    <div class="flex items-start justify-between gap-3 mb-4">
      <div class="min-w-0">
        <h2 class="font-display text-xl font-bold text-brand-900">Tipo de cambio</h2>
        <p class="text-sm text-slate-500">Consultando Google Finance (GTQ / MXN)...</p>
      </div>
      <button id="modal-close" class="btn btn-ghost btn-icon shrink-0"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div id="tipo-cambio-body" class="py-8 text-center text-slate-500">
      <div class="inline-flex items-center gap-2">
        <span class="spinner" style="border-color:rgba(15,118,110,.25);border-top-color:#0f766e"></span>
        Obteniendo factor desde Google Finance...
      </div>
    </div>
  `);

  const body = document.getElementById('tipo-cambio-body');
  try {
    const data = await api.settings.tipoCambioGemini();
    const factor = Number(data.factor);
    const actual = data.factor_actual;

    if (!body) return;
    body.innerHTML = `
      <div class="text-left space-y-3">
        <div class="rounded-2xl bg-white/55 p-4 text-center">
          <p class="text-xs uppercase tracking-wide text-slate-400">Factor sugerido</p>
          <p class="font-display text-4xl font-bold text-brand-700 mt-1">${factor}</p>
          <p class="text-sm text-slate-600 mt-2">${escHtml(data.descripcion || `1 GTQ ≈ ${factor} MXN`)}</p>
        </div>
        <p class="text-sm text-slate-600">
          Factor actual guardado:
          <strong>${actual != null && Number.isFinite(actual) ? actual : '—'}</strong>
        </p>
        ${data.fuente ? `<p class="text-xs text-slate-500">${escHtml(data.fuente)}</p>` : ''}
        <p class="text-sm text-slate-700">¿Deseas actualizar el factor de cambio en configuraciones?</p>
        <div class="flex gap-2 pt-1">
          <button type="button" id="btn-tc-cancel" class="btn btn-ghost flex-1">No</button>
          <button type="button" id="btn-tc-update" class="btn btn-primary flex-1">
            <i class="fa-solid fa-floppy-disk"></i> Sí, actualizar
          </button>
        </div>
      </div>
    `;

    document.getElementById('btn-tc-cancel')?.addEventListener('click', closeModal);
    document.getElementById('btn-tc-update')?.addEventListener('click', async () => {
      const btn = document.getElementById('btn-tc-update');
      if (btn) btn.disabled = true;
      try {
        const saved = await api.settings.updateFactorCambio(factor);
        toast(`Factor actualizado a ${saved.VALOR}`, 'success');
        closeModal();
        if (typeof onUpdated === 'function') onUpdated(Number(saved.VALOR));
      } catch (err) {
        toast(err.message, 'error');
        if (btn) btn.disabled = false;
      }
    });
  } catch (err) {
    if (body) body.innerHTML = `<p class="text-red-600">${escHtml(err.message)}</p>`;
    toast(err.message, 'error');
  }
}

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function openModal(html) {
  const root = document.getElementById('modal-root');
  if (!root) return;
  root.innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal-panel glass-strong p-5 sm:p-6">${html}</div>
    </div>
  `;
  document.getElementById('modal-close')?.addEventListener('click', closeModal);
}

export function closeModal() {
  const root = document.getElementById('modal-root');
  if (root) root.innerHTML = '';
}

/** Modal encima del actual (no cierra el de abajo) */
export function openStackedModal(html) {
  const stack = document.getElementById('modal-stack');
  if (!stack) return null;

  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop modal-stack-layer';
  wrap.innerHTML = `<div class="modal-panel glass-strong p-5 sm:p-6">${html}</div>`;
  stack.appendChild(wrap);

  const close = () => {
    wrap.remove();
  };

  return { el: wrap, close };
}

export function alertSuccess(title, text = '') {
  return window.Swal?.fire({
    icon: 'success',
    title,
    text,
    confirmButtonText: 'Aceptar',
    confirmButtonColor: '#0f766e',
    reverseButtons: false,
  });
}

export function alertConfirm(title, text = '') {
  return window.Swal?.fire({
    icon: 'question',
    title,
    text,
    showCancelButton: true,
    confirmButtonText: 'Confirmar',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#0f766e',
    cancelButtonColor: '#94a3b8',
    reverseButtons: false,
    focusCancel: false,
  });
}

/**
 * 1) Solicita clave de verificaciones (oculta, sin prompt de guardar)
 * 2) Valida en servidor
 * 3) Pide confirmación
 * @returns {Promise<boolean>}
 */
export async function confirmDeleteWithClave(mensajeConfirmacion) {
  if (!window.Swal) {
    return window.confirm(mensajeConfirmacion);
  }

  const { value: clave, isConfirmed: claveOk } = await window.Swal.fire({
    title: 'Clave de verificación',
    html: `
      <p class="swal-clave-hint">Escribe la clave de verificaciones para continuar</p>
      <div class="autofill-trap" aria-hidden="true">
        <input type="text" tabindex="-1" autocomplete="username" />
        <input type="password" tabindex="-1" autocomplete="current-password" />
      </div>
      <input id="swal-clave-input" class="swal2-input input-secret" type="text"
        autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"
        data-lpignore="true" data-1p-ignore="true" placeholder="Clave" />
    `,
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: 'Continuar',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#0f766e',
    cancelButtonColor: '#94a3b8',
    reverseButtons: false,
    didOpen: () => {
      const el = document.getElementById('swal-clave-input');
      if (!el) return;
      el.setAttribute('readonly', 'readonly');
      el.addEventListener('focus', () => el.removeAttribute('readonly'), { once: true });
      setTimeout(() => el.focus(), 50);
    },
    preConfirm: () => {
      const value = document.getElementById('swal-clave-input')?.value?.trim() || '';
      if (!value) {
        window.Swal.showValidationMessage('Debes escribir la clave');
        return false;
      }
      return value;
    },
  });

  if (!claveOk) return false;

  try {
    await api.settings.verificarClave(clave);
  } catch (err) {
    await window.Swal.fire({
      icon: 'error',
      title: 'Clave incorrecta',
      text: err.message || 'No autorizado',
      confirmButtonText: 'Aceptar',
      confirmButtonColor: '#0f766e',
    });
    return false;
  }

  const confirm = await alertConfirm('Confirmar eliminación', mensajeConfirmacion);
  return !!(confirm && confirm.isConfirmed);
}
