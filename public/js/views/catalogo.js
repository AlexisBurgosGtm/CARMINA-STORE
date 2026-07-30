import { api, toast, formatMoney, formatDate } from '../api.js';
import {
  shell,
  bindShell,
  openModal,
  closeModal,
  openStackedModal,
  alertSuccess,
  confirmDeleteWithClave,
} from '../router.js';

const MAX_FOTO_MB = 25;
const MAX_FOTO_BYTES = MAX_FOTO_MB * 1024 * 1024;

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function loadProveedores() {
  return api.proveedores.list();
}

async function loadFactorCambio() {
  try {
    const s = await api.settings.get('FACTOR CAMBIO MONEDA');
    const n = Number(s.VALOR);
    return Number.isFinite(n) && n > 0 ? n : 2.2;
  } catch {
    return 2.2;
  }
}

function formatQ(n) {
  return `Q ${Number(n || 0).toLocaleString('es-GT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function calcUtilidad(costo, precio, factor) {
  const costoQtz = factor > 0 ? Number(costo || 0) / factor : 0;
  const utilidad = Number(precio || 0) - costoQtz;
  const pct = costoQtz > 0 ? (utilidad / costoQtz) * 100 : 0;
  return { costoQtz, utilidad, pct };
}

function productForm(proveedores, product = null, factor = 2.2) {
  const isEdit = !!product;
  return `
    <div class="flex items-start justify-between gap-3 mb-4">
      <div class="min-w-0">
        <h2 class="font-display text-xl font-bold text-brand-900">${isEdit ? 'Editar producto' : 'Nuevo producto'}</h2>
        <p class="text-sm text-slate-500">Datos del catálogo</p>
      </div>
      <button id="modal-close" class="btn btn-ghost btn-icon shrink-0"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <form id="product-form" class="space-y-3" autocomplete="off" data-factor="${esc(factor)}">
      <div>
        <label class="label">Código</label>
        <div class="code-with-scan">
          <input id="input-codprod" name="CODPROD" class="input-field" required maxlength="30"
            autocomplete="off" ${isEdit ? 'readonly' : ''} value="${esc(product?.CODPROD || '')}" />
          ${!isEdit ? `
          <button type="button" id="btn-scan-barcode" class="btn-scan" title="Escanear código de barras" aria-label="Escanear código de barras">
            <i class="fa-solid fa-camera"></i>
          </button>` : ''}
        </div>
      </div>
      <div>
        <label class="label">Descripción</label>
        <input name="DESPROD" class="input-field" required maxlength="255" autocomplete="off" value="${esc(product?.DESPROD || '')}" />
      </div>
      <div>
        <label class="label">Proveedor</label>
        <select name="CODPROV" class="input-field" required autocomplete="off">
          <option value="">Seleccionar...</option>
          ${proveedores.map((p) => `
            <option value="${esc(p.CODPROV)}" ${product?.CODPROV === p.CODPROV ? 'selected' : ''}>
              ${esc(p.NOMPROV)}
            </option>`).join('')}
        </select>
      </div>
      <div class="money-row">
        <div class="costo-block">
          <label class="label">Costo</label>
          <div class="costo-line">
            <div class="money-input">
              <span class="money-prefix" title="Pesos">$</span>
              <input id="input-costo" name="COSTO" type="number" step="0.01" min="0" class="input-field" required autocomplete="off" value="${esc(product?.COSTO ?? '')}" />
            </div>
            <span id="costo-qtz" class="costo-qtz" title="Costo ÷ factor">Q 0.00</span>
          </div>
        </div>
        <div>
          <label class="label">Precio</label>
          <div class="money-input">
            <span class="money-prefix" title="Quetzales">Q</span>
            <input id="input-precio" name="PRECIO" type="number" step="0.01" min="0" class="input-field" required autocomplete="off" value="${esc(product?.PRECIO ?? '')}" />
          </div>
          <div id="utilidad-info" class="utilidad-line">
            <span>Utilidad: <strong id="utilidad-monto">Q 0.00</strong></span>
            <span id="utilidad-pct" class="utilidad-pct">0%</span>
          </div>
        </div>
      </div>
      <div>
        <label class="label">Foto</label>
        <div class="code-with-scan">
          <input id="input-foto" name="foto" type="file" accept="image/*" class="input-field" autocomplete="off" />
          <button type="button" id="btn-take-photo" class="btn-scan" title="Tomar foto con la cámara" aria-label="Tomar foto con la cámara">
            <i class="fa-solid fa-camera"></i>
          </button>
        </div>
        <p id="foto-capture-name" class="text-xs text-brand-700 mt-1 hidden"></p>
        <p class="text-xs text-slate-500 mt-1">Máx. ${MAX_FOTO_MB} MB. Se guarda en WebDAV con el nombre del código.</p>
        ${product?.FOTO ? `<p class="text-xs text-slate-500 mt-1">Actual: ${esc(product.FOTO)}</p>` : ''}
      </div>
      <div class="flex gap-2 pt-2">
        <button type="button" id="modal-close-2" class="btn btn-ghost flex-1">Cancelar</button>
        <button type="submit" class="btn btn-primary flex-1">${isEdit ? 'Guardar' : 'Crear'}</button>
      </div>
    </form>
  `;
}

function bindUtilidadCalc(factor) {
  const costoInput = document.getElementById('input-costo');
  const precioInput = document.getElementById('input-precio');
  const montoEl = document.getElementById('utilidad-monto');
  const pctEl = document.getElementById('utilidad-pct');
  const costoQtzEl = document.getElementById('costo-qtz');
  if (!costoInput || !precioInput || !montoEl || !pctEl) return;

  const recalc = () => {
    const { costoQtz, utilidad, pct } = calcUtilidad(costoInput.value, precioInput.value, factor);

    if (costoQtzEl) costoQtzEl.textContent = formatQ(costoQtz);
    montoEl.textContent = formatQ(utilidad);
    montoEl.style.color = utilidad < 0 ? '#dc2626' : '#134e4a';
    pctEl.textContent = `${pct.toLocaleString('es-GT', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })}%`;
  };

  costoInput.addEventListener('input', recalc);
  precioInput.addEventListener('input', recalc);
  recalc();
}

async function openBarcodeScanner(onCode) {
  if (!window.Html5Qrcode) {
    toast('Escáner no disponible. Recarga la página.', 'error');
    return;
  }

  const stacked = openStackedModal(`
    <div class="flex items-start justify-between gap-3 mb-4">
      <div>
        <h2 class="font-display text-xl font-bold text-brand-900">Escanear código</h2>
        <p class="text-sm text-slate-500">Apunta la cámara al código de barras</p>
      </div>
      <button id="modal-stack-close" class="btn btn-ghost btn-icon" type="button">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>
    <div id="barcode-reader"></div>
    <button type="button" id="modal-stack-cancel" class="btn btn-ghost w-full mt-4">Cancelar</button>
  `);

  if (!stacked) return;

  const scanner = new window.Html5Qrcode('barcode-reader');
  let handled = false;
  let running = false;

  const stop = async () => {
    try {
      if (running) {
        await scanner.stop();
        running = false;
      }
      scanner.clear();
    } catch (_) {
      /* ignore */
    }
  };

  const closeAndStop = async () => {
    await stop();
    stacked.close();
  };

  stacked.el.querySelector('#modal-stack-close')?.addEventListener('click', closeAndStop);
  stacked.el.querySelector('#modal-stack-cancel')?.addEventListener('click', closeAndStop);

  const F = window.Html5QrcodeSupportedFormats;
  const config = {
    fps: 10,
    qrbox: { width: 280, height: 140 },
    aspectRatio: 1.777,
  };
  if (F) {
    config.formatsToSupport = [
      F.EAN_13,
      F.EAN_8,
      F.UPC_A,
      F.UPC_E,
      F.CODE_128,
      F.CODE_39,
      F.CODE_93,
      F.ITF,
      F.CODABAR,
      F.QR_CODE,
    ];
  }

  try {
    await scanner.start(
      { facingMode: 'environment' },
      config,
      async (decodedText) => {
        if (handled) return;
        handled = true;
        await stop();
        stacked.close();
        onCode(String(decodedText).trim());
        await alertSuccess('Código leído', `Se asignó el código: ${decodedText}`);
      },
      () => {
        /* frame sin código */
      }
    );
    running = true;
  } catch (err) {
    stacked.close();
    toast(err?.message || 'No se pudo abrir la cámara. Revisa los permisos del navegador.', 'error');
  }
}

function setFotoFileInput(file) {
  const input = document.getElementById('input-foto');
  if (!input || !file) return;
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));

  const hint = document.getElementById('foto-capture-name');
  if (hint) {
    hint.textContent = `Foto lista: ${file.name}`;
    hint.classList.remove('hidden');
  }
}

async function openCameraCapture() {
  if (!navigator.mediaDevices?.getUserMedia) {
    toast('La cámara no está disponible en este dispositivo', 'error');
    return;
  }

  const stacked = openStackedModal(`
    <div class="flex items-start justify-between gap-3 mb-4">
      <div>
        <h2 class="font-display text-xl font-bold text-brand-900">Tomar foto</h2>
        <p class="text-sm text-slate-500">Enfoca el producto y captura la imagen</p>
      </div>
      <button id="modal-stack-close" class="btn btn-ghost btn-icon" type="button">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>
    <div class="camera-capture-wrap">
      <video id="camera-preview" class="camera-preview" playsinline autoplay muted></video>
      <canvas id="camera-canvas" class="hidden"></canvas>
    </div>
    <div class="flex gap-2 mt-4">
      <button type="button" id="modal-stack-cancel" class="btn btn-ghost flex-1">Cancelar</button>
      <button type="button" id="btn-capture-shot" class="btn btn-primary flex-1">
        <i class="fa-solid fa-camera"></i> Capturar
      </button>
    </div>
  `);

  if (!stacked) return;

  const video = stacked.el.querySelector('#camera-preview');
  const canvas = stacked.el.querySelector('#camera-canvas');
  let stream = null;

  const stopStream = () => {
    stream?.getTracks?.().forEach((t) => t.stop());
    stream = null;
    if (video) video.srcObject = null;
  };

  const closeAndStop = () => {
    stopStream();
    stacked.close();
  };

  stacked.el.querySelector('#modal-stack-close')?.addEventListener('click', closeAndStop);
  stacked.el.querySelector('#modal-stack-cancel')?.addEventListener('click', closeAndStop);

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
    if (!video) {
      closeAndStop();
      return;
    }
    video.srcObject = stream;
    await video.play().catch(() => {});
  } catch (err) {
    closeAndStop();
    toast(err?.message || 'No se pudo abrir la cámara. Revisa los permisos del navegador.', 'error');
    return;
  }

  stacked.el.querySelector('#btn-capture-shot')?.addEventListener('click', async () => {
    if (!video || !canvas) return;
    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    if (!w || !h) {
      toast('Espera a que la cámara esté lista', 'info');
      return;
    }

    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, w, h);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) {
      toast('No se pudo capturar la imagen', 'error');
      return;
    }

    if (blob.size > MAX_FOTO_BYTES) {
      toast(`La foto no puede superar ${MAX_FOTO_MB} MB`, 'error');
      return;
    }

    const file = new File([blob], `foto-${Date.now()}.jpg`, { type: 'image/jpeg' });
    stopStream();
    stacked.close();
    setFotoFileInput(file);
    toast('Foto cargada en el producto', 'success');
  });
}

function showProductModal(product) {
  const fotoHtml = product.FOTO
    ? `<img class="avatar-photo mx-auto" src="${api.productos.fotoUrl(product.CODPROD)}" alt="${esc(product.DESPROD)}"
         onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'avatar-placeholder mx-auto',innerHTML:'<i class=\\'fa-solid fa-image\\'></i>'}))" />`
    : `<div class="avatar-placeholder mx-auto"><i class="fa-solid fa-image"></i></div>`;

  openModal(`
    <div class="flex justify-end mb-2">
      <button id="modal-close" class="btn btn-ghost btn-icon"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="text-center space-y-3">
      ${fotoHtml}
      <div>
        <p class="text-xs uppercase tracking-wider text-slate-400 font-semibold">Código</p>
        <p class="font-display text-lg font-bold text-brand-900">${esc(product.CODPROD)}</p>
      </div>
      <div>
        <p class="text-xs uppercase tracking-wider text-slate-400 font-semibold">Producto</p>
        <p class="text-base font-semibold text-slate-800">${esc(product.DESPROD)}</p>
      </div>
      <div>
        <p class="text-xs uppercase tracking-wider text-slate-400 font-semibold">Proveedor</p>
        <p class="text-sm text-slate-700">${esc(product.NOMPROV || product.CODPROV)}</p>
      </div>
      <div>
        <p class="text-xs uppercase tracking-wider text-slate-400 font-semibold">Costo</p>
        <p class="text-base font-semibold text-slate-700">$ ${Number(product.COSTO || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
      </div>
      <div>
        <p class="text-xs uppercase tracking-wider text-slate-400 font-semibold">Precio</p>
        <p class="font-display text-2xl font-bold text-brand-700">${formatQ(product.PRECIO)}</p>
      </div>
      <div class="flex flex-col sm:flex-row gap-2 pt-3">
        <button id="btn-cotizar" class="btn btn-primary flex-1">
          <i class="fa-solid fa-robot"></i> Cotizar con Gemini
        </button>
        <button id="btn-edit-from-modal" class="btn btn-ghost flex-1">
          <i class="fa-solid fa-pen"></i> Editar
        </button>
      </div>
    </div>
  `);

  document.getElementById('btn-cotizar')?.addEventListener('click', () => cotizar(product));
  document.getElementById('btn-edit-from-modal')?.addEventListener('click', async () => {
    closeModal();
    const proveedores = await loadProveedores();
    openProductEditor(proveedores, product);
  });
}

async function cotizar(product) {
  await showCotizacionModal(product.DESPROD, () => api.productos.cotizar(product.CODPROD));
}

async function showCotizacionModal(descripcion, fetchCotizacion) {
  openModal(`
    <div class="flex items-center justify-between mb-4">
      <div>
        <h2 class="font-display text-xl font-bold text-brand-900">Cotización Gemini</h2>
        <p class="text-sm text-slate-500">${esc(descripcion)}</p>
      </div>
      <button id="modal-close" class="btn btn-ghost btn-icon"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div id="cotizacion-body" class="py-10 text-center text-slate-500">
      <div class="inline-flex items-center gap-2">
        <span class="spinner" style="border-color:rgba(15,118,110,.25);border-top-color:#0f766e"></span>
        Consultando precios en tiendas de México...
      </div>
    </div>
  `);

  document.querySelector('.modal-panel')?.classList.add('modal-wide');

  try {
    const data = await fetchCotizacion();
    const body = document.getElementById('cotizacion-body');
    if (!body) return;

    const cotizaciones = [...(data.cotizaciones || [])].sort(
      (a, b) => Number(a?.precio || 0) - Number(b?.precio || 0)
    );

    const rows = cotizaciones.map((c) => `
      <tr>
        <td class="font-semibold">${esc(c.tienda)}</td>
        <td>${formatMoney(c.precio)}</td>
        <td><span class="badge badge-operador">${esc(c.disponibilidad || '—')}</span></td>
        <td class="text-slate-500 text-xs">${esc(c.notas || '')}</td>
      </tr>
    `).join('');

    body.innerHTML = `
      <div class="grid grid-cols-3 gap-2 mb-4 text-center">
        <div class="rounded-2xl bg-white/50 p-3">
          <p class="text-[10px] uppercase text-slate-400">Mínimo</p>
          <p class="font-bold text-brand-700">${formatMoney(data.precio_minimo)}</p>
        </div>
        <div class="rounded-2xl bg-white/50 p-3">
          <p class="text-[10px] uppercase text-slate-400">Promedio</p>
          <p class="font-bold text-brand-700">${formatMoney(data.precio_promedio)}</p>
        </div>
        <div class="rounded-2xl bg-white/50 p-3">
          <p class="text-[10px] uppercase text-slate-400">Máximo</p>
          <p class="font-bold text-brand-700">${formatMoney(data.precio_maximo)}</p>
        </div>
      </div>
      <div class="overflow-x-auto">
        <table class="cotizacion-table">
          <thead>
            <tr>
              <th>Tienda</th>
              <th>Precio</th>
              <th>Disp.</th>
              <th>Notas</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${data.resumen ? `<p class="mt-4 text-sm text-slate-600 glass rounded-2xl p-3">${esc(data.resumen)}</p>` : ''}
    `;
  } catch (err) {
    const body = document.getElementById('cotizacion-body');
    if (body) body.innerHTML = `<p class="text-red-600">${esc(err.message)}</p>`;
    toast(err.message, 'error');
  }
}

function openCotizarTextoModal() {
  openModal(`
    <div class="flex items-start justify-between gap-3 mb-4">
      <div class="min-w-0">
        <h2 class="font-display text-xl font-bold text-brand-900">Cotizar con IA</h2>
        <p class="text-sm text-slate-500">Escribe el producto a cotizar (sin crearlo en el catálogo)</p>
      </div>
      <button id="modal-close" class="btn btn-ghost btn-icon shrink-0"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <form id="cotizar-texto-form" class="space-y-3" autocomplete="off">
      <div>
        <label class="label" for="cotizar-descripcion">Producto</label>
        <input id="cotizar-descripcion" name="descripcion" class="input-field" required maxlength="255"
          autocomplete="off" placeholder="Ej. Audífonos Bluetooth Sony WH-1000XM5" />
      </div>
      <div class="flex gap-2 pt-2">
        <button type="button" id="modal-close-2" class="btn btn-ghost flex-1">Cancelar</button>
        <button type="submit" class="btn btn-primary flex-1">
          <i class="fa-solid fa-robot"></i> Cotizar con IA
        </button>
      </div>
    </form>
  `);

  document.getElementById('modal-close-2')?.addEventListener('click', closeModal);
  document.getElementById('cotizar-descripcion')?.focus();

  document.getElementById('cotizar-texto-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const descripcion = document.getElementById('cotizar-descripcion')?.value.trim() || '';
    if (descripcion.length < 3) {
      toast('Escribe al menos 3 caracteres', 'error');
      return;
    }
    await showCotizacionModal(descripcion, () => api.productos.cotizarTexto(descripcion));
  });
}

function openProductEditor(proveedores, product = null) {
  loadFactorCambio().then((factor) => {
    openModal(productForm(proveedores, product, factor));
    document.getElementById('modal-close-2')?.addEventListener('click', closeModal);
    bindUtilidadCalc(factor);

    document.getElementById('btn-scan-barcode')?.addEventListener('click', () => {
      openBarcodeScanner((code) => {
        const input = document.getElementById('input-codprod');
        if (input) {
          input.value = code;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
    });

    document.getElementById('btn-take-photo')?.addEventListener('click', () => {
      openCameraCapture();
    });

    document.getElementById('input-foto')?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      const hint = document.getElementById('foto-capture-name');
      if (!hint) return;
      if (file) {
        hint.textContent = `Archivo: ${file.name}`;
        hint.classList.remove('hidden');
      } else {
        hint.classList.add('hidden');
        hint.textContent = '';
      }
    });

    const showUploadLoader = (visible, message = 'Subiendo foto...') => {
      const panel = document.querySelector('#modal-root .modal-panel');
      if (!panel) return;
      let loader = panel.querySelector('#upload-loader');
      if (visible) {
        if (!loader) {
          loader = document.createElement('div');
          loader.id = 'upload-loader';
          loader.className = 'upload-loader';
          loader.innerHTML = `
            <span class="spinner"></span>
            <p id="upload-loader-msg">${message}</p>
          `;
          panel.appendChild(loader);
        } else {
          const msg = loader.querySelector('#upload-loader-msg');
          if (msg) msg.textContent = message;
          loader.style.display = 'flex';
        }
      } else if (loader) {
        loader.remove();
      }
    };

    document.getElementById('product-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const codprod = form.CODPROD.value.trim();
      if (!codprod) {
        toast('El código es requerido', 'error');
        return;
      }

      const file = form.foto.files[0];
      if (file && file.size > MAX_FOTO_BYTES) {
        toast(`La foto no puede superar ${MAX_FOTO_MB} MB`, 'error');
        return;
      }

      const fd = new FormData();
      fd.append('CODPROD', codprod);
      fd.append('DESPROD', form.DESPROD.value.trim());
      fd.append('CODPROV', form.CODPROV.value);
      fd.append('COSTO', form.COSTO.value);
      fd.append('PRECIO', form.PRECIO.value);
      if (file) fd.append('foto', file);

      const btn = form.querySelector('[type=submit]');
      btn.disabled = true;
      showUploadLoader(true, file ? 'Subiendo foto a WebDAV...' : 'Guardando producto...');

      try {
        if (product) {
          await api.productos.update(product.CODPROD, fd);
          toast('Producto actualizado', 'success');
        } else {
          await api.productos.create(fd);
          toast('Producto creado', 'success');
        }
        showUploadLoader(false);
        closeModal();
        document.dispatchEvent(new CustomEvent('reload-catalogo'));
      } catch (err) {
        showUploadLoader(false);
        btn.disabled = false;
        if (/ya existe|mismo código|código de producto ya existe/i.test(err.message)) {
          await window.Swal?.fire({
            icon: 'warning',
            title: 'Código duplicado',
            text: err.message,
            confirmButtonText: 'Aceptar',
            confirmButtonColor: '#0f766e',
          });
        } else {
          toast(err.message, 'error');
        }
      }
    });
  });
}

let _reloadCatalogo = null;
let _catalogFilters = { proveedor: '', q: '' };

function handleReloadCatalogo() {
  _reloadCatalogo?.();
}

function filterProductos(productos, { proveedor, q }) {
  const query = String(q || '').trim().toLowerCase();
  return productos.filter((p) => {
    if (proveedor && String(p.CODPROV) !== String(proveedor)) return false;
    if (!query) return true;
    const haystack = [
      p.CODPROD,
      p.DESPROD,
      p.NOMPROV,
      p.CODPROV,
    ].map((v) => String(v || '').toLowerCase()).join(' ');
    return haystack.includes(query);
  });
}

function productListHtml(productos, factor) {
  if (!productos.length) {
    return `<div class="empty-state glass rounded-3xl" id="catalog-empty">
      <i class="fa-solid fa-box-open text-3xl mb-3 text-brand-500"></i>
      <p>No hay productos que coincidan</p>
      <p class="text-sm mt-1">Prueba otro proveedor o texto de búsqueda</p>
    </div>`;
  }

  return productos.map((p) => {
    const { utilidad, pct } = calcUtilidad(p.COSTO, p.PRECIO, factor);
    const pctTxt = `${pct.toLocaleString('es-GT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
    return `
    <article class="data-row p-3 sm:p-4" data-cod="${esc(p.CODPROD)}">
      <div class="product-row">
        <div class="product-row-top">
          <button class="btn-view shrink-0" title="Ver foto">
            ${p.FOTO
              ? `<img class="thumb" src="${api.productos.fotoUrl(p.CODPROD)}" alt="" onerror="this.outerHTML='<div class=\\'thumb flex items-center justify-center text-brand-700\\'><i class=\\'fa-solid fa-box\\'></i></div>'" />`
              : `<div class="thumb flex items-center justify-center text-brand-700"><i class="fa-solid fa-box"></i></div>`}
          </button>
          <div class="product-row-info">
            <p class="font-semibold text-slate-800 break-words">${esc(p.DESPROD)}</p>
            <p class="text-xs text-slate-500 truncate">${esc(p.CODPROD)} · ${esc(p.NOMPROV || p.CODPROV)}</p>
            <div class="product-meta">
              <span class="text-sm font-bold text-brand-700">${formatQ(p.PRECIO)}</span>
              <span class="product-util">Utilidad: ${formatQ(utilidad)}</span>
              <span class="product-util-pct">${pctTxt}</span>
            </div>
            <p class="text-[10px] text-slate-400 mt-0.5">Act. ${formatDate(p.LASTUPDATE)}</p>
          </div>
        </div>
        <div class="product-row-actions">
          <button class="btn btn-ghost btn-icon btn-view" title="Ver"><i class="fa-solid fa-eye"></i></button>
          <button class="btn btn-ghost btn-icon btn-cotizar-row" title="Cotizar Gemini"><i class="fa-solid fa-robot"></i></button>
          <button class="btn btn-ghost btn-icon btn-edit" title="Editar"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-danger btn-icon btn-del" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
    </article>`;
  }).join('');
}

function bindProductRowActions(el, productos, paint) {
  el.querySelectorAll('.data-row').forEach((row) => {
    const cod = row.dataset.cod;
    const product = productos.find((p) => p.CODPROD === cod);
    if (!product) return;

    row.querySelectorAll('.btn-view').forEach((btn) => {
      btn.addEventListener('click', () => showProductModal(product));
    });

    row.querySelector('.btn-cotizar-row')?.addEventListener('click', () => cotizar(product));

    row.querySelector('.btn-edit')?.addEventListener('click', async () => {
      const proveedores = await loadProveedores();
      openProductEditor(proveedores, product);
    });

    row.querySelector('.btn-del')?.addEventListener('click', async () => {
      const ok = await confirmDeleteWithClave(
        `¿Eliminar el producto ${cod}? También se eliminará su foto en WebDAV.`
      );
      if (!ok) return;
      try {
        await api.productos.remove(cod);
        toast('Producto eliminado', 'success');
        paint();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });
}

export async function renderCatalogo(el) {
  async function paint() {
    el.innerHTML = shell(`
      <div class="mb-4">
        <h1 class="font-display text-2xl font-bold text-brand-900">Catálogo</h1>
        <p class="text-sm text-slate-500">Cargando productos...</p>
      </div>
      <div class="glass rounded-3xl p-8 text-center text-slate-500">
        <span class="spinner inline-block" style="border-color:rgba(15,118,110,.25);border-top-color:#0f766e"></span>
      </div>
    `, { title: 'Productos', fab: true, fabSearch: true, active: 'catalogo' });
    bindShell(() => {}, openCotizarTextoModal);

    let productos = [];
    let proveedores = [];
    let factor = 2.2;
    try {
      [productos, proveedores, factor] = await Promise.all([
        api.productos.list(),
        loadProveedores(),
        loadFactorCambio(),
      ]);
    } catch (err) {
      toast(err.message, 'error');
      el.innerHTML = shell(`
        <div class="mb-4">
          <h1 class="font-display text-2xl font-bold text-brand-900">Catálogo</h1>
        </div>
        <div class="empty-state glass rounded-3xl">
          <p class="text-red-600 font-semibold mb-2">No se pudo cargar el catálogo</p>
          <p class="text-sm">${esc(err.message)}</p>
          <button id="btn-retry-cat" class="btn btn-primary mt-4">Reintentar</button>
        </div>
      `, { title: 'Productos', fab: true, fabSearch: true, active: 'catalogo' });
      bindShell(async () => {
        try {
          const provs = await loadProveedores();
          if (!provs.length) {
            toast('Primero registra al menos un proveedor', 'info');
            return;
          }
          openProductEditor(provs);
        } catch (e) {
          toast(e.message, 'error');
        }
      }, openCotizarTextoModal);
      document.getElementById('btn-retry-cat')?.addEventListener('click', paint);
      return;
    }

    const openCreate = async () => {
      try {
        const provs = proveedores.length ? proveedores : await loadProveedores();
        if (!provs.length) {
          toast('Primero registra al menos un proveedor', 'info');
          return;
        }
        openProductEditor(provs);
      } catch (err) {
        toast(err.message, 'error');
      }
    };

    if (!productos.length) {
      el.innerHTML = shell(`
        <div class="mb-4">
          <h1 class="font-display text-2xl font-bold text-brand-900">Catálogo</h1>
          <p class="text-sm text-slate-500">0 producto(s)</p>
        </div>
        <div class="empty-state glass rounded-3xl">
          <i class="fa-solid fa-box-open text-3xl mb-3 text-brand-500"></i>
          <p>No hay productos aún</p>
          <p class="text-sm mt-1">Usa el botón + para agregar</p>
        </div>
      `, { title: 'Productos', fab: true, fabSearch: true, active: 'catalogo' });
      bindShell(openCreate, openCotizarTextoModal);
      return;
    }

    const proveedorOptions = [
      `<option value="">Todos</option>`,
      ...proveedores.map((p) => `
        <option value="${esc(p.CODPROV)}" ${String(_catalogFilters.proveedor) === String(p.CODPROV) ? 'selected' : ''}>
          ${esc(p.NOMPROV)}
        </option>`),
    ].join('');

    const filtered = filterProductos(productos, _catalogFilters);

    el.innerHTML = shell(`
      <div class="mb-4">
        <h1 class="font-display text-2xl font-bold text-brand-900">Catálogo</h1>
        <p class="text-sm text-slate-500" id="catalog-count">${filtered.length} de ${productos.length} producto(s)</p>
      </div>
      <div class="catalog-filters mb-3">
        <div class="catalog-filter-prov">
          <label class="label" for="filter-proveedor">Proveedor</label>
          <select id="filter-proveedor" class="input-field" autocomplete="off">
            ${proveedorOptions}
          </select>
        </div>
        <div class="catalog-filter-search">
          <label class="label" for="filter-buscar">Buscar</label>
          <div class="catalog-search-wrap">
            <i class="fa-solid fa-magnifying-glass catalog-search-icon" aria-hidden="true"></i>
            <input id="filter-buscar" class="input-field catalog-search-input" type="search"
              placeholder="Código, descripción..." autocomplete="off"
              value="${esc(_catalogFilters.q)}" />
          </div>
        </div>
      </div>
      <div class="space-y-2" id="product-list">${productListHtml(filtered, factor)}</div>
    `, { title: 'Productos', fab: true, fabSearch: true, active: 'catalogo' });

    bindShell(openCreate, openCotizarTextoModal);

    const listEl = document.getElementById('product-list');
    const countEl = document.getElementById('catalog-count');
    const provSelect = document.getElementById('filter-proveedor');
    const searchInput = document.getElementById('filter-buscar');

    const applyFilters = () => {
      _catalogFilters = {
        proveedor: provSelect?.value || '',
        q: searchInput?.value || '',
      };
      const next = filterProductos(productos, _catalogFilters);
      if (listEl) {
        listEl.innerHTML = productListHtml(next, factor);
        bindProductRowActions(listEl, productos, paint);
      }
      if (countEl) {
        countEl.textContent = `${next.length} de ${productos.length} producto(s)`;
      }
    };

    provSelect?.addEventListener('change', applyFilters);
    searchInput?.addEventListener('input', applyFilters);

    bindProductRowActions(listEl || el, productos, paint);
  }

  _reloadCatalogo = paint;
  document.removeEventListener('reload-catalogo', handleReloadCatalogo);
  document.addEventListener('reload-catalogo', handleReloadCatalogo);
  await paint();
}
