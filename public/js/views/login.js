import { api, setSession, toast } from '../api.js';
import { navigate } from '../router.js';

export async function renderLogin(el) {
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

        <form id="login-form" class="glass-strong rounded-3xl p-6 sm:p-8 space-y-4" autocomplete="off">
          <div>
            <label class="label" for="user">Usuario</label>
            <input id="user" name="user" class="input-field" autocomplete="off" required placeholder="Usuario" />
          </div>
          <div>
            <label class="label" for="pass">Contraseña</label>
            <input id="pass" name="pass" type="password" class="input-field" autocomplete="new-password" required placeholder="••••••••" />
          </div>
          <button type="submit" id="login-btn" class="btn btn-primary w-full py-3 text-base rounded-2xl">
            <i class="fa-solid fa-right-to-bracket"></i> Entrar
          </button>
        </form>
      </div>
    </div>
  `;

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('login-btn');
    const user = document.getElementById('user').value.trim();
    const pass = document.getElementById('pass').value;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> Entrando...`;
    try {
      const data = await api.login(user, pass);
      setSession(data.token, data.user);
      toast(`Bienvenido, ${data.user.USER}`, 'success');
      navigate('/catalogo');
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-right-to-bracket"></i> Entrar`;
    }
  });
}
