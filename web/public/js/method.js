import { h, clear } from "./dom.js";
import { num } from "./format.js";

export function renderMethod(root, summary) {
  clear(root);
  const sp = summary.pembagian;
  const p = summary.profil;
  const sessionRows = Object.entries(p.sesi).map(([date, n]) => {
    const inSession = (list) => list.filter((e) => sp.session_of[e] === date);
    return h("tr", null,
      h("th", { scope: "row" }, date),
      h("td", { class: "n" }, String(n)),
      h("td", null, inSession(sp.train).join(", ")),
      h("td", null, inSession(sp.val).join(", ")),
      h("td", null, inSession(sp.purge).join(", ") || "tidak ada"),
      h("td", null, inSession(sp.test).join(", ")));
  });
  root.append(
    h("p", { class: "eyebrow" }, "Metodologi dan keterbatasan"),
    h("h1", null, "Bagaimana hasil ini dibuat"),
    h("h2", null, "Data"),
    h("p", null, `Skoltech Anomaly Benchmark (SKAB), versi pada commit ${summary.sumber_data.commit.slice(0, 7)}, lisensi GPL-3.0. Ada ${p.jumlah_berkas} berkas: ${p.eksperimen_berlabel} rekaman berlabel dan satu rekaman normal tanpa label. Tiap rekaman berisi delapan sensor yang dicatat sekitar tiap detik, dan tepat satu kejadian anomali yang berurutan.`),
    h("h2", null, "Pembagian data tanpa kebocoran"),
    h("p", null, "Pembagian dilakukan per rekaman, bukan per baris, karena baris yang bertetangga hampir sama. Dalam tiap sesi perekaman (tanggal yang sama, pengaturan pompa yang sama), rekaman diurutkan menurut waktu: bagian awal untuk latih, lalu validasi, satu rekaman pemisah, dan bagian paling akhir untuk uji."),
    h("div", { class: "table-wrap", tabindex: 0, role: "region", "aria-label": "Tabel. Geser ke samping untuk melihat kolom lain." }, h("table", null,
      h("caption", null, "Pembagian rekaman per sesi"),
      h("thead", null, h("tr", null, h("th", null, "Sesi"), h("th", { class: "n" }, "Rekaman"), h("th", null, "Latih"), h("th", null, "Validasi"), h("th", null, "Pemisah"), h("th", null, "Uji"))),
      h("tbody", null, sessionRows))),
    h("h2", null, "Dua skema evaluasi"),
    h("ul", { class: "clean" },
      h("li", null, `Skema A, kalibrasi awal (utama): model dikalibrasi dari ${summary.kalibrasi_awal_detik} detik pertama tiap rekaman, yang normal. Ambang, ketekunan, dan jendela fitur dipilih pada rekaman latih dan validasi, lalu dinilai sekali pada rekaman uji. Rekaman yang anomalinya muncul sebelum kalibrasi selesai tidak bisa dinilai dengan skema ini.`),
      h("li", null, "Skema B, riwayat normal: satu model per sesi dilatih dari bagian normal rekaman latih, ambang dipilih pada rekaman validasi, lalu dinilai pada rekaman uji yang lebih baru."),
    ),
    h("h2", null, "Model"),
    h("ul", { class: "clean" },
      h("li", null, "Ambang statistik: skor adalah simpangan terbesar sensor dari rata-rata normalnya. Ini baseline."),
      h("li", null, "PCA: skor dari dua ukuran, T2 (jarak di dalam pola normal) dan Q (sisa yang tidak dijelaskan pola normal)."),
      h("li", null, "Isolation Forest: skor dari seberapa mudah suatu titik dipisahkan dari data normal."),
      h("li", null, "Semua model tanpa label. Fitur hanya memakai data sampai saat ini, tidak melihat ke depan."),
    ),
    h("h2", null, "Metrik"),
    h("ul", { class: "clean" },
      h("li", null, "Skor F1, presisi, dan recall dihitung per titik waktu, digabung dari semua rekaman uji. PR-AUC menilai urutan skor tanpa ambang."),
      h("li", null, "Kejadian terdeteksi: ada alarm yang menyala saat kejadian berlangsung. Tunda deteksi: detik dari awal kejadian sampai alarm pertama."),
      h("li", null, "Alarm palsu: alarm yang mulai menyala di luar kejadian, dihitung per jam waktu normal teramati. Selisih waktu lebih dari 5 detik antar pengukuran tidak dihitung sebagai waktu teramati."),
      h("li", null, "Selang 95 persen dihitung dengan sampel ulang rekaman (bukan baris), 1000 kali."),
    ),
    h("h2", null, "Keterbatasan"),
    h("ul", { class: "clean" },
      h("li", null, `Hanya ${sp.test.length} rekaman uji dengan ${sp.test.length} kejadian. Selang kepercayaan lebar, dan perbedaan kecil antar model tidak bisa dianggap pasti.`),
      h("li", null, "Semua data berasal dari satu rig uji kecil dengan air. Hasil tidak otomatis berlaku untuk mesin lain."),
      h("li", null, "Label SKAB dibuat manual dan satu kejadian per rekaman. Batas awal dan akhir kejadian bisa tidak tepat, terutama pada fase pemulihan."),
      h("li", null, "Cap waktu beberapa rekaman bertetangga saling tumpang tindih, sehingga urutan antar rekaman hanya memakai waktu mulai. Rekaman pemisah dipakai untuk mengurangi pengaruhnya."),
      h("li", null, "Skema A memerlukan awal rekaman yang normal. Bila mesin sudah bermasalah saat pemantauan dimulai, kalibrasi menjadi salah."),
      h("li", null, "Angka di sini tidak dapat dibandingkan langsung dengan papan peringkat SKAB, karena protokol pembagian dan definisi alarm berbeda."),
      h("li", null, "Pelatihan dijalankan di sesi pengembangan. Notebook Kaggle disediakan di repo untuk mereproduksi hasil yang sama."),
    ),
    h("h2", null, "Reproduksi"),
    h("p", null, h("a", { href: "https://github.com/muhshandy-dev/industrial-sensor-sentinel", rel: "noopener" }, "Repositori GitHub"), " memuat kode, Data Card, Model Card, dan langkah reproduksi."),
  );
}
