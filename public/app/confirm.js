// Inline two-click arm-then-commit confirmation, ported verbatim from the
// reference frontend. ONE shared document-level listener (capture phase)
// disarms any armed button when the user clicks elsewhere; per-button state
// lives in a WeakMap so re-rendering rows can't stack listeners.
//
// Don't regress the listener-stacking bug — see CLAUDE.md and the reference.

const CONFIRM_STATE = new WeakMap();
const ARM_TIMEOUT_MS = 3000;

// Capture phase so we run before the button's own click handler. If a click
// lands on (or inside) an armed button, we leave it alone — its own handler
// will commit. Any other click anywhere disarms every armed button.
document.addEventListener(
  'click',
  (e) => {
    document.querySelectorAll('button.confirming').forEach((btn) => {
      const state = CONFIRM_STATE.get(btn);
      if (!state || !state.armed) return;
      if (e.target === btn || btn.contains(e.target)) return;
      disarmButton(btn);
    });
  },
  true
);

export function disarmButton(btn) {
  const state = CONFIRM_STATE.get(btn);
  if (!state) return;
  state.armed = false;
  btn.classList.remove('confirming');
  btn.textContent = state.originalLabel;
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
}

/**
 * Wire a button to require two clicks. Idempotent — calling again on the same
 * button updates labels/callback without stacking listeners. New DOM nodes
 * (e.g. row buttons after a re-render) get a fresh state entry.
 */
export function setupConfirmButton(btn, originalLabel, confirmLabel, onConfirm) {
  let state = CONFIRM_STATE.get(btn);
  if (state) {
    state.originalLabel = originalLabel;
    state.confirmLabel = confirmLabel;
    state.onConfirm = onConfirm;
    if (!state.armed) btn.textContent = originalLabel;
    return;
  }

  state = {
    armed: false,
    timer: null,
    originalLabel,
    confirmLabel,
    onConfirm,
  };
  CONFIRM_STATE.set(btn, state);
  btn.textContent = originalLabel;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const s = CONFIRM_STATE.get(btn);
    if (!s) return;
    if (!s.armed) {
      s.armed = true;
      btn.classList.add('confirming');
      btn.textContent = s.confirmLabel;
      s.timer = setTimeout(() => disarmButton(btn), ARM_TIMEOUT_MS);
    } else {
      const cb = s.onConfirm;
      disarmButton(btn);
      cb();
    }
  });
}
