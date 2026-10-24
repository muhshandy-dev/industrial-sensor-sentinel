import { h, s, clear } from "./dom.js";
import { num, pct, seconds, MODEL_LABEL, MODE_LABEL, SCHEME_LABEL } from "./format.js";

export function renderErrors(root, summary, state, setState) {
  clear(root);
  const key = `p1_kalibrasi_awal|${state.model}|${state.mode}`;
  const a = summary.analisis_kesalahan[key];
  root.append(
    h("p", { class: "eyebrow" }, "Analisis kesalahan"),
    h("h1", null, "Di mana dan mengapa model keliru"),
    h("p", { class: "lead" }, `Alarm palsu adalah alarm yang menyala ketika mesin normal. Kejadian terlewat adalah anomali yang tidak memicu alarm. Analisis ini memakai ${SCHEME_LABEL.p1_kalibrasi_awal.toLowerCase()} pada rekaman uji.`),
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
    stat("Rekaman dengan kejadian terlewat", `${missed.length} dari ${rows.length}`, missed.map((r) => r.eksperimen).join(", ") || "Tidak ada"),
    stat("Titik anomali yang terlewat", pct(lateShare * 100, 0), "Dari semua titik anomali pada rekaman uji"),
    stat("Titik alarm palsu sebelum kejadian", num(fpBefore, 0), "Mesin masih normal"),
    stat("Titik alarm palsu sesudah kejadian", num(fpAfter, 0), "Mesin pulih, sensor belum kembali normal"),
  ));

  const findings = [
    `Anomali yang sinyalnya lemah paling sering terlewat. Korelasi Spearman antara besar pergeseran sensor dan proporsi titik terlewat adalah ${rho == null ? "tidak tersedia" : num(rho, 2)} (negatif berarti makin besar pergeseran, makin sedikit yang terlewat). Dengan hanya ${rows.length} rekaman, angka ini hanya petunjuk.`,
    fpAfter > fpBefore
      ? "Alarm palsu lebih banyak muncul sesudah kejadian daripada sebelumnya. Penyebab yang masuk akal: label SKAB berhenti saat kejadian selesai, sedangkan sensor masih butuh waktu untuk kembali normal. Ini tidak bisa dipastikan dari data."
      : "Alarm palsu lebih banyak muncul sebelum kejadian daripada sesudahnya.",
    "Satu rekaman dengan banyak alarm palsu bisa mendominasi total. Lihat kolom episode palsu di tabel untuk melihat sebaran per rekaman.",
  ];
  root.append(h("h2", null, "Temuan"), h("ul", { class: "clean" }, findings.map((f) => h("li", null, f))));

  root.append(h("div", { class: "table-wrap", tabindex: 0, role: "region", "aria-label": "Tabel. Geser ke samping untuk melihat kolom lain." }, h("table", null,
    h("caption", null, `Model ${MODEL_LABEL[state.model]}, mode ${MODE_LABEL[state.mode].toLowerCase()}.`),
    h("thead", null, h("tr", null,
      h("th", { scope: "col" }, "Rekaman"),
      h("th", { scope: "col" }, "Sensor paling bergeser"),
      h("th", { scope: "col", class: "n" }, "Pergeseran (simpangan baku)"),
      h("th", { scope: "col" }, "Hasil"),
      h("th", { scope: "col", class: "n" }, "Titik terlewat"),
      h("th", { scope: "col", class: "n" }, "Alarm palsu sebelum / sesudah"),
      h("th", { scope: "col", class: "n" }, "Episode palsu"))),
    h("tbody", null, rows.map((r) => {
      const sensor = summary.sensor.find((x) => x.id === r.sensor_paling_bergeser)?.label ?? r.sensor_paling_bergeser;
      return h("tr", null,
        h("th", { scope: "row" }, h("div", null, r.skenario), h("div", { class: "mono s" }, r.eksperimen)),
        h("td", null, sensor),
        h("td", { class: "n" }, num(r.pergeseran_sensor_sd, 1)),
        h("td", null, h("span", { class: `chip ${r.terdeteksi ? "ok" : "bad"}` }, r.terdeteksi ? `Terdeteksi, tunda ${seconds(r.tunda_detik)}` : "Terlewat")),
        h("td", { class: "n" }, `${r.titik_terlewat} dari ${r.titik_anomali}`),
        h("td", { class: "n" }, `${r.alarm_palsu_titik_sebelum} / ${r.alarm_palsu_titik_sesudah}`),
        h("td", { class: "n" }, `${r.episode_palsu}`),
      );
    })))));

  root.append(scatter(rows));
}

function stat(l, v, sub) {
  return h("div", { class: "panel stat" }, h("div", { class: "l" }, l), h("div", { class: "v" }, v), h("div", { class: "s" }, sub));
}

function scatter(rows) {
  const W = 520, H = 240, L = 44, B = 34, T = 12, R = 12;
  const xs = rows.map((r) => Math.log10(Math.max(r.pergeseran_sensor_sd, 0.5)));
  const xmin = Math.min(...xs, 0), xmax = Math.max(...xs, 2.5);
  const X = (v) => L + ((v - xmin) / (xmax - xmin)) * (W - L - R);
  const Y = (v) => T + (1 - v) * (H - T - B);
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Setiap titik adalah satu rekaman uji: makin kecil pergeseran sensor, makin besar bagian anomali yang terlewat." });
  for (const v of [0, 0.5, 1]) {
    svg.append(s("line", { class: "grid-line", x1: L, x2: W - R, y1: Y(v), y2: Y(v) }));
    svg.append(s("text", { class: "t-label", x: L - 6, y: Y(v) + 4, "text-anchor": "end" }, `${v * 100}%`));
  }
  for (const p of [0.5, 1, 10, 100]) {
    const v = Math.log10(p);
    if (v < xmin - 0.01 || v > xmax + 0.01) continue;
    svg.append(s("text", { class: "t-label", x: X(v), y: H - 14, "text-anchor": "middle" }, String(p)));
  }
  svg.append(s("text", { class: "t-label", x: (L + W - R) / 2, y: H - 1, "text-anchor": "middle" }, "Pergeseran sensor terbesar (simpangan baku, skala log)"));
  rows.forEach((r, i) => {
    const frac = r.titik_terlewat / r.titik_anomali;
    const c = s("circle", { cx: X(xs[i]), cy: Y(frac), r: 6, fill: r.terdeteksi ? "var(--signal)" : "var(--alarm)", stroke: "var(--bg)", "stroke-width": 1.5 });
    c.append(s("title", null, `${r.eksperimen}: ${Math.round(frac * 100)}% titik terlewat`));
    svg.append(c);
    svg.append(s("text", { class: "t-label", x: X(xs[i]) + 8, y: Y(frac) + 4 }, r.eksperimen));
  });
  return h("div", null, h("h2", null, "Sinyal lemah lebih sulit dideteksi"), h("div", { class: "panel chart-wrap" }, svg,
    h("p", { class: "chart-note" }, "Titik hijau: kejadian terdeteksi. Titik merah: kejadian terlewat sepenuhnya. Sumbu tegak: bagian titik anomali yang tidak memicu alarm.")));
}
