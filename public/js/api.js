const TOKEN_KEY = 'shop_store_token';
const USER_KEY = 'shop_store_user';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
  } catch {
    return null;
  }
}

export function setSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function isAuthenticated() {
  return !!getToken();
}

export function isAdmin() {
  const u = getUser();
  return u && u.TIPO === 'ADMINISTRADOR';
}

export function isOperador() {
  const u = getUser();
  return u && u.TIPO === 'OPERADOR';
}

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const { timeoutMs = 20000, ...rest } = options;

  if (!(rest.body instanceof FormData) && rest.body && typeof rest.body === 'object') {
    headers['Content-Type'] = 'application/json';
    rest.body = JSON.stringify(rest.body);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(`/api${path}`, {
      ...rest,
      headers,
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Tiempo de espera agotado al contactar el servidor');
    }
    throw new Error('No se pudo conectar con el servidor');
  } finally {
    clearTimeout(timer);
  }

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : await res.blob();

  if (!res.ok) {
    if (res.status === 401) {
      const isAuthAttempt = path.includes('/auth/login') || path.includes('/auth/webauthn/login');
      if (!isAuthAttempt) {
        clearSession();
        location.hash = '#/login';
      }
    }
    const msg = data?.error || `Error ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

export const api = {
  login: (user, pass) => request('/auth/login', { method: 'POST', body: { user, pass } }),
  me: () => request('/auth/me'),
  webauthn: {
    status: (user) => request(`/auth/webauthn/status/${encodeURIComponent(user)}`),
    registerOptions: () => request('/auth/webauthn/register/options', { method: 'POST', body: {} }),
    registerVerify: (credential) =>
      request('/auth/webauthn/register/verify', { method: 'POST', body: credential }),
    loginOptions: () =>
      request('/auth/webauthn/login/options', { method: 'POST', body: {} }),
    loginVerify: (credential) =>
      request('/auth/webauthn/login/verify', { method: 'POST', body: { credential } }),
  },

  productos: {
    list: () => request('/productos'),
    get: (id) => request(`/productos/${encodeURIComponent(id)}`),
    create: (formData) =>
      request('/productos', { method: 'POST', body: formData, timeoutMs: 10 * 60 * 1000 }),
    update: (id, formData) =>
      request(`/productos/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: formData,
        timeoutMs: 10 * 60 * 1000,
      }),
    remove: (id) => request(`/productos/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    cotizar: (id) =>
      request(`/productos/${encodeURIComponent(id)}/cotizar`, {
        method: 'POST',
        timeoutMs: 60000,
      }),
    cotizarTexto: (descripcion) =>
      request('/productos/cotizar', {
        method: 'POST',
        body: { descripcion },
        timeoutMs: 60000,
      }),
    fotoUrl: (id) => {
      const token = encodeURIComponent(getToken() || '');
      return `/api/productos/${encodeURIComponent(id)}/foto?token=${token}&t=${Date.now()}`;
    },
  },

  proveedores: {
    list: () => request('/proveedores'),
    create: (body) => request('/proveedores', { method: 'POST', body }),
    update: (id, body) => request(`/proveedores/${encodeURIComponent(id)}`, { method: 'PUT', body }),
    remove: (id) => request(`/proveedores/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  },

  publicaciones: {
    list: () => request('/publicaciones'),
    create: (body) => request('/publicaciones', { method: 'POST', body }),
    remove: (id) => request(`/publicaciones/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    publicar: (id) => request(`/publicaciones/${encodeURIComponent(id)}/publicar`, { method: 'POST', body: {} }),
  },

  usuarios: {
    list: () => request('/usuarios'),
    create: (body) => request('/usuarios', { method: 'POST', body }),
    update: (id, body) => request(`/usuarios/${encodeURIComponent(id)}`, { method: 'PUT', body }),
    remove: (id) => request(`/usuarios/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  },

  settings: {
    list: () => request('/settings'),
    get: (opcion) => request(`/settings/${encodeURIComponent(opcion)}`),
    update: (opcion, body) =>
      request(`/settings/${encodeURIComponent(opcion)}`, { method: 'PUT', body }),
    verificarClave: (clave) =>
      request('/settings/verificar-clave', { method: 'POST', body: { clave } }),
    geminiModels: () => request('/settings/gemini-models'),
    tipoCambioGemini: () =>
      request('/settings/tipo-cambio-gemini', { method: 'POST', body: {}, timeoutMs: 60000 }),
    updateFactorCambio: (factor) =>
      request('/settings/factor-cambio', { method: 'PUT', body: { VALOR: factor } }),
  },
};

export function toast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.3s';
    setTimeout(() => el.remove(), 300);
  }, 3200);
}

export function formatMoney(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(n) || 0);
}

export function formatDate(d) {
  if (!d) return '—';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return String(d);
  return date.toLocaleString('es-MX', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}
