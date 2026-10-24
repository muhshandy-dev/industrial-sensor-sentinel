// Pembantu gerak. Semua animasi memakai transform dan opacity, dan berhenti bila
// pengguna meminta gerak dikurangi. Tidak ada gaya sebaris di HTML: nilai diatur lewat CSSOM.
import { h, s } from "./dom.js";

const mq = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
export const reduceMotion = () => Boolean(mq && mq.matches);

if (typeof document !== "undefined" && "IntersectionObserver" in window && !reduceMotion()) {
  document.documentElement.classList.add("motion");
}

let io = null;
// Elemen dengan atribut data-reveal muncul saat pertama kali terlihat.
// Nilai atribut adalah urutan dalam kelompok, untuk jeda bertingkat yang singkat.
export function reveal(root) {
  const els = [...root.querySelectorAll("[data-reveal]:not(.in)")];
  if (!document.documentElement.classList.contains("motion")) {
    for (const e of els) e.classList.add("in");
    return;
  }
  io ||= new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      en.target.classList.add("in");
      io.unobserve(en.target);
    }
  }, { rootMargin: "0px 0px -6% 0px", threshold: 0.05 });
  for (const e of els) {
    const order = Math.min(Number(e.dataset.reveal) || 0, 8);
    e.style.setProperty("--d", `${order * 70}ms`);
    io.observe(e);
  }
}

// Transisi singkat saat berpindah halaman.
export function enter(el) {
  if (reduceMotion() || !el.animate) return;
  el.animate(
    [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }],
    { duration: 260, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" },
  );
}

const chevron = () => s("svg", { class: "chev", viewBox: "0 0 24 24", width: 20, height: 20, fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", focusable: "false" }, s("path", { d: "M6 9l6 6 6-6" }));

// Panel lipat berbasis <details>, dengan transisi tinggi yang halus.
export function accordion(title, sub, body, { open = false, id = null } = {}) {
  const inner = h("div", { class: "acc-inner" }, body);
  const wrap = h("div", { class: "acc-body" }, inner);
  const summary = h("summary", null, h("span", null, title, sub ? h("span", { class: "sub" }, sub) : null), chevron());
  const d = h("details", { class: "acc panel", open, id }, summary, wrap);
  let anim = null;
  summary.addEventListener("click", (ev) => {
    if (reduceMotion() || !wrap.animate) return;
    ev.preventDefault();
    if (anim) anim.cancel();
    if (d.open) {
      const from = wrap.offsetHeight;
      anim = wrap.animate([{ height: `${from}px`, opacity: 1 }, { height: "0px", opacity: 0 }], { duration: 220, easing: "cubic-bezier(0.4, 0, 0.2, 1)" });
      anim.onfinish = () => { d.open = false; anim = null; };
    } else {
      d.open = true;
      const to = wrap.offsetHeight;
      anim = wrap.animate([{ height: "0px", opacity: 0 }, { height: `${to}px`, opacity: 1 }], { duration: 280, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" });
      anim.onfinish = () => { anim = null; };
    }
  });
  return d;
}

// Animasi lebar batang dari nol, sekali saat pertama terlihat.
export function growBars(root) {
  if (reduceMotion()) return;
  const bars = [...root.querySelectorAll(".bar-fill")];
  if (!bars.length || !("IntersectionObserver" in window)) return;
  const obs = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      obs.unobserve(en.target);
      en.target.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: 700, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)", delay: 80 });
    }
  });
  for (const b of bars) obs.observe(b);
}
