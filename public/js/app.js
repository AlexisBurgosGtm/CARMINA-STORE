import { register, startRouter, navigate } from './router.js';
import { isAuthenticated } from './api.js';
import { renderLogin } from './views/login.js';
import { renderCatalogo } from './views/catalogo.js';
import { renderProveedores } from './views/proveedores.js';
import { renderUsuarios } from './views/usuarios.js';
import { renderConfiguraciones } from './views/configuraciones.js';
import { renderCalcularPrecio } from './views/calcular-precio.js';
import { renderPublicaciones } from './views/publicaciones.js';

register('/login', renderLogin);
register('/catalogo', renderCatalogo);
register('/publicaciones', renderPublicaciones);
register('/calcular-precio', renderCalcularPrecio);
register('/proveedores', renderProveedores);
register('/usuarios', renderUsuarios);
register('/configuraciones', renderConfiguraciones);
register('/', async () => {
  navigate(isAuthenticated() ? '/catalogo' : '/login');
});
register('/404', async (el) => {
  el.innerHTML = `
    <div class="min-h-screen grid place-items-center p-6">
      <div class="glass-strong rounded-3xl p-8 text-center">
        <p class="font-display text-2xl font-bold text-brand-900 mb-2">404</p>
        <p class="text-slate-500 mb-4">Página no encontrada</p>
        <a href="#/catalogo" class="btn btn-primary">Ir al catálogo</a>
      </div>
    </div>
  `;
});

const app = document.getElementById('app');

startRouter(app).catch((err) => {
  console.error(err);
  app.innerHTML = `
    <div class="min-h-screen grid place-items-center p-6">
      <div class="glass-strong rounded-3xl p-8 text-center max-w-md">
        <p class="font-display text-xl font-bold text-red-700 mb-2">Error de la aplicación</p>
        <p class="text-sm text-slate-600">${String(err && err.message ? err.message : err)}</p>
        <p class="text-xs text-slate-400 mt-3">Abre la consola del navegador (F12) para más detalles.</p>
      </div>
    </div>
  `;
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled:', e.reason);
});


// Banner de instalación PWA (sin precache)
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  showInstallBanner();
});

function showInstallBanner() {
  if (document.getElementById('install-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'install-banner';
  banner.className = 'install-banner show';
  banner.innerHTML = `
    <div class="glass-strong rounded-2xl p-3 flex items-center gap-3 shadow-lg">
      <div class="w-10 h-10 rounded-xl bg-brand-600 text-white flex items-center justify-center shrink-0">
        <i class="fa-solid fa-download"></i>
      </div>
      <div class="min-w-0 flex-1">
        <p class="text-sm font-semibold text-slate-800">Instalar Carmina Store</p>
        <p class="text-xs text-slate-500">Acceso rápido como app</p>
      </div>
      <button id="btn-install" class="btn btn-primary text-xs px-3 py-2">Instalar</button>
      <button id="btn-dismiss-install" class="btn btn-ghost btn-icon"><i class="fa-solid fa-xmark"></i></button>
    </div>
  `;
  document.body.appendChild(banner);

  document.getElementById('btn-dismiss-install')?.addEventListener('click', () => banner.remove());
  document.getElementById('btn-install')?.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    banner.remove();
  });
}
