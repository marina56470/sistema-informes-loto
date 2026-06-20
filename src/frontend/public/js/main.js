/* ════════════════════════════════════════════
   LOTO PRO — main.js
   Modal de confirmación + Toast notifications
   ════════════════════════════════════════════ */

// ── TOAST SYSTEM ─────────────────────────────────────────────────────────────
const Toast = {
  container: null,

  init() {
    if (this.container) return;
    this.container = document.createElement('div');
    this.container.id = 'toast-container';
    document.body.appendChild(this.container);
  },

  show(message, type = 'success', duration = 4000) {
    this.init();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icons = {
      success: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
      error:   `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
      warning: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
      info:    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
    };

    toast.innerHTML = `
      <div class="toast-icon">${icons[type] || icons.info}</div>
      <div class="toast-msg">${message}</div>
      <button class="toast-close" onclick="this.parentElement.remove()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      <div class="toast-bar"></div>
    `;

    this.container.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => toast.classList.add('toast-in'));
    });

    // Barra de progreso
    const bar = toast.querySelector('.toast-bar');
    bar.style.transitionDuration = duration + 'ms';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => bar.classList.add('toast-bar-run'));
    });

    // Auto-dismiss
    const timer = setTimeout(() => this.dismiss(toast), duration);
    toast.addEventListener('mouseenter', () => clearTimeout(timer));
    toast.addEventListener('mouseleave', () => {
      setTimeout(() => this.dismiss(toast), 1200);
    });
  },

  dismiss(toast) {
    toast.classList.remove('toast-in');
    toast.classList.add('toast-out');
    setTimeout(() => toast.remove(), 380);
  },
};

// Convertir flash messages del servidor en toasts
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.flash').forEach(el => {
    const type = el.classList.contains('flash-success') ? 'success' : 'error';
    Toast.show(el.textContent.trim(), type);
    el.remove();
  });
});

// ── MODAL DE CONFIRMACIÓN ─────────────────────────────────────────────────────
const Modal = {
  el: null,
  resolveRef: null,

  init() {
    if (document.getElementById('confirm-modal')) return;
    const m = document.createElement('div');
    m.id = 'confirm-modal';
    m.innerHTML = `
      <div class="modal-backdrop" id="modal-backdrop"></div>
      <div class="modal-box" role="dialog" aria-modal="true">
        <div class="modal-icon-wrap" id="modal-icon-wrap">
          <svg id="modal-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
          </svg>
        </div>
        <h2 class="modal-title" id="modal-title">¿Estás seguro?</h2>
        <p class="modal-body" id="modal-body">Esta acción no se puede deshacer.</p>
        <div class="modal-actions">
          <button class="modal-btn modal-btn-cancel" id="modal-cancel">Cancelar</button>
          <button class="modal-btn modal-btn-confirm" id="modal-confirm">Confirmar</button>
        </div>
      </div>
    `;
    document.body.appendChild(m);
    this.el = m;

    document.getElementById('modal-cancel').addEventListener('click', () => this.resolve(false));
    document.getElementById('modal-backdrop').addEventListener('click', () => this.resolve(false));
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this.el.classList.contains('modal-open')) this.resolve(false);
    });
  },

  show({ title, body, confirmText = 'Sí, eliminar', confirmClass = 'modal-btn-danger', icon = 'trash' } = {}) {
    this.init();

    const icons = {
      trash: `<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>`,
      warning: `<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>`,
      check: `<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>`,
    };

    document.getElementById('modal-title').textContent   = title || '¿Estás seguro?';
    document.getElementById('modal-body').textContent    = body  || 'Esta acción no se puede deshacer.';
    document.getElementById('modal-icon').innerHTML      = icons[icon] || icons.trash;
    document.getElementById('modal-icon-wrap').className = `modal-icon-wrap modal-icon-${icon}`;

    const btn = document.getElementById('modal-confirm');
    btn.textContent = confirmText;
    btn.className   = `modal-btn ${confirmClass}`;

    this.el.classList.add('modal-open');
    document.getElementById('modal-cancel').focus();

    return new Promise(resolve => { this.resolveRef = resolve; });
  },

  resolve(value) {
    this.el.classList.remove('modal-open');
    if (this.resolveRef) { this.resolveRef(value); this.resolveRef = null; }
  },
};

// Botón confirm del modal conectado
document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('click', e => {
    const btn = e.target.closest('#modal-confirm');
    if (btn) Modal.resolve(true);
  });
});

// ── INTERCEPTAR TODOS LOS FORMULARIOS DE BORRADO ──────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-modal-confirm]').forEach(trigger => {
    trigger.addEventListener('click', async e => {
      e.preventDefault();

      const config = {
        title:        trigger.dataset.modalTitle   || '¿Eliminar este elemento?',
        body:         trigger.dataset.modalBody    || 'Esta acción no se puede deshacer.',
        confirmText:  trigger.dataset.modalConfirm || 'Sí, eliminar',
        confirmClass: trigger.dataset.modalClass   || 'modal-btn-danger',
        icon:         trigger.dataset.modalIcon    || 'trash',
      };

      const ok = await Modal.show(config);
      if (!ok) return;

      // Si el trigger es un botón dentro de un form, submit el form
      const form = trigger.closest('form') || document.querySelector(trigger.dataset.formTarget);
      if (form) form.submit();
    });
  });
});

// ── TOAST GLOBAL (para usar desde cualquier vista) ───────────────────────────
window.Toast = Toast;
window.Modal = Modal;