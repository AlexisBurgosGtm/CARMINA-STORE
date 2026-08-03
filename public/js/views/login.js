import { api, setSession, toast } from '../api.js';
import { navigate } from '../router.js';
import { startAuthentication, startRegistration, webauthnSupported } from '../webauthn-client.js';

function decoyAutofillTrap() {
  return `
    <div class="autofill-trap" aria-hidden="true">
      <input type="text" tabindex="-1" autocomplete="username" />
      <input type="password" tabindex="-1" autocomplete="current-password" />
    </div>`;
}

async function maybeRegisterWebauthn(alreadyRegistered = false) {
  if (!webauthnSupported()) return;

  const ask = await window.Swal?.fire({
    icon: 'question',
    title: alreadyRegistered ? '¿Actualizar biometría?' : '¿Activar biometría?',
    text: alreadyRegistered
      ? 'Si el acceso biométrico no funciona, actualízalo para entrar solo con tu dispositivo (sin usuario ni contraseña).'
      : 'La próxima vez podrás entrar solo con huella, Face ID o el desbloqueo de este dispositivo, sin escribir usuario ni contraseña.',
    showCancelButton: true,
    confirmButtonText: alreadyRegistered ? 'Actualizar' : 'Activar',
    cancelButtonText: alreadyRegistered ? 'No, gracias' : 'Ahora no',
    confirmButtonColor: '#0f766e',
    cancelButtonColor: '#94a3b8',
  });

  if (!ask?.isConfirmed) return;

  try {
    const options = await api.webauthn.registerOptions();
    const credential = await startRegistration(options);
    await api.webauthn.registerVerify(credential);
    toast('Biometría lista. Ya puedes entrar solo con tu dispositivo.', 'success');
  } catch (err) {
    if (err?.name === 'NotAllowedError') {
      toast('Registro biométrico cancelado', 'info');
      return;
    }
    toast(err.message || 'No se pudo activar la biometría', 'error');
  }
}

export async function renderLogin(el) {
  const canBio = webauthnSupported();

  el.innerHTML = `
    <div class="login-hero">
      <div class="w-full max-w-md">
        <div class="text-center mb-8">
          <img class="login-logo" src="/api/settings/logo" alt="Carmina Store"
            onerror="this.onerror=null;this.src='/logo.png'" />
          <h1 class="font-display text-4xl font-extrabold text-brand-900 tracking-tight">Carmina Store</h1>
          <p class="text-slate-500 mt-2">Ingresa para administrar tu catálogo</p>
        </div>

        <form id="login-form" class="glass-strong rounded-3xl p-6 sm:p-8 space-y-4" autocomplete="off" data-lpignore="true" data-1p-ignore="true">
          ${decoyAutofillTrap()}
          ${canBio ? `
          <button type="button" id="login-bio-btn" class="btn btn-primary w-full py-3 text-base rounded-2xl">
            <i class="fa-solid fa-fingerprint"></i> Entrar con biometría
          </button>
          <p class="text-xs text-center text-slate-500">Sin usuario ni contraseña. Solo tu huella, Face ID o PIN del dispositivo.</p>
          <div class="flex items-center gap-3 py-1">
            <div class="h-px flex-1 bg-slate-200"></div>
            <span class="text-[11px] uppercase tracking-wide text-slate-400">o con cuenta</span>
            <div class="h-px flex-1 bg-slate-200"></div>
          </div>
          ` : ''}
          <div>
            <label class="label" for="user">Usuario</label>
            <input id="user" name="store_user" class="input-field" type="text"
              autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false"
              required placeholder="Usuario" data-lpignore="true" data-1p-ignore="true" />
          </div>
          <div>
            <label class="label" for="pass">Contraseña</label>
            <input id="pass" name="store_secret" class="input-field input-secret" type="text"
              autocomplete="off" required placeholder="••••••••"
              data-lpignore="true" data-1p-ignore="true" />
          </div>
          <button type="submit" id="login-btn" class="btn ${canBio ? 'btn-ghost' : 'btn-primary'} w-full py-3 text-base rounded-2xl">
            <i class="fa-solid fa-right-to-bracket"></i> Entrar
          </button>
          ${!canBio ? `
          <p class="text-xs text-center text-slate-500">Este dispositivo no soporta inicio biométrico WebAuthn.</p>
          ` : ''}
        </form>
      </div>
    </div>
  `;

  const userInput = document.getElementById('user');
  const passInput = document.getElementById('pass');

  // Evita que el navegador ofrezca guardar contraseña
  passInput?.setAttribute('readonly', 'readonly');
  passInput?.addEventListener('focus', () => passInput.removeAttribute('readonly'), { once: true });

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('login-btn');
    const user = userInput.value.trim();
    const pass = passInput.value;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> Entrando...`;
    try {
      const data = await api.login(user, pass);
      setSession(data.token, data.user);
      toast(`Bienvenido, ${data.user.USER}`, 'success');
      if (webauthnSupported()) {
        const offerUpdate = sessionStorage.getItem('offer_bio_update') === '1';
        sessionStorage.removeItem('offer_bio_update');
        if (!data.webauthnRegistered || offerUpdate) {
          await maybeRegisterWebauthn(!!data.webauthnRegistered);
        }
      }
      navigate('/catalogo');
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-right-to-bracket"></i> Entrar`;
    }
  });

  document.getElementById('login-bio-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('login-bio-btn');
    const loginBtn = document.getElementById('login-btn');
    btn.disabled = true;
    if (loginBtn) loginBtn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> Esperando biometría...`;

    try {
      const options = await api.webauthn.loginOptions();
      const credential = await startAuthentication(options);
      const data = await api.webauthn.loginVerify(credential);
      setSession(data.token, data.user);
      toast(`Bienvenido, ${data.user.USER}`, 'success');
      navigate('/catalogo');
    } catch (err) {
      if (err?.name === 'NotAllowedError') {
        toast('Biometría cancelada', 'info');
      } else {
        sessionStorage.setItem('offer_bio_update', '1');
        toast(err.message || 'Biometría no disponible. Entra con tu cuenta y reactívala.', 'error');
      }
      btn.disabled = false;
      if (loginBtn) loginBtn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-fingerprint"></i> Entrar con biometría`;
    }
  });
}
