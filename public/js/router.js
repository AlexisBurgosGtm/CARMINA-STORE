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

export function shell(contentHtml, { title = '', fab = null, active = '' } = {}) {
  const user = getUser();
  const admin = isAdmin();

  return `
    <div class="min-h-screen pb-28">
      <header class="sticky top-0 z-30 px-4 pt-4 pb-2">
        <div class="glass-strong rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
          <div class="min-w-0">
            <p class="font-display text-xl font-bold text-brand-800 tracking-tight">Carmina Store</p>
            <p class="text-xs text-slate-500 truncate">${title}</p>
          </div>
          <div class="hidden sm:block text-right">
            <p class="text-sm font-semibold text-slate-700">${user?.USER || ''}</p>
            <p class="text-[10px] uppercase tracking-wide text-brand-700">${user?.TIPO || ''}</p>
          </div>
        </div>
      </header>

      <main class="px-4 pt-3 max-w-5xl mx-auto">
        ${contentHtml}
      </main>

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
          <a href="#/proveedores" class="menu-item ${active === 'proveedores' ? 'active' : ''}">
            <i class="fa-solid fa-truck-field"></i> Proveedores
          </a>
          ${admin ? `
          <a href="#/usuarios" class="menu-item ${active === 'usuarios' ? 'active' : ''}">
            <i class="fa-solid fa-users-gear"></i> Usuarios
          </a>` : ''}
          <a href="#/configuraciones" class="menu-item ${active === 'configuraciones' ? 'active' : ''}">
            <i class="fa-solid fa-sliders"></i> Configuraciones
          </a>
        </nav>
        <button id="btn-logout" class="btn btn-danger w-full mt-4">
          <i class="fa-solid fa-right-from-bracket"></i> Cerrar sesión
        </button>
      </aside>

      <div id="modal-root"></div>
    </div>
  `;
}

export function bindShell(onFab) {
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
    clearSession();
    navigate('/login');
  });

  if (onFab) {
    document.getElementById('fab-new')?.addEventListener('click', onFab);
  }
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
 * 1) Solicita clave de verificaciones (oculta)
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
    text: 'Escribe la clave de verificaciones para continuar',
    input: 'password',
    inputPlaceholder: 'Clave',
    inputAttributes: {
      autocomplete: 'new-password',
      autocapitalize: 'off',
      autocorrect: 'off',
    },
    showCancelButton: true,
    confirmButtonText: 'Continuar',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#0f766e',
    cancelButtonColor: '#94a3b8',
    reverseButtons: false,
    inputValidator: (value) => {
      if (!value) return 'Debes escribir la clave';
      return null;
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
