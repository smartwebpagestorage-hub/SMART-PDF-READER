/**
 * Smart PDF - Merge & Split Tools Engine
 * 100% Client-Side, Zero Upload, Private & Fast
 */

// =========================================================================
// MERGE PDFs LOGIC
// =========================================================================
const MergeState = {
  files: [] // array of { id, file, name, size, arrayBuffer, pageCount }
};

const mergeDom = {
  dropzone: document.getElementById('mergeDropzone'),
  fileInput: document.getElementById('mergeFileInput'),
  addMoreInput: document.getElementById('mergeAddMoreInput'),
  listContainer: document.getElementById('mergeFileListContainer'),
  fileList: document.getElementById('mergeFileList'),
  countText: document.getElementById('mergeFileCountText'),
  btnClearList: document.getElementById('btnClearMergeList'),
  btnExecute: document.getElementById('btnExecuteMerge')
};

async function handleMergeFilesAdded(fileList) {
  if (!fileList || fileList.length === 0) return;

  showToast(`${fileList.length} फाइलें जोड़ी जा रही हैं...`, 'info');

  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) continue;

    try {
      const buffer = await file.arrayBuffer();
      // Fast check page count with pdfjsLib
      let pageCount = '?';
      try {
        const tempDoc = await pdfjsLib.getDocument({ data: buffer.slice(0) }).promise;
        pageCount = tempDoc.numPages;
      } catch (e) {
        // Fallback
      }

      MergeState.files.push({
        id: 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        file: file,
        name: file.name,
        size: formatFileSize(file.size),
        arrayBuffer: buffer,
        pageCount: pageCount
      });
    } catch (err) {
      console.error('File read error:', err);
    }
  }

  renderMergeList();
}

function renderMergeList() {
  const count = MergeState.files.length;
  mergeDom.countText.textContent = `${count} फ़ाइलें चुनी गईं`;

  if (count === 0) {
    mergeDom.listContainer.classList.add('hidden');
    mergeDom.dropzone.classList.remove('hidden');
    return;
  }

  mergeDom.dropzone.classList.add('hidden');
  mergeDom.listContainer.classList.remove('hidden');
  mergeDom.fileList.innerHTML = '';

  MergeState.files.forEach((item, index) => {
    const li = document.createElement('li');
    li.className = 'merge-item';

    li.innerHTML = `
      <div class="merge-item-info">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--primary);flex-shrink:0"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
        <div>
          <div class="merge-item-title" title="${item.name}">${index + 1}. ${item.name}</div>
          <div class="merge-item-meta">${item.size} • ${item.pageCount} पेज</div>
        </div>
      </div>
      <div class="merge-item-actions">
        <button class="icon-btn-sm btn-move-up" title="Move Up" ${index === 0 ? 'disabled' : ''}>▲</button>
        <button class="icon-btn-sm btn-move-down" title="Move Down" ${index === count - 1 ? 'disabled' : ''}>▼</button>
        <button class="icon-btn-sm text-danger btn-remove" title="Remove">&times;</button>
      </div>
    `;

    // Move Up
    li.querySelector('.btn-move-up').addEventListener('click', () => {
      if (index > 0) {
        const temp = MergeState.files[index - 1];
        MergeState.files[index - 1] = MergeState.files[index];
        MergeState.files[index] = temp;
        renderMergeList();
      }
    });

    // Move Down
    li.querySelector('.btn-move-down').addEventListener('click', () => {
      if (index < count - 1) {
        const temp = MergeState.files[index + 1];
        MergeState.files[index + 1] = MergeState.files[index];
        MergeState.files[index] = temp;
        renderMergeList();
      }
    });

    // Remove
    li.querySelector('.btn-remove').addEventListener('click', () => {
      MergeState.files.splice(index, 1);
      renderMergeList();
    });

    mergeDom.fileList.appendChild(li);
  });
}

async function executeMergePdfs() {
  if (MergeState.files.length < 2) {
    showToast('कम से कम 2 PDF फ़ाइलें जोड़ें', 'warning');
    return;
  }

  try {
    showToast('PDF फ़ाइलें जोड़ी जा रही हैं...', 'info');
    mergeDom.btnExecute.disabled = true;
    mergeDom.btnExecute.innerHTML = '<span>प्रोसेस हो रहा है...</span>';

    const { PDFDocument } = PDFLib;
    const mergedDoc = await PDFDocument.create();

    let totalPagesMerged = 0;

    for (const item of MergeState.files) {
      try {
        const srcDoc = await PDFDocument.load(item.arrayBuffer.slice(0), { ignoreEncryption: true });
        const indices = srcDoc.getPageIndices();
        const copiedPages = await mergedDoc.copyPages(srcDoc, indices);
        copiedPages.forEach(p => mergedDoc.addPage(p));
        totalPagesMerged += copiedPages.length;
      } catch (fileErr) {
        console.error(`Error loading file ${item.name}:`, fileErr);
        throw new Error(`फ़ाइल "${item.name}" में समस्या: ${fileErr.message}`);
      }
    }

    const mergedBytes = await mergedDoc.save();
    const blob = new Blob([mergedBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `Merged_Document_${Date.now()}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast(`सफलतापूर्वक Merge हो गया! (${totalPagesMerged} कुल पेज)`, 'success');
  } catch (err) {
    console.error('Merge error:', err);
    showToast(err.message || 'Merge करने में त्रुटि हुई! कृपया दोबारा प्रयास करें।', 'error');
  } finally {
    mergeDom.btnExecute.disabled = false;
    mergeDom.btnExecute.innerHTML = `
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20m-7-7 7 7 7-7"></path></svg>
      <span>अभी Merge करें और डाउनलोड करें</span>
    `;
  }
}

// =========================================================================
// SPLIT & ORGANIZE LOGIC
// =========================================================================
const SplitState = {
  originalBytes: null,
  fileName: '',
  totalPages: 0,
  pageData: [] // array of { pageNum, selected: boolean, rotation: 0, canvas }
};

const splitDom = {
  uploadArea: document.getElementById('splitUploadArea'),
  fileInput: document.getElementById('splitFileInput'),
  managerContainer: document.getElementById('splitManagerContainer'),
  rangeInput: document.getElementById('splitRangeInput'),
  btnApplyRange: document.getElementById('btnApplyRange'),
  btnSelectAll: document.getElementById('btnSelectAllPages'),
  btnDeselectAll: document.getElementById('btnDeselectAllPages'),
  pagesGrid: document.getElementById('splitPagesGrid'),
  countBadge: document.getElementById('selectedPagesCountText'),
  btnRotate: document.getElementById('btnRotateSelected'),
  btnDelete: document.getElementById('btnDeleteSelected'),
  btnExtract: document.getElementById('btnExtractSelected')
};

async function loadPdfForSplit(arrayBuffer, name = 'document.pdf') {
  try {
    showToast('पेज थंबनेल्स लोड हो रहे हैं...', 'info');
    SplitState.originalBytes = arrayBuffer.slice(0);
    SplitState.fileName = name;

    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdfDoc = await loadingTask.promise;
    SplitState.totalPages = pdfDoc.numPages;
    SplitState.pageData = [];

    for (let i = 1; i <= SplitState.totalPages; i++) {
      SplitState.pageData.push({
        pageNum: i,
        selected: false,
        rotation: 0
      });
    }

    splitDom.uploadArea.classList.add('hidden');
    splitDom.managerContainer.classList.remove('hidden');

    renderSplitGrid(pdfDoc);
    updateSplitSelectedCount();
    showToast(`${SplitState.totalPages} पेज सफलतापूर्वक लोड हो गए`, 'success');
  } catch (err) {
    console.error('Split load error:', err);
    showToast('फ़ाइल लोड करने में त्रुटि हुई', 'error');
  }
}

async function renderSplitGrid(pdfDoc) {
  splitDom.pagesGrid.innerHTML = '';

  for (let i = 0; i < SplitState.pageData.length; i++) {
    const pInfo = SplitState.pageData[i];
    const card = document.createElement('div');
    card.className = `grid-page-card ${pInfo.selected ? 'selected' : ''}`;
    card.dataset.page = pInfo.pageNum;

    const canvas = document.createElement('canvas');
    card.appendChild(canvas);

    const badge = document.createElement('div');
    badge.className = 'grid-page-badge';
    badge.innerHTML = `
      <span>पेज ${pInfo.pageNum}</span>
      <span class="rotation-tag">${pInfo.rotation > 0 ? pInfo.rotation + '°' : ''}</span>
      <input type="checkbox" class="page-checkbox" ${pInfo.selected ? 'checked' : ''}>
    `;
    card.appendChild(badge);

    // Toggle click
    card.addEventListener('click', (e) => {
      if (e.target.type !== 'checkbox') {
        pInfo.selected = !pInfo.selected;
      } else {
        pInfo.selected = e.target.checked;
      }
      card.classList.toggle('selected', pInfo.selected);
      card.querySelector('.page-checkbox').checked = pInfo.selected;
      updateSplitSelectedCount();
    });

    splitDom.pagesGrid.appendChild(card);

    // Render thumbnail
    renderSplitPageThumbnail(pdfDoc, pInfo.pageNum, canvas);
  }
}

async function renderSplitPageThumbnail(pdfDoc, pageNum, canvas) {
  try {
    const page = await pdfDoc.getPage(pageNum);
    const vp = page.getViewport({ scale: 0.28 });
    canvas.width = vp.width;
    canvas.height = vp.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
  } catch (e) {}
}

function updateSplitSelectedCount() {
  const selected = SplitState.pageData.filter(p => p.selected).length;
  splitDom.countBadge.textContent = `${selected} / ${SplitState.pageData.length} पेज चुने गए`;
}

/**
 * Parse Range Input (e.g. "1-3, 5, 8-10")
 */
function applyRangeSelection() {
  const input = splitDom.rangeInput.value.trim();
  if (!input) return;

  const selectedSet = new Set();
  const parts = input.split(',');

  parts.forEach(part => {
    part = part.trim();
    if (part.includes('-')) {
      const [start, end] = part.split('-').map(n => parseInt(n.trim()));
      if (!isNaN(start) && !isNaN(end)) {
        for (let i = Math.min(start, end); i <= Math.max(start, end); i++) {
          if (i >= 1 && i <= SplitState.totalPages) selectedSet.add(i);
        }
      }
    } else {
      const n = parseInt(part);
      if (!isNaN(n) && n >= 1 && n <= SplitState.totalPages) selectedSet.add(n);
    }
  });

  SplitState.pageData.forEach(p => {
    p.selected = selectedSet.has(p.pageNum);
  });

  // Update UI cards
  const cards = splitDom.pagesGrid.querySelectorAll('.grid-page-card');
  cards.forEach(c => {
    const num = parseInt(c.dataset.page);
    const isSel = selectedSet.has(num);
    c.classList.toggle('selected', isSel);
    c.querySelector('.page-checkbox').checked = isSel;
  });

  updateSplitSelectedCount();
  showToast(`${selectedSet.size} पेज चुने गए`, 'info');
}

/**
 * Rotate Selected Pages 90 degrees
 */
function rotateSelectedPages() {
  const selectedPages = SplitState.pageData.filter(p => p.selected);
  if (selectedPages.length === 0) {
    showToast('पहले वो पेज चुनें जिन्हें घुमाना (Rotate) है', 'warning');
    return;
  }

  selectedPages.forEach(p => {
    p.rotation = (p.rotation + 90) % 360;
    const card = splitDom.pagesGrid.querySelector(`.grid-page-card[data-page="${p.pageNum}"]`);
    if (card) {
      const tag = card.querySelector('.rotation-tag');
      tag.textContent = p.rotation > 0 ? `${p.rotation}°` : '';
      const canvas = card.querySelector('canvas');
      canvas.style.transform = `rotate(${p.rotation}deg)`;
    }
  });

  showToast(`${selectedPages.length} पेज 90° घुमाए गए`, 'success');
}

/**
 * Extract Selected Pages to a New PDF
 */
async function extractSelectedPages() {
  const selected = SplitState.pageData.filter(p => p.selected);
  if (selected.length === 0) {
    showToast('पहले वो पेज चुनें जिन्हें अलग निकालना (Extract) है', 'warning');
    return;
  }

  try {
    showToast('चुने हुए पेज निकाले जा रहे हैं...', 'info');
    const { PDFDocument, degrees } = PDFLib;
    const srcDoc = await PDFDocument.load(SplitState.originalBytes.slice(0), { ignoreEncryption: true });
    const newDoc = await PDFDocument.create();

    const indices = selected.map(p => p.pageNum - 1);
    const copiedPages = await newDoc.copyPages(srcDoc, indices);

    copiedPages.forEach((page, i) => {
      const rot = selected[i].rotation;
      if (rot > 0) {
        const currentRot = page.getRotation().angle;
        page.setRotation(degrees((currentRot + rot) % 360));
      }
      newDoc.addPage(page);
    });

    const newBytes = await newDoc.save();
    downloadPdfBytes(newBytes, `${SplitState.fileName.replace('.pdf', '')}_Extracted_${selected.length}pages.pdf`);
    showToast(`${selected.length} पेज अलग निकाल कर डाउनलोड किए गए`, 'success');
  } catch (err) {
    console.error('Extract error:', err);
    showToast('Extract करने में त्रुटि हुई', 'error');
  }
}

/**
 * Delete Selected Pages from PDF
 */
async function deleteSelectedPages() {
  const selected = SplitState.pageData.filter(p => p.selected);
  if (selected.length === 0) {
    showToast('पहले वो पेज चुनें जिन्हें डिलीट करना है', 'warning');
    return;
  }

  const remaining = SplitState.pageData.filter(p => !p.selected);
  if (remaining.length === 0) {
    showToast('आप सभी पेज डिलीट नहीं कर सकते! कम से कम 1 पेज बचना चाहिए।', 'warning');
    return;
  }

  try {
    showToast('पेज हटाए जा रहे हैं...', 'info');
    const { PDFDocument, degrees } = PDFLib;
    const srcDoc = await PDFDocument.load(SplitState.originalBytes.slice(0), { ignoreEncryption: true });
    const newDoc = await PDFDocument.create();

    const remainingIndices = remaining.map(p => p.pageNum - 1);
    const copiedPages = await newDoc.copyPages(srcDoc, remainingIndices);

    copiedPages.forEach((page, i) => {
      const rot = remaining[i].rotation;
      if (rot > 0) {
        const currentRot = page.getRotation().angle;
        page.setRotation(degrees((currentRot + rot) % 360));
      }
      newDoc.addPage(page);
    });

    const newBytes = await newDoc.save();
    downloadPdfBytes(newBytes, `${SplitState.fileName.replace('.pdf', '')}_PagesRemoved.pdf`);
    showToast(`${selected.length} पेज हटा दिए गए और नई PDF डाउनलोड हो गई`, 'success');
  } catch (err) {
    console.error('Delete pages error:', err);
    showToast('पेज हटाने में त्रुटि हुई', 'error');
  }
}

function downloadPdfBytes(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Attach Tools Events
function initToolsEvents() {
  // Merge Listeners
  mergeDom.fileInput.addEventListener('change', (e) => handleMergeFilesAdded(e.target.files));
  mergeDom.addMoreInput.addEventListener('change', (e) => handleMergeFilesAdded(e.target.files));

  mergeDom.dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    mergeDom.dropzone.classList.add('dragover');
  });

  mergeDom.dropzone.addEventListener('dragleave', () => {
    mergeDom.dropzone.classList.remove('dragover');
  });

  mergeDom.dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    mergeDom.dropzone.classList.remove('dragover');
    handleMergeFilesAdded(e.dataTransfer.files);
  });

  mergeDom.btnClearList.addEventListener('click', () => {
    MergeState.files = [];
    renderMergeList();
  });

  mergeDom.btnExecute.addEventListener('click', executeMergePdfs);

  // Split Listeners
  splitDom.fileInput.addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (f) {
      const r = new FileReader();
      r.onload = () => loadPdfForSplit(r.result, f.name);
      r.readAsArrayBuffer(f);
    }
  });

  splitDom.btnApplyRange.addEventListener('click', applyRangeSelection);
  splitDom.rangeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') applyRangeSelection();
  });

  splitDom.btnSelectAll.addEventListener('click', () => {
    SplitState.pageData.forEach(p => p.selected = true);
    splitDom.pagesGrid.querySelectorAll('.grid-page-card').forEach(c => {
      c.classList.add('selected');
      c.querySelector('.page-checkbox').checked = true;
    });
    updateSplitSelectedCount();
  });

  splitDom.btnDeselectAll.addEventListener('click', () => {
    SplitState.pageData.forEach(p => p.selected = false);
    splitDom.pagesGrid.querySelectorAll('.grid-page-card').forEach(c => {
      c.classList.remove('selected');
      c.querySelector('.page-checkbox').checked = false;
    });
    updateSplitSelectedCount();
  });

  splitDom.btnRotate.addEventListener('click', rotateSelectedPages);
  splitDom.btnExtract.addEventListener('click', extractSelectedPages);
  splitDom.btnDelete.addEventListener('click', deleteSelectedPages);

  // Pro Tools Listeners
  initProToolsEvents();
}

// =========================================================================
// PRO TOOLS LOGIC (Watermark, Page Numbering, HD Image Export)
// =========================================================================
const ProState = {
  wmBytes: null,
  wmFileName: '',
  numBytes: null,
  numFileName: '',
  imgBytes: null,
  imgFileName: '',
  imgPdfDoc: null
};

function hexToRgb01(hex) {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const num = parseInt(c, 16);
  return {
    r: ((num >> 16) & 255) / 255,
    g: ((num >> 8) & 255) / 255,
    b: (num & 255) / 255
  };
}

async function executeWatermark() {
  if (!ProState.wmBytes) {
    showToast('पहले PDF फ़ाइल चुनें', 'warning');
    return;
  }

  const text = document.getElementById('wmTextInput').value.trim() || 'CONFIDENTIAL';
  const colorHex = document.getElementById('wmColorInput').value;
  const opacity = parseInt(document.getElementById('wmOpacityInput').value) / 100;
  const angleDeg = parseInt(document.getElementById('wmAngleSelect').value) || 0;

  try {
    showToast('वाटरमार्क लगाया जा रहा है...', 'info');
    const { PDFDocument, rgb, degrees, StandardFonts } = PDFLib;
    const doc = await PDFDocument.load(ProState.wmBytes.slice(0), { ignoreEncryption: true });
    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    const pages = doc.getPages();
    const c = hexToRgb01(colorHex);

    pages.forEach(page => {
      const { width, height } = page.getSize();
      const fontSize = Math.min(width, height) / 8;
      const textWidth = font.widthOfTextAtSize(text, fontSize);
      const textHeight = font.heightAtSize(fontSize);

      let x = (width - textWidth) / 2;
      let y = (height - textHeight) / 2;

      page.drawText(text, {
        x: x,
        y: y,
        size: fontSize,
        font: font,
        color: rgb(c.r, c.g, c.b),
        opacity: opacity,
        rotate: degrees(angleDeg)
      });
    });

    const outputBytes = await doc.save();
    downloadPdfBytes(outputBytes, `${ProState.wmFileName.replace('.pdf', '')}_Watermarked.pdf`);
    showToast('वाटरमार्क सफलतापूर्वक लग गया!', 'success');
  } catch (err) {
    console.error('Watermark error:', err);
    showToast('वाटरमार्क लगाने में त्रुटि हुई', 'error');
  }
}

async function executePageNumbers() {
  if (!ProState.numBytes) {
    showToast('पहले PDF फ़ाइल चुनें', 'warning');
    return;
  }

  const pos = document.getElementById('numPosSelect').value;
  const fmt = document.getElementById('numFormatSelect').value;

  try {
    showToast('पेज नंबर डाले जा रहे हैं...', 'info');
    const { PDFDocument, rgb, StandardFonts } = PDFLib;
    const doc = await PDFDocument.load(ProState.numBytes.slice(0), { ignoreEncryption: true });
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const pages = doc.getPages();
    const total = pages.length;

    pages.forEach((page, idx) => {
      const current = idx + 1;
      let label = '';
      if (fmt === 'page-of-total') label = `Page ${current} of ${total}`;
      else if (fmt === 'x-of-y') label = `${current} / ${total}`;
      else label = `${current}`;

      const { width, height } = page.getSize();
      const fontSize = 10;
      const textWidth = font.widthOfTextAtSize(label, fontSize);

      let x = (width - textWidth) / 2;
      let y = 20;

      if (pos === 'bottom-right') {
        x = width - textWidth - 30;
        y = 20;
      } else if (pos === 'top-right') {
        x = width - textWidth - 30;
        y = height - 25;
      }

      page.drawText(label, {
        x: x,
        y: y,
        size: fontSize,
        font: font,
        color: rgb(0.2, 0.2, 0.2)
      });
    });

    const outputBytes = await doc.save();
    downloadPdfBytes(outputBytes, `${ProState.numFileName.replace('.pdf', '')}_Numbered.pdf`);
    showToast(`${total} पेजों पर नंबर सफलतापूर्वक डाल दिए गए!`, 'success');
  } catch (err) {
    console.error('Page numbers error:', err);
    showToast('पेज नंबर डालने में त्रुटि हुई', 'error');
  }
}

async function handleImgExportFileSelect(file) {
  if (!file) return;
  try {
    showToast('PDF लोड हो रहा है...', 'info');
    ProState.imgBytes = await file.arrayBuffer();
    ProState.imgFileName = file.name;

    const loadingTask = pdfjsLib.getDocument({ data: ProState.imgBytes.slice(0) });
    ProState.imgPdfDoc = await loadingTask.promise;

    const select = document.getElementById('imgPageSelect');
    select.innerHTML = '';

    for (let i = 1; i <= ProState.imgPdfDoc.numPages; i++) {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = `पेज ${i} (Page ${i} of ${ProState.imgPdfDoc.numPages})`;
      select.appendChild(opt);
    }

    document.getElementById('imgExportControls').classList.remove('hidden');
    showToast('पेज चुनें और फोटो डाउनलोड करें', 'success');
  } catch (err) {
    console.error('Image export load error:', err);
    showToast('PDF लोड करने में त्रुटि हुई', 'error');
  }
}

async function executePageToImage() {
  if (!ProState.imgPdfDoc) {
    showToast('पहले PDF लोड करें', 'warning');
    return;
  }

  const pageNum = parseInt(document.getElementById('imgPageSelect').value) || 1;
  try {
    showToast(`पेज ${pageNum} की HD फोटो बनाई जा रही है...`, 'info');
    const page = await ProState.imgPdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 }); // 2x High Resolution

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');

    await page.render({ canvasContext: ctx, viewport: viewport }).promise;

    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${ProState.imgFileName.replace('.pdf', '')}_Page_${pageNum}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(`पेज ${pageNum} की HD फोटो डाउनलोड हो गई!`, 'success');
    }, 'image/png');
  } catch (err) {
    console.error('Page to image error:', err);
    showToast('फोटो बनाने में त्रुटि हुई', 'error');
  }
}

function initProToolsEvents() {
  // Watermark File Picker & Slider
  const wmFileInput = document.getElementById('wmFileInput');
  if (wmFileInput) {
    wmFileInput.addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (f) {
        ProState.wmBytes = await f.arrayBuffer();
        ProState.wmFileName = f.name;
        showToast(`फ़ाइल चुनी गई: ${f.name}`, 'info');
      }
    });
  }

  const wmOpacity = document.getElementById('wmOpacityInput');
  const wmOpacityVal = document.getElementById('wmOpacityVal');
  if (wmOpacity && wmOpacityVal) {
    wmOpacity.addEventListener('input', (e) => {
      wmOpacityVal.textContent = e.target.value + '%';
    });
  }

  const btnApplyWm = document.getElementById('btnApplyWatermark');
  if (btnApplyWm) btnApplyWm.addEventListener('click', executeWatermark);

  // Page Numbers File Picker & Button
  const numFileInput = document.getElementById('numFileInput');
  if (numFileInput) {
    numFileInput.addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (f) {
        ProState.numBytes = await f.arrayBuffer();
        ProState.numFileName = f.name;
        showToast(`फ़ाइल चुनी गई: ${f.name}`, 'info');
      }
    });
  }

  const btnApplyNums = document.getElementById('btnApplyPageNumbers');
  if (btnApplyNums) btnApplyNums.addEventListener('click', executePageNumbers);

  // PDF to Image
  const imgFileInput = document.getElementById('imgExportFileInput');
  if (imgFileInput) {
    imgFileInput.addEventListener('change', (e) => {
      handleImgExportFileSelect(e.target.files[0]);
    });
  }

  const btnExportImg = document.getElementById('btnExportPageToImage');
  if (btnExportImg) btnExportImg.addEventListener('click', executePageToImage);
}

// Global exports
window.initToolsEvents = initToolsEvents;
