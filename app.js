// app.js - Generate Alight Motion compatible XML from traced SVG paths
// Features:
// - Resize input image to speed up tracing
// - Ensure svgpath library available (dynamic load) and use it to translate path coords
// - Fallback numeric translator if svgpath unavailable
// - Group shapes by fill color and limit shapes per color / total shapes
// - Produce AM-style XML: scene attrs, shape -> transform/location, fillColor, path
// - Logging and longer timeout to reduce false timeouts

// --- Utility: dynamically ensure svgpath is loaded ---
function ensureSvgpathLoaded(callback) {
  if (typeof svgpath !== 'undefined') {
    callback();
    return;
  }
  const scriptId = 'svgpath-cdn-dynamic';
  if (document.getElementById(scriptId)) {
    const waitFor = setInterval(() => {
      if (typeof svgpath !== 'undefined') {
        clearInterval(waitFor);
        callback();
      }
    }, 50);
    setTimeout(() => clearInterval(waitFor), 5000);
    return;
  }
  const s = document.createElement('script');
  s.id = scriptId;
  s.src = 'https://unpkg.com/svgpath@2.6.0/svgpath.min.js';
  s.async = true;
  s.onload = () => callback();
  s.onerror = () => {
    console.warn('Gagal memuat svgpath dari CDN; path translation akan menggunakan fallback numeric.');
    callback();
  };
  document.head.appendChild(s);
}

// --- Fallback numeric translator for SVG path (translates absolute commands) ---
function translatePathNumbers(d, dx, dy) {
  if (!d) return d;
  const cmdRe = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;
  return d.replace(cmdRe, (full, cmd, argsStr) => {
    // If command is relative (lowercase), keep as-is
    if (cmd === cmd.toLowerCase()) return full;

    const nums = [];
    const numRe = /-?\d+\.?\d*(?:e[+-]?\d+)?/ig;
    let m;
    while ((m = numRe.exec(argsStr)) !== null) nums.push(m[0]);

    if (nums.length === 0) return full;

    const C = cmd.toUpperCase();
    let outNums = [];
    let i = 0;

    function fmt(n) {
      // Trim trailing zeros, keep up to 6 decimal places
      return (Math.round(n * 1000000) / 1000000).toString();
    }

    switch (C) {
      case 'M':
      case 'L':
      case 'T':
        while (i < nums.length) {
          const x = parseFloat(nums[i++]); const y = parseFloat(nums[i++]);
          outNums.push(fmt(x - dx), fmt(y - dy));
        }
        break;
      case 'H':
        while (i < nums.length) {
          const x = parseFloat(nums[i++]);
          outNums.push(fmt(x - dx));
        }
        break;
      case 'V':
        while (i < nums.length) {
          const y = parseFloat(nums[i++]);
          outNums.push(fmt(y - dy));
        }
        break;
      case 'C':
        while (i < nums.length) {
          const x1 = parseFloat(nums[i++]), y1 = parseFloat(nums[i++]);
          const x2 = parseFloat(nums[i++]), y2 = parseFloat(nums[i++]);
          const x = parseFloat(nums[i++]), y = parseFloat(nums[i++]);
          outNums.push(fmt(x1 - dx), fmt(y1 - dy), fmt(x2 - dx), fmt(y2 - dy), fmt(x - dx), fmt(y - dy));
        }
        break;
      case 'S':
        while (i < nums.length) {
          const x2 = parseFloat(nums[i++]), y2 = parseFloat(nums[i++]);
          const x = parseFloat(nums[i++]), y = parseFloat(nums[i++]);
          outNums.push(fmt(x2 - dx), fmt(y2 - dy), fmt(x - dx), fmt(y - dy));
        }
        break;
      case 'Q':
        while (i < nums.length) {
          const x1 = parseFloat(nums[i++]), y1 = parseFloat(nums[i++]);
          const x = parseFloat(nums[i++]), y = parseFloat(nums[i++]);
          outNums.push(fmt(x1 - dx), fmt(y1 - dy), fmt(x - dx), fmt(y - dy));
        }
        break;
      case 'A':
        while (i < nums.length) {
          const rx = nums[i++], ry = nums[i++], xrot = nums[i++], laf = nums[i++], sf = nums[i++];
          const x = parseFloat(nums[i++]), y = parseFloat(nums[i++]);
          outNums.push(rx, ry, xrot, laf, sf, fmt(x - dx), fmt(y - dy));
        }
        break;
      case 'Z':
        // no args
        return cmd;
      default:
        return full;
    }
    return cmd + (outNums.length ? ' ' + outNums.join(' ') : '');
  });
}

// --- Resize image to max side to speed up tracing ---
function getResizedDataUrl(img, maxDim = 1080, mime = 'image/png', quality = 0.92) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) return img.src;
  const ratio = Math.min(1, maxDim / Math.max(w, h));
  if (ratio === 1) return img.src;
  const cw = Math.round(w * ratio);
  const ch = Math.round(h * ratio);
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, cw, ch);
  return canvas.toDataURL(mime, quality);
}

// --- XML helpers ---
function escapeXml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function toHex(n) { return ('0' + n.toString(16)).slice(-2); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function formatToAMColor(col) {
  if (!col) return '#ffffffff';
  col = String(col).trim();
  if (col === 'none') return '#00ffffff';
  if (col.startsWith('#') && col.length === 9) return col.toLowerCase();
  if (col.startsWith('#') && col.length === 7) return ('#ff' + col.slice(1)).toLowerCase();
  if (col.startsWith('#') && col.length === 4) {
    const r = col[1] + col[1], g = col[2] + col[2], b = col[3] + col[3];
    return ('#ff' + r + g + b).toLowerCase();
  }
  const m = col.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/i);
  if (m) {
    const r = clamp(Number(m[1]), 0, 255), g = clamp(Number(m[2]), 0, 255), b = clamp(Number(m[3]), 0, 255);
    const a = m[4] !== undefined ? Math.round(clamp(Number(m[4]), 0, 1) * 255) : 255;
    return ('#' + toHex(a) + toHex(r) + toHex(g) + toHex(b)).toLowerCase();
  }
  return '#ffffffff';
}

// --- Download helper ---
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

// --- Main generator: group by color, limit shapes, translate coords, build AM XML ---
function generateAlightMotionXML(pathElements) {
  // UI limits (if inputs present)
  const maxShapesPerColorInput = document.getElementById('maxShapesPerColor');
  const maxTotalShapesInput = document.getElementById('maxTotalShapes');
  const maxShapesPerColor = maxShapesPerColorInput ? Math.max(1, parseInt(maxShapesPerColorInput.value, 10) || 200) : 200;
  const maxTotalShapes = maxTotalShapesInput ? Math.max(0, parseInt(maxTotalShapesInput.value, 10) || 0) : 0; // 0 = no limit

  // scene dims from preview
  const img = document.getElementById('imagePreview');
  const sceneWidth = (img && img.naturalWidth) ? Math.round(img.naturalWidth) : 1080;
  const sceneHeight = (img && img.naturalHeight) ? Math.round(img.naturalHeight) : 1080;
  const centerX = sceneWidth / 2;
  const centerY = sceneHeight / 2;

  const amver = '1028425';
  const ffver = '106';
  const amId = `com.alightcreative.motion/5.0.273.${amver}`;
  const totalTime = '2032';
  const fps = '30';
  const modifiedTime = Date.now();

  const exportedAt = new Date().toLocaleString();
  const header = `<?xml version='1.0' encoding='UTF-8' ?><!--\nCreated by Alight Motion (http://alightmotion.com)\nExported: ${exportedAt}\n5.0.273.1028425 (${amver})\n-->`;

  const sceneOpen = `<scene title="Vector Export" width="${sceneWidth}" height="${sceneHeight}" exportWidth="${sceneWidth}" exportHeight="${sceneHeight}" precompose="dynamicResolution" bgcolor="#ff000000" totalTime="${totalTime}" fps="${fps}" modifiedTime="${modifiedTime}" amver="${amver}" ffver="${ffver}" am="${amId}" amplatform="android" retime="freeze" retimeAdaptFPS="false">`;

  // Group by fill color
  const groups = {};
  Array.from(pathElements).forEach((pathEl) => {
    const d = (pathEl.getAttribute('d') || '').trim();
    let fill = pathEl.getAttribute('fill');
    if (!fill) fill = '#ffffffff';
    fill = String(fill).trim().toLowerCase();
    if (!groups[fill]) groups[fill] = [];
    groups[fill].push({ d, el: pathEl });
  });

  let shapeCount = 0;
  let shapeLayers = '';

  const colors = Object.keys(groups);
  for (let i = 0; i < colors.length; i++) {
    const color = colors[i];
    const items = groups[color];
    const perColorLimit = Math.min(maxShapesPerColor, items.length);

    for (let j = 0; j < perColorLimit; j++) {
      if (maxTotalShapes > 0 && shapeCount >= maxTotalShapes) break;
      const item = items[j];
      const dAttr = item.d || '';

      // translate path using svgpath if available, else fallback
      let dForOutput = dAttr;
      try {
        if (typeof svgpath !== 'undefined' && dAttr) {
          dForOutput = svgpath(dAttr).translate(-centerX, -centerY).toString();
          console.info('Translated a path with svgpath');
        } else if (dAttr) {
          dForOutput = translatePathNumbers(dAttr, centerX, centerY);
          console.info('Translated a path with fallback translator');
        }
      } catch (err) {
        console.warn('Path translation failed; using original dAttr', err);
        dForOutput = dAttr;
      }

      const amColor = formatToAMColor(color);
      const safePath = escapeXml(dForOutput);
      const safeColor = escapeXml(amColor);

      const id = 100 + shapeCount;
      const label = `Shape ${shapeCount + 1}`;

      shapeLayers += `\n  <shape id="${id}" label="${label}" startTime="0" endTime="${totalTime}" fillType="color" mediaFillMode="fill">` +
                     `\n    <transform>` +
                     `\n      <location value="${centerX.toFixed(6)},${centerY.toFixed(6)},0.000000" />` +
                     `\n    </transform>` +
                     `\n    <fillColor value="${safeColor}" />` +
                     `\n    <path d="${safePath}" />` +
                     `\n  </shape>`;

      shapeCount++;
    }

    if (maxTotalShapes > 0 && shapeCount >= maxTotalShapes) break;
  }

  const sceneClose = '\n</scene>';
  return header + '\n' + sceneOpen + shapeLayers + sceneClose;
}

// --- Main click handler ---
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

    const TRACE_TIMEOUT_MS = 60000; // 60s timeout to be safer

    img.onload = () => {
      console.info('Preview loaded:', { w: img.naturalWidth, h: img.naturalHeight, svgpathLoaded: typeof svgpath !== 'undefined' });

      // Resize to speed up tracing
      const resized = getResizedDataUrl(img, 1080);
      console.info('Using resized dataURL length:', resized ? resized.length : 0);

      let timedOut = false;
      const traceTimer = setTimeout(() => {
        timedOut = true;
        console.error('ImageTracer timeout after', TRACE_TIMEOUT_MS, 'ms');
        showMessage('Proses terlalu lama — kemungkinan gambar terlalu besar atau library gagal memprosesnya.', 'error');
        convertBtn.disabled = false;
        convertBtn.textContent = originalText;
        hideLoader();
      }, TRACE_TIMEOUT_MS);

      try {
        ensureSvgpathLoaded(() => {
          try {
            // For mostly-flat images use fewer colors to speed up tracing
            const tracerOptions = { lprs: 1, qtres: 1, numberofcolors: 2 };
            ImageTracer.imageToSVG(resized, function (svgString) {
              if (timedOut) {
                console.warn('Result after timeout - ignored');
                return;
              }
              clearTimeout(traceTimer);

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
                console.info('Found paths:', pathElements.length);

                if (!pathElements || pathElements.length === 0) {
                  showMessage('Tracing berhasil, tapi tidak ada path vektor yang ditemukan.', 'error');
                  convertBtn.disabled = false;
                  convertBtn.textContent = originalText;
                  hideLoader();
                  return;
                }

                const xmlContent = generateAlightMotionXML(pathElements);
                console.info('Generated XML length =', xmlContent.length);

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
            }, tracerOptions);
          } catch (err) {
            clearTimeout(traceTimer);
            console.error('ImageTracer gagal dipanggil:', err);
            showMessage('Terjadi kesalahan saat memulai proses tracing.', 'error');
            convertBtn.disabled = false;
            convertBtn.textContent = originalText;
            hideLoader();
          }
        });
      } catch (outerErr) {
        clearTimeout(traceTimer);
        console.error('Kesalahan tak terduga:', outerErr);
        showMessage('Terjadi kesalahan tak terduga.', 'error');
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

// --- UI helpers (message/loader) ---
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
