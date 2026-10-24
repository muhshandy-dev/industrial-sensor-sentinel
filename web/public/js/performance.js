import { h, s, clear } from "./dom.js";
import { num, pct, seconds, ci, MODEL_LABEL, MODE_LABEL, SCHEME_LABEL, SCHEME_SHORT } from "./format.js";
import { loadAllExperiments } from "./data.js";
import { prPanel, thresholdPanel } from "./evalviz.js";
import { growBars } from "./motion.js";

export function renderPerformance(root, summary, state, setState) {
  clear(root);
  const scheme = state.scheme;
  const mode = state.mode;
  const models = Object.keys(MODEL_LABEL);
  const rows = models.map((m) => ({ id: m, r: summary.kinerja[scheme][m][mode] }));

  root.append(
    h("header", { class: "page-head" },
      h("h1", null, "Kinerja model"),
      h("p", { class: "lead" }, "Dihitung pada rekaman uji yang tidak dipakai untuk melatih atau menyetel apa pun. Rekaman uji sedikit, jadi angka utama disertai rentang ketidakpastian 95 persen.")),
  );

  const controls = h("div", { class: "panel controls" },
    h("div", { class: "field" }, h("span", { class: "lab" }, "Skema evaluasi"),
      h("div", { class: "seg", role: "group", "aria-label": "Skema evaluasi" }, Object.keys(SCHEME_LABEL).map((k) =>
        h("button", { type: "button", "aria-pressed": String(k === scheme), onclick: () => setState({ scheme: k }) }, SCHEME_LABEL[k])))),
    h("div", { class: "field" }, h("span", { class: "lab" }, "Mode peringatan"),
      h("div", { class: "seg", role: "group", "aria-label": "Mode peringatan" }, Object.keys(MODE_LABEL).map((k) =>
        h("button", { type: "button", "aria-pressed": String(k === mode), onclick: () => setState({ mode: k }) }, MODE_LABEL[k])))),
  );
  root.append(controls);

  root.append(h("div", { class: "callout info" },
    h("p", null, scheme === "p1_kalibrasi_awal"
      ? `${SCHEME_SHORT[scheme]}: setiap rekaman dikalibrasi dari ${summary.kalibrasi_awal_detik} detik pertamanya yang normal, lalu dipantau. Ini skema utama di website ini.`
      : `${SCHEME_SHORT[scheme]}: satu model per sesi dilatih dari riwayat normal rekaman yang lebih lama, lalu dipakai pada rekaman yang lebih baru. Skema ini menguji ketahanan terhadap pergeseran kondisi mesin.`),
    h("p", null, mode === "sensitif"
      ? "Mode sensitif: batas alarm dipilih agar skor F1 (keseimbangan antara alarm yang tepat dan anomali yang tertangkap) paling tinggi pada data penyetelan."
      : `Mode hemat alarm: skor F1 setinggi mungkin, dengan syarat alarm palsu paling banyak ${summary.grid.batas_alarm_palsu_per_jam_mode_hemat} kali per jam pada data penyetelan.`),
  ));

  // Batang F1 dan PR-AUC
  root.append(h("h2", null, "Perbandingan utama"));
  const bars = h("div", { class: "grid k2" },
    barPanel("Skor F1, makin tinggi makin baik", rows, (r) => r.uji.f1, (r) => r.uji.selang_95.f1),
    barPanel("Kualitas skor sebelum diberi batas alarm (PR-AUC)", rows, (r) => r.uji.pr_auc, null, rows[0].r.uji.prevalensi_anomali),
  );
  root.append(bars);

  // Grafik evaluasi interaktif dari skor rekaman uji (Skema A).
  const schemeNote = scheme === "p1_kalibrasi_awal" ? "" : " Grafik ini selalu memakai Skema A, karena skor per detik hanya disimpan untuk skema utama.";
  const prHost = h("div", null, h("p", { class: "loading" }, "Memuat skor rekaman uji"));
  const thrHost = h("div", null, h("p", { class: "loading" }, "Memuat skor rekaman uji"));
  root.append(
    h("h2", null, "Kurva presisi dan recall"),
    h("p", { class: "section-lead" }, `Setiap garis menunjukkan tarik ulur antara alarm yang tepat dan anomali yang tertangkap, untuk semua kemungkinan batas skor. Makin dekat ke kanan atas makin baik.${schemeNote}`),
    prHost,
    h("h2", null, "Dampak menggeser batas alarm"),
    h("p", { class: "section-lead" }, `Batas rendah menangkap lebih banyak kejadian tetapi menambah alarm palsu. Geser batas atau klik grafik untuk melihat tarik ulurnya.${schemeNote}`),
    thrHost,
  );
  const stops = [];
  loadAllExperiments(summary).then((exps) => {
    if (!root.isConnected) return;
    const pr = prPanel(exps, summary, mode);
    const th = thresholdPanel(exps, summary, mode);
    prHost.replaceChildren(pr.el);
    thrHost.replaceChildren(th.el);
    stops.push(pr.stop, th.stop);
    root.dataset.viz = "siap";
  }).catch(() => {
    prHost.replaceChildren(h("p", { class: "empty" }, "Skor rekaman uji belum bisa dimuat."));
    thrHost.replaceChildren();
  });

  // Tabel
  const th = (t, n) => h("th", { class: n ? "n" : "", scope: "col" }, t);
  const body = rows.map(({ id, r }) => {
    const t = r.uji;
    return h("tr", null,
      h("th", { scope: "row" }, MODEL_LABEL[id]),
      h("td", { class: "n" }, num(t.f1, 2), h("div", { class: "s" }, ci(t.selang_95.f1))),
      h("td", { class: "n" }, num(t.precision, 2)),
      h("td", { class: "n" }, num(t.recall, 2)),
      h("td", { class: "n" }, num(t.pr_auc, 2)),
      h("td", { class: "n" }, pct(t.recall_kejadian * 100, 0), h("div", { class: "s" }, `${ci(t.selang_95.recall_kejadian.map((v) => v * 100), 0)}%`)),
      h("td", { class: "n" }, seconds(t.tunda_deteksi_median_detik)),
      h("td", { class: "n" }, num(t.alarm_palsu_per_jam, 1), h("div", { class: "s" }, ci(t.selang_95.alarm_palsu_per_jam, 1))),
    );
  });
  root.append(h("p", { class: "table-note" }, `${rows[0].r.uji.n_eksperimen} rekaman uji, ${num(rows[0].r.uji.jam_normal_teramati, 1)} jam waktu normal teramati. Ketepatan: bagian waktu alarm yang memang anomali. Cakupan: bagian waktu anomali yang memicu alarm. Waktu sampai alarm: nilai tengah dari semua kejadian yang tertangkap. Angka kecil di bawah nilai adalah rentang 95 persen.`), h("div", { class: "table-wrap", tabindex: 0, role: "region", "aria-label": "Tabel. Geser ke samping untuk melihat kolom lain." }, h("table", null,
    h("caption", null, `${SCHEME_LABEL[scheme]}, mode ${MODE_LABEL[mode].toLowerCase()}`),
    h("thead", null, h("tr", null, h("th", { scope: "col" }, "Model"), th("Skor F1", 1), th("Ketepatan alarm (presisi)", 1), th("Cakupan anomali (recall)", 1), th("PR-AUC", 1), th("Kejadian tertangkap", 1), th("Waktu sampai alarm", 1), th("Alarm palsu per jam", 1))),
    h("tbody", null, body),
  )));

  // Perbandingan berpasangan
  const pairs = [["pca", "PCA"], ["isolation_forest", "Isolation Forest"]].map(([m, label]) => {
    const p = summary.perbandingan_berpasangan?.[`${scheme}|${mode}|${m}_dikurangi_ambang_statistik`];
    if (!p) return null;
    const lo = p.selang_95[0], hi = p.selang_95[1];
    const verdict = lo > 0 ? (p.selisih_f1 < 0.05 ? "sedikit lebih baik, selisihnya kecil" : "lebih baik") : hi < 0 ? "lebih buruk" : "belum terbukti berbeda";
    return h("li", null, `${label} dibanding ambang statistik: selisih skor F1 ${num(p.selisih_f1, 2)} (rentang 95% ${num(lo, 2)} sampai ${num(hi, 2)}). Kesimpulan: ${verdict}.`);
  }).filter(Boolean);
  root.append(h("h2", null, "Apakah model yang lebih rumit benar-benar lebih baik?"),
    h("p", null, "Kami membandingkan tiap model dengan baseline paling sederhana, ambang statistik, pada rekaman uji yang sama. Model lain hanya layak ditambah bila selisihnya terbukti positif."),
    h("ul", { class: "clean" }, pairs));

  // Matriks per rekaman
  const exps = summary.eksperimen;
  const cols = rows.map(({ id, r }) => ({ id, per: Object.fromEntries(r.uji_per_eksperimen.map((e) => [e.exp, e])) }));
  const matrix = exps.map((e) => h("tr", null,
    h("th", { scope: "row" }, h("div", null, e.skenario), h("div", { class: "mono",}, e.id)),
    cols.map((c) => {
      const r = c.per[e.id];
      if (!r) return h("td", null, h("span", { class: "chip mute" }, "tidak dinilai"));
      return h("td", null,
        h("span", { class: `chip ${r.event_detected ? "ok" : "bad"}` }, r.event_detected ? `Tertangkap, alarm setelah ${num(r.delay_seconds, 0)} detik` : "Terlewat"),
        h("div", { class: "s num" }, `${r.false_episodes} alarm palsu`));
    }),
  ));
  root.append(h("h2", null, "Hasil per rekaman uji"),
    h("p", { class: "table-note" }, "Satu kejadian anomali per rekaman. Alarm hanya dihitung benar bila mulai menyala saat kejadian berlangsung. Waktu 0 detik berarti alarm sudah menyala sebelum kejadian dan masih menyala saat kejadian dimulai; alarm itu juga dihitung palsu."),
    h("div", { class: "table-wrap", tabindex: 0, role: "region", "aria-label": "Tabel. Geser ke samping untuk melihat kolom lain." }, h("table", null,
      h("caption", null, "Hasil per rekaman uji untuk setiap model"),
      h("thead", null, h("tr", null, h("th", { scope: "col" }, "Rekaman"), models.map((m) => h("th", { scope: "col" }, MODEL_LABEL[m])))),
      h("tbody", null, matrix))));
  growBars(root);
  return () => { for (const f of stops) f(); };
}

function barPanel(title, rows, val, ciOf, baseline) {
  const W = 360, rowH = 34;
  const panel = h("div", { class: "panel pad" }, h("h3", null, title));
  const list = h("div", { class: "bars" });
  for (const { id, r } of rows) {
    const v = val(r);
    const range = ciOf ? ciOf(r) : null;
    const svg = s("svg", { viewBox: `0 0 ${W} 22`, role: "img", "aria-label": `${MODEL_LABEL[id]}: ${num(v, 2)}` });
    svg.append(s("rect", { x: 0, y: 8, width: W, height: 6, rx: 3, fill: "var(--grid)" }));
    svg.append(s("rect", { class: "bar-fill", x: 0, y: 8, width: Math.max(0, Math.min(1, v)) * W, height: 6, rx: 3, fill: `var(--${{ ambang_statistik: "m1", pca: "m2", isolation_forest: "m3" }[id]})` }));
    if (range) {
      svg.append(s("line", { x1: range[0] * W, x2: range[1] * W, y1: 11, y2: 11, stroke: "var(--text)", "stroke-width": 1.5 }));
      svg.append(s("line", { x1: range[0] * W, x2: range[0] * W, y1: 5, y2: 17, stroke: "var(--text)", "stroke-width": 1.5 }));
      svg.append(s("line", { x1: range[1] * W, x2: range[1] * W, y1: 5, y2: 17, stroke: "var(--text)", "stroke-width": 1.5 }));
    }
    if (baseline != null) svg.append(s("line", { x1: baseline * W, x2: baseline * W, y1: 2, y2: 20, stroke: "var(--truth)", "stroke-width": 2, "stroke-dasharray": "3 2" }));
    list.append(h("div", { class: "bar-row" }, h("span", { class: "name" }, MODEL_LABEL[id]), svg, h("span", { class: "val num" }, num(v, 2))));
  }
  panel.append(list);
  panel.append(h("p", { class: "chart-note" }, ciOf ? "Garis tegak di sekitar ujung batang menunjukkan rentang ketidakpastian 95 persen." : `Garis putus-putus kuning: nilai tebakan acak (${num(baseline, 2)}), yaitu porsi waktu yang anomali. Makin jauh di atas garis ini, makin baik.`));
  return panel;
}
