# Laporan Evaluasi

Laporan ini merangkum hasil uji dari `reports/results.json` (SHA-256 berawalan `7f9284630a005a22`). Semua angka di website diambil dari berkas yang sama dan diperiksa ulang oleh `tools/verify_published.py`. Tidak ada angka di laporan ini yang dibuat di luar eksperimen tersebut.

## Ringkasan

- Tiga detektor tanpa label (ambang statistik sebagai baseline, PCA, Isolation Forest) dinilai pada 10 rekaman uji SKAB yang tidak dipakai untuk melatih atau menyetel apa pun.
- Pada skema utama (A) dan mode sensitif, F1 berada di rentang 0,73 sampai 0,79. Selang kepercayaan 95 persen ketiganya bertumpuk.
- Hanya PCA yang terbukti lebih baik dari baseline, dan selisihnya kecil: F1 +0,04 (selang 95 persen 0,003 sampai 0,071).
- Skema B (model dari riwayat normal) lebih buruk karena kondisi mesin bergeser antar rekaman.

## Data dan pembagian

| Himpunan | Jumlah rekaman | Kegunaan |
|---|---|---|
| Latih | 16 | fit model (skema B), penyetelan (skema A) |
| Validasi | 6 | penyetelan |
| Pemisah | 2 (`other/11`, `valve1/13`) | tidak dipakai, menjauhkan penyetelan dari uji |
| Uji | 10 (`other/4`, `other/12`, `other/13`, `other/14`, `valve1/14`, `valve1/15`, `valve2/0` sampai `valve2/3`) | dinilai sekali |

Pembagian per rekaman dan urut waktu dalam tiap sesi. Rincian di [Data Card](DATA_CARD.md).

## Definisi metrik

| Metrik | Definisi | Satuan |
|---|---|---|
| Presisi | TP / (TP + FP), per titik (detik), digabung dari semua rekaman uji | 0 sampai 1 |
| Recall titik | TP / (TP + FN), per titik | 0 sampai 1 |
| F1 | rata-rata harmonik presisi dan recall titik | 0 sampai 1 |
| PR-AUC | luas di bawah kurva presisi-recall dari skor mentah, **sebelum** aturan alarm. Karena itu sama untuk mode sensitif dan hemat alarm | 0 sampai 1 |
| Recall kejadian | bagian kejadian yang tersentuh alarm minimal sekali | 0 sampai 1 |
| Tunda deteksi | detik dari awal kejadian ke alarm pertama yang menyentuhnya, median dari kejadian yang tertangkap | detik |
| Alarm palsu per jam | jumlah episode alarm yang mulai di luar kejadian, dibagi jam waktu normal teramati (1,196 jam pada data uji skema A) | episode per jam |

Alarm yang mulai sebelum kejadian dan berlanjut ke dalamnya dihitung **palsu**, walau kejadiannya tetap dihitung tertangkap dengan tunda 0 detik. Kasus ini terjadi pada `valve1/15` dan `valve2/2`.

## Hasil uji skema A (utama)

| Model | Mode | Ambang | Ketekunan | Tahan | Jendela | F1 (selang 95%) | Presisi | Recall | PR-AUC | Recall kejadian | Alarm palsu per jam | Tunda median |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Ambang statistik | sensitif | 4,165 | 1 dtk | 0 dtk | 10 dtk | 0,730 (0,60 sampai 0,82) | 0,747 | 0,713 | 0,838 | 0,9 | 6,69 | 53 dtk |
| Ambang statistik | hemat alarm | 7,238 | 15 | 30 | 10 | 0,697 (0,55 sampai 0,81) | 0,776 | 0,633 | 0,838 | 0,8 | 2,51 | 69 dtk |
| PCA | sensitif | 12,581 | 1 | 30 | 30 | 0,768 (0,61 sampai 0,87) | 0,822 | 0,721 | 0,813 | 0,8 | 1,67 | 55 dtk |
| PCA | hemat alarm | 21,867 | 1 | 30 | 30 | 0,745 (0,56 sampai 0,87) | 0,863 | 0,656 | 0,813 | 0,8 | 1,67 | 58 dtk |
| Isolation Forest | sensitif | 0,057 | 15 | 30 | 1 | 0,793 (0,70 sampai 0,86) | 0,771 | 0,816 | 0,706 | 1,0 | 8,36 | 39 dtk |
| Isolation Forest | hemat alarm | 0,691 | 15 | 30 | 1 | 0,371 (0,10 sampai 0,62) | 0,906 | 0,233 | 0,706 | 0,4 | 1,67 | 106,5 dtk |

### Hitungan kesalahan (titik dan episode, 10 rekaman uji)

| Model | Mode | TP | FP | FN | TN | Episode alarm palsu | Kejadian tertangkap |
|---|---|---|---|---|---|---|---|
| Ambang statistik | sensitif | 2.562 | 868 | 1.029 | 3.209 | 8 | 9 dari 10 |
| Ambang statistik | hemat alarm | 2.274 | 658 | 1.317 | 3.419 | 3 | 8 dari 10 |
| PCA | sensitif | 2.590 | 561 | 1.001 | 3.516 | 2 | 8 dari 10 |
| PCA | hemat alarm | 2.355 | 373 | 1.236 | 3.704 | 2 | 8 dari 10 |
| Isolation Forest | sensitif | 2.930 | 871 | 661 | 3.206 | 10 | 10 dari 10 |
| Isolation Forest | hemat alarm | 837 | 87 | 2.754 | 3.990 | 2 | 4 dari 10 |

Prevalensi anomali pada data uji yang dinilai: 46,8 persen (garis acak untuk PR-AUC 0,47).

### Perbandingan berpasangan terhadap baseline

Selisih F1 dengan 1000 sampel ulang rekaman yang sama untuk kedua model:

| Model | Mode | Selisih F1 | Selang 95% | Kesimpulan |
|---|---|---|---|---|
| PCA | sensitif | +0,039 | 0,003 sampai 0,071 | lebih baik, selisih kecil |
| Isolation Forest | sensitif | +0,063 | -0,014 sampai 0,161 | belum terbukti berbeda |
| PCA | hemat alarm | +0,048 | -0,052 sampai 0,142 | belum terbukti berbeda |
| Isolation Forest | hemat alarm | -0,326 | -0,602 sampai -0,098 | lebih buruk |

## Skema B (riwayat normal)

Semua model turun (F1 0,23 sampai 0,69) dan tunda 0 detik pada beberapa konfigurasi menandakan alarm yang sudah menyala sebelum kejadian. Angka lengkap ada di README dan `reports/results.json`. Kesimpulannya: model yang dilatih dari rekaman lama tidak tahan terhadap pergeseran kondisi mesin, jadi kalibrasi di awal pemantauan lebih andal.

## Metrik yang tidak tersedia

- Biaya kesalahan (rupiah atau waktu henti): tidak ada data biaya di SKAB.
- Waktu sebelum kerusakan atau sisa umur komponen: SKAB tidak memuat label kerusakan, dan proyek ini bukan pemeliharaan prediktif.
- Skor resmi papan peringkat SKAB (NAB): tidak dihitung karena protokol pembagian dan definisi alarm berbeda.
- Kinerja pada data pabrik nyata: tidak ada datanya.

## Bukti reproduksi

- Pada 24 Oktober 2026 seluruh evaluasi dijalankan ulang dari CSV SKAB mentah (`sentinel evaluate`, 3 menit 6 detik pada satu inti CPU, Python 3.13.17, NumPy 2.5.4, pandas 3.1.0, scikit-learn 1.9.1, SciPy 1.18.1). Hasilnya **identik byte per byte** dengan `reports/results.json` (SHA-256 sama), dan 11 berkas data website identik.
- Sel pembanding di `notebooks/kaggle_train.ipynb` dijalankan terhadap hasil ulang itu: 12 dari 12 nilai F1 sama. Notebook **belum dijalankan di Kaggle**.
- `pytest` (55 tes) memuat tes yang menghitung ulang metrik uji dari konfigurasi tersimpan.
- `tools/verify_published.py` menghitung ulang semua angka website dari CSV mentah tanpa memakai modul metrik proyek: 10 rekaman uji, 60 konfigurasi, semua cocok. Dijalankan juga di CI.

## Keterbatasan

Lihat [Model Card](MODEL_CARD.md). Yang terpenting: hanya 10 rekaman uji dengan 10 kejadian, satu rig laboratorium, dan hasil uji sempat dilihat selama pengembangan sebelum definisi alarm diperketat (dicatat terbuka di Model Card).
