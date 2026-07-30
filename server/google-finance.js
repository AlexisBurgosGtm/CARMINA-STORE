/**
 * Obtiene el tipo de cambio GTQ → MXN desde Google Finance
 * (cuántos pesos mexicanos equivalen a 1 quetzal).
 */
async function consultarTipoCambioMxnPorGtq() {
  const url = 'https://www.google.com/finance/quote/GTQ-MXN?hl=es';
  let html;
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) {
      throw new Error(`Google Finance respondió ${res.status}`);
    }
    html = await res.text();
  } catch (err) {
    throw new Error(err.message || 'No se pudo conectar con Google Finance');
  }

  const patterns = [
    // Precio principal en la cabecera del par GTQ/MXN
    /Quetzal guatemalteco\s*\/\s*Peso mexicano[\s\S]{0,500}?jsname="Pdsbrc"[\s\S]{0,80}?<span>([0-9]+,[0-9]+)<\/span>/i,
    /jsname="Pdsbrc"[^>]*>\s*<span>([0-9]+,[0-9]{2,6})<\/span>/i,
    /class="N6SYTe"[^>]*>\s*<span[^>]*>\s*<span>([0-9]+,[0-9]{2,6})<\/span>/i,
  ];

  let raw = null;
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) {
      raw = m[1];
      break;
    }
  }

  if (!raw) {
    throw new Error('No se pudo leer el tipo de cambio en Google Finance (GTQ/MXN)');
  }

  // Formato es-GT/MX: "2,2755" → 2.2755
  const factor = Number(String(raw).trim().replace(',', '.'));
  // Rango razonable GTQ→MXN (~1 a 5)
  if (!Number.isFinite(factor) || factor < 0.5 || factor > 20) {
    throw new Error(`Factor de Google Finance fuera de rango: ${raw}`);
  }

  const fecha = new Date().toISOString().slice(0, 10);
  return {
    factor: Math.round(factor * 10000) / 10000,
    moneda_origen: 'GTQ',
    moneda_destino: 'MXN',
    descripcion: `1 GTQ ≈ ${factor} MXN`,
    fecha,
    fuente: 'Google Finance (GTQ/MXN)',
    url,
  };
}

module.exports = { consultarTipoCambioMxnPorGtq };
