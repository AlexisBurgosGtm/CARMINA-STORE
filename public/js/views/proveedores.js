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
        <h2 class="font-display text-xl font-bold text-brand-900">${isEdit ? 'Editar proveedor' : 'Nuevo proveedor'}</h2>
        <p class="text-sm text-slate-500">Registro de proveedores</p>
      </div>
      <button id="modal-close" class="btn btn-ghost btn-icon"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <form id="prov-form" class="space-y-3" autocomplete="off">
      ${isEdit ? `
      <div>
        <label class="label">Código</label>
        <input class="input-field" readonly autocomplete="off" value="${esc(item.CODPROV)}" />
      </div>` : `
      <p class="text-xs text-slate-500 rounded-xl bg-white/40 px-3 py-2">
        El código se asignará automáticamente.
      </p>`}
      <div>
        <label class="label">Nombre</label>
        <input name="NOMPROV" class="input-field" required maxlength="150" autocomplete="off" value="${esc(item?.NOMPROV || '')}" autofocus />
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

  document.getElementById('prov-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const NOMPROV = form.NOMPROV.value.trim();
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      if (item) {
        await api.proveedores.update(item.CODPROV, { NOMPROV });
        toast('Proveedor actualizado', 'success');
      } else {
        const created = await api.proveedores.create({ NOMPROV });
        toast(`Proveedor creado (código ${created.CODPROV})`, 'success');
      }
      closeModal();
      document.dispatchEvent(new CustomEvent('reload-proveedores'));
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
    }
  });
}

let _reloadProveedores = null;
function handleReloadProveedores() {
  _reloadProveedores?.();
}

export async function renderProveedores(el) {
  async function paint() {
    let items = [];
    try {
      items = await api.proveedores.list();
    } catch (err) {
      toast(err.message, 'error');
    }

    const list = items.length
      ? items.map((p) => `
        <article class="data-row p-4 flex items-center gap-3" data-cod="${esc(p.CODPROV)}">
          <div class="w-11 h-11 rounded-2xl bg-brand-100 text-brand-700 flex items-center justify-center shrink-0">
            <i class="fa-solid fa-truck"></i>
          </div>
          <div class="min-w-0 flex-1">
            <p class="font-semibold text-slate-800 truncate">${esc(p.NOMPROV)}</p>
            <p class="text-xs text-slate-500">${esc(p.CODPROV)}</p>
          </div>
          <button class="btn btn-ghost btn-icon btn-edit" title="Editar"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-danger btn-icon btn-del" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
        </article>
      `).join('')
      : `<div class="empty-state glass rounded-3xl"><i class="fa-solid fa-truck-field text-3xl mb-3 text-brand-500"></i><p>No hay proveedores</p></div>`;

    el.innerHTML = shell(`
      <div class="mb-4">
        <h1 class="font-display text-2xl font-bold text-brand-900">Proveedores</h1>
        <p class="text-sm text-slate-500">${items.length} registro(s)</p>
      </div>
      <div class="space-y-2">${list}</div>
    `, { title: 'Proveedores', fab: true, active: 'proveedores' });

    bindShell(() => openEditor());

    el.querySelectorAll('.data-row').forEach((row) => {
      const cod = row.dataset.cod;
      const item = items.find((p) => p.CODPROV === cod);

      row.querySelector('.btn-edit')?.addEventListener('click', () => openEditor(item));
      row.querySelector('.btn-del')?.addEventListener('click', async () => {
        const ok = await confirmDeleteWithClave(`¿Eliminar el proveedor ${cod}?`);
        if (!ok) return;
        try {
          await api.proveedores.remove(cod);
          toast('Proveedor eliminado', 'success');
          paint();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
  }

  _reloadProveedores = paint;
  document.removeEventListener('reload-proveedores', handleReloadProveedores);
  document.addEventListener('reload-proveedores', handleReloadProveedores);
  await paint();
}
