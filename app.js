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

    // 1. Jalankan Tracing Gambar ke Data Vektor SVG
    ImageTracer.imageToSVG(imgDataUrl, function (svgString) {
      // 2. Parse SVG untuk mengambil data path/titik
      const parser = new DOMParser();
      const svgDoc = parser.parseFromString(svgString, "image/svg+xml");
      const pathElements = svgDoc.querySelectorAll('path');

      // 3. Generasi Konten XML Alight Motion
      let xmlContent = generateAlightMotionXML(pathElements);

      // 4. Unduh File XML
      downloadXML(xmlContent, "vector_shape_am.xml");
    }, { lprs: 1, qtres: 1, numberofcolors: 4 }); // Opsi detail/presisi tracing
  };

  reader.readAsDataURL(file);
});

// Fungsi Menyusun XML Khas Alight Motion
function generateAlightMotionXML(pathElements) {
  let shapeLayers = '';

  pathElements.forEach((path, index) => {
    const dAttr = path.getAttribute('d');
    const fillColor = path.getAttribute('fill') || '#ffffff';

    // Format hexadecimal color ke format ARGB Alight Motion
    const amColor = formatToAMColor(fillColor);

    shapeLayers += `
    <shape id="${index + 100}" name="Vector Shape ${index + 1}" type="path">
      <property name="fillColor" value="${amColor}" />
      <property name="pathData" value="${dAttr}" />
      <transform>
        <position x="540.0" y="960.0" />
        <scale x="1.0" y="1.0" />
      </transform>
    </shape>`;
  });

  // Skema Wrapper XML Alight Motion Project
  return `<?xml version='1.0' encoding='UTF-8' ?>
<scene width="1080" height="1920" fps="30" backgroundColor="#ff000000">
  ${shapeLayers}
</scene>`;
}

// Helper: Format Warna Hex (#RRGGBB) ke ARGB (#AARRGGBB)
function formatToAMColor(hex) {
  if (hex.startsWith('#') && hex.length === 7) {
    return '#ff' + hex.slice(1);
  }
  return '#ffffffff';
}

// Helper: Unduh File Teks XML
function downloadXML(filename, text) {
  const blob = new Blob([text], { type: 'application/xml' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}
