/**
 * Genera iconos PWA / favicon desde logo.png (raíz del proyecto).
 * Uso: node scripts/generate-icons.js
 */
const path = require('path');
const fs = require('fs');

async function main() {
  let sharp;
  try {
    sharp = require('sharp');
  } catch {
    console.error('Instala sharp primero: npm install sharp --no-save');
    process.exit(1);
  }

  const root = path.join(__dirname, '..');
  const src = path.join(root, 'logo.png');
  const outDir = path.join(root, 'public', 'icons');

  if (!fs.existsSync(src)) {
    console.error('No se encontró logo.png en la raíz del proyecto');
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });

  const logoMeta = await sharp(src).metadata();
  console.log(`Fuente: ${logoMeta.width}x${logoMeta.height}`);

  // Tamaños estándar: favicon, Android, iOS, PWA
  const sizes = [16, 32, 48, 72, 96, 128, 144, 152, 167, 180, 192, 256, 384, 512];

  async function renderAny(size) {
    // Logo circular sobre fondo negro (mismo del archivo), llenando el cuadrado
    return sharp(src)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 1 },
      })
      .png()
      .toFile(path.join(outDir, `icon-${size}.png`));
  }

  async function renderMaskable(size) {
    // Safe zone ~80%: logo centrado con padding para iconos adaptativos Android
    const inner = Math.round(size * 0.8);
    const pad = Math.round((size - inner) / 2);
    const resized = await sharp(src)
      .resize(inner, inner, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 1 },
      })
      .png()
      .toBuffer();

    return sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 1 },
      },
    })
      .composite([{ input: resized, left: pad, top: pad }])
      .png()
      .toFile(path.join(outDir, `icon-${size}-maskable.png`));
  }

  for (const size of sizes) {
    await renderAny(size);
    console.log(`✓ icon-${size}.png`);
  }

  for (const size of [192, 512]) {
    await renderMaskable(size);
    console.log(`✓ icon-${size}-maskable.png`);
  }

  // Favicon clásico 32px (también referenciado como favicon.png)
  await sharp(src)
    .resize(32, 32, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    })
    .png()
    .toFile(path.join(outDir, 'favicon.png'));
  console.log('✓ favicon.png');

  // Apple touch (alias 180)
  await fs.promises.copyFile(
    path.join(outDir, 'icon-180.png'),
    path.join(outDir, 'apple-touch-icon.png')
  );
  console.log('✓ apple-touch-icon.png');

  console.log('Iconos generados en public/icons/');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
