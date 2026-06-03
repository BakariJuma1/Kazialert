// Options page context only — full browser APIs available.
// PDF text extraction uses only browser built-ins: TextDecoder + DecompressionStream.
// Works for text-based PDFs (Word exports, Google Docs exports, etc.).
// Scanned / image-only PDFs will fall through to the "paste text" error.

export async function extractCVText(file) {
  if (!file) throw new Error('No file provided');

  if (file.type === 'application/pdf') {
    const buffer = await file.arrayBuffer();
    const text   = await extractPDFText(buffer);
    if (!text || text.length < 50) {
      throw new Error(
        'Could not extract text from this PDF — it may be a scanned image. Please paste your CV text directly.'
      );
    }
    return text;
  }

  return new Promise((resolve, reject) => {
    const reader  = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = () => reject(new Error('Could not read file.'));
    reader.readAsText(file);
  });
}

// ── PDF extraction ────────────────────────────────────────────────────────────

async function extractPDFText(buffer) {
  const bytes  = new Uint8Array(buffer);
  const latin1 = new TextDecoder('latin1').decode(bytes);
  const parts  = [];

  // Walk every stream object in the PDF.
  // Each stream starts with "stream\r\n" or "stream\n" and ends at "endstream".
  const streamRe = /stream\r?\n/g;
  let m;

  while ((m = streamRe.exec(latin1)) !== null) {
    const dataStart = m.index + m[0].length;
    const dataEnd   = latin1.indexOf('endstream', dataStart);
    if (dataEnd === -1) continue;

    // Peek at the dictionary before this stream to detect the filter.
    const lookback = latin1.slice(Math.max(0, m.index - 600), m.index);
    const isFlate  = /\/FlateDecode/.test(lookback);
    const hasOther = /\/Filter/.test(lookback) && !isFlate;
    if (hasOther) continue; // unsupported filter (e.g. DCTDecode for images)

    let content;
    if (isFlate) {
      try {
        const compressed  = bytes.slice(dataStart, dataEnd);
        const decompressed = await flateDecode(compressed);
        content = new TextDecoder('latin1').decode(decompressed);
      } catch {
        continue;
      }
    } else {
      content = latin1.slice(dataStart, dataEnd);
    }

    const text = pullTextFromStream(content);
    if (text) parts.push(text);
  }

  return parts.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Decompress a FlateDecode (zlib) stream using the browser's built-in API.
async function flateDecode(data) {
  // zlib streams start with a 2-byte header; strip it for raw deflate fallback.
  for (const format of ['deflate', 'deflate-raw']) {
    try {
      const ds     = new DecompressionStream(format);
      const writer = ds.writable.getWriter();
      const reader = ds.readable.getReader();

      // Write async; ignore backpressure errors on bad streams.
      writer.write(data).catch(() => {});
      writer.close().catch(() => {});

      const chunks = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      const total = chunks.reduce((n, c) => n + c.length, 0);
      const out   = new Uint8Array(total);
      let off = 0;
      for (const c of chunks) { out.set(c, off); off += c.length; }
      return out;
    } catch {
      // Try the next format.
    }
  }
  throw new Error('Decompression failed');
}

// Pull text strings out of a PDF content stream (BT … ET blocks).
function pullTextFromStream(content) {
  const parts  = [];
  const btEt   = /\bBT\b([\s\S]*?)\bET\b/g;
  let blockM;

  while ((blockM = btEt.exec(content)) !== null) {
    const block     = blockM[1];
    const lineParts = [];

    // Match (string) Tj  and  [(str|-kern) …] TJ
    const opRe = /\(([^)\\]*(?:\\.[^)\\]*)*)\)\s*(?:Tj|'|"|\")|\[([^\]]*)\]\s*TJ/g;
    let op;

    while ((op = opRe.exec(block)) !== null) {
      if (op[1] !== undefined) {
        lineParts.push(unescapePDF(op[1]));
      } else if (op[2] !== undefined) {
        const strRe = /\(([^)\\]*(?:\\.[^)\\]*)*)\)/g;
        let s;
        while ((s = strRe.exec(op[2])) !== null) {
          lineParts.push(unescapePDF(s[1]));
        }
      }
    }

    if (lineParts.length > 0) parts.push(lineParts.join(''));
  }

  return parts.join('\n');
}

function unescapePDF(s) {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\')
    .replace(/\\([0-7]{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
}
