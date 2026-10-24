import { h, clear } from "./dom.js";
import { num, pct, MODEL_LABEL } from "./format.js";

export function renderOverview(root, summary) {
  clear(root);
  const p = summary.profil;
  const a = summary.kinerja.p1_kalibrasi_awal;
  const best = Object.keys(MODEL_LABEL)
    .map((m) => ({ m, r: a[m].sensitif.uji }))
    .sort((x, y) => y.r.f1 - x.r.f1)[0];
  const test = summary.pembagian.test.length;

  root.append(
    h("p", { class: "eyebrow" }, "Deteksi anomali dan peringatan dini sensor industri"),
    h("h1", null, "Industrial Sensor Sentinel"),
    h("p", { class: "lead" }, "Sistem ini mempelajari kondisi normal sebuah pompa dari delapan sensor, lalu memberi peringatan ketika pola sensor menyimpang. Semua hasil dihitung dari data rekaman SKAB dan dinilai pada rekaman yang belum pernah dilihat model."),
    h("div", { class: "callout" },
      h("p", null, "Penting: halaman ini menampilkan hasil batch yang dihitung sebelumnya. Tidak ada sensor yang terhubung dan tidak ada prediksi langsung. Anda bisa menggeser ambang alarm, dan alarm dihitung ulang di browser dari skor yang tersimpan.")),
    h("div", { class: "grid k4" },
      stat("Rekaman berlabel", num(p.eksperimen_berlabel, 0), `${num(p.total_baris_berlabel, 0)} pengukuran, tiap detik`),
      stat("Rekaman uji", num(test, 0), "Tidak dipakai untuk melatih atau menyetel"),
      stat("Skor F1 terbaik pada uji", num(best.r.f1, 2), `${MODEL_LABEL[best.m]}, mode sensitif. Selang 95%: ${num(best.r.selang_95.f1[0], 2)} sampai ${num(best.r.selang_95.f1[1], 2)}`),
      stat("Anomali dalam data", pct(p.persen_anomali, 0), "Dari seluruh pengukuran berlabel"),
    ),
    h("h2", null, "Mulai dari mana"),
    h("div", { class: "grid k3" },
      card("#/konsol", "Konsol pemantauan", "Pilih rekaman uji dan lihat alarm model dibandingkan dengan kejadian sebenarnya, lengkap dengan delapan sensor."),
      card("#/kinerja", "Kinerja model", "Bandingkan ambang statistik, PCA, dan Isolation Forest dengan selang kepercayaan."),
      card("#/kesalahan", "Analisis kesalahan", "Lihat rekaman mana yang terlewat dan kapan alarm palsu muncul."),
    ),
    h("h2", null, "Temuan utama"),
    h("ul", { class: "clean" }, findings(summary).map((t) => h("li", null, t))),
    h("h2", null, "Cara membaca hasil"),
    h("ul", { class: "clean" },
      h("li", null, "Setiap rekaman SKAB berisi satu kejadian anomali, misalnya katup ditutup atau air bersuhu tinggi dialirkan."),
      h("li", null, "Alarm dianggap sah hanya bila mulai menyala saat kejadian berlangsung. Alarm yang sudah menyala sebelumnya dihitung palsu."),
      h("li", null, "Model dilatih tanpa label. Label hanya dipakai untuk memilih ambang pada rekaman penyetelan, lalu dinilai sekali pada rekaman uji."),
    ),
  );
}

function findings(summary) {
  const a = summary.kinerja.p1_kalibrasi_awal;
  const b = summary.kinerja.p2_riwayat_normal;
  const out = [];
  const f = (x, m, mode) => x[m][mode].uji.f1;
  out.push(`Pada skema utama (kalibrasi awal), ketiga model mencapai skor F1 sekitar ${num(Math.min(...Object.keys(MODEL_LABEL).map((m) => f(a, m, "sensitif"))), 2)} sampai ${num(Math.max(...Object.keys(MODEL_LABEL).map((m) => f(a, m, "sensitif"))), 2)} pada rekaman uji. Selang kepercayaannya saling tumpang tindih, jadi urutan antar model belum pasti.`);
  const pc = summary.perbandingan_berpasangan["p1_kalibrasi_awal|sensitif|pca_dikurangi_ambang_statistik"];
  if (pc) out.push(`Baseline ambang statistik yang sangat sederhana hampir menyamai model yang lebih rumit. Keunggulan PCA atas baseline hanya ${num(pc.selisih_f1, 2)} poin F1 (selang 95% ${num(pc.selang_95[0], 2)} sampai ${num(pc.selang_95[1], 2)}).`);
  const drop = f(a, "pca", "sensitif") - f(b, "pca", "sensitif");
  out.push(`Model yang dilatih dari riwayat normal (skema B) turun ${num(drop, 2)} poin F1 untuk PCA dibanding kalibrasi awal. Kondisi mesin bergeser antar rekaman, sehingga kalibrasi di awal setiap pemantauan lebih andal.`);
  out.push("Mode hemat alarm menekan alarm palsu, tetapi sebagian anomali dengan sinyal lemah tidak lagi terdeteksi.");
  return out;
}

function stat(l, v, sub) {
  return h("div", { class: "panel stat" }, h("div", { class: "l" }, l), h("div", { class: "v" }, v), h("div", { class: "s" }, sub));
}
function card(href, title, text) {
  return h("a", { class: "panel pad", href }, h("h3", null, title), h("p", { class: "s" }, text));
}
