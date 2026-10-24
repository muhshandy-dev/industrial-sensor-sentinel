import { h, s, clear } from "./dom.js";
import { num, pct, seconds, MODEL_LABEL, MODE_LABEL } from "./format.js";
import { loadAllExperiments } from "./data.js";
import { errorTimeline } from "./evalviz.js";
import { reveal } from "./motion.js";

export function renderErrors(root, summary, state, setState) {
  clear(root);
  const key = `p1_kalibrasi_awal|${state.model}|${state.mode}`;
  const a = summary.analisis_kesalahan[key];
  root.append(
    h("p", { class: "eyebrow" }, "Analisis kesalahan"),
    h("h1", null, "Di mana dan mengapa model keliru"),
    h("p", { class: "lead" }, "Alarm palsu adalah alarm yang menyala ketika mesin normal. Kejadian terlewat adalah anomali yang tidak memicu alarm sama sekali. Analisis ini memakai Skema A (kalibrasi awal) pada rekaman uji."),
  );
  const seg = (values, labels, cur, k, name) => h("div", { class: "seg", role: "group", "aria-label": name }, values.map((v) => h("button", { type: "button", "aria-pressed": String(v === cur), onclick: () => setState({ [k]: v }) }, labels[v])));
  root.append(h("div", { class: "panel controls" },
    h("div", { class: "field" }, h("span", { class: "lab" }, "Model"), seg(Object.keys(MODEL_LABEL), MODEL_LABEL, state.model, "model", "Model")),
    h("div", { class: "field" }, h("span", { class: "lab" }, "Mode"), seg(Object.keys(MODE_LABEL), MODE_LABEL, state.mode, "mode", "Mode")),
  ));
  if (!a) { root.append(h("p", { class: "empty" }, "Tidak ada data untuk pilihan ini.")); return; }

  const rows = a.per_eksperimen;
  const missed = rows.filter((r) => !r.terdeteksi);
  const lateShare = rows.reduce((t, r) => t + r.titik_terlewat, 0) / rows.reduce((t, r) => t + r.titik_anomali, 0);
  const fpBefore = a.alarm_palsu_titik_sebelum, fpAfter = a.alarm_palsu_titik_sesudah;
  const rho = a.korelasi_pergeseran_dan_proporsi_terlewat_spearman;
  root.append(h("div", { class: "grid k4" },
    stat("Kejadian yang terlewat", `${missed.length} dari ${rows.length}`, missed.map((r) => r.eksperimen).join(", ") || "Semua kejadian tertangkap"),
    stat("Bagian anomali tanpa alarm", pct(lateShare * 100, 0), "Termasuk detik awal sebelum alarm menyala"),
    stat("Alarm palsu sebelum kejadian", `${num(fpBefore, 0)} pengukuran`, "Mesin masih normal. Satu pengukuran kira-kira satu detik."),
    stat("Alarm palsu sesudah kejadian", `${num(fpAfter, 0)} pengukuran`, "Label sudah normal, sensor belum pulih"),
  ));

  const tlHost = h("div", null, h("p", { class: "loading" }, "Memuat garis waktu"));
  root.append(h("h2", null, "Garis waktu alarm pada semua rekaman uji"),
    h("p", { class: "section-lead" }, "Lihat sekaligus di mana alarm benar, alarm palsu, dan kejadian yang terlewat. Diambil langsung dari hasil evaluasi."),
    tlHost);
  loadAllExperiments(summary).then((exps) => {
    if (!root.isConnected) return;
    tlHost.replaceChildren(errorTimeline(exps, state.model, state.mode));
    reveal(tlHost);
    root.dataset.viz = "siap";
  }).catch(() => tlHost.replaceChildren(h("p", { class: "empty" }, "Garis waktu belum bisa dimuat.")));

  const findings = [
    rho != null && rho < 0
      ? `Anomali yang mengubah sensor hanya sedikit paling sering terlewat. Pada rekaman uji, makin kecil perubahan sensor, makin besar bagian anomali yang tidak memicu alarm. Dengan hanya ${rows.length} rekaman, pola ini baru petunjuk, belum kesimpulan. Ukuran statistiknya ada di halaman Metodologi.`
      : `Pada pilihan ini tidak terlihat hubungan yang jelas antara besar perubahan sensor dan bagian anomali yang terlewat. Dengan hanya ${rows.length} rekaman, pola apa pun masih belum pasti.`,
    fpAfter > fpBefore
      ? "Alarm palsu lebih banyak muncul sesudah kejadian daripada sebelumnya. Penyebab yang masuk akal: label SKAB berhenti saat kejadian selesai, sedangkan sensor masih butuh waktu untuk kembali normal. Ini tidak bisa dipastikan dari data."
      : "Alarm palsu lebih banyak muncul sebelum kejadian daripada sesudahnya.",
    "Satu rekaman dengan banyak alarm palsu bisa mendominasi total. Kolom jumlah alarm palsu di tabel menunjukkan sebarannya per rekaman.",
  ];
  root.append(h("h2", null, "Temuan"), h("ul", { class: "clean" }, findings.map((f) => h("li", null, f))));

  root.append(h("div", { class: "table-wrap", tabindex: 0, role: "region", "aria-label": "Tabel. Geser ke samping untuk melihat kolom lain." }, h("table", null,
    h("caption", null, `Model ${MODEL_LABEL[state.model]}, mode ${MODE_LABEL[state.mode].toLowerCase()}. Besar perubahan: seberapa jauh sensor bergeser dibanding variasi normalnya. Tanpa alarm: bagian waktu anomali yang tidak memicu alarm. Alarm palsu: berapa kali alarm mulai menyala di luar kejadian.`),
    h("thead", null, h("tr", null,
      h("th", { scope: "col" }, "Rekaman"),
      h("th", { scope: "col" }, "Sensor paling berubah"),
      h("th", { scope: "col", class: "n" }, "Besar perubahan"),
      h("th", { scope: "col" }, "Hasil"),
      h("th", { scope: "col", class: "n" }, "Tanpa alarm"),
      h("th", { scope: "col", class: "n" }, "Alarm palsu"))),
    h("tbody", null, rows.map((r) => {
      const sensor = summary.sensor.find((x) => x.id === r.sensor_paling_bergeser)?.label ?? r.sensor_paling_bergeser;
      return h("tr", null,
        h("th", { scope: "row" }, h("div", null, r.skenario), h("div", { class: "mono s" }, r.eksperimen)),
        h("td", null, sensor),
        h("td", { class: "n" }, `${num(r.pergeseran_sensor_sd, 1)} kali`),
        h("td", null, h("span", { class: `chip ${r.terdeteksi ? "ok" : "bad"}` }, r.terdeteksi ? `Tertangkap, alarm setelah ${seconds(r.tunda_detik)}` : "Terlewat")),
        h("td", { class: "n" }, pct((r.titik_terlewat / r.titik_anomali) * 100, 0)),
        h("td", { class: "n" }, `${r.episode_palsu} kali`),
      );
    })))));

  root.append(scatter(rows));
}

function stat(l, v, sub) {
  return h("div", { class: "panel stat" }, h("div", { class: "l" }, l), h("div", { class: "v" }, v), h("div", { class: "s" }, sub));
}

function scatter(rows) {
  // Layar sempit memakai bidang gambar lebih kecil agar teks tetap terbaca.
  const small = window.matchMedia("(max-width: 600px)").matches;
  const W = small ? 360 : 560, H = small ? 230 : 250, L = 40, B = 36, T = 14, R = small ? 16 : 24;
  const xs = rows.map((r) => Math.log10(Math.max(r.pergeseran_sensor_sd, 0.5)));
  const xmin = Math.min(...xs, 0), xmax = Math.max(...xs, 2.5);
  const X = (v) => L + ((v - xmin) / (xmax - xmin)) * (W - L - R);
  const Y = (v) => T + (1 - v) * (H - T - B);
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Setiap titik adalah satu rekaman uji: makin kecil perubahan sensor, makin besar bagian anomali yang tidak memicu alarm." });
  for (const v of [0, 0.5, 1]) {
    svg.append(s("line", { class: "grid-line", x1: L, x2: W - R, y1: Y(v), y2: Y(v) }));
    svg.append(s("text", { class: "t-label", x: L - 6, y: Y(v) + 4, "text-anchor": "end" }, `${v * 100}%`));
  }
  for (const p of [1, 10, 100]) {
    const v = Math.log10(p);
    if (v < xmin - 0.01 || v > xmax + 0.01) continue;
    svg.append(s("text", { class: "t-label", x: X(v), y: H - 16, "text-anchor": "middle" }, `${p}x`));
  }
  svg.append(s("text", { class: "t-label", x: (L + W - R) / 2, y: H - 2, "text-anchor": "middle" }, small ? "Perubahan dibanding variasi normal" : "Besar perubahan sensor dibanding variasi normal"));
  const pts = rows.map((r, i) => ({ r, x: X(xs[i]), y: Y(r.titik_terlewat / r.titik_anomali), frac: r.titik_terlewat / r.titik_anomali }));
  for (const p of pts) {
    const c = s("circle", { cx: p.x, cy: p.y, r: 6, fill: p.r.terdeteksi ? "var(--signal)" : "var(--alarm)", stroke: "var(--bg)", "stroke-width": 1.5 });
    c.append(s("title", null, `${p.r.eksperimen}: ${Math.round(p.frac * 100)}% tanpa alarm`));
    svg.append(c);
  }
  return h("div", null, h("h2", null, "Perubahan kecil lebih sulit dideteksi"), h("div", { class: "panel chart-wrap narrow" }, svg,
    h("p", { class: "chart-note" }, "Titik hijau: kejadian tertangkap. Titik merah: kejadian terlewat sepenuhnya. Sumbu tegak: bagian waktu anomali yang tidak memicu alarm. Nama tiap rekaman muncul saat kursor diarahkan ke titik. Angka lengkapnya ada di tabel di atas.")));
}
