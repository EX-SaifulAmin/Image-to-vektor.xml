// Updated app.js — generate Alight Motion compatible XML structure
// Adds generation of <scene> and <shape> elements matching exported AM structure.
// Keeps tracing, SVG parsing, and download logic from previous version.

// Main click handler
document.getElementById('convertBtn').addEventListener('click', () => {
  const convertBtn = document.getElementById('convertBtn');
  const fileInput = document.getElementById('imageInput');
  const messageEl = getOrCreateMessageEl();
  const loader = getOrCreateLoaderEl();

  // Helper to show messages on the page
  function showMessage(text, type = 'info') {
    messageEl.textContent = text;
    messageEl.style.display = 'block';
    messageEl.style.padding = '8px 10px';
    messageEl.style.borderRadius = '4px';
    messageEl.style.marginTop = '10px';
    if (type === 'error') {
      messageEl.style.background = '#ffdddd';
      messageEl.style.color = '#660000';
      messageEl.setAttribute('role', 'alert');
    } else if (type === 'success') {
      messageEl.style.background = '#ddffdd';
      messageEl.style.color = '#003300';
    } else {
      messageEl.style.background = '#eef3ff';
      messageEl.style.color = '#002244';
    }
  }

  function clearMessage() {
    messageEl.textContent = '';
    messageEl.style.display = 'none';
  }

  function showLoader() {
    loader.style.display = 'flex';
  }

  function hideLoader() {
    loader.style.display = 'none';
  }

  // Reset any previous message/loader
  clearMessage();
  hideLoader();

  if (!fileInput.files[0]) {
    showMessage('Pilih gambar terlebih dahulu!', 'error');
    return;
  }

  // Disable button to prevent duplicate clicks while processing
  convertBtn.disabled = true;
  const originalText = convertBtn.textContent;
  convertBtn.textContent = 'Memproses...';
  showMessage('Memproses gambar — tunggu sebentar...', 'info');
  showLoader();

  const file = fileInput.files[0];
  const reader = new FileReader();

  reader.onload = function (e) {
    const imgDataUrl = e.target.result;

    // Set preview image src dan tunggu sampai ter-load sebelum tracing
    const img = document.getElementById('imagePreview');
    img.src = imgDataUrl;

    // Timeout / debug settings
    const TRACE_TIMEOUT_MS = 30000; // 30 detik

    img.onload = () => {
      console.log('Preview image loaded. dataURL length =', img.src ? img.src.length : 0);

      let timedOut = false;
      const traceTimer = setTimeout(() => {
        timedOut = true;
        console.error('ImageTracer timeout: tidak ada callback dalam', TRACE_TIMEOUT_MS, 'ms');
        showMessage('Proses terlalu lama — kemungkinan gambar terlalu besar atau library gagal memprosesnya.', 'error');
        convertBtn.disabled = false;
        convertBtn.textContent = originalText;
        hideLoader();
      }, TRACE_TIMEOUT_MS);

      try {
        console.log('Memanggil ImageTracer.imageToSVG dengan data URL...');
        // PENTING: gunakan img.src (data URL), bukan objek element
        ImageTracer.imageToSVG(img.src, function (svgString) {
          if (timedOut) {
            console.warn('Hasil ImageTracer diterima setelah timeout — diabaikan.');
            return;
          }
          clearTimeout(traceTimer);

          console.log('ImageTracer callback dipanggil. svgString length =', svgString ? svgString.length : 0);
          if (!svgString || svgString.indexOf('<svg') === -1) {
            console.error('SVG kosong/tidak valid:', svgString);
            showMessage('Hasil tracing kosong atau tidak valid. Lihat console untuk detail.', 'error');
            convertBtn.disabled = false;
            convertBtn.textContent = originalText;
            hideLoader();
            return;
          }

          try {
            const parser = new DOMParser();
            const svgDoc = parser.parseFromString(svgString, 'image/svg+xml');
            const pathElements = svgDoc.querySelectorAll('path');
            console.log('Jumlah <path> ditemukan =', pathElements.length);

            if (!pathElements || pathElements.length === 0) {
              showMessage('Tracing berhasil, tapi tidak ada path vektor yang ditemukan.', 'error');
              convertBtn.disabled = false;
              convertBtn.textContent = originalText;
              hideLoader();
              return;
            }

            const xmlContent = generateAlightMotionXML(pathElements);
            console.log('Generated XML length =', xmlContent.length);

            // Unduh file
            downloadXML('vector_shape_am.xml', xmlContent);
            showMessage('Selesai: file XML diunduh.', 'success');
          } catch (innerErr) {
            console.error('Error saat memproses SVG:', innerErr);
            showMessage('Terjadi kesalahan saat memproses SVG. Lihat console untuk detail.', 'error');
          } finally {
            convertBtn.disabled = false;
            convertBtn.textContent = originalText;
            hideLoader();
          }
        }, { lprs: 1, qtres: 1, numberofcolors: 4 }); // Opsi detail/presisi tracing
      } catch (err) {
        clearTimeout(traceTimer);
        console.error('ImageTracer gagal dipanggil:', err);
        showMessage('Terjadi kesalahan saat memulai proses tracing.', 'error');
        convertBtn.disabled = false;
        convertBtn.textContent = originalText;
        hideLoader();
      }
    };

    img.onerror = () => {
      showMessage('Gagal memuat gambar. Pastikan file gambar valid.', 'error');
      convertBtn.disabled = false;
      convertBtn.textContent = originalText;
      hideLoader();
    };
  };

  reader.onerror = function (e) {
    console.error('FileReader error:', e);
    showMessage('Gagal membaca file. Coba lagi.', 'error');
    convertBtn.disabled = false;
    convertBtn.textContent = originalText;
    hideLoader();
  };

  reader.readAsDataURL(file);
});

// Fungsi Menyusun XML Khas Alight Motion
function generateAlightMotionXML(pathElements) {
  // Determine scene dimensions from preview image (fallback to 1080x1920)
  const img = document.getElementById('imagePreview');
  const sceneWidth = (img && img.naturalWidth) ? Math.round(img.naturalWidth) : 1080;
  const sceneHeight = (img && img.naturalHeight) ? Math.round(img.naturalHeight) : 1920;
  const centerX = (sceneWidth / 2).toFixed(6);
  const centerY = (sceneHeight / 2).toFixed(6);

  // Build shapes following Alight Motion exported structure
  let shapeLayers = '';

  Array.from(pathElements).forEach((path, index) => {
    const dAttr = path.getAttribute('d') || '';
    const fillColorRaw = path.getAttribute('fill');
    const fillColor = fillColorRaw === null ? '#ffffffff' : fillColorRaw; // default white

    // Format color to AM ARGB
    const amColor = formatToAMColor(fillColor);

    // Escape attributes
    const safePath = escapeXml(dAttr);
    const safeColor = escapeXml(amColor);

    const id = index + 100;
    const label = `Shape ${index + 1}`;

    shapeLayers += `\n  <shape id="${id}" label="${label}" startTime="0" endTime="2032" fillType="color" mediaFillMode="fill">\n` +
      `    <transform>\n      <location value="${centerX},${centerY},0.000000" />\n    </transform>\n` +
      `    <fillColor value="${safeColor}" />\n` +
      `    <path d="${safePath}" />\n` +
      `  </shape>`;
  });

  const modifiedTime = Date.now();
  // Build scene wrapper similar to exported AM file
  const sceneHeader = `<?xml version='1.0' encoding='UTF-8' ?><!--Created by Image-to-vektor.xml converter-->\n` +
    `<scene title="Vector Export" width="${sceneWidth}" height="${sceneHeight}" exportWidth="${sceneWidth}" exportHeight="${sceneHeight}" precompose="dynamicResolution" bgcolor="#ff000000" totalTime="2032" fps="30" modifiedTime="${modifiedTime}" retime="freeze" retimeAdaptFPS="false">`;

  return `${sceneHeader}${shapeLayers}\n</scene>`;
}

// Helper: Escape XML atribut
function escapeXml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Helper: Format Warna ke ARGB (#AARRGGBB)
function formatToAMColor(col) {
  if (!col) return '#ffffffff';
  col = col.trim();
  // Transparansi explicit
  if (col === 'none') return '#00ffffff';

  // If already in #AARRGGBB (8 chars after #)
  if (col.startsWith('#') && col.length === 9) {
    return col;
  }

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

// Helper: create or get a message element on the page
function getOrCreateMessageEl() {
  let el = document.getElementById('amMessage');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'amMessage';
  el.style.display = 'none';
  const container = document.querySelector('.container') || document.body;
  container.appendChild(el);
  return el;
}

// Helper: create or get a loader element (simple spinner)
function getOrCreateLoaderEl() {
  let el = document.getElementById('amLoader');
  if (el) return el;

  // ensure spinner CSS only injected once
  if (!document.getElementById('amLoaderStyles')) {
    const style = document.createElement('style');
    style.id = 'amLoaderStyles';
    style.textContent = `
      @keyframes am-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      #amLoader { display: none; align-items: center; gap: 10px; margin-top: 10px; }
      #amLoader .am-dot { width: 14px; height: 14px; border-radius: 50%; border: 2px solid #3b82f6; border-top-color: transparent; animation: am-spin 1s linear infinite; }
      #amLoader .am-text { color: #002244; font-size: 14px; }
    `;
    document.head.appendChild(style);
  }

  el = document.createElement('div');
  el.id = 'amLoader';
  el.style.display = 'none';
  el.style.alignItems = 'center';

  const dot = document.createElement('div');
  dot.className = 'am-dot';
  const txt = document.createElement('div');
  txt.className = 'am-text';
  txt.textContent = 'Memproses...';

  el.appendChild(dot);
  el.appendChild(txt);

  const container = document.querySelector('.container') || document.body;
  container.appendChild(el);
  return el;
}
