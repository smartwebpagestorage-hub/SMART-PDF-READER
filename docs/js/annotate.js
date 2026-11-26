/**
 * Smart PDF - Annotation, Rich Text & Signature Engine
 * Supports Freehand Draw, Highlighting, Top-Toolbar Font Controls,
 * Direct Inline WYSIWYG Text Box (Pixel-Perfect Alignment),
 * Floating Text Selection Toolbar, and Permanent PDF Baking.
 */

const AnnotState = {
  currentTool: 'cursor', // 'cursor' | 'pen' | 'highlight' | 'text' | 'signature'
  color: '#ef4444',
  size: 4,
  isDrawing: false,
  lastX: 0,
  lastY: 0,
  activePage: 1,
  targetCanvas: null,

  // Annotations stored per page: Map<pageNum, dataURL>
  pageCanvasData: {},

  // Font & Style State (Controlled directly from Top Toolbar)
  fontFamily: 'sans-serif',
  fontSize: 18,
  isBold: false,
  isItalic: false,
  isUnderline: false,
  textColor: '#2563eb',

  // Text Selection State
  selectedText: '',
  selectedRange: null,
  selectedPage: 1,

  // Signature state
  isSigning: false,
  signColor: '#000000',
  pendingSignImg: null
};

const annotDom = {
  canvas: document.getElementById('annotationCanvas'),
  toolBtns: document.querySelectorAll('.tool-btn[data-tool]'),
  toolSubToolbar: document.getElementById('toolSubToolbar'),
  toolOptionsBar: document.getElementById('toolOptionsBar'),
  colorPicker: document.getElementById('toolColorPicker'),
  sizeSelect: document.getElementById('toolSizeSelect'),
  btnClearPageAnnot: document.getElementById('btnClearPageAnnot'),
  btnSaveEditedPdf: document.getElementById('btnSaveEditedPdf'),

  // Top Toolbar Text & Font Controls
  textToolbarOptions: document.getElementById('textToolbarOptions'),
  tbFontFamily: document.getElementById('tbFontFamily'),
  tbSizeDec: document.getElementById('tbSizeDec'),
  tbSizeVal: document.getElementById('tbSizeVal'),
  tbFontSizeSelect: document.getElementById('tbFontSizeSelect'),
  tbSizeInc: document.getElementById('tbSizeInc'),
  tbBold: document.getElementById('tbBold'),
  tbItalic: document.getElementById('tbItalic'),
  tbUnderline: document.getElementById('tbUnderline'),
  tbTextColor: document.getElementById('tbTextColor'),
  tbInlineActions: document.getElementById('tbInlineActions'),
  tbTextHint: document.getElementById('tbTextHint'),
  tbInlineConfirm: document.getElementById('tbInlineConfirm'),
  tbInlineCancel: document.getElementById('tbInlineCancel'),

  // Direct Inline WYSIWYG Text Box (On-PDF)
  pdfViewport: document.getElementById('pdfViewport'),
  floatingViewerBar: document.getElementById('floatingViewerBar'),
  inlineTextOverlay: document.getElementById('inlineTextOverlay'),
  inlineDragHandle: document.getElementById('inlineDragHandle'),
  inlineTextInput: document.getElementById('inlineTextInput'),
  btnInlineConfirm: document.getElementById('btnInlineConfirm'),
  btnInlineCancel: document.getElementById('btnInlineCancel'),

  // Text Selection Popup Buttons
  btnSelCopy: document.getElementById('btnSelCopy'),
  btnSelHighlight: document.getElementById('btnSelHighlight'),
  btnSelUnderline: document.getElementById('btnSelUnderline'),
  btnSelSpeak: document.getElementById('btnSelSpeak'),
  btnSelAddFormatted: document.getElementById('btnSelAddFormatted'),
  textSelectionPopup: document.getElementById('textSelectionPopup'),

  // Signature Modal DOM
  btnOpenSignModal: document.getElementById('btnOpenSignModal'),
  signatureModal: document.getElementById('signatureModal'),
  btnCloseSignModal: document.getElementById('btnCloseSignModal'),
  btnCancelSignature: document.getElementById('btnCancelSignature'),
  btnApplySignature: document.getElementById('btnApplySignature'),
  btnClearSignature: document.getElementById('btnClearSignature'),
  signaturePadCanvas: document.getElementById('signaturePadCanvas'),
  signColorDots: document.querySelectorAll('.color-dot[data-color]')
};

let annotCtx = null;
let signCtx = null;

/**
 * Synchronize single-page annotation canvas size
 */
function syncAnnotationCanvasSize(width, height) {
  if (!annotDom.canvas) return;
  annotDom.canvas.width = width;
  annotDom.canvas.height = height;
  annotDom.canvas.style.width = width + 'px';
  annotDom.canvas.style.height = height + 'px';
  annotCtx = annotDom.canvas.getContext('2d');

  restorePageAnnotations(window.ViewerState ? window.ViewerState.currentPage : 1);
}

/**
 * Attach drawing & text events to an individual page canvas in continuous mode
 */
function attachAnnotationCanvasToPage(pageNum, canvas) {
  if (!canvas) return;

  let touchStartPos = null;
  let lastTouchTime = 0;

  function getResolvedPage() {
    if (canvas === annotDom.canvas && window.ViewerState && window.ViewerState.scrollMode === 'single') {
      return window.ViewerState.currentPage || 1;
    }
    return pageNum;
  }

  function onPointerDown(e) {
    const resolvedPage = getResolvedPage();
    AnnotState.activePage = resolvedPage;
    AnnotState.targetCanvas = canvas;
    if (window.ViewerState) window.ViewerState.currentPage = resolvedPage;

    if (AnnotState.currentTool === 'text') {
      if (e.type === 'touchstart') {
        if (e.touches && e.touches.length === 1) {
          touchStartPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
        return;
      }
      // Ignore synthetic mousedown fired right after touch tap
      if (Date.now() - lastTouchTime < 600) return;
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      openInlineTextBox(e, resolvedPage, canvas);
      return;
    }

    if (AnnotState.currentTool !== 'pen' && AnnotState.currentTool !== 'highlight') return;

    AnnotState.isDrawing = true;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    AnnotState.lastX = clientX - rect.left;
    AnnotState.lastY = clientY - rect.top;
  }

  function onPointerMove(e) {
    if (AnnotState.currentTool === 'text' && e.type === 'touchmove' && touchStartPos && e.touches && e.touches.length === 1) {
      const dist = Math.hypot(e.touches[0].clientX - touchStartPos.x, e.touches[0].clientY - touchStartPos.y);
      if (dist > 12) touchStartPos = null; // User is scrolling, not tapping
      return;
    }

    const resolvedPage = getResolvedPage();
    if (!AnnotState.isDrawing || AnnotState.activePage !== resolvedPage) return;
    e.preventDefault();

    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const currX = clientX - rect.left;
    const currY = clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(AnnotState.lastX, AnnotState.lastY);
    ctx.lineTo(currX, currY);

    if (AnnotState.currentTool === 'highlight') {
      ctx.strokeStyle = AnnotState.color;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = AnnotState.size * 3;
      ctx.lineCap = 'square';
    } else {
      ctx.strokeStyle = AnnotState.color;
      ctx.globalAlpha = 1.0;
      ctx.lineWidth = AnnotState.size;
      ctx.lineCap = 'round';
    }
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.globalAlpha = 1.0;

    AnnotState.lastX = currX;
    AnnotState.lastY = currY;
  }

  function onPointerUp(e) {
    if (AnnotState.currentTool === 'text' && e && e.type === 'touchend') {
      if (touchStartPos && e.changedTouches && e.changedTouches.length === 1) {
        const t = e.changedTouches[0];
        const dist = Math.hypot(t.clientX - touchStartPos.x, t.clientY - touchStartPos.y);
        touchStartPos = null;
        if (dist < 12) {
          e.preventDefault();
          lastTouchTime = Date.now();
          const resolvedPage = getResolvedPage();
          AnnotState.activePage = resolvedPage;
          AnnotState.targetCanvas = canvas;
          if (window.ViewerState) window.ViewerState.currentPage = resolvedPage;
          openInlineTextBox({ clientX: t.clientX, clientY: t.clientY }, resolvedPage, canvas);
        }
      }
      return;
    }

    const resolvedPage = getResolvedPage();
    if (AnnotState.isDrawing && AnnotState.activePage === resolvedPage) {
      AnnotState.isDrawing = false;
      savePageAnnotations(resolvedPage, canvas);
    }
  }

  canvas.addEventListener('mousedown', onPointerDown);
  canvas.addEventListener('mousemove', onPointerMove);
  canvas.addEventListener('mouseup', onPointerUp);
  canvas.addEventListener('mouseleave', onPointerUp);

  canvas.addEventListener('touchstart', onPointerDown, { passive: true });
  canvas.addEventListener('touchmove', onPointerMove, { passive: false });
  canvas.addEventListener('touchend', onPointerUp, { passive: false });
}

/**
 * Save page annotations to memory from a given canvas
 */
function savePageAnnotations(pageNum, canvas) {
  if (!canvas) return;
  const blank = document.createElement('canvas');
  blank.width = canvas.width;
  blank.height = canvas.height;

  if (canvas.toDataURL() !== blank.toDataURL()) {
    AnnotState.pageCanvasData[pageNum] = canvas.toDataURL('image/png');
  } else {
    delete AnnotState.pageCanvasData[pageNum];
  }
}

/**
 * Save current page's annotation canvas (single page mode)
 */
function saveCurrentPageAnnotations() {
  const p = window.ViewerState ? window.ViewerState.currentPage : 1;
  const canvas = (window.ViewerState && window.ViewerState.scrollMode === 'continuous')
    ? document.getElementById(`page-annot-canvas-${p}`)
    : annotDom.canvas;

  if (canvas) savePageAnnotations(p, canvas);
}

/**
 * Restore page annotations onto a target canvas
 */
function restorePageAnnotationsToCanvas(pageNum, canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const dataUrl = AnnotState.pageCanvasData[pageNum];
  if (dataUrl) {
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = dataUrl;
  }
}

function restorePageAnnotations(pageNum) {
  restorePageAnnotationsToCanvas(pageNum, annotDom.canvas);
}

/**
 * Switch Active Annotation Tool
 */
function setTool(toolName) {
  // Commit any currently open text box before switching tools
  if (AnnotState.currentTool === 'text' && toolName !== 'text') {
    commitInlineText();
  }

  AnnotState.currentTool = toolName;

  annotDom.toolBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tool === toolName);
  });

  const isContinuous = window.ViewerState && window.ViewerState.scrollMode === 'continuous';
  const annotCanvases = isContinuous
    ? document.querySelectorAll('.pdf-annot-canvas')
    : [annotDom.canvas];

  annotCanvases.forEach(c => {
    if (!c) return;
    c.classList.remove('active-draw', 'active-text');
    if (toolName === 'pen' || toolName === 'highlight') {
      c.classList.add('active-draw');
    } else if (toolName === 'text') {
      c.classList.add('active-text');
    }
  });

  // Top Sub-Toolbar Formatting Strip Management (Font & Style always accessible)
  if (toolName === 'pen' || toolName === 'highlight') {
    if (annotDom.toolSubToolbar) annotDom.toolSubToolbar.classList.remove('hidden');
    if (annotDom.toolOptionsBar) annotDom.toolOptionsBar.classList.remove('hidden');
    if (annotDom.textToolbarOptions) annotDom.textToolbarOptions.classList.add('hidden');
    if (toolName === 'highlight') {
      AnnotState.color = '#fef08a';
      if (annotDom.colorPicker) annotDom.colorPicker.value = '#fef08a';
    }
  } else if (toolName === 'text') {
    if (annotDom.toolSubToolbar) annotDom.toolSubToolbar.classList.remove('hidden');
    if (annotDom.toolOptionsBar) annotDom.toolOptionsBar.classList.add('hidden');
    if (annotDom.textToolbarOptions) annotDom.textToolbarOptions.classList.remove('hidden');
    if (annotDom.tbTextHint) annotDom.tbTextHint.textContent = 'PDF पर जहाँ लिखना है वहाँ टैप करें (L गाइड आएगा)';
    updateToolbarFontControls();
  } else {
    if (annotDom.toolSubToolbar) annotDom.toolSubToolbar.classList.remove('hidden');
    if (annotDom.toolOptionsBar) annotDom.toolOptionsBar.classList.add('hidden');
    if (annotDom.textToolbarOptions) annotDom.textToolbarOptions.classList.remove('hidden');
    if (annotDom.tbTextHint) annotDom.tbTextHint.textContent = 'लिखने के लिए ऊपर "T Text" दबाकर PDF पर क्लिक करें';
    closeInlineText();
  }
}

/**
 * Update Top Toolbar Font UI controls to match AnnotState
 */
function updateToolbarFontControls() {
  if (annotDom.tbFontFamily) annotDom.tbFontFamily.value = AnnotState.fontFamily;
  if (annotDom.tbSizeVal) annotDom.tbSizeVal.textContent = `${AnnotState.fontSize}px`;
  if (annotDom.tbFontSizeSelect) {
    const valStr = String(AnnotState.fontSize);
    let hasOption = Array.from(annotDom.tbFontSizeSelect.options).some(o => o.value === valStr);
    if (!hasOption) {
      const opt = document.createElement('option');
      opt.value = valStr;
      opt.textContent = `${valStr}px`;
      annotDom.tbFontSizeSelect.appendChild(opt);
    }
    annotDom.tbFontSizeSelect.value = valStr;
  }
  if (annotDom.tbTextColor) annotDom.tbTextColor.value = AnnotState.textColor;
  if (annotDom.tbBold) annotDom.tbBold.classList.toggle('active', AnnotState.isBold);
  if (annotDom.tbItalic) annotDom.tbItalic.classList.toggle('active', AnnotState.isItalic);
  if (annotDom.tbUnderline) annotDom.tbUnderline.classList.toggle('active', AnnotState.isUnderline);

  // Apply to currently open inline text box in real-time
  applyStylesToInlineBox();
}

function toggleInlineStripActions(isOpen) {
  if (annotDom.tbInlineActions) annotDom.tbInlineActions.classList.toggle('hidden', !isOpen);
  if (annotDom.tbTextHint) annotDom.tbTextHint.classList.toggle('hidden', isOpen);
}

/**
 * =========================================================================
 * INLINE WYSIWYG TEXT BOX SYSTEM (जहाँ क्लिक करें, वहीं सीधा टाइप करें)
 * =========================================================================
 */
function openInlineTextBox(e, pageNum, canvas, initialText = '') {
  const box = annotDom.inlineTextOverlay;
  const input = annotDom.inlineTextInput;
  if (!box || !input || !canvas) return;

  // If another text was already being typed, commit or close it first
  if (!box.classList.contains('hidden')) {
    if (input.value.trim()) {
      commitInlineText();
    } else {
      closeInlineText();
    }
  }

  AnnotState.activePage = pageNum;
  AnnotState.targetCanvas = canvas;

  const rect = canvas.getBoundingClientRect();
  const touchPoint = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
  const clientX = touchPoint ? touchPoint.clientX : e.clientX;
  const clientY = touchPoint ? touchPoint.clientY : e.clientY;

  // Click position relative to page canvas
  const clickX = clientX - rect.left;
  const clickY = clientY - rect.top;

  // Move inline box element inside this page's .canvas-wrapper for page-locked positioning
  const wrapper = canvas.parentElement;
  if (wrapper && box.parentElement !== wrapper) {
    wrapper.appendChild(box);
  }

  // Align the L-shape corner (└) directly at the user's tap point on the PDF
  const lineH = AnnotState.fontSize * 1.2;
  const posX = Math.max(2, Math.min(Math.max(2, rect.width - 96), clickX - 8));
  const posY = Math.max(2, Math.min(Math.max(2, rect.height - lineH - 6), clickY - lineH * 0.65));

  // Keep drag pill below the L unless tapping very close to bottom of the page
  box.classList.toggle('handle-top', posY + lineH + 34 > rect.height);
  box.style.left = `${posX}px`;
  box.style.top = `${posY}px`;
  box.classList.remove('hidden');
  toggleInlineStripActions(true);

  if (annotDom.floatingViewerBar) {
    annotDom.floatingViewerBar.classList.add('hidden');
  }

  input.value = initialText || '';
  applyStylesToInlineBox();

  try {
    input.focus({ preventScroll: true });
  } catch (_) {
    input.focus();
  }
  if (initialText) {
    const len = input.value.length;
    try { input.setSelectionRange(len, len); } catch (_) { }
  }

  // After mobile soft-keyboard resize, keep typed box visible without changing its PDF coordinates
  setTimeout(() => {
    if (box.classList.contains('hidden') || !annotDom.pdfViewport) return;
    const vp = annotDom.pdfViewport;
    const vpRect = vp.getBoundingClientRect();
    const inRect = input.getBoundingClientRect();
    if (inRect.bottom > vpRect.bottom - 12) {
      vp.scrollTop += (inRect.bottom - vpRect.bottom + 24);
    } else if (inRect.top < vpRect.top + 12) {
      vp.scrollTop -= (vpRect.top - inRect.top + 24);
    }
  }, 280);
}

/**
 * Auto-resize inline text box width & height to match typed content smoothly
 */
function autoResizeInlineBox() {
  const box = annotDom.inlineTextOverlay;
  const input = annotDom.inlineTextInput;
  if (!box || !input || box.classList.contains('hidden')) return;

  const measureCanvas = autoResizeInlineBox._c || (autoResizeInlineBox._c = document.createElement('canvas'));
  const mCtx = measureCanvas.getContext('2d');
  mCtx.font = `${AnnotState.isItalic ? 'italic ' : ''}${AnnotState.isBold ? 'bold ' : 'normal '}${AnnotState.fontSize}px ${AnnotState.fontFamily}`;

  const lines = (input.value || input.placeholder || '').split('\n');
  let maxLineW = 0;
  for (let i = 0; i < lines.length; i++) {
    maxLineW = Math.max(maxLineW, mCtx.measureText(lines[i]).width);
  }

  const canvas = AnnotState.targetCanvas;
  const leftPx = parseFloat(box.style.left) || 0;
  const maxAllowedW = canvas
    ? Math.max(90, canvas.getBoundingClientRect().width - leftPx - 4)
    : 320;
  const targetW = Math.min(maxAllowedW, Math.max(90, Math.ceil(maxLineW + 18)));

  box.style.width = `${targetW}px`;
  box.style.maxWidth = `${maxAllowedW}px`;

  input.style.height = 'auto';
  const minH = Math.max(22, Math.ceil(AnnotState.fontSize * 1.2));
  input.style.height = `${Math.max(minH, input.scrollHeight)}px`;
}

/**
 * Real-time styling of inline text box from Top Toolbar settings
 */
function applyStylesToInlineBox() {
  const input = annotDom.inlineTextInput;
  if (!input) return;

  input.style.fontFamily = AnnotState.fontFamily;
  input.style.fontSize = `${AnnotState.fontSize}px`;
  input.style.fontWeight = AnnotState.isBold ? 'bold' : 'normal';
  input.style.fontStyle = AnnotState.isItalic ? 'italic' : 'normal';
  input.style.textDecoration = AnnotState.isUnderline ? 'underline' : 'none';
  input.style.color = AnnotState.textColor;

  autoResizeInlineBox();
}

/**
 * Commit typed text onto the canvas with 100% pixel-perfect baseline & wrap alignment
 */
function commitInlineText() {
  const box = annotDom.inlineTextOverlay;
  const input = annotDom.inlineTextInput;
  if (!box || !input || box.classList.contains('hidden')) return;

  const text = input.value;
  if (!text.trim()) {
    closeInlineText();
    return;
  }

  const p = AnnotState.activePage || 1;
  const canvas = AnnotState.targetCanvas || (
    (window.ViewerState && window.ViewerState.scrollMode === 'continuous')
      ? document.getElementById(`page-annot-canvas-${p}`)
      : annotDom.canvas
  );

  if (!canvas) {
    closeInlineText();
    return;
  }

  const canvasRect = canvas.getBoundingClientRect();
  const inputRect = input.getBoundingClientRect();
  if (!canvasRect.width || !canvasRect.height) {
    closeInlineText();
    return;
  }

  const computed = window.getComputedStyle(input);
  const padLeft = parseFloat(computed.paddingLeft) || 0;
  const padRight = parseFloat(computed.paddingRight) || 0;
  const padTop = parseFloat(computed.paddingTop) || 0;
  const borderLeft = parseFloat(computed.borderLeftWidth) || 0;
  const borderRight = parseFloat(computed.borderRightWidth) || 0;
  const borderTop = parseFloat(computed.borderTopWidth) || 0;
  const cssLineHeight = parseFloat(computed.lineHeight) || (AnnotState.fontSize * 1.2);

  const cssX = inputRect.left - canvasRect.left + borderLeft + padLeft;
  const cssY = inputRect.top - canvasRect.top + borderTop + padTop;

  // Convert from CSS pixels to internal Canvas pixels
  const scaleX = canvas.width / canvasRect.width;
  const scaleY = canvas.height / canvasRect.height;

  const drawX = cssX * scaleX;
  const drawY = cssY * scaleY;
  const drawFontSize = AnnotState.fontSize * scaleY;
  const lineHeight = cssLineHeight * scaleY;
  const maxContentWidth = Math.max(20, (inputRect.width - borderLeft - borderRight - padLeft - padRight) * scaleX);

  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.font = `${AnnotState.isItalic ? 'italic ' : ''}${AnnotState.isBold ? 'bold ' : 'normal '}${drawFontSize}px ${AnnotState.fontFamily}`;
  ctx.fillStyle = AnnotState.textColor;

  // Match CSS line-box half-leading + font ascent so text stays at exact same Y pixel
  const metrics = ctx.measureText('Mg');
  const ascent = (typeof metrics.fontBoundingBoxAscent === 'number') ? metrics.fontBoundingBoxAscent : drawFontSize * 0.82;
  const descent = (typeof metrics.fontBoundingBoxDescent === 'number') ? metrics.fontBoundingBoxDescent : drawFontSize * 0.18;
  const halfLeading = (lineHeight - (ascent + descent)) / 2;

  ctx.textBaseline = 'alphabetic';
  let currentBaselineY = drawY + halfLeading + ascent;

  // Wrap lines identically to <textarea> width
  const rawLines = text.split('\n');
  const wrappedLines = [];
  rawLines.forEach(rawLine => {
    if (!rawLine) {
      wrappedLines.push('');
      return;
    }
    let current = '';
    const tokens = rawLine.split(/(\s+)/);
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const test = current + token;
      if (current && ctx.measureText(test).width > maxContentWidth + 1) {
        wrappedLines.push(current);
        current = token.trimStart();
      } else {
        current = test;
      }
    }
    if (current !== '') {
      wrappedLines.push(current);
    }
  });

  wrappedLines.forEach(line => {
    ctx.fillText(line, drawX, currentBaselineY);

    if (AnnotState.isUnderline && line.length > 0) {
      const textWidth = ctx.measureText(line).width;
      const underlineY = currentBaselineY + Math.max(2, drawFontSize * 0.12);
      ctx.beginPath();
      ctx.strokeStyle = AnnotState.textColor;
      ctx.lineWidth = Math.max(1.2, drawFontSize / 15);
      ctx.moveTo(drawX, underlineY);
      ctx.lineTo(drawX + textWidth, underlineY);
      ctx.stroke();
    }

    currentBaselineY += lineHeight;
  });
  ctx.restore();

  savePageAnnotations(p, canvas);
  showToast('टेक्स्ट सही जगह जोड़ दिया गया', 'success');
  closeInlineText();
}

function closeInlineText() {
  const box = annotDom.inlineTextOverlay;
  const input = annotDom.inlineTextInput;
  if (box) {
    box.classList.add('hidden');
    // Keep overlay safely outside #pagesContainer so re-renders never detach it
    if (annotDom.pdfViewport && box.parentElement !== annotDom.pdfViewport) {
      annotDom.pdfViewport.appendChild(box);
    }
  }
  if (input) input.value = '';
  toggleInlineStripActions(false);
  if (annotDom.floatingViewerBar && window.ViewerState && window.ViewerState.pdfDoc) {
    annotDom.floatingViewerBar.classList.remove('hidden');
  }
}

/**
 * Dragging / Moving the Inline Text Box for pixel-perfect alignment
 */
function initInlineBoxDraggable() {
  const handle = annotDom.inlineDragHandle;
  const box = annotDom.inlineTextOverlay;
  if (!handle || !box) return;

  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let initialLeft = 0;
  let initialTop = 0;

  function onDragStart(e) {
    if (e.target && e.target.closest('button')) return;
    isDragging = true;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    startX = clientX;
    startY = clientY;
    initialLeft = parseFloat(box.style.left) || 0;
    initialTop = parseFloat(box.style.top) || 0;
    e.stopPropagation();
  }

  function onDragMove(e) {
    if (!isDragging) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const deltaX = clientX - startX;
    const deltaY = clientY - startY;

    box.style.left = `${Math.max(0, initialLeft + deltaX)}px`;
    box.style.top = `${Math.max(0, initialTop + deltaY)}px`;
    e.preventDefault();
  }

  function onDragEnd() {
    if (!isDragging) return;
    isDragging = false;
    if (annotDom.inlineTextInput && !box.classList.contains('hidden')) {
      try {
        annotDom.inlineTextInput.focus({ preventScroll: true });
      } catch (_) {
        annotDom.inlineTextInput.focus();
      }
    }
  }

  handle.addEventListener('mousedown', onDragStart);
  window.addEventListener('mousemove', onDragMove);
  window.addEventListener('mouseup', onDragEnd);

  handle.addEventListener('touchstart', onDragStart, { passive: false });
  window.addEventListener('touchmove', onDragMove, { passive: false });
  window.addEventListener('touchend', onDragEnd);
}

/**
 * =========================================================================
 * TEXT SELECTION POPUP ACTIONS
 * =========================================================================
 */
function initTextSelectionActions() {
  // 1. Copy Selected Text
  if (annotDom.btnSelCopy) {
    annotDom.btnSelCopy.addEventListener('click', () => {
      if (AnnotState.selectedText) {
        navigator.clipboard.writeText(AnnotState.selectedText).then(() => {
          showToast('टेक्स्ट कॉपी हो गया! (Copied)', 'success');
          hideSelectionPopup();
        });
      }
    });
  }

  // 2. Highlight Selected Text
  if (annotDom.btnSelHighlight) {
    annotDom.btnSelHighlight.addEventListener('click', () => {
      highlightSelectedText();
    });
  }

  // 3. Underline Selected Text
  if (annotDom.btnSelUnderline) {
    annotDom.btnSelUnderline.addEventListener('click', () => {
      underlineSelectedText();
    });
  }

  // 4. Speak Selected Text (Text-to-Speech)
  if (annotDom.btnSelSpeak) {
    annotDom.btnSelSpeak.addEventListener('click', () => {
      speakSelectedText();
    });
  }

  // 5. Add Formatted Text Note from Selection
  if (annotDom.btnSelAddFormatted) {
    annotDom.btnSelAddFormatted.addEventListener('click', () => {
      if (AnnotState.selectedRange && AnnotState.selectedText) {
        const rects = AnnotState.selectedRange.getClientRects();
        const fallbackRect = AnnotState.selectedRange.getBoundingClientRect();
        const targetRect = (rects && rects.length > 0) ? rects[0] : fallbackRect;
        const p = AnnotState.selectedPage || (window.ViewerState ? window.ViewerState.currentPage : 1);

        const canvas = (window.ViewerState && window.ViewerState.scrollMode === 'continuous')
          ? document.getElementById(`page-annot-canvas-${p}`)
          : annotDom.canvas;

        hideSelectionPopup();
        setTool('text');
        openInlineTextBox({ clientX: targetRect.left, clientY: targetRect.bottom + 14 }, p, canvas, AnnotState.selectedText);
      }
    });
  }
}

function hideSelectionPopup() {
  if (annotDom.textSelectionPopup) {
    annotDom.textSelectionPopup.classList.add('hidden');
  }
  const sel = window.getSelection();
  if (sel) sel.removeAllRanges();
}

function highlightSelectedText() {
  const range = AnnotState.selectedRange;
  const p = AnnotState.selectedPage;
  if (!range || !p) return;

  const canvas = (window.ViewerState && window.ViewerState.scrollMode === 'continuous')
    ? document.getElementById(`page-annot-canvas-${p}`)
    : annotDom.canvas;

  if (!canvas) return;
  const canvasRect = canvas.getBoundingClientRect();
  const ctx = canvas.getContext('2d');
  const rects = range.getClientRects();

  ctx.fillStyle = 'rgba(254, 240, 138, 0.45)'; // Yellow highlight
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    const x = r.left - canvasRect.left;
    const y = r.top - canvasRect.top;
    ctx.fillRect(x, y, r.width, r.height);
  }

  savePageAnnotations(p, canvas);
  showToast('टेक्स्ट हाइलाइट कर दिया गया', 'success');
  hideSelectionPopup();
}

function underlineSelectedText() {
  const range = AnnotState.selectedRange;
  const p = AnnotState.selectedPage;
  if (!range || !p) return;

  const canvas = (window.ViewerState && window.ViewerState.scrollMode === 'continuous')
    ? document.getElementById(`page-annot-canvas-${p}`)
    : annotDom.canvas;

  if (!canvas) return;
  const canvasRect = canvas.getBoundingClientRect();
  const ctx = canvas.getContext('2d');
  const rects = range.getClientRects();

  ctx.strokeStyle = '#ef4444'; // Red underline
  ctx.lineWidth = 2.0;

  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    const x = r.left - canvasRect.left;
    const y = r.bottom - canvasRect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + r.width, y);
    ctx.stroke();
  }

  savePageAnnotations(p, canvas);
  showToast('टेक्स्ट अंडरलाइन कर दिया गया', 'success');
  hideSelectionPopup();
}

function speakSelectedText() {
  const text = AnnotState.selectedText;
  if (!text) return;

  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    const hasHindi = /[\u0900-\u097F]/.test(text);
    utterance.lang = hasHindi ? 'hi-IN' : 'en-US';
    window.speechSynthesis.speak(utterance);
    showToast('🔊 बोलकर सुनाया जा रहा है...', 'info');
  } else {
    showToast('स्पीच सिंथेसिस इस ब्राउज़र में उपलब्ध नहीं है', 'warning');
  }
  hideSelectionPopup();
}

/**
 * Clear Current Page Annotations
 */
function clearCurrentPageAnnotations() {
  const p = window.ViewerState ? window.ViewerState.currentPage : 1;
  const canvas = (window.ViewerState && window.ViewerState.scrollMode === 'continuous')
    ? document.getElementById(`page-annot-canvas-${p}`)
    : annotDom.canvas;

  if (canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  delete AnnotState.pageCanvasData[p];
  closeInlineText();
  showToast(`पेज ${p} के सभी निशान हटा दिए गए`, 'info');
}

/**
 * =========================================================================
 * SIGNATURE PAD MODAL SYSTEM
 * =========================================================================
 */
function initSignaturePad() {
  const canvas = annotDom.signaturePadCanvas;
  if (!canvas) return;
  signCtx = canvas.getContext('2d');

  canvas.width = 450;
  canvas.height = 200;

  let isDrawingSign = false;
  let lastSignX = 0;
  let lastSignY = 0;

  function getSignCoords(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height)
    };
  }

  function startSign(e) {
    isDrawingSign = true;
    const pos = getSignCoords(e);
    lastSignX = pos.x;
    lastSignY = pos.y;
  }

  function moveSign(e) {
    if (!isDrawingSign) return;
    e.preventDefault();
    const pos = getSignCoords(e);

    signCtx.beginPath();
    signCtx.moveTo(lastSignX, lastSignY);
    signCtx.lineTo(pos.x, pos.y);
    signCtx.strokeStyle = AnnotState.signColor;
    signCtx.lineWidth = 2.5;
    signCtx.lineCap = 'round';
    signCtx.lineJoin = 'round';
    signCtx.stroke();

    lastSignX = pos.x;
    lastSignY = pos.y;
  }

  function endSign() {
    isDrawingSign = false;
  }

  canvas.addEventListener('mousedown', startSign);
  canvas.addEventListener('mousemove', moveSign);
  canvas.addEventListener('mouseup', endSign);
  canvas.addEventListener('mouseleave', endSign);

  canvas.addEventListener('touchstart', startSign, { passive: false });
  canvas.addEventListener('touchmove', moveSign, { passive: false });
  canvas.addEventListener('touchend', endSign);

  if (annotDom.btnClearSignature) {
    annotDom.btnClearSignature.addEventListener('click', () => {
      signCtx.clearRect(0, 0, canvas.width, canvas.height);
    });
  }

  annotDom.signColorDots.forEach(dot => {
    dot.addEventListener('click', () => {
      annotDom.signColorDots.forEach(d => d.classList.remove('active'));
      dot.classList.add('active');
      AnnotState.signColor = dot.dataset.color;
    });
  });

  if (annotDom.btnOpenSignModal) {
    annotDom.btnOpenSignModal.addEventListener('click', () => {
      annotDom.signatureModal.classList.remove('hidden');
      signCtx.clearRect(0, 0, canvas.width, canvas.height);
    });
  }

  if (annotDom.btnCloseSignModal) annotDom.btnCloseSignModal.addEventListener('click', closeSignatureModal);
  if (annotDom.btnCancelSignature) annotDom.btnCancelSignature.addEventListener('click', closeSignatureModal);

  if (annotDom.btnApplySignature) {
    annotDom.btnApplySignature.addEventListener('click', () => {
      const dataUrl = canvas.toDataURL('image/png');
      closeSignatureModal();

      const p = window.ViewerState ? window.ViewerState.currentPage : 1;
      const targetCanvas = (window.ViewerState && window.ViewerState.scrollMode === 'continuous')
        ? document.getElementById(`page-annot-canvas-${p}`)
        : annotDom.canvas;

      if (!targetCanvas) return;
      const tCtx = targetCanvas.getContext('2d');

      const signImg = new Image();
      signImg.onload = () => {
        const targetW = 160;
        const targetH = (signImg.height / signImg.width) * targetW;
        const targetX = (targetCanvas.width - targetW) / 2;
        const targetY = (targetCanvas.height - targetH) / 2;

        tCtx.drawImage(signImg, targetX, targetY, targetW, targetH);
        savePageAnnotations(p, targetCanvas);
        showToast('सिग्नेचर पेज पर लगा दिया गया', 'success');
        setTool('cursor');
      };
      signImg.src = dataUrl;
    });
  }
}

function closeSignatureModal() {
  if (annotDom.signatureModal) annotDom.signatureModal.classList.add('hidden');
}

/**
 * =========================================================================
 * BAKE ANNOTATIONS INTO PDF (SAVE / DOWNLOAD)
 * Uses pdf-lib to embed all drawings, highlights, rich text, and signatures
 * permanently into the PDF bytes.
 * =========================================================================
 */
async function saveAndDownloadEditedPdf() {
  if (!window.ViewerState || !window.ViewerState.pdfBytes) {
    showToast('पहले कोई PDF खोलें', 'warning');
    return;
  }

  // Ensure active inline text is committed
  commitInlineText();
  saveCurrentPageAnnotations();

  try {
    showToast('एडिट की गई PDF तैयार हो रही है...', 'info');
    const { PDFDocument } = PDFLib;
    const pdfDoc = await PDFDocument.load(window.ViewerState.pdfBytes.slice(0), { ignoreEncryption: true });
    const pages = pdfDoc.getPages();

    let bakedCount = 0;

    for (let pNum = 1; pNum <= pages.length; pNum++) {
      let dataUrl = AnnotState.pageCanvasData[pNum];

      if (!dataUrl) {
        const cardCanvas = document.getElementById(`page-annot-canvas-${pNum}`);
        if (cardCanvas) {
          savePageAnnotations(pNum, cardCanvas);
          dataUrl = AnnotState.pageCanvasData[pNum];
        }
      }

      if (dataUrl) {
        const pngBytes = await fetch(dataUrl).then(res => res.arrayBuffer());
        const pngImage = await pdfDoc.embedPng(pngBytes);
        const page = pages[pNum - 1];

        page.drawImage(pngImage, {
          x: 0,
          y: 0,
          width: page.getWidth(),
          height: page.getHeight()
        });
        bakedCount++;
      }
    }

    const modifiedPdfBytes = await pdfDoc.save();
    const originalName = window.ViewerState.fileName.replace('.pdf', '');
    const filename = `${originalName}_Edited.pdf`;

    if (window.downloadFileBlobOrBytes) {
      window.downloadFileBlobOrBytes(modifiedPdfBytes, filename, 'application/pdf');
    } else {
      const blob = new Blob([modifiedPdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }

    showToast(`सफलतापूर्वक सेव किया गया (${bakedCount} पेजों पर बदलाव सुरक्षित किए)`, 'success');
  } catch (err) {
    console.error('Error baking PDF:', err);
    showToast('PDF सेव करने में त्रुटि हुई', 'error');
  }
}

/**
 * Attach Annotation Events
 */
function initAnnotateEvents() {
  if (annotDom.canvas) {
    attachAnnotationCanvasToPage(1, annotDom.canvas);
  }

  // Tool selector buttons
  annotDom.toolBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      setTool(btn.dataset.tool);
    });
  });

  // Stroke color & size change for pen/highlight
  if (annotDom.colorPicker) {
    annotDom.colorPicker.addEventListener('input', (e) => {
      AnnotState.color = e.target.value;
    });
  }

  if (annotDom.sizeSelect) {
    annotDom.sizeSelect.addEventListener('change', (e) => {
      AnnotState.size = parseInt(e.target.value, 10);
    });
  }

  // ========================================================
  // Top Toolbar Font & Style Controls
  // ========================================================
  function refocusInlineIfOpen() {
    if (annotDom.inlineTextOverlay && !annotDom.inlineTextOverlay.classList.contains('hidden') && annotDom.inlineTextInput) {
      try {
        annotDom.inlineTextInput.focus({ preventScroll: true });
      } catch (_) {
        annotDom.inlineTextInput.focus();
      }
    }
  }

  function ensureTextToolAndFocus() {
    if (AnnotState.currentTool !== 'text') {
      setTool('text');
    }
    refocusInlineIfOpen();
  }

  if (annotDom.tbFontFamily) {
    annotDom.tbFontFamily.addEventListener('change', (e) => {
      AnnotState.fontFamily = e.target.value;
      applyStylesToInlineBox();
      ensureTextToolAndFocus();
    });
  }

  if (annotDom.tbFontSizeSelect) {
    annotDom.tbFontSizeSelect.addEventListener('change', (e) => {
      const val = parseInt(e.target.value, 10);
      if (!isNaN(val) && val >= 8 && val <= 96) {
        AnnotState.fontSize = val;
        updateToolbarFontControls();
        ensureTextToolAndFocus();
      }
    });
  }

  if (annotDom.tbSizeDec) {
    annotDom.tbSizeDec.addEventListener('click', () => {
      if (AnnotState.fontSize > 10) {
        AnnotState.fontSize -= 2;
        updateToolbarFontControls();
      }
      ensureTextToolAndFocus();
    });
  }

  if (annotDom.tbSizeInc) {
    annotDom.tbSizeInc.addEventListener('click', () => {
      if (AnnotState.fontSize < 72) {
        AnnotState.fontSize += 2;
        updateToolbarFontControls();
      }
      ensureTextToolAndFocus();
    });
  }

  if (annotDom.tbBold) {
    annotDom.tbBold.addEventListener('click', () => {
      AnnotState.isBold = !AnnotState.isBold;
      updateToolbarFontControls();
      ensureTextToolAndFocus();
    });
  }

  if (annotDom.tbItalic) {
    annotDom.tbItalic.addEventListener('click', () => {
      AnnotState.isItalic = !AnnotState.isItalic;
      updateToolbarFontControls();
      ensureTextToolAndFocus();
    });
  }

  if (annotDom.tbUnderline) {
    annotDom.tbUnderline.addEventListener('click', () => {
      AnnotState.isUnderline = !AnnotState.isUnderline;
      updateToolbarFontControls();
      ensureTextToolAndFocus();
    });
  }

  if (annotDom.tbTextColor) {
    annotDom.tbTextColor.addEventListener('input', (e) => {
      AnnotState.textColor = e.target.value;
      applyStylesToInlineBox();
      if (AnnotState.currentTool !== 'text') setTool('text');
    });
    annotDom.tbTextColor.addEventListener('change', () => {
      ensureTextToolAndFocus();
    });
  }

  if (annotDom.tbInlineConfirm) {
    annotDom.tbInlineConfirm.addEventListener('click', commitInlineText);
  }

  if (annotDom.tbInlineCancel) {
    annotDom.tbInlineCancel.addEventListener('click', closeInlineText);
  }

  // ========================================================
  // Inline Text Box Confirm & Cancel & Auto-Grow
  // ========================================================
  if (annotDom.btnInlineConfirm) {
    annotDom.btnInlineConfirm.addEventListener('click', commitInlineText);
  }

  if (annotDom.btnInlineCancel) {
    annotDom.btnInlineCancel.addEventListener('click', closeInlineText);
  }

  if (annotDom.inlineTextInput) {
    annotDom.inlineTextInput.addEventListener('input', autoResizeInlineBox);

    annotDom.inlineTextInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        commitInlineText();
      } else if (e.key === 'Escape') {
        closeInlineText();
      }
    });
  }

  // Draggable move handle for inline text box
  initInlineBoxDraggable();

  // Clear & Save
  if (annotDom.btnClearPageAnnot) annotDom.btnClearPageAnnot.addEventListener('click', clearCurrentPageAnnotations);
  if (annotDom.btnSaveEditedPdf) annotDom.btnSaveEditedPdf.addEventListener('click', saveAndDownloadEditedPdf);

  // Text selection actions
  initTextSelectionActions();

  // Signature pad
  initSignaturePad();
}

// Global exports
window.syncAnnotationCanvasSize = syncAnnotationCanvasSize;
window.attachAnnotationCanvasToPage = attachAnnotationCanvasToPage;
window.savePageAnnotations = savePageAnnotations;
window.saveCurrentPageAnnotations = saveCurrentPageAnnotations;
window.restorePageAnnotations = restorePageAnnotations;
window.restorePageAnnotationsToCanvas = restorePageAnnotationsToCanvas;
window.commitInlineText = commitInlineText;
window.initAnnotateEvents = initAnnotateEvents;
window.AnnotState = AnnotState;
