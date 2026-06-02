// Runs only in popup/options page context — uses FileReader and DOM APIs

export function extractCVText(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('No file provided'));

    if (file.type === 'application/pdf') {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const text = await extractTextFromPDF(e.target.result);
          if (!text || text.length < 50) {
            reject(new Error('PDF text extraction failed — please paste your CV text instead.'));
          } else {
            resolve(text);
          }
        } catch {
          reject(new Error('Could not parse PDF. Please paste your CV text instead.'));
        }
      };
      reader.onerror = () => reject(new Error('Could not read file.'));
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error('Could not read file.'));
      reader.readAsText(file);
    }
  });
}

async function extractTextFromPDF(buffer) {
  const bytes = new Uint8Array(buffer);
  const latin1 = new TextDecoder('latin1').decode(bytes);

  // Try uncompressed BT/ET streams first (simple PDFs)
  const plain = extractBTET(latin1);
  if (plain.length >= 50) return plain;

  // Fall back to decompressing FlateDecode streams (modern PDFs)
  return extractCompressedStreams(bytes, latin1);
}

// ── Uncompressed PDF text ─────────────────────────────────────────────────────

function extractBTET(str) {
  const parts = [];
  const btEt = /BT([\s\S]*?)ET/g;
  let block;
  while ((block = btEt.exec(str)) !== null) {
    extractTJFromBlock(block[1], parts);
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function extractTJFromBlock(content, parts) {
  const tj = /\(([^)]*)\)\s*T[jJ]/g;
  let m;
  while ((m = tj.exec(content)) !== null) {
    parts.push(m[1].replace(/\\(\d{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8))));
  }
  const tjArr = /\[((?:[^[\]]*\([^)]*\)[^[\]]*)*)\]\s*TJ/g;
  let arr;
  while ((arr = tjArr.exec(content)) !== null) {
    const inner = arr[1].replace(/\(([^)]*)\)/g, (_, t) => t + ' ');
    parts.push(inner.trim());
  }
}

// ── FlateDecode compressed streams ────────────────────────────────────────────

async function extractCompressedStreams(bytes, str) {
  const parts = [];

  // Find each 'stream' keyword and its surrounding dictionary
  const streamRe = /stream\r?\n/g;
  let m;
  while ((m = streamRe.exec(str)) !== null) {
    const dataStart = m.index + m[0].length;

    const endIdx = str.indexOf('endstream', dataStart);
    if (endIdx === -1) continue;

    // Check 200 chars before 'stream' keyword for FlateDecode filter
    const dictSnippet = str.slice(Math.max(0, m.index - 200), m.index);
    if (!/\/FlateDecode|\/Fl\b/.test(dictSnippet)) continue;

    // Trim trailing CR/LF before 'endstream'
    let dataEnd = endIdx;
    if (str[dataEnd - 1] === '\n') dataEnd--;
    if (str[dataEnd - 1] === '\r') dataEnd--;

    // latin1 → byte positions are 1:1
    const compressed = bytes.slice(dataStart, dataEnd);
    if (compressed.length < 4) continue;

    try {
      const decompressed = await deflateDecompress(compressed);
      const text = extractBTET(decompressed);
      if (text) parts.push(text);
    } catch {
      // skip stream that fails to decompress
    }
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

async function deflateDecompress(data) {
  // PDF FlateDecode = zlib-wrapped deflate (2-byte header: 0x78 0x__)
  // Try stripping zlib header first, then fall back to raw deflate
  const candidates = data[0] === 0x78 ? [data.slice(2), data] : [data, data.slice(2)];

  for (const d of candidates) {
    try {
      const ds = new DecompressionStream('deflate-raw');
      const writer = ds.writable.getWriter();
      const reader = ds.readable.getReader();

      writer.write(d);
      writer.close();

      const chunks = [];
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      const total = chunks.reduce((n, c) => n + c.length, 0);
      const out = new Uint8Array(total);
      let offset = 0;
      for (const c of chunks) { out.set(c, offset); offset += c.length; }

      return new TextDecoder('latin1').decode(out);
    } catch {
      continue;
    }
  }

  throw new Error('Decompression failed');
}
