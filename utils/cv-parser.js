// Runs only in popup/options page context — uses FileReader and DOM APIs

export function extractCVText(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('No file provided'));

    if (file.type === 'application/pdf') {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = extractTextFromPDF(e.target.result);
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
      // Plain text, .txt, .doc readable as text
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error('Could not read file.'));
      reader.readAsText(file);
    }
  });
}

// Basic PDF text extraction using BT/ET stream parsing
// Works on most simple PDFs — complex PDFs should be pasted as text
function extractTextFromPDF(buffer) {
  const bytes = new Uint8Array(buffer);
  const str = new TextDecoder('latin1').decode(bytes);

  const parts = [];

  // Extract text from BT...ET blocks
  const btEt = /BT([\s\S]*?)ET/g;
  let block;
  while ((block = btEt.exec(str)) !== null) {
    const content = block[1];
    // Tj and TJ operators carry text
    const tj = /\(([^)]*)\)\s*T[jJ]/g;
    let m;
    while ((m = tj.exec(content)) !== null) {
      parts.push(m[1].replace(/\\(\d{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8))));
    }
    // TJ array form: [(text) offset (text)]
    const tjArr = /\[((?:[^[\]]*\([^)]*\)[^[\]]*)*)\]\s*TJ/g;
    let arr;
    while ((arr = tjArr.exec(content)) !== null) {
      const inner = arr[1].replace(/\(([^)]*)\)/g, (_, t) => t + ' ');
      parts.push(inner.trim());
    }
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}
