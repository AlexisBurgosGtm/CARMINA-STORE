const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { query } = require('./db');

const LOGO_OPTION = 'LOGO EMPRESA';
const FONT_CANDIDATES = [
  path.join(__dirname, 'assets', 'fonts', 'Nunito-ExtraBold.ttf'),
  path.join(__dirname, 'assets', 'fonts', 'Nunito-Bold.ttf'),
  path.join(__dirname, 'assets', 'fonts', 'Nunito-Variable.ttf'),
];

let cachedFontCss = null;

function formatQ(n) {
  return `Q ${Number(n || 0).toLocaleString('es-GT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function escapeXml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getFontFaceCss() {
  if (cachedFontCss !== null) return cachedFontCss;
  for (const fontPath of FONT_CANDIDATES) {
    if (!fs.existsSync(fontPath)) continue;
    try {
      const b64 = fs.readFileSync(fontPath).toString('base64');
      cachedFontCss = `
        @font-face {
          font-family: 'PubPrice';
          src: url('data:font/ttf;base64,${b64}') format('truetype');
          font-weight: 700;
          font-style: normal;
        }`;
      return cachedFontCss;
    } catch (_) {
      /* try next */
    }
  }
  cachedFontCss = '';
  return cachedFontCss;
}

function parseLogoDataUrl(valor) {
  const raw = String(valor || '');
  const m = /^data:(image\/[\w.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(raw);
  if (!m) return null;
  return Buffer.from(m[2].replace(/\s+/g, ''), 'base64');
}

async function loadEmpresaLogoBuffer() {
  try {
    const rows = await query('SELECT VALOR FROM SETTINGS WHERE OPCION = ?', [LOGO_OPTION]);
    if (!rows.length) return null;
    const buf = parseLogoDataUrl(rows[0].VALOR);
    return buf && buf.length ? buf : null;
  } catch (_) {
    return null;
  }
}

function buildPriceOverlaySvg({ width, height, priceText }) {
  const fontSize = Math.max(32, Math.round(width * 0.062));
  const padX = Math.round(fontSize * 0.72);
  const padY = Math.round(fontSize * 0.42);
  const margin = Math.max(16, Math.round(width * 0.035));
  const approxCharW = fontSize * 0.58;
  const textW = Math.ceil(String(priceText).length * approxCharW);
  const pillW = textW + padX * 2;
  const pillH = Math.round(fontSize + padY * 2);
  const pillX = width - margin - pillW;
  const pillY = height - margin - pillH;
  const textX = pillX + pillW / 2;
  const textY = pillY + pillH / 2 + fontSize * 0.35;
  const fontFace = getFontFaceCss();
  const fontFamily = fontFace
    ? `'PubPrice', 'Nunito', Arial, sans-serif`
    : `'Nunito', 'Arial Rounded MT Bold', Arial, Helvetica, sans-serif`;

  return Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <style>
          ${fontFace}
          .price-pill { fill: rgba(15, 118, 110, 0.92); }
          .price-text {
            font-family: ${fontFamily};
            font-weight: 800;
            font-size: ${fontSize}px;
            fill: #ffffff;
            letter-spacing: 0.5px;
          }
        </style>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#000000" flood-opacity="0.35"/>
        </filter>
      </defs>
      <rect class="price-pill" x="${pillX}" y="${pillY}"
        width="${pillW}" height="${pillH}" rx="${Math.round(pillH / 2)}" ry="${Math.round(pillH / 2)}"
        filter="url(#shadow)" />
      <text class="price-text" x="${textX}" y="${textY}" text-anchor="middle">${escapeXml(priceText)}</text>
    </svg>
  `);
}

/**
 * Compone logo (sup. izq.) + precio (inf. der.) sobre la foto del producto.
 * No modifica el archivo original: trabaja en memoria y devuelve un PNG nuevo.
 */
async function composePublicacionImage({ photoBuffer, precio, logoBuffer = null }) {
  if (!photoBuffer || !Buffer.isBuffer(photoBuffer) || !photoBuffer.length) {
    throw new Error('Foto del producto requerida para componer la imagen');
  }

  let logo = logoBuffer;
  if (logo === undefined || logo === null) {
    logo = await loadEmpresaLogoBuffer();
  }

  const maxSide = 1600;
  let pipeline = sharp(photoBuffer).rotate();
  const meta = await pipeline.metadata();
  const srcW = meta.width || 1080;
  const srcH = meta.height || 1080;

  if (srcW > maxSide || srcH > maxSide) {
    pipeline = pipeline.resize({
      width: maxSide,
      height: maxSide,
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  const basePng = await pipeline.png().toBuffer();
  const baseMeta = await sharp(basePng).metadata();
  const width = baseMeta.width;
  const height = baseMeta.height;
  const composites = [];

  if (logo && logo.length) {
    const logoMaxW = Math.max(64, Math.round(width * 0.2));
    const logoMaxH = Math.max(64, Math.round(height * 0.2));
    const logoPng = await sharp(logo)
      .resize({
        width: logoMaxW,
        height: logoMaxH,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();
    const margin = Math.max(14, Math.round(width * 0.03));
    composites.push({ input: logoPng, left: margin, top: margin });
  }

  const priceText = formatQ(precio);
  const priceSvg = buildPriceOverlaySvg({ width, height, priceText });
  composites.push({ input: priceSvg, left: 0, top: 0 });

  return sharp(basePng).composite(composites).png().toBuffer();
}

module.exports = {
  composePublicacionImage,
  loadEmpresaLogoBuffer,
  formatQ,
};
