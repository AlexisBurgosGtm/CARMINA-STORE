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

async function maybeRegisterWebauthn() {
  if (!webauthnSupported()) return;

  const ask = await window.Swal?.fire({
    icon: 'question',
    title: '¿Activar biometría?',
    text: 'Podrás iniciar sesión con huella, Face ID o el desbloqueo de este dispositivo.',
    showCancelButton: true,
    confirmButtonText: 'Activar',
    cancelButtonText: 'Ahora no',
    confirmButtonColor: '#0f766e',
    cancelButtonColor: '#94a3b8',
  });

  if (!ask?.isConfirmed) return;

  try {
    const options = await api.webauthn.registerOptions();
    const credential = await startRegistration(options);
    await api.webauthn.registerVerify(credential);
    toast('Biometría activada para este usuario', 'success');
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
          <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-600 to-sky-400 text-white text-2xl shadow-lg mb-4">
            <i class="fa-solid fa-store"></i>
          </div>
          <h1 class="font-display text-4xl font-extrabold text-brand-900 tracking-tight">Carmina Store</h1>
          <p class="text-slate-500 mt-2">Ingresa para administrar tu catálogo</p>
        </div>

        <form id="login-form" class="glass-strong rounded-3xl p-6 sm:p-8 space-y-4" autocomplete="off" data-lpignore="true" data-1p-ignore="true">
          ${decoyAutofillTrap()}
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
          <button type="submit" id="login-btn" class="btn btn-primary w-full py-3 text-base rounded-2xl">
            <i class="fa-solid fa-right-to-bracket"></i> Entrar
          </button>
          ${canBio ? `
          <button type="button" id="login-bio-btn" class="btn btn-ghost w-full py-3 text-base rounded-2xl">
            <i class="fa-solid fa-fingerprint"></i> Entrar con biometría
          </button>
          <p class="text-xs text-center text-slate-500">Usa huella, Face ID o PIN del dispositivo (después de activarlo una vez).</p>
          ` : `
          <p class="text-xs text-center text-slate-500">Este dispositivo no soporta inicio biométrico WebAuthn.</p>
          `}
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
      if (!data.webauthnRegistered && webauthnSupported()) {
        await maybeRegisterWebauthn();
      }
      navigate('/catalogo');
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-right-to-bracket"></i> Entrar`;
    }
  });

  document.getElementById('login-bio-btn')?.addEventListener('click', async () => {
    const user = userInput.value.trim();
    if (!user) {
      toast('Escribe tu usuario para usar biometría', 'info');
      userInput.focus();
      return;
    }

    const btn = document.getElementById('login-bio-btn');
    const loginBtn = document.getElementById('login-btn');
    btn.disabled = true;
    loginBtn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> Esperando biometría...`;

    try {
      const options = await api.webauthn.loginOptions(user);
      const credential = await startAuthentication(options);
      const data = await api.webauthn.loginVerify(user, credential);
      setSession(data.token, data.user);
      toast(`Bienvenido, ${data.user.USER}`, 'success');
      navigate('/catalogo');
    } catch (err) {
      if (err?.name === 'NotAllowedError') {
        toast('Biometría cancelada', 'info');
      } else {
        toast(err.message || 'No se pudo iniciar con biometría', 'error');
      }
      btn.disabled = false;
      loginBtn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-fingerprint"></i> Entrar con biometría`;
    }
  });
}
