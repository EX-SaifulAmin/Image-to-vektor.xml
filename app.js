// app.js - Standalone Alight Motion XML Generator
// Tidak lagi bergantung pada library eksternal svgpath untuk translasi koordinat

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
        showMessage('Proses terlalu lama — kemungkinan gambar terlalu besar.', 'error');
        convertBtn.disabled = false;
        convertBtn.textContent = originalText;
        hideLoader();
      }, TRACE_TIMEOUT_MS);

      try {
        const maxShapesPerColorEl = document.getElementById('maxShapesPerColor');
        const maxTotalShapesEl = document.getElementById('maxTotalShapes');
        const numberofcolors = maxShapesPerColorEl ? Math.max(1, parseInt(maxShapesPerColorEl.value) || 2) : 2;
        const maxTotalShapes = maxTotalShapesEl ? Math.max(0, parseInt(maxTotalShapesEl.value) || 0) : 0;

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

            let pathsArr = Array.from(pathElements);
            if (maxTotalShapes > 0 && pathsArr.length > maxTotalShapes) {
              pathsArr = pathsArr.slice(0, maxTotalShapes);
            }

            const xmlContent = generateAlightMotionXML(
              pathsArr, 
              1080, 
              1080, 
              maxTotalShapes || 500, 
              img.naturalWidth, 
              img.naturalHeight
            );

            downloadXML('vector_shape_am.xml', xmlContent);
            showMessage('Selesai: file XML siap di-import ke Alight Motion!', 'success');
          } catch (innerErr) {
            console.error(innerErr);
            showMessage('Terjadi kesalahan saat membangun struktur XML.', 'error');
          } finally {
            convertBtn.disabled = false;
            convertBtn.textContent = originalText;
            hideLoader();
          }
        }, { lprs: 1, qtres: 1, numberofcolors: numberofcolors, pathomit: 10 });
      } catch (err) {
        clearTimeout(traceTimer);
        showMessage('Gagal memulai proses tracing.', 'error');
        convertBtn.disabled = false;
        convertBtn.textContent = originalText;
        hideLoader();
      }
    };
  };
  reader.readAsDataURL(file);
});

function generateAlightMotionXML(pathElements, sceneWidth = 1080, sceneHeight = 1080, maxShapes = 500, imgW = 1080, imgH = 1080) {
  const title = 'Exported Vector';
  const exportW = sceneWidth;
  const exportH = sceneHeight;
  const totalTime = 2032;
  const fps = 30;
  const modifiedTime = Date.now();
  const amver = '1028425';
  const ffver = '106';
  const amAttr = 'com.alightcreative.motion/5.0.273.1028425';
  const bgcolor = '#ffd8d8d8';

  function escAttr(v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  function extractNumbers(pathStr) {
    return (String(pathStr).match(/-?\d*\.?\d+(?:e[-+]?\d+)?/g) || []).map(Number);
  }

  function getBBoxFromPathD(d) {
    const numbers = extractNumbers(d);
    if (numbers.length < 2) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < numbers.length; i += 2) {
      if (i + 1 < numbers.length) {
        const x = numbers[i]; const y = numbers[i + 1];
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }
    }
    if (minX === Infinity) return null;
    return { width: maxX - minX, height: maxY - minY };
  }

  function isZeroAreaPath(d) {
    const nums = extractNumbers(d);
    if (nums.length <= 4) return true; 
    if (nums.length === 6) {
      if (Math.abs(nums[0] - nums[4]) < 0.1 && Math.abs(nums[1] - nums[5]) < 0.1) return true;
    }
    return false;
  }

  function isCanvasLikeBackground(d) {
    if (!d) return false;
    const box = getBBoxFromPathD(d);
    if (!box) return false;
    return (box.width / sceneWidth > 0.8 && box.height / sceneHeight > 0.8);
  }

  // TRANSLATOR PATH MANUAL (TANPA SVGPATH) - 100% Akurat dengan format Alight Motion
  function normalizePathToAM(d, sceneW, sceneH, imgW, imgH) {
    if (!d) return '';
    const centerX = (imgW || sceneW) / 2;
    const centerY = (imgH || sceneH) / 2;

    let formattedD = '';
    const regex = /([a-zA-Z])|(-?\d+\.?\d*(?:e[-+]?\d+)?)/g;
    let match;
    let isX = true;

    while ((match = regex.exec(d)) !== null) {
      if (match[1]) {
        // Jika ada command huruf (M, L, Q, Z), hapus sisa koma sebelumnya
        if (formattedD.endsWith(', ')) formattedD = formattedD.slice(0, -2) + ' ';
        formattedD += match[1].toUpperCase() + ' ';
        isX = true; // Reset toggle ke X
      } else if (match[2]) {
        let num = parseFloat(match[2]);
        // Translasi titik ke tengah canvas (0,0)
        num -= isX ? centerX : centerY;
        
        // Memaksa format desimal Alight Motion (misal: 82.0)
        let numStr = num.toFixed(2);
        if (numStr.endsWith('.00')) numStr = numStr.slice(0, -2) + '.0';
        else if (numStr.endsWith('0') && numStr.includes('.')) numStr = numStr.slice(0, -1);
        if (!numStr.includes('.')) numStr += '.0';

        // Tambahkan spasi antar X dan Y, serta koma setelah Y
        if (isX) {
          formattedD += numStr + ' ';
        } else {
          formattedD += numStr + ', ';
        }
        isX = !isX;
      }
    }

    if (formattedD.endsWith(', ')) formattedD = formattedD.slice(0, -2);
    
    // Hapus spasi dan koma sebelum huruf perintah (L, Q, C, Z)
    let finalD = formattedD.replace(/,\s+([A-Za-z])/g, '$1');
    finalD = finalD.replace(/\s+([A-Za-z])/g, '$1');
    finalD = finalD.trim();
    finalD = finalD.replace(/M([^\s])/g, 'M $1'); // M wajib ada spasi

    return finalD;
  }

  function splitSubpaths(d) {
    if (!d) return [];
    const subpaths = [];
    const matches = d.match(/M[^M]+(?:[A-Za-z][^M]*)*/gi) || [];
    if (matches.length > 0) {
      matches.forEach(m => {
        const clean = m.trim();
        if (clean) subpaths.push(clean);
      });
      return subpaths;
    }
    return [d];
  }

  let shapeBlocks = '';
  const cx = (sceneWidth / 2).toFixed(6);
  const cy = (sceneHeight / 2).toFixed(6);

  let shapeCount = 0;
  const limit = Math.max(1, maxShapes);

  for (let pi = 0; pi < pathElements.length && shapeCount < limit; pi++) {
    const path = pathElements[pi];
    const rawD = path.getAttribute('d') || '';
    const fillRaw = path.getAttribute('fill') || (path.style && path.style.fill) || null;
    const fill = formatToAMColor(fillRaw);

    const subpaths = splitSubpaths(rawD);
    for (let si = 0; si < subpaths.length && shapeCount < limit; si++) {
      const sub = subpaths[si];
      if (!sub) continue;

      const translatedSub = normalizePathToAM(sub, sceneWidth, sceneHeight, imgW, imgH);
      if (!translatedSub) continue;
      if (isCanvasLikeBackground(translatedSub)) continue;
      if (isZeroAreaPath(translatedSub)) continue; 

      const safeD = translatedSub.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const shapeId = 101 + shapeCount;
      const label = `Shape ${shapeCount + 1}`;

      shapeBlocks += `  <shape id="${shapeId}" label="${escAttr(label)}" startTime="0" endTime="${totalTime}" fillType="color" mediaFillMode="fill">\n` +
        `    <transform>\n      <location value="${cx},${cy},0.000000" />\n    </transform>\n` +
        `    <fillColor value="${escAttr(fill)}" />\n` +
        `    <path d="${safeD}" />\n` +
        `  </shape>\n`;

      shapeCount++;
    }
  }

  const header = `<?xml version='1.0' encoding='UTF-8' ?><!--\nCreated by Image-to-vektor.xml\nExported: ${new Date().toLocaleString()}\n-->\n`;
  const sceneOpen = `<scene title="${escAttr(title)}" width="${sceneWidth}" height="${sceneHeight}" exportWidth="${exportW}" exportHeight="${exportH}" precompose="dynamicResolution" bgcolor="${escAttr(bgcolor)}" totalTime="${totalTime}" fps="${fps}" modifiedTime="${modifiedTime}" amver="${escAttr(amver)}" ffver="${escAttr(ffver)}" am="${escAttr(amAttr)}" amplatform="android" retime="freeze" retimeAdaptFPS="false">\n`;
  const sceneClose = `</scene>`;

  return header + sceneOpen + shapeBlocks + sceneClose;
}

function formatToAMColor(col) {
  if (!col) return '#ffffffff';
  col = String(col).trim();
  if (col === 'none') return '#00ffffff';
  if (col.startsWith('#')) {
    if (col.length === 7) return ('#ff' + col.slice(1)).toLowerCase();
    if (col.length === 4) return ('#ff' + col[1]+col[1] + col[2]+col[2] + col[3]+col[3]).toLowerCase();
    if (col.length === 9) return col.toLowerCase();
    if (col.length === 8) return ('#' + col.slice(1)).toLowerCase();
  }
  return '#ffffffff';
}

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
  el = document.createElement('div'); el.id = 'amMessage'; el.style.display = 'none';
  (document.querySelector('.container') || document.body).appendChild(el);
  return el;
}

function getOrCreateLoaderEl() {
  let el = document.getElementById('amLoader');
  if (el) return el;
  el = document.createElement('div'); el.id = 'amLoader'; el.style.display = 'none';
  el.textContent = 'Memproses...'; // disederhanakan
  (document.querySelector('.container') || document.body).appendChild(el);
  return el;
                                    }
