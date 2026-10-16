document.getElementById('convertBtn').addEventListener('click', () => {
  const fileInput = document.getElementById('imageInput');
  if (!fileInput.files[0]) {
    alert("Pilih gambar terlebih dahulu!");
    return;
  }

  const file = fileInput.files[0];
  const reader = new FileReader();

  reader.onload = function (e) {
    const imgDataUrl = e.target.result;

    // Set preview image src dan tunggu sampai ter-load sebelum tracing
    const img = document.getElementById('imagePreview');
    img.src = imgDataUrl;

    img.onload = () => {
      // 1. Jalankan Tracing Gambar ke Data Vektor SVG menggunakan elemen <img>
      ImageTracer.imageToSVG(img, function (svgString) {
        // 2. Parse SVG untuk mengambil data path/titik
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(svgString, "image/svg+xml");
        const pathElements = svgDoc.querySelectorAll('path');

        // 3. Generasi Konten XML Alight Motion
        let xmlContent = generateAlightMotionXML(pathElements);

        // 4. Unduh File XML (argumen: filename, text)
        downloadXML("vector_shape_am.xml", xmlContent);
      }, { lprs: 1, qtres: 1, numberofcolors: 4 }); // Opsi detail/presisi tracing
    };

    img.onerror = () => {
      alert('Gagal memuat gambar. Pastikan file gambar valid.');
    };
  };

  reader.readAsDataURL(file);
});

// Fungsi Menyusun XML Khas Alight Motion
function generateAlightMotionXML(pathElements) {
  let shapeLayers = '';

  Array.from(pathElements).forEach((path, index) => {
    const dAttr = path.getAttribute('d') || '';
    const fillColorRaw = path.getAttribute('fill');
    const fillColor = fillColorRaw === null ? '#ffffff' : fillColorRaw;

    // Format hexadecimal color ke format ARGB Alight Motion
    const amColor = formatToAMColor(fillColor);

    shapeLayers += `\n    <shape id="${index + 100}" name="Vector Shape ${index + 1}" type="path">\n      <property name="fillColor" value="${escapeXml(amColor)}" />\n      <property name="pathData" value="${escapeXml(dAttr)}" />\n      <transform>\n        <position x="540.0" y="960.0" />\n        <scale x="1.0" y="1.0" />\n      </transform>\n    </shape>`;
  });

  // Skema Wrapper XML Alight Motion Project
  return `<?xml version="1.0" encoding="UTF-8"?>\n<scene width="1080" height="1920" fps="30" backgroundColor="#ff000000">\n  ${shapeLayers}\n</scene>`;
}

// Helper: Escape XML atribut
function escapeXml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Helper: Format Warna ke ARGB (#AARRGGBB)
function formatToAMColor(col) {
  if (!col) return '#ffffffff';
  col = col.trim();
  // Transparansi explicit
  if (col === 'none') return '#00ffffff';

  // Hex #RRGGBB atau #RGB
  if (col.startsWith('#')) {
    if (col.length === 7) {
      return '#ff' + col.slice(1);
    }
    if (col.length === 4) { // #RGB -> #RRGGBB
      const r = col[1] + col[1];
      const g = col[2] + col[2];
      const b = col[3] + col[3];
      return '#ff' + r + g + b;
    }
  }

  // rgb(...) or rgba(...)
  const m = col.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/i);
  if (m) {
    const r = clamp(Number(m[1]), 0, 255);
    const g = clamp(Number(m[2]), 0, 255);
    const b = clamp(Number(m[3]), 0, 255);
    const a = m[4] !== undefined ? Math.round(clamp(Number(m[4]), 0, 1) * 255) : 255;
    return '#' + toHex(a) + toHex(r) + toHex(g) + toHex(b);
  }

  // Jika format tak dikenal, fallback opaque white
  return '#ffffffff';
}

function toHex(n) {
  return ('0' + n.toString(16)).slice(-2);
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

// Helper: Unduh File Teks XML
function downloadXML(filename, text) {
  const blob = new Blob([text], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.style.display = 'none';
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
