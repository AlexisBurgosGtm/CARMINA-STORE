require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { query } = require('./db');
const {
  DEFAULT_GEMINI_MODEL,
  SETTING_MODELO,
  isAllowedGeminiModel,
} = require('./gemini-models');

async function getConfiguredGeminiModel() {
  try {
    const rows = await query('SELECT VALOR FROM SETTINGS WHERE OPCION = ?', [SETTING_MODELO]);
    const fromDb = rows[0]?.VALOR?.trim();
    if (fromDb && isAllowedGeminiModel(fromDb)) return fromDb;
    if (fromDb) return fromDb; // permitir modelos custom guardados
  } catch (_) {
    /* ignore */
  }
  const fromEnv = (process.env.GEMINI_MODEL || '').trim();
  if (fromEnv) return fromEnv;
  return DEFAULT_GEMINI_MODEL;
}

function friendlyGeminiError(err, modelName) {
  const msg = String(err?.message || err || '');
  const status = err?.status || err?.statusCode;

  if (status === 429 || /quota|rate.?limit|exceeded your current quota/i.test(msg)) {
    return `Cuota de Gemini agotada para el modelo "${modelName}". Prueba otro en Configuraciones o revisa https://ai.dev/rate-limit`;
  }
  if (status === 404 || /no longer available|not found|is not found/i.test(msg)) {
    return `Modelo Gemini no disponible (${modelName}). Elige otro en Configuraciones → MODELO GEMINI`;
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

  const modelName = await getConfiguredGeminiModel();
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });

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

Usa precios realistas aproximados en pesos mexicanos (MXN) basados en tu conocimiento del mercado mexicano. Incluye exactamente 10 o más cotizaciones. Ordena el arreglo "cotizaciones" de menor a mayor precio.`;

  let result;
  try {
    result = await model.generateContent(prompt);
  } catch (err) {
    console.error('Gemini error:', modelName, err?.message || err);
    throw new Error(friendlyGeminiError(err, modelName));
  }

  const text = result.response.text().trim();

  let cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let data;
  try {
    data = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) data = JSON.parse(match[0]);
    else throw new Error('No se pudo parsear la respuesta de Gemini');
  }

  return normalizeCotizacion(data);
}

function normalizeCotizacion(data) {
  const list = Array.isArray(data?.cotizaciones) ? [...data.cotizaciones] : [];
  list.sort((a, b) => Number(a?.precio || 0) - Number(b?.precio || 0));

  const precios = list
    .map((c) => Number(c?.precio))
    .filter((n) => Number.isFinite(n) && n >= 0);

  const precio_minimo = precios.length ? Math.min(...precios) : Number(data?.precio_minimo) || 0;
  const precio_maximo = precios.length ? Math.max(...precios) : Number(data?.precio_maximo) || 0;
  const precio_promedio = precios.length
    ? precios.reduce((s, n) => s + n, 0) / precios.length
    : Number(data?.precio_promedio) || 0;

  return {
    ...data,
    cotizaciones: list,
    precio_minimo,
    precio_maximo,
    precio_promedio: Math.round(precio_promedio * 100) / 100,
  };
}

module.exports = { cotizarProducto, getConfiguredGeminiModel };
