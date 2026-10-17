// app.js - improved generator for Alight Motion compatibility
// - Complete generateAlightMotionXML to produce a valid AM scene XML (based on sample export)
// - Read options from UI (max shapes per color -> passed as numberofcolors; max total shapes -> limit)
// - Keep loader and messages
// - Generate <path d="..."/> with raw path data (no XML escaping for d attribute)
// - Ensure fillColor is 8-hex #AARRGGBB
// - Open generated XML in a new tab for inspection before download

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

    const TRACE_TIMEOUT_MS = 30000; // 30s fallback

    img.onload = () => {
      console.log('Preview loaded. dataURL length =', img.src ? img.src.length : 0);

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

        // Get options from UI
        const maxShapesPerColorEl = document.getElementById('maxShapesPerColor');
        const maxTotalShapesEl = document.getElementById('maxTotalShapes');
        const numberofcolors = maxShapesPerColorEl ? Math.max(1, parseInt(maxShapesPerColorEl.value) || 2) : 2;
        const maxTotalShapes = maxTotalShapesEl ? Math.max(0, parseInt(maxTotalShapesEl.value) || 0) : 0;

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

            // Turn NodeList into array and optionally limit total shapes
            let pathsArr = Array.from(pathElements);
            if (maxTotalShapes > 0 && pathsArr.length > maxTotalShapes) {
              console.warn('Membatasi jumlah path dari', pathsArr.length, 'ke', maxTotalShapes);
              pathsArr = pathsArr.slice(0, maxTotalShapes);
            }

            // Generate AM-compatible XML (do NOT escape path d)
            const xmlContent = generateAlightMotionXML(pathsArr, 1080, 1080);

            // Open in new tab for inspection and then trigger download
            const blob = new Blob([xmlContent], { type: 'application/xml' });
            const url = URL.createObjectURL(blob);
            // Open a new tab for user inspection (some browsers may block popups if not user-initiated)
            try { window.open(url, '_blank'); } catch (openErr) { console.warn('Could not open new tab for XML preview', openErr); }

            downloadXML('vector_shape_am.xml', xmlContent);
            showMessage('Selesai: file XML diunduh. Jika import error, buka tab XML dan periksa isinya.', 'success');
          } catch (innerErr) {
            console.error('Error saat memproses SVG:', innerErr);
            showMessage('Terjadi kesalahan saat memproses SVG. Lihat console untuk detail.', 'error');
          } finally {
            convertBtn.disabled = false;
            convertBtn.textContent = originalText;
            hideLoader();
          }
        }, { lprs: 1, qtres: 1, numberofcolors: numberofcolors }); // pass numberofcolors from UI
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

// New: generate XML in Alight Motion export format
function generateAlightMotionXML(pathElements, sceneWidth = 1080, sceneHeight = 1080) {
  const title = 'Exported Vector';
  const exportW = sceneWidth;
  const exportH = sceneHeight;
  const totalTime = 2032;
  const fps = 30;
  const modifiedTime = Date.now();
  const amver = '1028425';
  const ffver = '106';
  // Use a neutral background similar to sample; callers can tweak if needed
  const bgcolor = '#ffd8d8d8';

  let shapeBlocks = '';

  const centerX = (sceneWidth / 2).toFixed(6);
  const centerY = (sceneHeight / 2).toFixed(6);

  pathElements.forEach((path, idx) => {
    // raw path data (do NOT escape)
    let d = path.getAttribute('d') || '';
    // normalize whitespace
    d = d.replace(/\s+/g, ' ').trim();

    const fillRaw = path.getAttribute('fill') || path.style && path.style.fill;
    const fill = formatToAMColor(fillRaw);

    // ensure d does not contain double quotes (AM xml will use double quotes)
    const safeD = d.replace(/\"/g, "'");

    const shapeId = 101 + idx; // start ids at 101 like the sample
    const label = `Shape ${idx + 1}`;

    shapeBlocks += `  <shape id="${shapeId}" label="${escapeXml(label)}" startTime="0" endTime="${totalTime}" fillType="color" mediaFillMode="fill">\n` +
      `    <transform>\n      <location value="${centerX},${centerY},0.000000" />\n    </transform>\n` +
      `    <fillColor value="${fill}" />\n` +
      `    <path d="${safeD}" />\n` +
      `  </shape>\n`;
  });

  // Build header using fields similar to the exported sample
  const header = `<?xml version="1.0" encoding="UTF-8" ?><!--\nCreated by Image-to-vektor.xml\nExported: ${new Date().toLocaleString()}\n-->\n`;

  const sceneOpen = `<scene title="${escapeXml(title)}" width="${sceneWidth}" height="${sceneHeight}" exportWidth="${exportW}" exportHeight="${exportH}" precompose="dynamicResolution" bgcolor="${bgcolor}" totalTime="${totalTime}" fps="${fps}" modifiedTime="${modifiedTime}" amver="${amver}" ffver="${ffver}" am="com.alightcreative.motion/5.0.273.1028425" amplatform="android" retime="freeze" retimeAdaptFPS="false">\n`;

  const sceneClose = `</scene>`;

  return header + sceneOpen + shapeBlocks + sceneClose;
}

// Helper: Escape XML atribut (still used for non-path values if needed)
function escapeXml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Format Warna ke ARGB (#AARRGGBB)
function formatToAMColor(col) {
  if (!col) return '#ffffffff';
  col = String(col).trim();
  if (col === 'none') return '#00ffffff';

  if (col.startsWith('#')) {
    // normalize #RRGGBB or #RGB
    if (col.length === 7) return ('#ff' + col.slice(1)).toLowerCase();
    if (col.length === 4) {
      const r = col[1] + col[1];
      const g = col[2] + col[2];
      const b = col[3] + col[3];
      return ('#ff' + r + g + b).toLowerCase();
    }
    // if already #AARRGGBB or #RRGGBBAA variations
    if (col.length === 9) return col.toLowerCase();
    if (col.length === 8) return ('#' + col.slice(1)).toLowerCase();
  }

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
