# Model Card: detektor anomali Industrial Sensor Sentinel

## Tujuan dan penggunaan

Mendeteksi kondisi abnormal pada pompa air dari 8 sensor dan memberi peringatan dini. Dibuat sebagai proyek riset dan portofolio pada data benchmark SKAB.

**Bukan untuk** keputusan keselamatan atau produksi. Data hanya dari satu rig uji kecil, dengan satu jenis mesin.

"Peringatan dini" di sini berarti alarm menyala segera setelah pola sensor mulai berbeda dari kondisi normal. Ini **bukan** ramalan kerusakan, bukan perkiraan sisa umur komponen, dan bukan pemeliharaan prediktif. Website demo (https://industrial-sensor-sentinel.pages.dev/) menampilkan skor yang sudah dihitung dari rekaman tersimpan, bukan pemantauan waktu nyata.

## Model

Semua model tanpa label: hanya data normal yang dipakai untuk fit.

| Model | Skor anomali | Parameter tetap |
|---|---|---|
| Ambang statistik (baseline) | simpangan mutlak terbesar fitur dari rata-rata normal (z-score maksimum) | simpangan baku minimal 1e-6 |
| PCA | maksimum antara T2 dan Q, masing-masing dibagi persentil 99 data fit | komponen menjelaskan 95 persen ragam |
| Isolation Forest | minus skor sampel scikit-learn | 200 pohon, seed 0 |

Fitur: nilai 8 sensor mentah (jendela 1), atau rata-rata dan simpangan baku bergulir pada 10 atau 30 detik terakhir (16 fitur). Jendela hanya melihat ke belakang. Semua fitur distandarkan memakai rata-rata dan simpangan baku data fit saja.

Dari skor ke peringatan: skor dinormalkan agar median data kalibrasi normal bernilai 0 dan persentil 99 bernilai 1 (data kalibrasi tidak dipakai untuk fit). Alarm menyala bila skor melewati ambang selama **ketekunan** detik berturut-turut, lalu bertahan **penahanan** detik setelah skor turun, agar alarm yang berkedip dihitung sebagai satu episode.

## Pelatihan dan penyetelan

- Skema A (utama): tiap rekaman dikalibrasi dari 300 detik pertamanya. 200 detik pertama untuk fit, 100 detik berikutnya untuk normalisasi skor. Rekaman yang anomalinya muncul sebelum detik ke-300 (hanya `other/2`) tidak bisa dinilai.
- Skema B: satu model per sesi, dilatih dari bagian normal (sebelum anomali pertama) rekaman latih sesi itu, 80 persen pertama untuk fit dan 20 persen terakhir untuk normalisasi.
- Hiperparameter yang dipilih dengan label: jendela fitur {1, 10, 30}, ambang (56 nilai geometrik 0,05 sampai 100), ketekunan {1, 5, 15} detik, penahanan {0, 10, 30} detik. Pilihan memaksimalkan F1 gabungan pada himpunan penyetelan (skema A: rekaman latih dan validasi, 21 rekaman. Skema B: rekaman validasi, 6 rekaman). Seri diputuskan dengan FAR lebih rendah.
- Mode hemat alarm: sama, dengan syarat alarm palsu paling banyak 2 per jam pada himpunan penyetelan.
- Rekaman uji tidak pernah dipakai untuk memilih apa pun. Nilai uji dihitung sekali dari konfigurasi terpilih.

### Konfigurasi terpilih

| Skema | Model | Mode | Jendela fitur (detik) | Ambang | Ketekunan (detik) | Penahanan (detik) | F1 penyetelan |
|---|---|---|---|---|---|---|---|
| A | Ambang statistik | sensitif | 10 | 4,17 | 1 | 0 | 0,78 |
| A | Ambang statistik | hemat alarm | 10 | 7,24 | 15 | 30 | 0,67 |
| A | PCA | sensitif | 30 | 12,58 | 1 | 30 | 0,77 |
| A | PCA | hemat alarm | 30 | 21,87 | 1 | 30 | 0,69 |
| A | Isolation Forest | sensitif | 1 | 0,06 | 15 | 30 | 0,70 |
| A | Isolation Forest | hemat alarm | 1 | 0,69 | 15 | 30 | 0,47 |
| B | Ambang statistik | sensitif | 30 | 0,30 | 15 | 0 | 0,75 |
| B | Ambang statistik | hemat alarm | 30 | 2,09 | 1 | 30 | 0,75 |
| B | PCA | sensitif | 30 | 2,09 | 1 | 10 | 0,84 |
| B | PCA | hemat alarm | 10 | 2,40 | 15 | 30 | 0,83 |
| B | Isolation Forest | sensitif | 1 | 0,20 | 15 | 0 | 0,68 |
| B | Isolation Forest | hemat alarm | 1 | 0,69 | 15 | 30 | 0,50 |

Tidak ada konfigurasi terpilih yang berada di tepi grid ambang (dicatat di `reports/results.json` sebagai `ambang_di_tepi_grid`).

## Evaluasi

Pembagian dijelaskan di [Data Card](DATA_CARD.md): 16 rekaman latih, 6 validasi, 2 pemisah, 10 uji. Metrik: presisi, recall, F1 dan PR-AUC per titik (digabung dari semua rekaman uji), recall kejadian, tunda deteksi (detik dari awal kejadian ke alarm pertama), dan alarm palsu per jam waktu normal teramati. Alarm sah hanya bila mulai menyala pada saat kejadian. Alarm yang sudah menyala sebelumnya dihitung palsu walau berlanjut ke kejadian. Kejadian dihitung terdeteksi bila alarm menyala kapan pun selama kejadian, termasuk alarm yang berlanjut dari sebelumnya (tunda 0 detik). Kasus ini muncul pada `valve1/15` (ambang statistik dan PCA, kedua mode; alarm mulai 41 sampai 66 detik sebelum label) dan `valve2/2` (Isolation Forest sensitif; 57 detik sebelum label). Alarm itu tetap dihitung sebagai alarm palsu. Selang 95 persen: 1000 kali sampel ulang rekaman. Hasil lengkap ada di README dan `reports/results.json`. Skor yang diekspor ke website tidak lagi dipotong pada rentang tertentu, sehingga kurva presisi-recall yang digambar di browser memberi PR-AUC yang sama dengan hasil Python. Perubahan ini tidak mengubah alarm maupun angka evaluasi mana pun.

Selisih F1 terhadap baseline ambang statistik, dengan sampel ulang rekaman yang sama (skema A):

| Model | Mode | Selisih F1 (selang 95%) |
|---|---|---|
| PCA | sensitif | 0,04 (0,00 sampai 0,07) |
| Isolation Forest | sensitif | 0,06 (-0,01 sampai 0,16) |
| PCA | hemat alarm | 0,05 (-0,05 sampai 0,14) |
| Isolation Forest | hemat alarm | -0,33 (-0,60 sampai -0,10) |

Hanya satu dari empat perbandingan yang selangnya di atas nol, dan selisihnya kecil. Dengan bukti ini, tidak ada alasan menambah model yang lebih kompleks (misalnya autoencoder). Model tambahan baru layak bila terbukti mengalahkan baseline pada protokol yang sama.

## Analisis kesalahan (skema A, mode sensitif)

Rinciannya di `reports/error_analysis.json` dan halaman Kesalahan di website.

- Kejadian terlewat: ambang statistik melewatkan `other/13` (aliran dua fase, pergeseran sensor hanya 1,5 simpangan baku). PCA melewatkan `other/13` dan `other/4` (simulasi kebocoran). Isolation Forest mendeteksi semua kejadian tetapi dengan alarm palsu terbanyak.
- Proporsi titik anomali yang terlewat berkorelasi negatif dengan besar pergeseran sensor (korelasi peringkat Spearman minus 0,41 sampai minus 0,53 pada tiga model, mode sensitif). Dengan 10 rekaman, ini petunjuk, bukan bukti.
- Titik alarm palsu lebih banyak muncul sesudah kejadian daripada sebelum. Dugaan: sensor belum pulih padahal label sudah selesai. Sebagian alarm sebelum label bisa saja peringatan dini yang sah (sensor mulai bergeser sebelum label dimulai), tetapi label tidak memungkinkan hal itu dibuktikan, sehingga dihitung palsu.
- Generalisasi: skor F1 penyetelan umumnya lebih tinggi daripada uji (terutama skema B, misalnya PCA 0,83 pada validasi menjadi 0,61 pada uji). Penyetelan di rekaman lama tidak sepenuhnya berlaku untuk rekaman yang lebih baru.

## Transparansi proses pengembangan

- Pembagian latih, validasi, uji ditetapkan dan diperiksa otomatis sebelum penyetelan. Ambang, ketekunan, penahanan, dan jendela fitur hanya dipilih dari rekaman latih dan validasi.
- Hasil uji sempat dilihat selama pengembangan. Dua perubahan dibuat sesudahnya: (1) definisi alarm diperketat karena definisi lama bisa diakali alarm yang menyala terus (alarm yang sudah menyala sebelum kejadian kini dihitung palsu), dan (2) rentang ambang yang dicoba diperluas sampai 100 karena ambang terpilih sempat berada di tepi rentang pada data penyetelan. Keduanya berlaku sama untuk semua model, dan tidak ada ambang terpilih yang kini berada di tepi rentang.
- `tools/verify_published.py` menghitung ulang angka website dari data mentah secara independen dan dijalankan di CI.

## Keterbatasan

- 10 rekaman uji dan 10 kejadian. Selang kepercayaan lebar.
- Satu rig, satu jenis mesin, satu kejadian per rekaman, label manual. Tidak teruji untuk mesin lain.
- Skema A butuh 300 detik awal yang normal dan tidak berlaku bila mesin sudah bermasalah di awal.
- Mode hemat alarm tidak menjamin batas alarm palsu pada data baru (pada uji, ambang statistik mencapai 2,5 per jam).
- Cap waktu antar rekaman tumpang tindih pada beberapa pasangan, sehingga urutan antar rekaman hanya pendekatan.
- Hasil dihitung di sesi pengembangan, belum direproduksi di Kaggle.
- Angka tidak sebanding langsung dengan papan peringkat SKAB.
