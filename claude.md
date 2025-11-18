# Claude Code Project Guidelines

## Critical Requirements

### Tesseract OCR Language Files

**CRITICAL**: The Tesseract language files MUST be stored in `.gz` (gzip) format. This is essential for Windows compatibility.

#### Why this matters:
- Tesseract.js on Windows requires gzip-compressed language files
- The `gzip: true` option in the worker configuration expects `.traineddata.gz` files
- Using uncompressed `.traineddata` files will cause OCR to fail on Windows

#### Correct format:
```
tessdata/por.traineddata.gz
```

#### DO NOT use:
```
tessdata/por.traineddata  (uncompressed - will fail on Windows)
```

#### Download URL for Portuguese language data:
```
https://github.com/naptha/tessdata/raw/gh-pages/4.0.0/por.traineddata.gz
```

#### Configuration in code:
```typescript
const worker = await Tesseract.createWorker('por', 1, {
  langPath: tessdataPath,
  cachePath: tessdataPath,
  gzip: true,  // This requires .gz files
  // ...
})
```

### Build Configuration

The `tessdata` folder is configured as an `extraResource` in electron-builder to be copied outside the ASAR archive:

```json
{
  "extraResources": [
    {
      "from": "tessdata",
      "to": "tessdata",
      "filter": ["**/*"]
    }
  ]
}
```

This ensures the language files are accessible at runtime on Windows.

## Project Structure

- `src/main/` - Electron main process (PDF parsing, OCR, file generation)
- `src/renderer/` - React UI
- `src/preload/` - Electron preload scripts
- `src/shared/` - Shared TypeScript types
- `tessdata/` - Tesseract language files (gzip compressed)

## PDF Processing Flow

1. Try text extraction with pdf-parse
2. If text < 50 characters, use OCR:
   - Convert PDF to image using pdf.js + canvas
   - Run Tesseract OCR with Portuguese language
3. Extract data using regex patterns
4. If essential fields (NIF, paymentReference, amount) are missing, return `needsReview: true` for manual correction

## Testing

Run tests with:
```bash
npm run test:packaged
```

This runs the packaged application tests which verify OCR functionality.
