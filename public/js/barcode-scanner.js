import { openStackedModal, alertSuccess } from './router.js';
import { toast } from './api.js';

/**
 * Abre la cámara para leer un código de barras.
 * @param {(code: string) => void} onCode
 */
export async function openBarcodeScanner(onCode) {
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
        await alertSuccess('Código leído', `Se leyó el código: ${decodedText}`);
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
