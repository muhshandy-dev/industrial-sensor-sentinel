# Deploy ke Cloudflare Pages

Website statis tanpa build. Yang dipublikasikan adalah folder `web/public`.

## Langkah (di dashboard Cloudflare milik pemilik repo)

1. Workers and Pages, Create, Pages, Connect to Git, pilih `industrial-sensor-sentinel`.
2. Project name: `industrial-sensor-sentinel`.
3. Production branch: `main`.
4. Build command: kosongkan. Build output directory: `web/public`.
5. Simpan dan deploy. URL: `https://industrial-sensor-sentinel.pages.dev`.
6. Opsional: matikan preview build untuk branch non-produksi di Settings, Builds. Kuota build gratis (500 per bulan) dipakai bersama semua proyek.

## Catatan

- `web/public/_headers` memasang CSP ketat, `X-Frame-Options`, dan header keamanan lain. Tidak ada skrip atau gaya sebaris dan tidak ada permintaan ke pihak ketiga. Font (Inter dan JetBrains Mono, lisensi OFL, berkas lisensi ada di `web/public/fonts`) disajikan dari domain sendiri, jadi CSP hanya mengizinkan `font-src 'self'`. HTML, CSS, dan JS dikirim dengan `Cache-Control: no-cache` agar browser selalu memeriksa versi terbaru setelah deploy.
- Berkas terbesar sekitar 135 KB, jauh di bawah batas 25 MiB per berkas.
- Situs statis tidak "tidur": tidak ada server yang perlu dinyalakan ulang.
- Data website dibuat oleh `sentinel evaluate --web-out web/public/data` dan di-commit. Mengubah model berarti menjalankan ulang perintah itu lalu commit.
- Header tambahan: `Strict-Transport-Security` (tanpa `includeSubDomains` dan tanpa preload), `Cross-Origin-Opener-Policy` dan `Cross-Origin-Resource-Policy` bernilai `same-origin`.

## Status deploy

- Produksi: https://industrial-sensor-sentinel.pages.dev/ (di-deploy oleh pemilik repo dari branch `main`).
- Sesi pengembangan tidak dapat membuka domain `pages.dev`, jadi isi situs live diperiksa oleh pemilik repo. Isi folder `web/public` di `main` adalah yang diuji e2e di CI.

## Status integrasi yang teramati (24 Oktober 2026)

- Pada PR #2, check **Cloudflare Pages** berhasil dan bot Cloudflare memasang URL preview. Artinya integrasi Git proyek Pages `industrial-sensor-sentinel` tersambung dan deploy otomatis berjalan.
- Ada check lain, **Workers Builds: industrial-sensor-sentinel**, yang gagal dengan pesan "This Worker does not exist on your account". Ini berasal dari koneksi build milik sebuah *Worker* (bukan proyek Pages) bernama sama yang sudah tidak ada. Check ini tidak memengaruhi situs Pages, tetapi membuat tanda silang merah pada setiap commit.

Cara menghilangkan check Workers Builds yang gagal, tanpa menyentuh proyek Pages:

1. Cloudflare: Workers and Pages. Cari entri bertipe **Worker** bernama `industrial-sensor-sentinel` (ikon dan label berbeda dari proyek Pages).
2. Bila ada: buka, Settings, Build, lalu Disconnect pada bagian Git repository. Worker kosong itu boleh dihapus bila memang tidak dipakai. Jangan hapus proyek Pages.
3. Bila tidak ada, koneksi build lama tertinggal tanpa Worker. Check ini aman diabaikan karena tidak memengaruhi situs; bila ingin dihapus, minta bantuan dukungan Cloudflare dengan menyebut Build ID dari check yang gagal.
4. Jangan mencabut akses aplikasi Cloudflare di GitHub, karena aplikasi yang sama dipakai oleh proyek Pages.

## Bila integrasi GitHub berstatus "disconnected"

Peringatan ini biasanya berarti aplikasi GitHub milik Cloudflare tidak lagi punya akses ke repo. Akibatnya push ke `main` tidak memicu deploy baru, walau situs lama tetap tampil. Perbaiki tanpa membuat proyek baru:

1. Di GitHub: avatar, Settings, Applications, tab Installed GitHub Apps, lalu **Cloudflare Workers and Pages**, Configure.
2. Di Repository access, pastikan `industrial-sensor-sentinel` termasuk (pilih All repositories, atau tambahkan repo ini di Only select repositories). Save.
3. Di Cloudflare: Workers and Pages, proyek `industrial-sensor-sentinel`, Settings, Build. Pada bagian Git repository, pilih Manage atau Reconnect bila tersedia, lalu pilih akun GitHub yang sama dan repo `industrial-sensor-sentinel`. Pastikan production branch `main`, build command kosong, output `web/public`.
4. Uji: di tab Deployments pilih Retry deployment pada deploy terakhir, atau merge commit kecil ke `main`. Deploy baru harus muncul dengan hash commit terbaru. Pada pull request berikutnya, Cloudflare biasanya menambahkan status atau komentar berisi URL preview; itu tanda integrasi sudah tersambung.

Bila proyek dibuat lewat **Direct Upload** (unggah folder manual), proyek itu memang tidak punya koneksi Git dan Cloudflare tidak menyediakan cara mengubahnya menjadi proyek berbasis Git. Pilihannya: tetap unggah ulang folder `web/public` setiap ada perubahan (Create deployment pada proyek yang sama), atau, bila ingin deploy otomatis, membuat proyek Git baru dengan nama lain lalu memindahkan nama domain. Jalan kedua mengubah URL, jadi sebaiknya dihindari kecuali diperlukan.
