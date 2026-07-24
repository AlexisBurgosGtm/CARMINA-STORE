require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

/** Modelo actual (gemini-2.0-flash está retirado / sin cuota free) */
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';

function friendlyGeminiError(err) {
  const msg = String(err?.message || err || '');
  const status = err?.status || err?.statusCode;

  if (status === 429 || /quota|rate.?limit|exceeded your current quota/i.test(msg)) {
    return 'Cuota de Gemini agotada o sin acceso free para este modelo. Revisa billing/límites en https://ai.dev/rate-limit';
  }
  if (status === 404 || /no longer available|not found|is not found/i.test(msg)) {
    return `Modelo Gemini no disponible (${GEMINI_MODEL}). Prueba actualizar GEMINI_MODEL en .env`;
  }
  if (status === 401 || status === 403 || /API_KEY|invalid|permission/i.test(msg)) {
    return 'API key de Gemini inválida o sin permisos';
  }
  return msg || 'Error al consultar Gemini';
}

async function cotizarProducto(descripcion) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY no configurada');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

  const prompt = `Eres un asistente de cotización de precios en México.
Cotiza el siguiente producto en al menos 10 tiendas distintas del país México (pueden ser cadenas físicas u online conocidas: Liverpool, Walmart, Amazon México, Mercado Libre, Coppel, Elektra, Best Buy, Sam's Club, Costco, Home Depot, Office Depot, Soriana, Chedraui, etc.).

Producto a cotizar: "${descripcion}"

Responde ÚNICAMENTE con un JSON válido (sin markdown, sin backticks) con este formato exacto:
{
  "producto": "nombre del producto",
  "fecha": "YYYY-MM-DD",
  "moneda": "MXN",
  "cotizaciones": [
    {
      "tienda": "nombre de la tienda",
      "precio": 0.00,
      "url": "url aproximada o sitio de la tienda",
      "disponibilidad": "disponible|agotado|desconocido",
      "notas": "breve nota"
    }
  ],
  "precio_minimo": 0.00,
  "precio_maximo": 0.00,
  "precio_promedio": 0.00,
  "resumen": "breve resumen de la cotización"
}

Usa precios realistas aproximados en pesos mexicanos (MXN) basados en tu conocimiento del mercado mexicano. Incluye exactamente 10 o más cotizaciones.`;

  let result;
  try {
    result = await model.generateContent(prompt);
  } catch (err) {
    console.error('Gemini error:', err?.message || err);
    throw new Error(friendlyGeminiError(err));
  }

  const text = result.response.text().trim();

  let cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('No se pudo parsear la respuesta de Gemini');
  }
}

module.exports = { cotizarProducto, GEMINI_MODEL };
