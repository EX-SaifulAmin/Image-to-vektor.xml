// Updated app.js — produce Alight Motion compatible XML structure
// This file traces an image to SVG paths (ImageTracer), then outputs an XML
// formatted to match the structure Alight Motion exports so its "Upload XML"
// can accept it. It attempts to mirror required tags/attributes (scene, shape,
// transform/location, fillColor, path) and header metadata.

// Main click handler
document.getElementById('convertBtn').addEventListener('click', () => {
  const convertBtn = document.getElementById('convertBtn');
  const fileInput = document.getElementById('imageInput');
  const messageEl = getOrCreateMessageEl();
  const loader = getOrCreateLoaderEl();

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

  function showLoader() { loader.style.display = 'flex'; }
  function hideLoader() { loader.style.display = 'none'; }

  clearMessage();
  hideLoader();

  if (!fileInput.files[0]) {
    showMessage('Pilih gambar terlebih dahulu!', 'error');
    return;
  }

  convertBtn.disabled = true;
  const originalText = convertBtn.textContent;
  convertBtn.textContent = 'Memproses...';
  showMessage('Memproses gambar — tunggu sebentar...', 'info');
  showLoader();

  const file = fileInput.files[0];
  const reader = new FileReader();

  reader.onload = function (e) {
    const imgDataUrl = e.target.result;

    const img = document.getElementById('imagePreview');
    img.src = imgDataUrl;

    const TRACE_TIMEOUT_MS = 30000;

    img.onload = () => {
      let timedOut = false;
      const traceTimer = setTimeout(() => {
        timedOut = true;
        showMessage('Proses terlalu lama — kemungkinan gambar terlalu besar atau library gagal memprosesnya.', 'error');
        convertBtn.disabled = false;
        convertBtn.textContent = originalText;
        hideLoader();
      }, TRACE_TIMEOUT_MS);

      try {
        ImageTracer.imageToSVG(img.src, function (svgString) {
          if (timedOut) return;
          clearTimeout(traceTimer);

          if (!svgString || svgString.indexOf('<svg') === -1) {
            showMessage('Hasil tracing kosong atau tidak valid.', 'error');
            convertBtn.disabled = false;
            convertBtn.textContent = originalText;
            hideLoader();
            return;
          }

          try {
            const parser = new DOMParser();
            const svgDoc = parser.parseFromString(svgString, 'image/svg+xml');
            const pathElements = svgDoc.querySelectorAll('path');
            if (!pathElements || pathElements.length === 0) {
              showMessage('Tracing berhasil, tapi tidak ada path vektor yang ditemukan.', 'error');
              convertBtn.disabled = false;
              convertBtn.textContent = originalText;
              hideLoader();
              return;
            }

            const xmlContent = generateAlightMotionXML(pathElements);

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
        }, { lprs: 1, qtres: 1, numberofcolors: 4 });
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

// Generate XML that closely matches an Alight Motion exported project/preset
function generateAlightMotionXML(pathElements) {
  // Scene dimensions: use preview natural size if available, fallback to 1080x1080
  const img = document.getElementById('imagePreview');
  const sceneWidth = (img && img.naturalWidth) ? Math.round(img.naturalWidth) : 1080;
  const sceneHeight = (img && img.naturalHeight) ? Math.round(img.naturalHeight) : 1080;
  const centerX = (sceneWidth / 2).toFixed(6);
  const centerY = (sceneHeight / 2).toFixed(6);

  // Alight Motion metadata (these values mirror the example export; you can adjust if needed)
  const amver = '1028425';
  const ffver = '106';
  const amId = `com.alightcreative.motion/5.0.273.${amver}`;
  const totalTime = '2032';
  const fps = '30';
  const modifiedTime = Date.now();

  const exportedAt = new Date().toLocaleString();
  const header = `<?xml version='1.0' encoding='UTF-8' ?><!--\nCreated by Alight Motion (http://alightmotion.com)\nExported: ${exportedAt}\n5.0.273.1028425 (${amver})\n-->`;

  const sceneOpen = `<scene title="Vector Export" width="${sceneWidth}" height="${sceneHeight}" exportWidth="${sceneWidth}" exportHeight="${sceneHeight}" precompose="dynamicResolution" bgcolor="#ff000000" totalTime="${totalTime}" fps="${fps}" modifiedTime="${modifiedTime}" amver="${amver}" ffver="${ffver}" am="${amId}" amplatform="android" retime="freeze" retimeAdaptFPS="false">`;

  let shapeLayers = '';

  Array.from(pathElements).forEach((path, index) => {
    // Read path data and fill color
    let dAttr = path.getAttribute('d') || '';

    // ImageTracer sometimes outputs relative cubic commands or includes commas; keep as-is but trim
    dAttr = dAttr.trim();

    const fillColorRaw = path.getAttribute('fill');
    const fillColor = (fillColorRaw === null || fillColorRaw === '') ? '#ffffffff' : fillColorRaw;
    const amColor = formatToAMColor(fillColor);

    // Escape minimal XML-sensitive chars in attributes
    const safePath = escapeXml(dAttr);
    const safeColor = escapeXml(amColor);

    const id = index + 100;
    const label = `Shape ${index + 1}`;

    shapeLayers += `\n  <shape id="${id}" label="${label}" startTime="0" endTime="${totalTime}" fillType="color" mediaFillMode="fill">` +
                   `\n    <transform>` +
                   `\n      <location value="${centerX},${centerY},0.000000" />` +
                   `\n    </transform>` +
                   `\n    <fillColor value="${safeColor}" />` +
                   `\n    <path d="${safePath}" />` +
                   `\n  </shape>`;
  });

  const sceneClose = '\n</scene>';
  return header + '\n' + sceneOpen + shapeLayers + sceneClose;
}

// Helper: Escape XML attribute values
function escapeXml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Helper: Convert various color formats into AM's #AARRGGBB
function formatToAMColor(col) {
  if (!col) return '#ffffffff';
  col = String(col).trim();
  if (col === 'none') return '#00ffffff';

  // If already #AARRGGBB
  if (col.startsWith('#') && col.length === 9) return col.toLowerCase();

  // #RRGGBB -> #AARRGGBB (opaque)
  if (col.startsWith('#') && col.length === 7) return ('#ff' + col.slice(1)).toLowerCase();

  // #RGB -> expand
  if (col.startsWith('#') && col.length === 4) {
    const r = col[1] + col[1];
    const g = col[2] + col[2];
    const b = col[3] + col[3];
    return ('#ff' + r + g + b).toLowerCase();
  }

  // rgb()/rgba()
  const m = col.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/i);
  if (m) {
    const r = clamp(Number(m[1]), 0, 255);
    const g = clamp(Number(m[2]), 0, 255);
    const b = clamp(Number(m[3]), 0, 255);
    const a = m[4] !== undefined ? Math.round(clamp(Number(m[4]), 0, 1) * 255) : 255;
    return ('#' + toHex(a) + toHex(r) + toHex(g) + toHex(b)).toLowerCase();
  }

  return '#ffffffff';
}

function toHex(n) { return ('0' + n.toString(16)).slice(-2); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

// Download helper
function downloadXML(filename, text) {
  const blob = new Blob([text], { type: 'application/xml;charset=UTF-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// UI helpers
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

function getOrCreateLoaderEl() {
  let el = document.getElementById('amLoader');
  if (el) return el;
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
  const dot = document.createElement('div'); dot.className = 'am-dot';
  const txt = document.createElement('div'); txt.className = 'am-text'; txt.textContent = 'Memproses...';
  el.appendChild(dot); el.appendChild(txt);
  const container = document.querySelector('.container') || document.body;
  container.appendChild(el);
  return el;
}
