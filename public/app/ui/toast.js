// Bottom-right toast for short action feedback.

const el = () => document.getElementById('toast');
let timer = 0;
const SHOW_MS = 2200;

export function showToast(msg) {
  const t = el();
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(timer);
  timer = setTimeout(() => t.classList.remove('show'), SHOW_MS);
}
