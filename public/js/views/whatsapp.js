import { api, toast } from '../api.js';
import { shell, bindShell } from '../router.js';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stateLabel(state) {
  switch (state) {
    case 'connected':
      return 'Conectado';
    case 'qr':
      return 'Escanea el código QR';
    case 'connecting':
      return 'Conectando...';
    case 'disconnected':
      return 'Desconectado';
    default:
      return 'Sin iniciar';
  }
}

function stateBadgeClass(state) {
  if (state === 'connected') return 'wa-badge wa-badge-ok';
  if (state === 'qr') return 'wa-badge wa-badge-qr';
  if (state === 'connecting') return 'wa-badge wa-badge-wait';
  return 'wa-badge';
}

export async function renderWhatsapp(el) {
  let pollTimer = null;
  let busy = false;

  const stopPoll = () => {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  };

  const paint = async (status) => {
    const st = status || { state: 'idle' };
    const connected = st.state === 'connected';
    const showQr = st.state === 'qr' && st.qr;

    el.innerHTML = shell(`
      <div class="mb-4">
        <h1 class="font-display text-2xl font-bold text-brand-900">WhatsApp</h1>
        <p class="text-sm text-slate-500">Vincula un dispositivo con Baileys para publicar Estados</p>
      </div>

      <article class="glass rounded-3xl p-5 sm:p-6 space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-xs uppercase tracking-wide text-slate-400">Estado de sesión</p>
            <p class="font-display text-xl font-bold text-brand-900 mt-1">${esc(stateLabel(st.state))}</p>
          </div>
          <span class="${stateBadgeClass(st.state)}">${esc(st.state || 'idle')}</span>
        </div>

        ${connected && st.user ? `
          <div class="rounded-2xl bg-white/55 p-4">
            <p class="text-xs uppercase tracking-wide text-slate-400">Dispositivo vinculado</p>
            <p class="font-semibold text-slate-800 mt-1">${esc(st.user.name || 'WhatsApp')}</p>
            <p class="text-sm text-slate-600">+${esc(st.user.phone || '—')}</p>
            <p class="text-xs text-slate-400 mt-2">${Number(st.contacts) || 0} contacto(s) para Estados</p>
          </div>
        ` : ''}

        ${showQr ? `
          <div class="text-center space-y-3">
            <p class="text-sm text-slate-600">Abre WhatsApp en tu teléfono → Dispositivos vinculados → Vincular dispositivo</p>
            <img class="wa-qr mx-auto" src="${esc(st.qr)}" alt="Código QR de WhatsApp" />
          </div>
        ` : ''}

        ${st.state === 'connecting' ? `
          <div class="text-center py-6 text-slate-500">
            <span class="spinner inline-block" style="border-color:rgba(15,118,110,.25);border-top-color:#0f766e"></span>
            <p class="mt-3 text-sm">Iniciando sesión de Baileys...</p>
          </div>
        ` : ''}

        ${st.error ? `<p class="text-sm text-amber-700">${esc(st.error)}</p>` : ''}

        <div class="flex flex-wrap gap-2 pt-1">
          ${!connected ? `
            <button type="button" id="btn-wa-connect" class="btn btn-primary" ${busy ? 'disabled' : ''}>
              <i class="fa-brands fa-whatsapp"></i> Iniciar sesión
            </button>
          ` : `
            <button type="button" id="btn-wa-disconnect" class="btn btn-danger" ${busy ? 'disabled' : ''}>
              <i class="fa-solid fa-link-slash"></i> Cerrar sesión WhatsApp
            </button>
          `}
          <button type="button" id="btn-wa-refresh" class="btn btn-ghost" ${busy ? 'disabled' : ''}>
            <i class="fa-solid fa-arrows-rotate"></i> Actualizar
          </button>
        </div>
      </article>
    `, { title: 'WhatsApp', fab: false, active: 'whatsapp' });

    bindShell(null);

    document.getElementById('btn-wa-connect')?.addEventListener('click', async () => {
      if (busy) return;
      busy = true;
      try {
        await api.whatsapp.connect();
        toast('Escanea el código QR con WhatsApp', 'info');
        await refresh();
        startPoll();
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        busy = false;
      }
    });

    document.getElementById('btn-wa-disconnect')?.addEventListener('click', async () => {
      if (busy) return;
      const ask = await window.Swal?.fire({
        icon: 'warning',
        title: '¿Cerrar sesión de WhatsApp?',
        text: 'Deberás escanear el QR de nuevo para publicar Estados.',
        showCancelButton: true,
        confirmButtonText: 'Cerrar sesión',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#dc2626',
      });
      if (!ask?.isConfirmed) return;
      busy = true;
      try {
        stopPoll();
        await api.whatsapp.disconnect();
        toast('Sesión de WhatsApp cerrada', 'success');
        await refresh();
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        busy = false;
      }
    });

    document.getElementById('btn-wa-refresh')?.addEventListener('click', () => refresh());
  };

  const refresh = async () => {
    try {
      const status = await api.whatsapp.status();
      await paint(status);
      if (status.state === 'qr' || status.state === 'connecting') {
        startPoll();
      } else if (status.state === 'connected') {
        stopPoll();
      }
    } catch (err) {
      toast(err.message, 'error');
      await paint({ state: 'disconnected', error: err.message });
    }
  };

  const startPoll = () => {
    stopPoll();
    pollTimer = setInterval(async () => {
      try {
        const status = await api.whatsapp.status();
        await paint(status);
        if (status.state === 'connected' || status.state === 'disconnected' || status.state === 'idle') {
          if (status.state === 'connected') stopPoll();
        }
      } catch (_) {
        /* ignore poll errors */
      }
    }, 2500);
  };

  // Detener polling al salir de la vista
  const onHash = () => {
    if (!location.hash.includes('/whatsapp')) {
      stopPoll();
      window.removeEventListener('hashchange', onHash);
    }
  };
  window.addEventListener('hashchange', onHash);

  await refresh();
}
