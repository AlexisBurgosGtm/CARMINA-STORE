/**
 * Color y forma del badge de precio en imágenes de publicación.
 */
const COLOR_OPTION = 'COLOR BADGE PRECIO';
const FORMA_OPTION = 'FORMA BADGE PRECIO';

const BADGE_COLORS = {
  ROSADO: { bg: '#ec4899', text: '#ffffff', label: 'Rosado' },
  PURPURA: { bg: '#9333ea', text: '#ffffff', label: 'Púrpura' },
  AMARILLO: { bg: '#eab308', text: '#ffffff', label: 'Amarillo' },
  VERDE: { bg: '#16a34a', text: '#ffffff', label: 'Verde' },
  ROJO: { bg: '#dc2626', text: '#ffffff', label: 'Rojo' },
  CELESTE: { bg: '#0ea5e9', text: '#ffffff', label: 'Celeste' },
  BLANCO: { bg: '#ffffff', text: '#111827', label: 'Blanco' },
};

const BADGE_SHAPES = {
  OVALO: { label: 'Óvalo' },
  ESTRELLA: { label: 'Estrella' },
  'ESTRELLA DE 8 PICOS': { label: 'Estrella de 8 picos' },
  CORAZON: { label: 'Corazón' },
  'COPO DE NIEVE': { label: 'Copo de nieve' },
  CIRCULO: { label: 'Círculo' },
};

const DEFAULT_COLOR = 'VERDE';
const DEFAULT_FORMA = 'OVALO';

function normalizeColor(valor) {
  const key = String(valor || '').trim().toUpperCase();
  return BADGE_COLORS[key] ? key : DEFAULT_COLOR;
}

function normalizeForma(valor) {
  const key = String(valor || '').trim().toUpperCase();
  return BADGE_SHAPES[key] ? key : DEFAULT_FORMA;
}

function isValidColor(valor) {
  return Object.prototype.hasOwnProperty.call(BADGE_COLORS, String(valor || '').trim().toUpperCase());
}

function isValidForma(valor) {
  return Object.prototype.hasOwnProperty.call(BADGE_SHAPES, String(valor || '').trim().toUpperCase());
}

function colorOptions() {
  return Object.entries(BADGE_COLORS).map(([id, c]) => ({ id, label: c.label, bg: c.bg, text: c.text }));
}

function formaOptions() {
  return Object.entries(BADGE_SHAPES).map(([id, s]) => ({ id, label: s.label }));
}

/** Estrella regular de N puntas */
function starPoints(cx, cy, spikes, outerR, innerR) {
  const pts = [];
  const step = Math.PI / spikes;
  let rot = -Math.PI / 2;
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    pts.push([cx + Math.cos(rot) * r, cy + Math.sin(rot) * r]);
    rot += step;
  }
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ') + ' Z';
}

function heartPath(cx, cy, size) {
  // Corazón centrado; size ≈ radio visual
  const s = size / 16;
  const x = cx;
  const y = cy + size * 0.08;
  return [
    `M ${x} ${y + 4 * s}`,
    `C ${x} ${y + 1.5 * s}, ${x - 7 * s} ${y - 5 * s}, ${x - 10 * s} ${y - 1 * s}`,
    `C ${x - 13 * s} ${y + 4 * s}, ${x - 7 * s} ${y + 9 * s}, ${x} ${y + 14 * s}`,
    `C ${x + 7 * s} ${y + 9 * s}, ${x + 13 * s} ${y + 4 * s}, ${x + 10 * s} ${y - 1 * s}`,
    `C ${x + 7 * s} ${y - 5 * s}, ${x} ${y + 1.5 * s}, ${x} ${y + 4 * s}`,
    'Z',
  ].join(' ');
}

function snowflakeLines(cx, cy, r) {
  const lines = [];
  const arms = 6;
  for (let i = 0; i < arms; i++) {
    const a = (i * Math.PI) / 3 - Math.PI / 2;
    const x2 = cx + Math.cos(a) * r;
    const y2 = cy + Math.sin(a) * r;
    lines.push(
      `<line x1="${cx}" y1="${cy}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" />`
    );
    // ramas a ~60% del brazo
    const mx = cx + Math.cos(a) * r * 0.58;
    const my = cy + Math.sin(a) * r * 0.58;
    const branch = r * 0.28;
    for (const side of [-1, 1]) {
      const ba = a + side * (Math.PI / 3.2);
      const bx = mx + Math.cos(ba) * branch;
      const by = my + Math.sin(ba) * branch;
      lines.push(
        `<line x1="${mx.toFixed(2)}" y1="${my.toFixed(2)}" x2="${bx.toFixed(2)}" y2="${by.toFixed(2)}" />`
      );
    }
  }
  // hexágono exterior sutil
  const hex = [];
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3 - Math.PI / 2;
    hex.push([cx + Math.cos(a) * r * 0.42, cy + Math.sin(a) * r * 0.42]);
  }
  const hexPath =
    hex.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ') +
    ' Z';
  lines.push(`<path d="${hexPath}" fill="none" />`);
  return lines.join('');
}

/**
 * Genera el elemento(s) SVG del fondo del badge.
 * @returns {{ shapeSvg: string, textX: number, textY: number, fontSize: number }}
 */
function buildBadgeShape({ forma, colorKey, width, height, priceText, fontSize }) {
  const color = BADGE_COLORS[normalizeColor(colorKey)];
  const shape = normalizeForma(forma);
  const margin = Math.max(16, Math.round(width * 0.035));
  const padX = Math.round(fontSize * 0.72);
  const padY = Math.round(fontSize * 0.45);
  const approxCharW = fontSize * 0.58;
  const textW = Math.ceil(String(priceText).length * approxCharW);
  const pillW = textW + padX * 2;
  const pillH = Math.round(fontSize + padY * 2);

  const fill = color.bg;
  const stroke = colorKey === 'BLANCO' || normalizeColor(colorKey) === 'BLANCO'
    ? 'rgba(15,23,42,0.18)'
    : 'rgba(0,0,0,0.12)';

  let shapeSvg = '';
  let cx;
  let cy;
  let textYOffset = fontSize * 0.35;

  if (shape === 'OVALO') {
    const bw = pillW;
    const bh = pillH;
    const x = width - margin - bw;
    const y = height - margin - bh;
    cx = x + bw / 2;
    cy = y + bh / 2;
    shapeSvg = `<ellipse cx="${cx}" cy="${cy}" rx="${(bw / 2).toFixed(2)}" ry="${(bh / 2).toFixed(2)}"
      fill="${fill}" stroke="${stroke}" stroke-width="2" filter="url(#badgeShadow)" />`;
  } else if (shape === 'CIRCULO') {
    const r = Math.max(pillW, pillH) / 2 + fontSize * 0.15;
    cx = width - margin - r;
    cy = height - margin - r;
    shapeSvg = `<circle cx="${cx}" cy="${cy}" r="${r.toFixed(2)}"
      fill="${fill}" stroke="${stroke}" stroke-width="2" filter="url(#badgeShadow)" />`;
  } else if (shape === 'ESTRELLA') {
    const outerR = Math.max(pillW, pillH) * 0.62;
    cx = width - margin - outerR;
    cy = height - margin - outerR;
    const d = starPoints(cx, cy, 5, outerR, outerR * 0.42);
    shapeSvg = `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="2" filter="url(#badgeShadow)" />`;
    textYOffset = fontSize * 0.38;
  } else if (shape === 'ESTRELLA DE 8 PICOS') {
    const outerR = Math.max(pillW, pillH) * 0.6;
    cx = width - margin - outerR;
    cy = height - margin - outerR;
    const d = starPoints(cx, cy, 8, outerR, outerR * 0.48);
    shapeSvg = `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="2" filter="url(#badgeShadow)" />`;
  } else if (shape === 'CORAZON') {
    const size = Math.max(pillW, pillH) * 0.95;
    cx = width - margin - size * 0.55;
    cy = height - margin - size * 0.55;
    const d = heartPath(cx, cy, size);
    shapeSvg = `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="2" filter="url(#badgeShadow)" />`;
    textYOffset = fontSize * 0.55;
  } else if (shape === 'COPO DE NIEVE') {
    const r = Math.max(pillW, pillH) * 0.58;
    cx = width - margin - r;
    cy = height - margin - r;
    // Disco de fondo + líneas del copo
    const lineColor = normalizeColor(colorKey) === 'BLANCO' ? '#111827' : '#ffffff';
    shapeSvg = `
      <circle cx="${cx}" cy="${cy}" r="${r.toFixed(2)}"
        fill="${fill}" stroke="${stroke}" stroke-width="2" filter="url(#badgeShadow)" />
      <g stroke="${lineColor}" stroke-width="${Math.max(2, fontSize * 0.08).toFixed(2)}"
         stroke-linecap="round" opacity="0.55">
        ${snowflakeLines(cx, cy, r * 0.78)}
      </g>`;
  } else {
    // fallback óvalo
    const bw = pillW;
    const bh = pillH;
    const x = width - margin - bw;
    const y = height - margin - bh;
    cx = x + bw / 2;
    cy = y + bh / 2;
    shapeSvg = `<ellipse cx="${cx}" cy="${cy}" rx="${bw / 2}" ry="${bh / 2}" fill="${fill}" filter="url(#badgeShadow)" />`;
  }

  return {
    shapeSvg,
    textX: cx,
    textY: cy + textYOffset,
    textFill: color.text,
  };
}

module.exports = {
  COLOR_OPTION,
  FORMA_OPTION,
  BADGE_COLORS,
  BADGE_SHAPES,
  DEFAULT_COLOR,
  DEFAULT_FORMA,
  normalizeColor,
  normalizeForma,
  isValidColor,
  isValidForma,
  colorOptions,
  formaOptions,
  buildBadgeShape,
};
