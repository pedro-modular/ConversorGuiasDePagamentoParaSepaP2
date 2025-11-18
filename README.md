# Guias de Pagamento SEPA

An open source desktop application for converting Portuguese Tax Authority (Autoridade Tributária) payment guides from PDF format into SEPA XML or PS2 files.

This project was created to solve a real problem: manually processing tax payment guides is time-consuming and error-prone. By automating the extraction of payment data from PDFs and generating standardized payment files, this tool saves time and reduces mistakes when dealing with Portuguese tax payments.

## Project Goals

The primary objective is to provide a free, open source tool that:

1. Extracts payment information from Portuguese tax authority PDFs automatically
2. Generates properly formatted SEPA XML files compliant with ISO 20022 standard
3. Generates PS2 format files for Portuguese banking systems
4. Works completely offline for data privacy and security
5. Runs on Windows, the most common platform in Portuguese businesses

This is not a commercial product. The code is open source under the MIT license so anyone can use it, modify it, or learn from it.

## How It Works

The application uses a two-stage approach to extract text from PDF files:

**Stage 1: Native Text Extraction**
The application first attempts to extract text directly from the PDF using the pdf-parse library. This works for PDFs that contain actual text data (not scanned images). If sufficient text is found, the application uses this method as it is faster and more accurate.

**Stage 2: OCR Fallback**
If the PDF contains insufficient text (typically because it is a scanned image), the application falls back to Optical Character Recognition. It renders the PDF page to a canvas element using pdf.js, then runs Tesseract.js OCR with Portuguese language data to extract text from the image.

**Data Parsing**
Once text is extracted (via either method), the application uses regular expressions to locate and extract specific fields:
- Document number
- Tax identification number (NIF)
- Taxpayer name
- Payment reference (entity and reference number)
- Amount to pay
- Payment deadline

**File Generation**
The extracted data is then formatted into either:
- SEPA XML files following the ISO 20022 pain.001.001.03 standard
- PS2 format files with fixed-width fields for Portuguese banking systems

## Features

- Automatic data extraction from PDF payment guides
- Support for both text-based and image-based PDFs
- OCR capabilities using Tesseract.js with Portuguese language support
- SEPA XML generation (ISO 20022 pain.001.001.03 format)
- PS2 file generation for Portuguese banks
- Drag and drop file interface
- Completely offline operation (except initial Tesseract language file download)
- No telemetry or external data transmission

## Installation

### For End Users

Download the latest Windows installer from the Releases page and run it. The application will be installed and a desktop shortcut will be created.

Requirements:
- Windows 10 or Windows 11 (64-bit)
- No additional software required

### For Developers

Prerequisites:
- Node.js 22 or higher
- npm 10 or higher
- macOS recommended for development (Windows works but cross-platform builds are easier from macOS)

Clone and install:

```bash
git clone https://github.com/pedro-modular/ConversorGuiasDePagamentoParaSepaP2.git
cd GuiasDePagamentoSepa
npm install
```

Run in development mode:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Create Windows installer:

```bash
npm run package:win
```

## Usage

1. Launch the application
2. Select a PDF file or drag and drop it into the window
3. Wait for the application to extract data (OCR may take a few seconds for scanned PDFs)
4. Review the extracted data in the table
5. Choose export format (SEPA XML or PS2)
6. Click Export and choose where to save the file

## Technical Architecture

### Stack

- **Electron 39**: Cross-platform desktop framework
- **React 19**: User interface
- **TypeScript**: Type safety throughout the codebase
- **Vite**: Build tool and module bundler
- **Tesseract.js**: OCR engine
- **pdf.js**: PDF rendering
- **canvas**: Image rendering for OCR
- **pdf-parse**: Native PDF text extraction
- **xml-js**: XML generation

### Project Structure

```
src/
├── main/                 Main Electron process
│   ├── index.ts         Application entry point
│   ├── polyfills.ts     Windows compatibility polyfills
│   ├── sepaGenerator.ts SEPA XML generation
│   └── ps2Generator.ts  PS2 file generation
├── preload/             IPC bridge
│   └── index.ts
├── renderer/            React UI
│   └── src/
└── shared/              Shared TypeScript types
    └── types.ts
```

### Cross-Platform Build Considerations

This application can be built for Windows from macOS, but requires special handling for the native canvas module. The canvas library is a Node.js native addon that depends on Cairo graphics library, which means it needs platform-specific binaries.

The build process handles this automatically:

1. During development on macOS, the application uses macOS canvas binaries
2. When packaging for Windows, the afterPack hook (build/afterPack.js) downloads the Windows prebuild of canvas from GitHub
3. The hook extracts the Windows canvas.node binary and 44 DLL files (Cairo, GTK, etc.) and includes them in the package
4. The final Windows installer contains all necessary Windows binaries

This approach works because canvas version 3.2.0 provides prebuild binaries for both platforms. Earlier versions (like 2.11.2) do not have Windows prebuilds, which is why the package.json uses npm overrides to force all dependencies to use canvas 3.2.0.

## GitHub Actions

The project includes a GitHub Actions workflow that builds the Windows installer on an actual Windows runner. This ensures the build is correct and native modules are compiled properly.

The workflow runs when you push a version tag (like v1.0.9) or can be triggered manually. It builds the application, runs tests, and creates a draft release with the installer attached.

To create a new release:

```bash
npm version patch  # or minor/major
git push origin v1.0.9
```

GitHub Actions will automatically build and create a release draft.

## Configuration

Before using this application in production, you should configure the debtor information in src/main/sepaGenerator.ts:

```typescript
const defaultDebtorName = 'YOUR COMPANY NAME'
const defaultDebtorIBAN = 'PT50000000000000000000000'
const defaultDebtorBIC = 'BBPIPTPL'
```

Replace these placeholder values with your actual company name, IBAN, and bank BIC code.

## Known Issues and Limitations

- OCR accuracy depends on PDF quality. Low-resolution scans may produce incorrect results.
- The application is designed for Portuguese Tax Authority payment guides. Other PDF formats may not work correctly.
- Tesseract language files are downloaded from tessdata.projectnaptha.com on first OCR use. This requires internet connection initially.
- The PS2 format implementation may need adjustments for specific banks. Please open an issue if you encounter problems.

## Contributing

Contributions are welcome. If you find bugs or have ideas for improvements, please open an issue or submit a pull request.

When contributing code:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly on Windows
5. Submit a pull request with a clear description of what you changed and why

Please maintain the existing code style and add tests where appropriate.

## Development Notes

### Windows Polyfills

The application includes polyfills for DOMMatrix and DOMRect in src/main/polyfills.ts. These browser APIs are not available in Node.js but are required by the canvas library on Windows. The polyfills provide basic implementations sufficient for the canvas operations needed by this application.

### Canvas Module Version Pinning

The package.json uses npm overrides to force canvas version 3.2.0 for all dependencies. This is necessary because pdfjs-dist depends on canvas 2.11.2, which does not have Windows prebuild binaries available. Without this override, Windows builds would fail.

### Testing

The project includes automated tests in test-packaged-app.js that verify:
- Native modules are present
- xml-js is bundled into the output
- DOMMatrix polyfills are included
- Build output is the correct size

Run tests with:

```bash
npm run test:build
```

## License

This project is licensed under the MIT License. See the LICENSE file for details.

You are free to use this software for any purpose, commercial or non-commercial, modify it, and distribute it. The only requirement is to include the original copyright notice.

## Author

Pedro Seco

This project was developed to address a real need in handling Portuguese tax payments. While it was created for use at Patrocínio, it is released as open source software so others can benefit from it and contribute improvements.

## Support

For bugs, feature requests, or questions, please open an issue on GitHub:
https://github.com/pedroseco/GuiasDePagamentoSepa/issues

This is an open source project maintained in my spare time. Response times may vary, but I will do my best to address issues and review pull requests.
