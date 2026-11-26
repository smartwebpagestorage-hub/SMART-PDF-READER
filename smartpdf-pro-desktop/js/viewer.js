/**
 * Smart PDF - Core Viewer Engine (PDF.js Integration & Search)
 * Supports Continuous Vertical Scrolling, Single-Page View,
 * Pinch-to-Zoom, Deep Text Selection Popup, and Android Intent Bridge.
 */

// Configure PDF.js Worker using local offline file
if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';
}

const ViewerState = {
  pdfDoc: null,
  currentPage: 1,
  totalPages: 0,
  scale: 1.0,
  rotation: 0,
  pdfBytes: null,
  fileName: 'document.pdf',
  isRendering: false,
  pendingPage: null,
  
  // Continuous scroll state
  scrollMode: 'continuous', // 'continuous' (default) | 'single'
  renderedPages: new Set(),
  pageViewports: {},
  pageObserver: null,
  
  // Search state
  searchQuery: '',
  searchResults: [], // array of { pageNum, itemIndex, text, rects }
  currentSearchIndex: -1,
  isSearching: false
};

const dom = {
  uploadSection: document.getElementById('readerUploadSection'),
  viewerContainer: document.getElementById('viewerContainer'),
  fileInput: document.getElementById('pdfFileInput'),
  fileInputToolbar: document.getElementById('pdfFileInputToolbar'),
  btnLoadDemoPdf: document.getElementById('btnLoadDemoPdf'),
  docFileName: document.getElementById('docFileName'),
  
  // Controls
  btnPrevPage: document.getElementById('btnPrevPage'),
  btnNextPage: document.getElementById('btnNextPage'),
  pageNumberInput: document.getElementById('pageNumberInput'),
  pageCount: document.getElementById('pageCount'),
  btnToggleScrollMode: document.getElementById('btnToggleScrollMode'),
  iconContinuous: document.getElementById('iconContinuous'),
  iconSinglePage: document.getElementById('iconSinglePage'),
  
  btnZoomIn: document.getElementById('btnZoomIn'),
  btnZoomOut: document.getElementById('btnZoomOut'),
  btnZoomReset: document.getElementById('btnZoomReset'),
  btnFitWidth: document.getElementById('btnFitWidth'),
  
  btnToggleSidebar: document.getElementById('btnToggleSidebar'),
  sidebar: document.getElementById('sidebarThumbnails'),
  thumbnailList: document.getElementById('thumbnailList'),
  
  // Viewport & Containers
  viewport: document.getElementById('pdfViewport'),
  pagesContainer: document.getElementById('pagesContainer'),
  pageContainer: document.getElementById('pageContainer'),
  renderCanvas: document.getElementById('pdfRenderCanvas'),
  singleTextLayer: document.getElementById('singleTextLayer'),
  highlightLayer: document.getElementById('searchHighlightLayer'),
  
  // Text Selection Popup
  textSelectionPopup: document.getElementById('textSelectionPopup'),
  btnSelCopy: document.getElementById('btnSelCopy'),
  btnSelHighlight: document.getElementById('btnSelHighlight'),
  btnSelUnderline: document.getElementById('btnSelUnderline'),
  btnSelSpeak: document.getElementById('btnSelSpeak'),
  btnSelAddFormatted: document.getElementById('btnSelAddFormatted'),
  
  // Search DOM
  btnToggleSearch: document.getElementById('btnToggleSearch'),
  searchBar: document.getElementById('searchBar'),
  searchInput: document.getElementById('searchInput'),
  btnClearSearch: document.getElementById('btnClearSearch'),
  btnSearchPrev: document.getElementById('btnSearchPrev'),
  btnSearchNext: document.getElementById('btnSearchNext'),
  btnCloseSearch: document.getElementById('btnCloseSearch'),
  searchMatchCount: document.getElementById('searchMatchCount'),

  // Floating Controls DOM
  floatingViewerBar: document.getElementById('floatingViewerBar'),
  floatBtnPrev: document.getElementById('floatBtnPrev'),
  floatBtnNext: document.getElementById('floatBtnNext'),
  floatCurrentPage: document.getElementById('floatCurrentPage'),
  floatTotalPages: document.getElementById('floatTotalPages'),
  floatBtnScrollMode: document.getElementById('floatBtnScrollMode'),
  floatBtnZoomIn: document.getElementById('floatBtnZoomIn'),
  floatBtnZoomOut: document.getElementById('floatBtnZoomOut'),
  floatBtnZoomReset: document.getElementById('floatBtnZoomReset'),
  floatBtnFitWidth: document.getElementById('floatBtnFitWidth'),
  liveZoomBadge: document.getElementById('liveZoomBadge'),
};

/**
 * Load PDF from ArrayBuffer or Uint8Array
 */
async function loadPdfDocument(arrayBuffer, fileName = 'document.pdf') {
  try {
    showToast('PDF लोड हो रहा है...', 'info');
    ViewerState.pdfBytes = arrayBuffer.slice(0);
    ViewerState.fileName = fileName;
    dom.docFileName.textContent = fileName;

    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    ViewerState.pdfDoc = await loadingTask.promise;
    ViewerState.totalPages = ViewerState.pdfDoc.numPages;
    ViewerState.currentPage = 1;

    dom.pageCount.textContent = ViewerState.totalPages;
    dom.pageNumberInput.max = ViewerState.totalPages;
    dom.pageNumberInput.value = 1;

    // Show Viewer, Hide Uploader
    dom.uploadSection.classList.add('hidden');
    dom.viewerContainer.classList.remove('hidden');
    if (dom.floatingViewerBar) dom.floatingViewerBar.classList.remove('hidden');
    if (dom.floatTotalPages) dom.floatTotalPages.textContent = ViewerState.totalPages;
    if (dom.floatCurrentPage) dom.floatCurrentPage.textContent = 1;

    // Calculate initial scale to fit width nicely
    calculateOptimalFitWidth();

    // Render in continuous or single-page mode
    if (ViewerState.scrollMode === 'continuous') {
      await renderContinuousPages();
    } else {
      await renderCurrentPage();
    }

    // Render Thumbnails in background
    renderThumbnails();

    showToast(`PDF सफलतापूर्वक खुल गया (${ViewerState.totalPages} पेज)`, 'success');
  } catch (err) {
    console.error('Error loading PDF:', err);
    showToast('PDF खोलने में त्रुटि हुई! कृपया दोबारा प्रयास करें।', 'error');
  }
}

/**
 * Calculate scale to fit viewport width
 */
function calculateOptimalFitWidth() {
  if (!dom.viewport || !dom.viewport.clientWidth) {
    ViewerState.scale = 1.15;
    return;
  }
  const availableWidth = dom.viewport.clientWidth - 40; // padding
  ViewerState.scale = Math.min(Math.max(availableWidth / 620, 0.70), 1.6);
  updateZoomDisplay();
}

/**
 * =========================================================================
 * CONTINUOUS VERTICAL SCROLLING SYSTEM (ऊपर से नीचे सतत स्क्रॉल)
 * =========================================================================
 */
async function renderContinuousPages() {
  if (!ViewerState.pdfDoc) return;
  if (!dom.pagesContainer) return;
  if (window.commitInlineText) window.commitInlineText();

  // Show continuous pages container, hide single page container
  dom.pagesContainer.style.display = 'flex';
  if (dom.pageContainer) dom.pageContainer.style.display = 'none';

  dom.pagesContainer.innerHTML = '';
  ViewerState.renderedPages.clear();

  // Obtain page 1 to calculate base aspect ratio
  const firstPage = await ViewerState.pdfDoc.getPage(1);
  const baseViewport = firstPage.getViewport({ scale: ViewerState.scale });
  const baseW = Math.floor(baseViewport.width);
  const baseH = Math.floor(baseViewport.height);

  for (let p = 1; p <= ViewerState.totalPages; p++) {
    const card = document.createElement('div');
    card.className = `pdf-page-card ${p === ViewerState.currentPage ? 'active-page' : ''}`;
    card.id = `page-wrapper-${p}`;
    card.dataset.pageNumber = p;
    card.style.width = baseW + 'px';
    card.style.minHeight = baseH + 'px';

    const wrapper = document.createElement('div');
    wrapper.className = 'canvas-wrapper';
    wrapper.style.width = baseW + 'px';
    wrapper.style.height = baseH + 'px';

    const canvas = document.createElement('canvas');
    canvas.className = 'pdf-page-canvas';
    canvas.id = `page-canvas-${p}`;

    const textLayer = document.createElement('div');
    textLayer.className = 'pdf-text-layer textLayer';
    textLayer.id = `page-text-layer-${p}`;

    const annotCanvas = document.createElement('canvas');
    annotCanvas.className = 'pdf-annot-canvas annotation-overlay';
    annotCanvas.id = `page-annot-canvas-${p}`;

    const highlightLayer = document.createElement('div');
    highlightLayer.className = 'highlight-layer';
    highlightLayer.id = `page-highlight-layer-${p}`;

    const tag = document.createElement('div');
    tag.className = 'page-number-tag';
    tag.textContent = `${p} / ${ViewerState.totalPages}`;

    wrapper.appendChild(canvas);
    wrapper.appendChild(textLayer);
    wrapper.appendChild(annotCanvas);
    wrapper.appendChild(highlightLayer);

    card.appendChild(wrapper);
    card.appendChild(tag);
    dom.pagesContainer.appendChild(card);

    // Attach drawing listeners to this page's annotation canvas
    if (window.attachAnnotationCanvasToPage) {
      window.attachAnnotationCanvasToPage(p, annotCanvas);
    }
  }

  // Setup Lazy-rendering with IntersectionObserver
  setupContinuousObserver();
}

/**
 * Setup IntersectionObserver for continuous page lazy-rendering
 */
function setupContinuousObserver() {
  if (ViewerState.pageObserver) {
    ViewerState.pageObserver.disconnect();
  }

  const options = {
    root: dom.viewport,
    rootMargin: '400px 0px 400px 0px',
    threshold: [0.01, 0.25, 0.5]
  };

  ViewerState.pageObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const pageNum = parseInt(entry.target.dataset.pageNumber, 10);
        if (!ViewerState.renderedPages.has(pageNum)) {
          renderSingleContinuousPage(pageNum);
        }
      }
    });
  }, options);

  for (let p = 1; p <= ViewerState.totalPages; p++) {
    const el = document.getElementById(`page-wrapper-${p}`);
    if (el) ViewerState.pageObserver.observe(el);
  }
}

/**
 * Render an individual page inside continuous view
 */
async function renderSingleContinuousPage(pageNum) {
  if (ViewerState.renderedPages.has(pageNum) || !ViewerState.pdfDoc) return;
  ViewerState.renderedPages.add(pageNum);

  try {
    const page = await ViewerState.pdfDoc.getPage(pageNum);
    const pixelRatio = window.devicePixelRatio || 1;
    const viewport = page.getViewport({ scale: ViewerState.scale });
    ViewerState.pageViewports[pageNum] = viewport;

    const card = document.getElementById(`page-wrapper-${pageNum}`);
    const canvas = document.getElementById(`page-canvas-${pageNum}`);
    const textLayer = document.getElementById(`page-text-layer-${pageNum}`);
    const annotCanvas = document.getElementById(`page-annot-canvas-${pageNum}`);
    const wrapper = canvas ? canvas.parentElement : null;

    if (!canvas || !wrapper) return;

    const cssW = Math.floor(viewport.width) + 'px';
    const cssH = Math.floor(viewport.height) + 'px';

    card.style.width = cssW;
    card.style.minHeight = cssH;
    wrapper.style.width = cssW;
    wrapper.style.height = cssH;

    canvas.width = Math.floor(viewport.width * pixelRatio);
    canvas.height = Math.floor(viewport.height * pixelRatio);
    canvas.style.width = cssW;
    canvas.style.height = cssH;

    const ctx = canvas.getContext('2d');
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    // Render PDF page canvas
    await page.render({ canvasContext: ctx, viewport }).promise;

    // Render Text Layer for text selection & search
    if (textLayer) {
      textLayer.innerHTML = '';
      textLayer.style.width = cssW;
      textLayer.style.height = cssH;

      const textContent = await page.getTextContent();
      if (window.pdfjsLib && window.pdfjsLib.renderTextLayer) {
        window.pdfjsLib.renderTextLayer({
          textContent: textContent,
          textContentSource: textContent,
          container: textLayer,
          viewport: viewport,
          textDivs: []
        });
      }
    }

    // Setup Annotation Canvas overlay
    if (annotCanvas) {
      annotCanvas.width = viewport.width;
      annotCanvas.height = viewport.height;
      annotCanvas.style.width = cssW;
      annotCanvas.style.height = cssH;

      if (window.restorePageAnnotationsToCanvas) {
        window.restorePageAnnotationsToCanvas(pageNum, annotCanvas);
      }
    }

    // Render search highlights on this page if search is active
    renderSearchHighlightsOnPage(pageNum, viewport);

  } catch (err) {
    console.error(`Error rendering continuous page ${pageNum}:`, err);
    ViewerState.renderedPages.delete(pageNum);
  }
}

/**
 * Detect which page is currently most visible in viewport during vertical scroll
 */
function syncActivePageFromScroll() {
  if (ViewerState.scrollMode !== 'continuous' || !ViewerState.pdfDoc) return;
  const viewportRect = dom.viewport.getBoundingClientRect();
  const targetY = viewportRect.top + viewportRect.height * 0.35;

  let bestPage = ViewerState.currentPage;
  let minDistance = Infinity;

  for (let p = 1; p <= ViewerState.totalPages; p++) {
    const card = document.getElementById(`page-wrapper-${p}`);
    if (!card) continue;
    const rect = card.getBoundingClientRect();
    if (rect.bottom > viewportRect.top && rect.top < viewportRect.bottom) {
      const dist = Math.abs(rect.top - targetY);
      if (dist < minDistance) {
        minDistance = dist;
        bestPage = p;
      }
    }
  }

  if (bestPage !== ViewerState.currentPage) {
    ViewerState.currentPage = bestPage;
    dom.pageNumberInput.value = bestPage;
    if (dom.floatCurrentPage) dom.floatCurrentPage.textContent = bestPage;
    updateActiveThumbnail(bestPage);

    document.querySelectorAll('.pdf-page-card').forEach(c => {
      c.classList.toggle('active-page', parseInt(c.dataset.pageNumber, 10) === bestPage);
    });
  }
}

/**
 * Render single page (fallback or single-page mode)
 */
async function renderCurrentPage() {
  if (!ViewerState.pdfDoc) return;
  if (window.commitInlineText) window.commitInlineText();
  if (ViewerState.isRendering) {
    ViewerState.pendingPage = ViewerState.currentPage;
    return;
  }

  // If in single page mode, show #pageContainer and hide #pagesContainer
  if (ViewerState.scrollMode === 'single') {
    dom.pagesContainer.style.display = 'none';
    if (dom.pageContainer) dom.pageContainer.style.display = 'block';
  }

  ViewerState.isRendering = true;
  const pageNum = ViewerState.currentPage;
  dom.pageNumberInput.value = pageNum;
  if (dom.floatCurrentPage) dom.floatCurrentPage.textContent = pageNum;

  try {
    const page = await ViewerState.pdfDoc.getPage(pageNum);
    const pixelRatio = window.devicePixelRatio || 1;
    const viewport = page.getViewport({ scale: ViewerState.scale });

    // Setup Canvas dimensions
    const canvas = dom.renderCanvas;
    const ctx = canvas.getContext('2d');

    canvas.width = Math.floor(viewport.width * pixelRatio);
    canvas.height = Math.floor(viewport.height * pixelRatio);
    canvas.style.width = Math.floor(viewport.width) + 'px';
    canvas.style.height = Math.floor(viewport.height) + 'px';

    if (dom.pageContainer) {
      dom.pageContainer.style.width = Math.floor(viewport.width) + 'px';
      dom.pageContainer.style.height = Math.floor(viewport.height) + 'px';
    }

    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    await page.render({ canvasContext: ctx, viewport }).promise;

    // Render text layer for single page
    if (dom.singleTextLayer) {
      dom.singleTextLayer.innerHTML = '';
      dom.singleTextLayer.style.width = Math.floor(viewport.width) + 'px';
      dom.singleTextLayer.style.height = Math.floor(viewport.height) + 'px';
      const textContent = await page.getTextContent();
      if (window.pdfjsLib && window.pdfjsLib.renderTextLayer) {
        window.pdfjsLib.renderTextLayer({
          textContent: textContent,
          textContentSource: textContent,
          container: dom.singleTextLayer,
          viewport: viewport,
          textDivs: []
        });
      }
    }

    // Sync Annotation Canvas overlay dimensions
    if (window.syncAnnotationCanvasSize) {
      window.syncAnnotationCanvasSize(viewport.width, viewport.height);
    }

    // Highlight search matches on this page
    renderSearchHighlightsOnPage(pageNum, viewport);

    // Update active thumbnail
    updateActiveThumbnail(pageNum);

  } catch (err) {
    console.error('Render error:', err);
  } finally {
    ViewerState.isRendering = false;
    if (ViewerState.pendingPage !== null) {
      const nextP = ViewerState.pendingPage;
      ViewerState.pendingPage = null;
      goToPage(nextP);
    }
  }
}

/**
 * Page Navigation
 */
function goToPage(pageNum) {
  if (!ViewerState.pdfDoc) return;
  const target = Math.max(1, Math.min(pageNum, ViewerState.totalPages));
  ViewerState.currentPage = target;
  dom.pageNumberInput.value = target;
  if (dom.floatCurrentPage) dom.floatCurrentPage.textContent = target;
  updateActiveThumbnail(target);

  if (ViewerState.scrollMode === 'continuous') {
    const card = document.getElementById(`page-wrapper-${target}`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  } else {
    // Save annotations of current page before leaving in single-page mode
    if (window.saveCurrentPageAnnotations) {
      window.saveCurrentPageAnnotations();
    }
    renderCurrentPage().then(() => {
      if (window.restorePageAnnotations) {
        window.restorePageAnnotations(ViewerState.currentPage);
      }
    });
  }
}

function prevPage() {
  if (ViewerState.currentPage > 1) {
    goToPage(ViewerState.currentPage - 1);
  }
}

function nextPage() {
  if (ViewerState.currentPage < ViewerState.totalPages) {
    goToPage(ViewerState.currentPage + 1);
  }
}

/**
 * Toggle Scroll Mode (Continuous vs Single Page)
 */
function toggleScrollMode() {
  if (ViewerState.scrollMode === 'continuous') {
    ViewerState.scrollMode = 'single';
    if (dom.iconContinuous) dom.iconContinuous.classList.add('hidden');
    if (dom.iconSinglePage) dom.iconSinglePage.classList.remove('hidden');
    showToast('मोड: एकल पेज (Single Page)', 'info');
    renderCurrentPage();
  } else {
    ViewerState.scrollMode = 'continuous';
    if (dom.iconContinuous) dom.iconContinuous.classList.remove('hidden');
    if (dom.iconSinglePage) dom.iconSinglePage.classList.add('hidden');
    showToast('मोड: सतत स्क्रॉल (Continuous Vertical Scroll)', 'info');
    renderContinuousPages().then(() => {
      goToPage(ViewerState.currentPage);
    });
  }
}

/**
 * Zoom Management
 */
function updateZoomDisplay() {
  const percentText = `${Math.round(ViewerState.scale * 100)}%`;
  if (dom.btnZoomReset) dom.btnZoomReset.textContent = percentText;
  if (dom.floatBtnZoomReset) dom.floatBtnZoomReset.textContent = percentText;
}

function onZoomUpdated() {
  updateZoomDisplay();
  if (ViewerState.scrollMode === 'continuous') {
    renderContinuousPages().then(() => {
      goToPage(ViewerState.currentPage);
    });
  } else {
    renderCurrentPage();
  }
}

function zoomIn() {
  if (ViewerState.scale < 4.0) {
    ViewerState.scale = Math.min(4.0, ViewerState.scale + 0.15);
    onZoomUpdated();
  }
}

function zoomOut() {
  if (ViewerState.scale > 0.4) {
    ViewerState.scale = Math.max(0.4, ViewerState.scale - 0.15);
    onZoomUpdated();
  }
}

function resetZoom() {
  ViewerState.scale = 1.0;
  onZoomUpdated();
}

function fitToWidth() {
  calculateOptimalFitWidth();
  onZoomUpdated();
}

/**
 * =========================================================================
 * TEXT SELECTION FLOATING POPUP SYSTEM
 * =========================================================================
 */
let selDebounce = null;
function handleTextSelectionChange() {
  clearTimeout(selDebounce);
  selDebounce = setTimeout(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      if (dom.textSelectionPopup && !dom.textSelectionPopup.contains(document.activeElement)) {
        dom.textSelectionPopup.classList.add('hidden');
      }
      return;
    }

    const text = sel.toString().trim();
    if (!text) {
      if (dom.textSelectionPopup) dom.textSelectionPopup.classList.add('hidden');
      return;
    }

    const range = sel.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const textLayer = container.nodeType === 1 ? container.closest('.pdf-text-layer') : (container.parentElement ? container.parentElement.closest('.pdf-text-layer') : null);
    if (!textLayer) {
      if (dom.textSelectionPopup) dom.textSelectionPopup.classList.add('hidden');
      return;
    }

    const pageCard = textLayer.closest('.pdf-page-card') || dom.pageContainer;
    const pageNum = pageCard ? parseInt(pageCard.dataset.pageNumber || ViewerState.currentPage, 10) : ViewerState.currentPage;

    const rects = range.getClientRects();
    if (!rects || rects.length === 0) return;

    const firstRect = rects[0];
    const vpRect = dom.viewport.getBoundingClientRect();
    const popupLeft = Math.max(10, Math.min(vpRect.width - 280, firstRect.left - vpRect.left + dom.viewport.scrollLeft));
    const popupTop = Math.max(10, firstRect.top - vpRect.top + dom.viewport.scrollTop - 44);

    const popup = dom.textSelectionPopup;
    if (popup) {
      popup.style.left = `${popupLeft}px`;
      popup.style.top = `${popupTop}px`;
      popup.classList.remove('hidden');

      if (window.AnnotState) {
        window.AnnotState.selectedText = text;
        window.AnnotState.selectedRange = range;
        window.AnnotState.selectedPage = pageNum;
      }
    }
  }, 100);
}

/**
 * Render Sidebar Thumbnails
 */
async function renderThumbnails() {
  dom.thumbnailList.innerHTML = '';
  if (!ViewerState.pdfDoc) return;

  const count = ViewerState.totalPages;
  for (let i = 1; i <= count; i++) {
    const item = document.createElement('div');
    item.className = `thumbnail-item ${i === ViewerState.currentPage ? 'active' : ''}`;
    item.dataset.page = i;

    const canvas = document.createElement('canvas');
    item.appendChild(canvas);

    const span = document.createElement('span');
    span.textContent = `Page ${i}`;
    item.appendChild(span);

    item.addEventListener('click', () => goToPage(i));
    dom.thumbnailList.appendChild(item);

    renderSingleThumbnail(i, canvas);
  }
}

async function renderSingleThumbnail(pageNum, canvas) {
  try {
    const page = await ViewerState.pdfDoc.getPage(pageNum);
    const vp = page.getViewport({ scale: 0.25 });
    canvas.width = vp.width;
    canvas.height = vp.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
  } catch (e) {
    // Ignore thumbnail errors
  }
}

function updateActiveThumbnail(pageNum) {
  const items = dom.thumbnailList.querySelectorAll('.thumbnail-item');
  items.forEach(el => {
    if (parseInt(el.dataset.page) === pageNum) {
      el.classList.add('active');
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      el.classList.remove('active');
    }
  });
}

/**
 * =========================================================================
 * ADVANCED SEARCH ENGINE
 * =========================================================================
 */
async function executePdfSearch(query) {
  if (!ViewerState.pdfDoc || !query || !query.trim()) {
    clearSearch();
    return;
  }

  const q = query.trim().toLowerCase();
  ViewerState.searchQuery = q;
  ViewerState.searchResults = [];
  ViewerState.currentSearchIndex = -1;
  ViewerState.isSearching = true;

  dom.searchMatchCount.textContent = 'खोज रहे हैं...';

  const totalPages = ViewerState.pdfDoc.numPages;

  for (let p = 1; p <= totalPages; p++) {
    const page = await ViewerState.pdfDoc.getPage(p);
    const textContent = await page.getTextContent();

    textContent.items.forEach((item, itemIdx) => {
      const text = item.str.toLowerCase();
      let pos = text.indexOf(q);

      while (pos !== -1) {
        ViewerState.searchResults.push({
          pageNum: p,
          itemIndex: itemIdx,
          str: item.str,
          transform: item.transform,
          width: item.width,
          height: item.height,
          matchPos: pos,
          matchLen: q.length
        });
        pos = text.indexOf(q, pos + q.length);
      }
    });
  }

  const count = ViewerState.searchResults.length;
  if (count === 0) {
    dom.searchMatchCount.textContent = '0 / 0';
    showToast('कोई मेल नहीं मिला (No matches found)', 'warning');
    clearHighlights();
  } else {
    ViewerState.currentSearchIndex = 0;
    updateSearchMatchDisplay();
    jumpToCurrentSearchMatch();
  }
}

function updateSearchMatchDisplay() {
  const total = ViewerState.searchResults.length;
  const current = ViewerState.currentSearchIndex + 1;
  dom.searchMatchCount.textContent = `${current} / ${total}`;
}

function jumpToCurrentSearchMatch() {
  if (ViewerState.currentSearchIndex < 0 || ViewerState.searchResults.length === 0) return;
  const match = ViewerState.searchResults[ViewerState.currentSearchIndex];
  
  if (ViewerState.currentPage !== match.pageNum) {
    goToPage(match.pageNum);
  } else {
    renderSearchHighlightsOnPage(match.pageNum);
  }
}

function searchNext() {
  if (ViewerState.searchResults.length === 0) return;
  ViewerState.currentSearchIndex = (ViewerState.currentSearchIndex + 1) % ViewerState.searchResults.length;
  updateSearchMatchDisplay();
  jumpToCurrentSearchMatch();
}

function searchPrev() {
  if (ViewerState.searchResults.length === 0) return;
  ViewerState.currentSearchIndex = (ViewerState.currentSearchIndex - 1 + ViewerState.searchResults.length) % ViewerState.searchResults.length;
  updateSearchMatchDisplay();
  jumpToCurrentSearchMatch();
}

function clearHighlights() {
  if (dom.highlightLayer) dom.highlightLayer.innerHTML = '';
  document.querySelectorAll('.highlight-layer').forEach(l => l.innerHTML = '');
}

function clearSearch() {
  ViewerState.searchQuery = '';
  ViewerState.searchResults = [];
  ViewerState.currentSearchIndex = -1;
  dom.searchInput.value = '';
  dom.searchMatchCount.textContent = '0 / 0';
  clearHighlights();
}

async function renderSearchHighlightsOnPage(pageNum, customViewport = null) {
  const targetLayer = (ViewerState.scrollMode === 'continuous')
    ? document.getElementById(`page-highlight-layer-${pageNum}`)
    : dom.highlightLayer;

  if (!targetLayer) return;
  targetLayer.innerHTML = '';
  if (!ViewerState.searchQuery || ViewerState.searchResults.length === 0) return;

  const pageMatches = ViewerState.searchResults.filter(m => m.pageNum === pageNum);
  if (pageMatches.length === 0) return;

  const page = await ViewerState.pdfDoc.getPage(pageNum);
  const viewport = customViewport || page.getViewport({ scale: ViewerState.scale });

  pageMatches.forEach((match) => {
    const tx = match.transform;
    const pdfX = tx[4];
    const pdfY = tx[5];
    const pdfW = match.width;
    const pdfH = match.height || Math.abs(tx[0]);

    const rect = viewport.convertToViewportRectangle([pdfX, pdfY, pdfX + pdfW, pdfY + pdfH]);
    const left = Math.min(rect[0], rect[2]);
    const top = Math.min(rect[1], rect[3]);
    const width = Math.abs(rect[2] - rect[0]);
    const height = Math.abs(rect[3] - rect[1]);

    const highlight = document.createElement('div');
    highlight.className = 'search-highlight';
    
    const isCurrent = ViewerState.searchResults[ViewerState.currentSearchIndex] === match;
    if (isCurrent) {
      highlight.classList.add('active-match');
      highlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    highlight.style.left = `${left}px`;
    highlight.style.top = `${top}px`;
    highlight.style.width = `${width}px`;
    highlight.style.height = `${height}px`;

    targetLayer.appendChild(highlight);
  });
}

/**
 * Generate in-memory Sample Demo PDF for instant testing
 */
async function generateSamplePdf() {
  try {
    showToast('डेमो PDF तैयार किया जा रहा है...', 'info');
    const { PDFDocument, rgb, StandardFonts } = PDFLib;
    const pdfDoc = await PDFDocument.create();

    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const bodyFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Page 1
    const page1 = pdfDoc.addPage([600, 750]);
    page1.drawText('Welcome to Smart PDF Pro', {
      x: 50, y: 680, size: 22, font: font, color: rgb(0.14, 0.38, 0.92)
    });
    page1.drawText('100% Free, Private, Offline, and Zero Advertisements', {
      x: 50, y: 645, size: 14, font: font, color: rgb(0.2, 0.7, 0.3)
    });
    page1.drawText('Continuous vertical scrolling lets you scroll naturally up and down:', {
      x: 50, y: 600, size: 12, font: bodyFont, color: rgb(0.1, 0.1, 0.1)
    });
    page1.drawText('1. Scroll smoothly through all pages without clicking next page.', {
      x: 60, y: 570, size: 11, font: bodyFont, color: rgb(0.2, 0.2, 0.2)
    });
    page1.drawText('2. Select text on this PDF to Copy, Highlight, Underline, or Read Aloud.', {
      x: 60, y: 545, size: 11, font: bodyFont, color: rgb(0.2, 0.2, 0.2)
    });
    page1.drawText('3. Use the Rich Text tool with custom fonts, sizes, bold, italic & colors.', {
      x: 60, y: 520, size: 11, font: bodyFont, color: rgb(0.2, 0.2, 0.2)
    });

    // Page 2
    const page2 = pdfDoc.addPage([600, 750]);
    page2.drawText('Page 2: Rich Text & Selection Demonstration', {
      x: 50, y: 680, size: 18, font: font, color: rgb(0.14, 0.38, 0.92)
    });
    page2.drawText('Key features designed for Desktop & Android:', {
      x: 50, y: 630, size: 13, font: font, color: rgb(0.1, 0.1, 0.1)
    });
    const sampleItems = [
      'Continuous vertical scrolling across all pages',
      'Text selection popup with Copy, Highlight, Underline, and Voice Speech',
      'Rich text editor with Bold, Italic, Underline, Stepper, and Devanagari Hindi font',
      '100% Offline & Private - Ready for Google Play Store'
    ];
    sampleItems.forEach((item, idx) => {
      page2.drawText(`* ${item}`, {
        x: 60, y: 590 - (idx * 30), size: 11, font: bodyFont, color: rgb(0.2, 0.2, 0.2)
      });
    });

    // Page 3
    const page3 = pdfDoc.addPage([600, 750]);
    page3.drawText('Page 3: Signatures & Verification', {
      x: 50, y: 680, size: 18, font: font, color: rgb(0.14, 0.38, 0.92)
    });
    page3.drawRectangle({
      x: 50, y: 480, width: 280, height: 110,
      borderWidth: 1, borderColor: rgb(0.7, 0.7, 0.7),
      color: rgb(0.97, 0.97, 0.97)
    });
    page3.drawText('Sign here or place formatted text note', {
      x: 65, y: 495, size: 10, font: bodyFont, color: rgb(0.5, 0.5, 0.5)
    });

    const pdfBytes = await pdfDoc.save();
    await loadPdfDocument(pdfBytes.buffer, 'Demo_SmartPDF_Pro.pdf');
  } catch (err) {
    console.error('Demo PDF error:', err);
    showToast('डेमो PDF बनाने में त्रुटि हुई', 'error');
  }
}

// Attach Event Listeners
function initViewerEvents() {
  dom.fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => loadPdfDocument(reader.result, file.name);
      reader.readAsArrayBuffer(file);
    }
  });

  dom.fileInputToolbar.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => loadPdfDocument(reader.result, file.name);
      reader.readAsArrayBuffer(file);
    }
  });

  dom.btnLoadDemoPdf.addEventListener('click', generateSamplePdf);

  dom.btnPrevPage.addEventListener('click', prevPage);
  dom.btnNextPage.addEventListener('click', nextPage);
  
  if (dom.btnToggleScrollMode) dom.btnToggleScrollMode.addEventListener('click', toggleScrollMode);
  if (dom.floatBtnScrollMode) dom.floatBtnScrollMode.addEventListener('click', toggleScrollMode);

  dom.pageNumberInput.addEventListener('change', (e) => {
    const num = parseInt(e.target.value);
    if (!isNaN(num)) goToPage(num);
  });

  dom.btnZoomIn.addEventListener('click', zoomIn);
  dom.btnZoomOut.addEventListener('click', zoomOut);
  dom.btnZoomReset.addEventListener('click', resetZoom);
  dom.btnFitWidth.addEventListener('click', fitToWidth);

  // Floating Bar
  if (dom.floatBtnPrev) dom.floatBtnPrev.addEventListener('click', prevPage);
  if (dom.floatBtnNext) dom.floatBtnNext.addEventListener('click', nextPage);
  if (dom.floatBtnZoomIn) dom.floatBtnZoomIn.addEventListener('click', zoomIn);
  if (dom.floatBtnZoomOut) dom.floatBtnZoomOut.addEventListener('click', zoomOut);
  if (dom.floatBtnZoomReset) dom.floatBtnZoomReset.addEventListener('click', fitToWidth);
  if (dom.floatBtnFitWidth) dom.floatBtnFitWidth.addEventListener('click', fitToWidth);

  dom.btnToggleSidebar.addEventListener('click', () => {
    dom.sidebar.classList.toggle('collapsed');
  });

  // Scroll listener for continuous page tracking
  let scrollDebounce = null;
  dom.viewport.addEventListener('scroll', () => {
    clearTimeout(scrollDebounce);
    scrollDebounce = setTimeout(syncActivePageFromScroll, 40);
  }, { passive: true });

  // Text selection listener
  document.addEventListener('selectionchange', handleTextSelectionChange);

  // Search Listeners
  dom.btnToggleSearch.addEventListener('click', () => {
    dom.searchBar.classList.toggle('hidden');
    if (!dom.searchBar.classList.contains('hidden')) {
      dom.searchInput.focus();
    }
  });

  let searchDebounce = null;
  dom.searchInput.addEventListener('input', (e) => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      executePdfSearch(e.target.value);
    }, 300);
  });

  dom.searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) searchPrev();
      else searchNext();
    }
  });

  dom.btnSearchNext.addEventListener('click', searchNext);
  dom.btnSearchPrev.addEventListener('click', searchPrev);
  dom.btnClearSearch.addEventListener('click', clearSearch);
  dom.btnCloseSearch.addEventListener('click', () => {
    dom.searchBar.classList.add('hidden');
    clearSearch();
  });

  // Initialize Touch Gestures (Pinch-to-zoom, Left/Right swipe, Double-tap)
  initTouchAndGestures();
}

/**
 * Advanced Touch & Gesture Handling
 */
let touchState = {
  isPinching: false,
  startDistance: 0,
  initialScale: 1.0,
  currentFactor: 1.0,
  centerX: 0,
  centerY: 0,
  startX: 0,
  startY: 0,
  startTime: 0,
  lastTapTime: 0
};

function initTouchAndGestures() {
  const viewport = dom.viewport;
  const container = dom.pagesContainer || dom.pageContainer;
  const liveBadge = dom.liveZoomBadge;

  if (!viewport || !container) return;

  viewport.addEventListener('touchstart', (e) => {
    const currentTool = window.AnnotState ? window.AnnotState.currentTool : 'cursor';

    if (e.touches.length === 2) {
      touchState.isPinching = true;
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      touchState.startDistance = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      touchState.initialScale = ViewerState.scale;
      touchState.currentFactor = 1.0;
      touchState.centerX = (t1.clientX + t2.clientX) / 2;
      touchState.centerY = (t1.clientY + t2.clientY) / 2;

      if (liveBadge) {
        liveBadge.textContent = `${Math.round(ViewerState.scale * 100)}%`;
        liveBadge.classList.remove('hidden');
      }
    } else if (e.touches.length === 1 && currentTool === 'cursor') {
      touchState.isPinching = false;
      const t = e.touches[0];
      touchState.startX = t.clientX;
      touchState.startY = t.clientY;
      touchState.startTime = Date.now();

      const now = Date.now();
      if (now - touchState.lastTapTime < 320) {
        e.preventDefault();
        touchState.lastTapTime = 0;
        if (ViewerState.scale < 1.35) {
          ViewerState.scale = 1.85;
        } else {
          calculateOptimalFitWidth();
        }
        onZoomUpdated();
        return;
      }
      touchState.lastTapTime = now;
    }
  }, { passive: false });

  viewport.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && touchState.isPinching) {
      e.preventDefault();
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const currentDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      if (touchState.startDistance > 0) {
        const factor = currentDist / touchState.startDistance;
        touchState.currentFactor = factor;
        const liveScale = Math.min(4.0, Math.max(0.4, touchState.initialScale * factor));

        container.style.transform = `scale(${factor})`;
        container.style.transformOrigin = `${touchState.centerX}px ${touchState.centerY}px`;
        container.style.transition = 'none';

        if (liveBadge) {
          liveBadge.textContent = `${Math.round(liveScale * 100)}%`;
        }
      }
    }
  }, { passive: false });

  const onTouchEnd = (e) => {
    if (touchState.isPinching) {
      if (e.touches.length < 2) {
        touchState.isPinching = false;
        if (liveBadge) liveBadge.classList.add('hidden');

        container.style.transform = '';
        container.style.transformOrigin = '';

        const factor = touchState.currentFactor;
        if (factor && factor > 0 && Math.abs(factor - 1.0) > 0.04) {
          ViewerState.scale = Math.min(4.0, Math.max(0.4, touchState.initialScale * factor));
          onZoomUpdated();
        }
      }
    } else if (e.changedTouches.length === 1) {
      const currentTool = window.AnnotState ? window.AnnotState.currentTool : 'cursor';
      if (currentTool === 'cursor' && ViewerState.scrollMode === 'single') {
        const t = e.changedTouches[0];
        const deltaX = t.clientX - touchState.startX;
        const deltaY = t.clientY - touchState.startY;
        const elapsed = Date.now() - touchState.startTime;

        const isHorizontalSwipe = Math.abs(deltaX) > 65 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5 && elapsed < 450;
        if (isHorizontalSwipe) {
          if (deltaX < 0) nextPage();
          else if (deltaX > 0) prevPage();
        }
      }
    }
  };

  viewport.addEventListener('touchend', onTouchEnd, { passive: true });
  viewport.addEventListener('touchcancel', onTouchEnd, { passive: true });
}

/**
 * Universal Android Intent Bridge Loader
 */
window.loadPdfFromAndroid = function(base64Data, fileName) {
  try {
    if (!base64Data) return;
    const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    const binary = atob(cleanBase64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const readerTab = document.querySelector('.nav-tab[data-tab="tab-reader"]');
    if (readerTab && !readerTab.classList.contains('active')) {
      readerTab.click();
    }

    window.loadPdfDocument(bytes.buffer, fileName || 'document.pdf');
  } catch (err) {
    console.error('Failed to load PDF from Android bridge:', err);
    if (window.showToast) window.showToast('Android से PDF लोड करने में त्रुटि!', 'error');
  }
};

// Export functions to global scope
window.loadPdfDocument = loadPdfDocument;
window.ViewerState = ViewerState;
window.initViewerEvents = initViewerEvents;
window.goToPage = goToPage;
window.nextPage = nextPage;
window.prevPage = prevPage;
