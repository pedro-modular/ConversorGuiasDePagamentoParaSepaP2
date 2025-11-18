const sharp = require('sharp');
const png2icons = require('png2icons');
const fs = require('fs');
const path = require('path');

async function convertSvgToIco() {
  const svgPath = path.join(__dirname, 'icon.svg');
  const icoPath = path.join(__dirname, 'icon.ico');
  const pngPath = path.join(__dirname, 'icon-256.png');

  try {
    // Convert SVG to PNG (256x256 for high quality)
    console.log('Converting SVG to PNG...');
    await sharp(svgPath)
      .resize(256, 256)
      .png()
      .toFile(pngPath);

    // Read PNG file
    const pngBuffer = fs.readFileSync(pngPath);

    // Convert PNG to ICO
    console.log('Converting PNG to ICO...');
    const icoBuffer = png2icons.createICO(pngBuffer, png2icons.BILINEAR, 0, false);

    // Write ICO file
    fs.writeFileSync(icoPath, icoBuffer);

    // Clean up temporary PNG
    fs.unlinkSync(pngPath);

    console.log('✓ Icon successfully created at:', icoPath);
  } catch (error) {
    console.error('Error converting icon:', error);
    process.exit(1);
  }
}

convertSvgToIco();
