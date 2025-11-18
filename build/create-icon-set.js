const sharp = require('sharp');
const path = require('path');

async function createIconSet() {
  const svgPath = path.join(__dirname, 'icon.svg');
  const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];

  console.log('Creating icon set from SVG...');

  for (const size of sizes) {
    const outputPath = path.join(__dirname, `icon-${size}.png`);

    await sharp(svgPath)
      .resize(size, size)
      .png()
      .toFile(outputPath);

    console.log(`✓ Created ${size}x${size} PNG`);
  }

  console.log('✓ Icon set complete!');
}

createIconSet();
