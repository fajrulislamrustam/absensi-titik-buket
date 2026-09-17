# 🔗 Cara Dapat Link Permanen (tetap aktif walau laptop mati)

Link `localhost` TIDAK bisa dibagikan. Link permanen = aplikasi di-hosting di cloud.
Saya sudah siapkan kodenya (`render.yaml` + `DATA_DIR`) agar **link tidak berubah dan data tidak hilang**.

## Pilihan 1 — GRATIS & Permanen (disarankan untuk mulai) ⭐

Hasil: link permanen seperti `https://absensi-titik-buket.onrender.com`
- Link ini **tidak berubah**, bisa dibagikan ke semua karyawan via WA, dipasang QR di toko.
- Gratis, online walau laptop mati.

Langkah (10 menit):
1. Upload folder ini ke GitHub (buat repo baru → Add file → Upload files).
2. Buka https://render.com → Sign up (pakai GitHub) → **New + → Web Service → pilih repo**.
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Tambah Environment Variables:
     - `STORAGE_LIMIT_MB` = `500`
     - `JWT_SECRET` = isi acak panjang (atau klik Generate)
   - Pilih plan **Free**. JANGAN tambah Disk (itu berbayar — kalau Render minta kartu, berarti Anda kepencet opsi berbayar, kembali & pilih Free).
3. Klik Deploy → tunggu ±3 menit → dapat link `https://xxxx.onrender.com`.
4. Buka link → login `admin / admin123` → buat akun karyawan → bagikan link + akun.
5. Agar tidak "tidur" (gratisan Render tidur setelah 15 mnt sepi, bangun ±30 detik):
   - Buka https://uptimerobot.com (gratis) → Add Monitor → HTTP(S) → URL link Render → interval 5 menit.
   - Ini membuat link selalu cepat dibuka karyawan.

## Pilihan 2 — Permanen + Nama Sendiri (profesional)

Contoh: `https://absen.titikbuket.com` — tidak akan berubah selamanya, mudah diingat.
1. Beli domain di Niagahoster/Domainesia/Namecheap (±Rp 100–150 rb/tahun).
2. Lakukan Pilihan 1 dulu, lalu di Render: Settings → Custom Domain → masukkan domain → ikuti DNS yang diberikan.
3. Tempel QR domain itu di kedua toko.

## Pilihan 3 — VPS Indonesia (stok data besar, akses super cepat)

Jika foto banyak dan ingin penyimpanan besar: sewa VPS IDCloudHost/Niagahoster (±Rp 50–80 rb/bln),
install Node, jalankan `npm start` via PM2. Saya bisa siapkan panduannya jika Anda pilih ini.

## Setelah link jadi — wajib dilakukan sekali saja:
1. Login admin → menu 🏪 Toko & GPS → kalibrasi titik Pettarani & Samata dari HP di lokasi toko.
2. Menu 👥 buat akun tiap karyawan (akun hanya admin yang bisa buat).
3. Cetak QR link + tempel di toko:
   - Buka https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=LINK_ANDA
   - Ganti LINK_ANDA dengan link Render/domain, print & tempel.
4. Uji absen dari HP karyawan (izin kamera + lokasi harus diizinkan, buka via HTTPS — Render sudah HTTPS).

## Tanya-jawab cepat
- "Apakah link berubah saat redeploy?" Tidak. Selama service Render tidak dihapus, link tetap sama.
- "Apakah data hilang?" Di paket gratis, foto & data di server bisa hilang saat Render redeploy/restart.
  Solusi: tiap akhir bulan admin **Export CSV** dari menu Laporan + download foto penting.
  Kalau ingin data permanen penuh, upgrade ke paket Starter $7/bln + Disk.
- "Laptop admin mati, karyawan masih bisa absen?" Bisa. Server di cloud, bukan di laptop.
