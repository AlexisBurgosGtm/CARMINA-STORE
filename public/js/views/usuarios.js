import { api, toast } from '../api.js';
import { shell, bindShell, openModal, closeModal, confirmDeleteWithClave } from '../router.js';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formHtml(item = null) {
  const isEdit = !!item;
  return `
    <div class="flex items-start justify-between gap-3 mb-4">
      <div>
        <h2 class="font-display text-xl font-bold text-brand-900">${isEdit ? 'Editar usuario' : 'Nuevo usuario'}</h2>
        <p class="text-sm text-slate-500">Acceso a la aplicación</p>
      </div>
      <button id="modal-close" class="btn btn-ghost btn-icon"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <form id="user-form" class="space-y-3" autocomplete="off">
      <div>
        <label class="label">Usuario</label>
        <input name="USER" class="input-field" required maxlength="50" autocomplete="off" ${isEdit ? 'readonly' : ''} value="${esc(item?.USER || '')}" />
      </div>
      <div>
        <label class="label">Contraseña${isEdit ? ' — dejar vacío para no cambiar' : ''}</label>
        <input name="PASS" type="password" class="input-field" autocomplete="new-password" ${isEdit ? '' : 'required'} maxlength="100" />
      </div>
      <div>
        <label class="label">Tipo</label>
        <select name="TIPO" class="input-field" required autocomplete="off">
          <option value="OPERADOR" ${item?.TIPO === 'OPERADOR' ? 'selected' : ''}>OPERADOR</option>
          <option value="ADMINISTRADOR" ${item?.TIPO === 'ADMINISTRADOR' ? 'selected' : ''}>ADMINISTRADOR</option>
        </select>
      </div>
      <div class="flex gap-2 pt-2">
        <button type="button" id="modal-close-2" class="btn btn-ghost flex-1">Cancelar</button>
        <button type="submit" class="btn btn-primary flex-1">${isEdit ? 'Guardar' : 'Crear'}</button>
      </div>
    </form>
  `;
}

function openEditor(item = null) {
  openModal(formHtml(item));
  document.getElementById('modal-close-2')?.addEventListener('click', closeModal);

  document.getElementById('user-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      if (item) {
        const body = { TIPO: form.TIPO.value };
        if (form.PASS.value) body.PASS = form.PASS.value;
        await api.usuarios.update(item.USER, body);
        toast('Usuario actualizado', 'success');
      } else {
        await api.usuarios.create({
          USER: form.USER.value.trim(),
          PASS: form.PASS.value,
          TIPO: form.TIPO.value,
        });
        toast('Usuario creado', 'success');
      }
      closeModal();
      document.dispatchEvent(new CustomEvent('reload-usuarios'));
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
    }
  });
}

let _reloadUsuarios = null;
function handleReloadUsuarios() {
  _reloadUsuarios?.();
}

export async function renderUsuarios(el) {
  async function paint() {
    let items = [];
    try {
      items = await api.usuarios.list();
    } catch (err) {
      toast(err.message, 'error');
    }

    const list = items.length
      ? items.map((u) => `
        <article class="data-row p-4 flex items-center gap-3" data-user="${esc(u.USER)}">
          <div class="w-11 h-11 rounded-2xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
            <i class="fa-solid fa-user"></i>
          </div>
          <div class="min-w-0 flex-1">
            <p class="font-semibold text-slate-800 truncate">${esc(u.USER)}</p>
            <span class="badge ${u.TIPO === 'ADMINISTRADOR' ? 'badge-admin' : 'badge-operador'}">${esc(u.TIPO)}</span>
          </div>
          <button class="btn btn-ghost btn-icon btn-edit" title="Editar"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-danger btn-icon btn-del" title="Eliminar" ${u.USER === 'ALEXIS' ? 'disabled' : ''}>
            <i class="fa-solid fa-trash"></i>
          </button>
        </article>
      `).join('')
      : `<div class="empty-state glass rounded-3xl"><i class="fa-solid fa-users text-3xl mb-3 text-brand-500"></i><p>No hay usuarios</p></div>`;

    el.innerHTML = shell(`
      <div class="mb-4">
        <h1 class="font-display text-2xl font-bold text-brand-900">Usuarios</h1>
        <p class="text-sm text-slate-500">${items.length} usuario(s)</p>
      </div>
      <div class="space-y-2">${list}</div>
    `, { title: 'Usuarios', fab: true, active: 'usuarios' });

    bindShell(() => openEditor());

    el.querySelectorAll('.data-row').forEach((row) => {
      const username = row.dataset.user;
      const item = items.find((u) => u.USER === username);

      row.querySelector('.btn-edit')?.addEventListener('click', () => openEditor(item));
      row.querySelector('.btn-del')?.addEventListener('click', async () => {
        const ok = await confirmDeleteWithClave(`¿Eliminar el usuario ${username}?`);
        if (!ok) return;
        try {
          await api.usuarios.remove(username);
          toast('Usuario eliminado', 'success');
          paint();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
  }

  _reloadUsuarios = paint;
  document.removeEventListener('reload-usuarios', handleReloadUsuarios);
  document.addEventListener('reload-usuarios', handleReloadUsuarios);
  await paint();
}
