# Data Card: SKAB

## Sumber

- Nama: Skoltech Anomaly Benchmark (SKAB), versi 0.9.
- Repo resmi: https://github.com/waico/SKAB
- Commit yang dikunci: `b2c0d46c2971dcbfe71e26087b6d231998bb91c2` (11 Agustus 2024).
- Lisensi: GPL-3.0. Karena data ikut diolah dan ditampilkan di website, repo ini juga berlisensi GPL-3.0.
- Sitasi: Katser dan Kozitsin, Skoltech Anomaly Benchmark (SKAB), Kaggle, DOI 10.34740/KAGGLE/DSV/1693952.
- Pengambilan: `sentinel data fetch` mengunduh dari commit di atas dan memverifikasi SHA-256 tiap berkas terhadap `data/skab_manifest.json`. Data mentah tidak disimpan di repo.

Catatan: README SKAB menyebut testbed sedang diperbaiki dan versi 1.0 dijanjikan memuat 300 berkas lebih. Proyek ini memakai v0.9 pada commit di atas, bukan versi yang mungkin terbit kemudian.

## Isi (diverifikasi dari berkas)

- 35 berkas CSV: 34 rekaman berlabel (`valve1` 16 berkas, `valve2` 4, `other` 14) dan 1 rekaman normal tanpa label (`anomaly-free`, 9.405 baris).
- 37.401 baris berlabel dengan 13.067 baris anomali (34,9 persen). Median per rekaman 35,0 persen.
- Pemisah titik koma. Kolom: `datetime`, 8 sensor, `anomaly` (0 atau 1), `changepoint` (0 atau 1). Rekaman normal tidak memiliki kolom label.
- Sensor: Accelerometer1RMS (g), Accelerometer2RMS (g), Current (A), Pressure (bar), Temperature (°C, badan motor), Thermocouple (°C, cairan), Voltage (V), Volume Flow RateRMS (L/menit).
- Pencatatan sekitar tiap 1 detik. Selisih terkecil 1 detik, terbesar 247 detik.

## Hasil pemeriksaan

| Pemeriksaan | Hasil |
|---|---|
| Nilai kosong | 0 di semua berkas |
| Cap waktu ganda atau menurun | tidak ada |
| Label anomali | tepat satu segmen berurutan per rekaman berlabel (34 dari 34) |
| Celah waktu lebih dari 5 detik | 9 celah di seluruh data (maks 247 detik) |
| Awal kejadian | biasanya sekitar detik ke-570. Pengecualian: `other/2` mulai di baris 104 |
| Cap waktu rekaman bertetangga | tumpang tindih pada 4 pasang: other/10 ke 11 (20 dtk), other/12 ke 13 (442 dtk), other/2 ke 3 (125 dtk), other/3 ke 4 (239 dtk) |
| Rekaman normal tanpa label | cap waktunya tumpang tindih dengan `other/5` |
| Kolom `changepoint` | dipakai SKAB untuk masalah titik perubahan. Proyek ini tidak memakainya |

Tumpang tindih cap waktu berarti jam pencatat tidak sepenuhnya konsisten antar berkas, sehingga urutan antar rekaman hanya memakai waktu mulai.

## Rezim operasi (tiga sesi, tanggal berbeda)

Rata-rata sensor pada bagian normal berbeda jauh antar sesi, sehingga satu model global untuk semua rekaman tidak masuk akal.

| Sesi | Rekaman | Arus (A) | Laju aliran (L/menit) | Getaran 1 (g) |
|---|---|---|---|---|
| 2020-02-08 | other/5 sampai 14 | 2,42 | 123,7 | 0,23 |
| 2020-03-01 | other/1 sampai 4 | 1,57 | 76,5 | 0,08 |
| 2020-03-09 | valve1/0 sampai 15, valve2/0 sampai 3 | 0,98 | 32,2 | 0,03 |

Dalam sesi 2020-03-09, suhu motor dan suhu cairan bergeser turun dari rekaman ke rekaman (sekitar 79 ke 68 °C untuk suhu motor), jadi data berurutan waktu mengalami pergeseran (drift).

## Skenario

`valve1`: katup di sisi masuk pompa ditutup. `valve2`: katup di sisi keluaran ditutup. `other/1` sampai `4`: simulasi kebocoran dan penambahan cairan. `other/5` sampai `9`: rotor tidak seimbang dengan pola perubahan berbeda. `other/10`, `11`: jumlah air bertambah perlahan atau mendadak. `other/12`: air dikuras hingga kavitasi. `other/13`: aliran dua fase ke sisi masuk (kavitasi). `other/14`: air bersuhu lebih tinggi.

Besar pergeseran sensor sangat beragam. Pergeseran terbesar per rekaman (dalam simpangan baku bagian normal) bermedian 4,7 dan ada rekaman yang hanya 1,5 (`other/13`). Detail ada di `reports/data_profile.json`.

## Risiko kebocoran dan cara penanganan

- Baris bertetangga hampir identik, sehingga random split per baris membocorkan informasi. Pembagian dilakukan per rekaman.
- Rekaman satu sesi dibuat berurutan di kondisi yang hampir sama (termasuk drift suhu). Penanganan: dalam tiap sesi rekaman diurutkan menurut waktu mulai, uji adalah rekaman paling baru, dan satu rekaman pemisah memisahkan penyetelan dari uji pada sesi besar.
- Sesi kecil (2020-03-01, 4 rekaman) tidak punya pemisah, dan hanya satu rekaman uji (`other/4`).
- Rekaman normal tanpa label hanya dipakai pada skema B untuk sesi 2020-02-08, dan hanya bila berakhir sebelum rekaman uji pertama sesi itu.
- Pemeriksaan otomatis: `check_no_leakage` (tidak ada rekaman di dua himpunan, uji lebih baru dari latih dan validasi) dan tes fitur yang tidak melihat ke depan.

## Keterbatasan data

- Satu rig kecil dengan air, satu kejadian per rekaman, label manual. Batas kejadian, terutama fase pemulihan, bisa tidak tepat.
- 34 rekaman berlabel saja. Bagian uji hanya 10.
