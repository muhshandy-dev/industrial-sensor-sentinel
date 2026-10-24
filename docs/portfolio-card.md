# Kartu Portofolio: Industrial Sensor Sentinel

Teks siap pakai untuk kartu proyek di portofolio Magic UI. Semua angka berasal dari `reports/results.json`.

## Isi kartu

- **Judul:** Industrial Sensor Sentinel
- **Kategori:** Industrial AI, deteksi anomali deret waktu
- **Tagline:** Deteksi anomali sensor pompa air dengan alarm yang bisa diputar ulang dan diuji.
- **Deskripsi singkat (2 kalimat):** Tiga detektor tanpa label (baseline ambang statistik, PCA, Isolation Forest) dilatih dan dinilai pada 8 sensor dataset SKAB dengan pembagian per rekaman yang bebas kebocoran. Website konsol memutar ulang 10 rekaman uji, menunjukkan kapan alarm menyala dibanding kejadian sebenarnya, dan menghitung ulang dampak batas alarm langsung di browser.
- **Angka utama:**
  - F1 0,77 (PCA, mode sensitif) pada 10 rekaman uji, baseline 0,73
  - 80 sampai 100 persen kejadian tertangkap, tunda median 39 sampai 55 detik
  - Reproduksi penuh identik byte per byte, 178 pemeriksaan browser otomatis
- **Teknologi:** Python, NumPy, pandas, scikit-learn, JavaScript (ES module tanpa framework), SVG, Playwright, axe-core, GitHub Actions, Cloudflare Pages
- **Tautan demo:** https://industrial-sensor-sentinel.pages.dev/
- **Tautan kode:** https://github.com/muhshandy-dev/industrial-sensor-sentinel
- **Label status:** Hasil batch dari data publik, bukan pemantauan langsung

## Peran saya

Saya menetapkan tujuan, batasan, dan standar kejujuran proyek; membuat repo dan proyek Cloudflare Pages; mengarahkan pengembangan yang dikerjakan bersama asisten AI (Claude Code); meninjau hasil evaluasi dan tampilan di setiap tahap, termasuk meminta rombak desain; dan memutuskan setiap merge ke produksi. Kode, eksperimen, dan pengujian ditulis dengan bantuan asisten AI di bawah arahan dan review saya.

## Catatan kejujuran untuk kartu

- Jangan sebut "real-time" atau "predictive maintenance". Yang benar: deteksi anomali pada rekaman tersimpan.
- Sebut bahwa keunggulan PCA atas baseline kecil (F1 +0,04) dan data uji hanya 10 rekaman.
- Notebook Kaggle tersedia tetapi belum dijalankan di Kaggle.
