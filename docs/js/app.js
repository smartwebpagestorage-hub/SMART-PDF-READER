/**
 * Smart PDF - Application Coordinator
 * Handles Navigation Tabs, Theme Toggling, Toast Notifications,
 * Keyboard Shortcuts, and PWA Installation.
 */

// Toast Notifications System
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  let iconSvg = '';
  if (type === 'success') {
    iconSvg = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" style="color:#10b981"><polyline points="20 6 9 17 4 12"></polyline></svg>';
  } else if (type === 'error') {
    iconSvg = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" style="color:#ef4444"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
  } else if (type === 'warning') {
    iconSvg = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" style="color:#f59e0b"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';
  } else {
    iconSvg = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" style="color:#3b82f6"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
  }

  toast.innerHTML = `${iconSvg}<span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}
window.showToast = showToast;

// Theme Toggle (Dark / Light Mode)
function initTheme() {
  const btnDark = document.getElementById('btnDarkMode');
  const moonIcon = document.getElementById('moonIcon');
  const sunIcon = document.getElementById('sunIcon');
  const savedTheme = localStorage.getItem('smart_pdf_theme') || 'light';

  function setTheme(theme) {
    if (theme === 'dark') {
      document.body.classList.remove('theme-light');
      document.body.classList.add('theme-dark');
      moonIcon.classList.add('hidden');
      sunIcon.classList.remove('hidden');
    } else {
      document.body.classList.remove('theme-dark');
      document.body.classList.add('theme-light');
      sunIcon.classList.add('hidden');
      moonIcon.classList.remove('hidden');
    }
    localStorage.setItem('smart_pdf_theme', theme);
  }

  setTheme(savedTheme);

  btnDark.addEventListener('click', () => {
    const isDark = document.body.classList.contains('theme-dark');
    setTheme(isDark ? 'light' : 'dark');
  });
}

// Navigation Tabs
function initNavTabs() {
  const tabs = document.querySelectorAll('.nav-tab');
  const panes = document.querySelectorAll('.tab-pane');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = tab.dataset.tab;

      tabs.forEach(t => t.classList.remove('active'));
      panes.forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const targetPane = document.getElementById(targetId);
      if (targetPane) {
        targetPane.classList.add('active');
      }
    });
  });
}

// Global Drag and Drop
function initGlobalDragDrop() {
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.name.toLowerCase().endsWith('.pdf')) {
        // If user drops on viewer tab, open it
        const activeTab = document.querySelector('.nav-tab.active');
        if (activeTab && activeTab.dataset.tab === 'tab-reader') {
          const reader = new FileReader();
          reader.onload = () => window.loadPdfDocument(reader.result, file.name);
          reader.readAsArrayBuffer(file);
        }
      }
    }
  });
}

// Keyboard Shortcuts
function initShortcuts() {
  window.addEventListener('keydown', (e) => {
    // Check if user is typing in an input
    const tag = e.target.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
      return;
    }

    // Ctrl + F: Open search
    if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
      e.preventDefault();
      const sb = document.getElementById('searchBar');
      if (sb) {
        sb.classList.remove('hidden');
        document.getElementById('searchInput').focus();
      }
      return;
    }

    // Arrow Left: Previous Page
    if (e.key === 'ArrowLeft') {
      if (window.ViewerState && window.ViewerState.pdfDoc) {
        document.getElementById('btnPrevPage')?.click();
      }
    }

    // Arrow Right: Next Page
    if (e.key === 'ArrowRight') {
      if (window.ViewerState && window.ViewerState.pdfDoc) {
        document.getElementById('btnNextPage')?.click();
      }
    }

    // Escape: Close search & modals
    if (e.key === 'Escape') {
      const sb = document.getElementById('searchBar');
      if (sb && !sb.classList.contains('hidden')) {
        sb.classList.add('hidden');
      }
      const sm = document.getElementById('signatureModal');
      if (sm && !sm.classList.contains('hidden')) {
        sm.classList.add('hidden');
      }
    }
  });
}

// PWA Install Prompt
let deferredPrompt = null;
function initPWA() {
  const installBtn = document.getElementById('btnInstallApp');

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.classList.remove('hidden');
  });

  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      showToast('Smart PDF ऐप इनस्टॉल हो गया!', 'success');
    }
    deferredPrompt = null;
    installBtn.classList.add('hidden');
  });

  // Register Service Worker for offline capability (bypass & clean on local dev servers like Go Live)
  if ('serviceWorker' in navigator) {
    const isLocalDev = location.hostname === '127.0.0.1' || location.hostname === 'localhost';
    if (isLocalDev) {
      if ('caches' in window) {
        caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => { });
      }
      navigator.serviceWorker.getRegistrations().then((regs) => {
        if (regs.length > 0) {
          Promise.all(regs.map((reg) => reg.unregister())).then(() => {
            if (navigator.serviceWorker.controller && !sessionStorage.getItem('sw_cleared_v6')) {
              sessionStorage.setItem('sw_cleared_v6', '1');
              window.location.reload();
            }
          });
        }
      }).catch(() => { });
    } else {
      navigator.serviceWorker.register('sw.js')
        .then((reg) => {
          reg.update();
          console.log('ServiceWorker registered successfully.');
        })
        .catch((err) => console.log('ServiceWorker registration error:', err));
    }
  }
}

// Desktop Launcher Integration: Heartbeat & Auto-Open Initial PDF
function initDesktopIntegration() {
  // 1. Heartbeat every 3 seconds to keep launcher process alive
  setInterval(() => {
    fetch('/api/heartbeat').catch(() => { });
  }, 3000);

  // Send first heartbeat immediately
  fetch('/api/heartbeat').catch(() => { });

  // 2. Check if a PDF was passed to launcher via "Open With" or double click
  fetch('/api/initial-pdf')
    .then(res => {
      if (res.status === 200) {
        const rawFilename = res.headers.get('X-Pdf-Filename') || 'document.pdf';
        let fileName = 'document.pdf';
        try { fileName = decodeURIComponent(rawFilename); } catch (e) { fileName = rawFilename; }
        return res.arrayBuffer().then(buf => {
          if (window.loadPdfDocument) {
            window.loadPdfDocument(buf, fileName);
          }
        });
      }
    })
    .catch(() => { });
}

// Android Native Integration (Initial PDF and Intent Listeners)
function initAndroidIntegration() {
  if (window.AndroidBridge) {
    try {
      if (typeof window.AndroidBridge.getPendingPdfData === 'function') {
        const base64Data = window.AndroidBridge.getPendingPdfData();
        const fileName = (typeof window.AndroidBridge.getPendingPdfName === 'function')
          ? window.AndroidBridge.getPendingPdfName()
          : 'document.pdf';

        if (base64Data && base64Data.length > 0) {
          if (window.loadPdfFromAndroid) {
            window.loadPdfFromAndroid(base64Data, fileName || 'document.pdf');
          }
          if (typeof window.AndroidBridge.clearPendingPdf === 'function') {
            window.AndroidBridge.clearPendingPdf();
          }
        }
      }
    } catch (e) {
      console.log('Android initial PDF check error:', e);
    }
  }
}

// App Bootstrap on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initNavTabs();
  initGlobalDragDrop();
  initShortcuts();
  initPWA();
  initDesktopIntegration();
  initAndroidIntegration();

  // Initialize modules
  if (window.initViewerEvents) window.initViewerEvents();
  if (window.initAnnotateEvents) window.initAnnotateEvents();
  if (window.initToolsEvents) window.initToolsEvents();

  console.log('Smart PDF Reader & Editor loaded successfully.');
});
