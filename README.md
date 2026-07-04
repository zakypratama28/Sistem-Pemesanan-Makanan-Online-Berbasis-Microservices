*Perancangan dan Implementasi Sistem Pemesanan Makanan Online Berbasis Microservices Menggunakan Traefik API Gateway, REST API, WebSocket, dan Monitoring Container**

berisi API Gateway Traefik, frontend statis, 11 backend service Node.js Express, PostgreSQL, Redis, Prometheus, Grafana, node-exporter, dan cAdvisor.

# Arsitektur

- Traefik menjadi API Gateway pada port `80`.
- Dashboard Traefik tersedia pada port `8080`.
- Semua backend service listen pada port internal `3000`.
- Backend tidak expose port langsung ke host.
- PostgreSQL expose port `5432` untuk development.
- Redis expose port `6379` untuk development.
- Prometheus expose port `9090`.
- Grafana expose port `3001`.
- cAdvisor expose port `8081`.
- node-exporter expose port `9100`.

## Endpoint Health Via Traefik

| Service | URL |
| --- | --- |
| auth-service | `http://localhost/api/auth/health` |
| user-service | `http://localhost/api/users/health` |
| restaurant-service | `http://localhost/api/restaurants/health` |
| menu-service | `http://localhost/api/menus/health` |
| cart-service | `http://localhost/api/cart/health` |
| order-service | `http://localhost/api/orders/health` |
| payment-service | `http://localhost/api/payments/health` |
| delivery-service | `http://localhost/api/deliveries/health` |
| notification-service | `http://localhost/api/notifications/health` |
| realtime-service | `http://localhost/api/realtime/health` |
| report-service | `http://localhost/api/reports/health` |

Cek endpoint health service melalui Traefik:

```powershell
$endpoints = @(
  "http://localhost/api/auth/health",
  "http://localhost/api/users/health",
  "http://localhost/api/restaurants/health",
  "http://localhost/api/menus/health",
  "http://localhost/api/cart/health",
  "http://localhost/api/orders/health",
  "http://localhost/api/payments/health",
  "http://localhost/api/deliveries/health",
  "http://localhost/api/notifications/health",
  "http://localhost/api/realtime/health",
  "http://localhost/api/reports/health"
)

$endpoints | ForEach-Object {
  Write-Host "`nGET $_"
  Invoke-RestMethod $_
}
```

Akses dashboard:

- Frontend: `http://localhost`
- Traefik: `http://localhost:8080/dashboard/`
- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3001`
- cAdvisor: `http://localhost:8081`
- node-exporter metrics: `http://localhost:9100/metrics`

Fitur demo utama:

- Quick login Customer, Admin, dan Courier.
- Token JWT disimpan di `localStorage` untuk request berikutnya.
- Profil user dari `GET /api/users/me`.
- Daftar restoran dan menu dari `GET /api/restaurants` dan `GET /api/menus`.
- Tambah item ke cart, lihat cart, dan buat order.
- Payment simulasi via QRIS.
- Timeline tracking: `CREATED`, `PAID`, `COOKING`, `READY`, `ON_DELIVERY`, `DELIVERED`.
- Realtime event panel dari WebSocket `/ws`.
- Admin panel untuk update status order ke `COOKING` dan `READY`, serta melihat report.
- Courier action untuk update delivery ke `ON_DELIVERY` atau `DELIVERED`.
- Link cepat ke Traefik, Prometheus Targets, Grafana, dan cAdvisor.

Akun quick login:

| Role | Email | Password |
|------|-------|----------|
| Customer | `budi@foodorder.id` | `password` |
| Admin | `admin@foodorder.id` | `password` |
| Courier | `raka@foodorder.id` | `password` |

Alur demo yang disarankan:

1. Buka `http://localhost`.
2. Klik **Quick Login Customer**.
3. Tambahkan menu ke cart, lalu klik **Buat Order**.
4. Klik **Bayar QRIS**.
5. Login sebagai **Admin**, lalu update order ke `COOKING` dan `READY`.
6. Login sebagai **Courier**, cek delivery, lalu update ke `ON_DELIVERY` dan `DELIVERED`.
7. Amati panel **Realtime Events** dan timeline order yang ikut berubah.


## Database PostgreSQL

### Konfigurasi Koneksi

| Parameter | Nilai |
|-----------|-------|
| Host | `localhost` |
| Port | `5432` |
| Database | `food_ordering_db` |
| User | `food_user` |
| Password | `food_password` |

### File SQL

File SQL berada di `database/init/` dan dieksekusi otomatis oleh PostgreSQL saat container pertama kali dibuat (via `docker-entrypoint-initdb.d`):

| File | Keterangan |
|------|-----------|
| `01_init.sql` | Membuat semua tabel dan index |
| `02_seed.sql` | Mengisi data awal untuk development |

---

## Data User Seed

Berikut akun yang tersedia setelah seed berhasil dijalankan:

| Nama | Email | Role | Password |
|------|-------|------|---------|
| Super Admin | `admin@foodorder.id` | `ADMIN` | *(dummy hash — belum aktif)* |
| Budi Pelanggan | `budi@foodorder.id` | `CUSTOMER` | *(dummy hash — belum aktif)* |
| Sari Restoran | `sari@foodorder.id` | `RESTAURANT_ADMIN` | *(dummy hash — belum aktif)* |
| Raka Kurir | `raka@foodorder.id` | `COURIER` | *(dummy hash — belum aktif)* |

### Data Restoran Seed

| Nama | Alamat | Status |
|------|--------|--------|
| Warung Nusantara | Jl. Sudirman No. 10, Jakarta Pusat | OPEN |
| Kedai Padang Jaya | Jl. Gatot Subroto No. 45, Jakarta Selatan | OPEN |

### Data Menu Seed

| Restoran | Menu | Harga |
|----------|------|-------|
| Warung Nusantara | Nasi Goreng Spesial | Rp 25.000 |
| Warung Nusantara | Mie Ayam Bakso | Rp 22.000 |
| Warung Nusantara | Es Teh Manis | Rp 5.000 |
| Kedai Padang Jaya | Rendang Sapi | Rp 45.000 |
| Kedai Padang Jaya | Ayam Pop | Rp 35.000 |
| Kedai Padang Jaya | Gulai Ikan Tongkol | Rp 30.000 |

## Skema Database

```
users
├── id, name, email, password_hash, role, created_at

restaurants
├── id, name, address, status, created_at

menus
├── id, restaurant_id → restaurants, name, description, price, stock, created_at

carts
├── id, user_id → users, menu_id → menus, quantity, created_at

orders
├── id, user_id → users, restaurant_id → restaurants, total_price, status, created_at

order_items
├── id, order_id → orders, menu_id → menus, quantity, price

payments
├── id, order_id → orders, amount, status, payment_method, created_at

deliveries
├── id, order_id → orders, courier_id → users, status, address, created_at

notifications
├── id, user_id → users, title, message, is_read, created_at
```

### POST /api/auth/register

Mendaftarkan user baru ke sistem.

**Request Body:**
```json
{
  "name": "Customer Baru",
  "email": "customerbaru@foodorder.id",
  "password": "password123",
  "role": "CUSTOMER"
}
```

Role yang diizinkan: `ADMIN`, `CUSTOMER`, `RESTAURANT_ADMIN`, `COURIER`


```
### POST /api/auth/login

Login dan mendapatkan JWT token.

**Request Body:**
```json
{
  "email": "budi@foodorder.id",
  "password": "password"
}
```

**Akun seed tersedia:**

| Email | Password | Role |
|-------|----------|------|
| `admin@foodorder.id` | `password` | `ADMIN` |
| `budi@foodorder.id` | `password` | `CUSTOMER` |
| `sari@foodorder.id` | `password` | `RESTAURANT_ADMIN` |
| `raka@foodorder.id` | `password` | `COURIER` |

---

### Workflow Lengkap (PowerShell)

```powershell
# 1. Login
$resp = Invoke-RestMethod -Method Post `
  -Uri http://localhost/api/auth/login `
  -ContentType "application/json" `
  -Body '{"email":"admin@foodorder.id","password":"password"}'
$token = $resp.token
Write-Host "Token: $token"

# 2. Verify
Invoke-RestMethod -Uri http://localhost/api/auth/verify `
  -Headers @{ Authorization = "Bearer $token" } | ConvertTo-Json

# 3. Register user baru
Invoke-RestMethod -Method Post `
  -Uri http://localhost/api/auth/register `
  -ContentType "application/json" `
  -Body '{"name":"Test User","email":"test@foodorder.id","password":"rahasia123","role":"CUSTOMER"}' | ConvertTo-Json
```

---

## Traefik ForwardAuth

Traefik dikonfigurasi dengan middleware `auth-forward` yang memanggil `http://auth-service:3000/verify` sebelum meneruskan request ke service tujuan.

### Peta Endpoint

| Endpoint | Tipe | Keterangan |
|----------|------|-----------|
| `/` | 🌐 Public | Frontend |
| `/api/auth/*` | 🌐 Public | register, login, verify, health, metrics |
| `/api/restaurants/*` | 🌐 Public | Daftar restoran |
| `/api/menus/*` | 🌐 Public | Daftar menu |
| `/api/realtime/health` | 🌐 Public | Health realtime |
| `/api/users/*` | 🔒 Protected | Butuh JWT |
| `/api/cart/*` | 🔒 Protected | Butuh JWT |
| `/api/orders/*` | 🔒 Protected | Butuh JWT |
| `/api/payments/*` | 🔒 Protected | Butuh JWT |
| `/api/deliveries/*` | 🔒 Protected | Butuh JWT |
| `/api/notifications/*` | 🔒 Protected | Butuh JWT |
| `/api/reports/*` | 🔒 Protected | Butuh JWT |

### Header yang Diteruskan ke Service

| Header | Isi |
|--------|-----|
| `X-User-Id` | ID user dari JWT payload |
| `X-User-Email` | Email user dari JWT payload |
| `X-User-Role` | Role user dari JWT payload |

---

## 📈 Monitoring Infrastruktur

Sistem telah dilengkapi dengan *stack* monitoring yang memonitor performa *Host* maupun metrik *Container* menggunakan Prometheus dan Grafana.

1. **node-exporter**: Mengumpulkan data metrik mesin *Host* (CPU, RAM).
2. **cAdvisor**: Mengumpulkan metrik *real-time* dari *Container* Docker.
3. **Prometheus**: Melakukan *scraping* (pengambilan data metrik) secara otomatis setiap 15 detik.
4. **Grafana**: Menyediakan antarmuka *dashboard* visual.

### Cara Akses dan Verifikasi

#### 1. Verifikasi Target Prometheus
Buka URL di bawah pada *browser* untuk memastikan bahwa `node-exporter` dan `cadvisor` telah berstatus **UP**.
> **URL**: [http://localhost:9090/targets](http://localhost:9090/targets)

Bisa juga menggunakan PowerShell:
```powershell
$targets = Invoke-RestMethod -Uri "http://localhost:9090/api/v1/targets"
$targets.data.activeTargets | Select-Object @{N="Job";E={$_.labels.job}}, health, lastScrape | Format-Table -AutoSize
```

#### 2. Akses Dashboard Grafana
Kami telah menerapkan *Grafana Provisioning* sehingga *datasource* dan *dashboard* otomatis tersedia tanpa perlu konfigurasi manual.
1. Buka Grafana di **[http://localhost:3001](http://localhost:3001)**
2. Login dengan akun bawaan (kecuali diubah via `.env`):
   - **Username**: `admin`
   - **Password**: `admin`
3. Navigasi ke **Dashboards** > **Monitoring** > **System Monitoring Dashboard**.
4. Anda akan melihat 4 panel utama secara instan:
   - **Host CPU Usage** (%)
   - **Host RAM Usage** (Bytes)
   - **Containers CPU Usage** (%)
   - **Containers RAM Usage** (Bytes)

### Test Beban (Opsional)
Untuk melihat grafik bergerak, Anda dapat menjalankan *endpoint* API berulang-ulang menggunakan PowerShell *loop* untuk mensimulasikan trafik jaringan:
```powershell
# Menjalankan 100 request public berurutan
1..100 | ForEach-Object {
    Invoke-RestMethod -Uri "http://localhost/api/restaurants"
    Write-Host -NoNewline "."
}
```
Grafik pada Grafana akan langsung melonjak setelah ~15 detik merespons trafik tersebut.

### Demo WebSocket Real-Time

1. Buka `http://localhost` di browser.
2. Pastikan status WebSocket **Connected**.
3. Buka PowerShell dan jalankan skrip endpoint di atas secara berurutan (misal: Buat Order, Bayar Order, Update Status Order, Update Delivery).
4. Lihat halaman frontend di browser, event akan muncul secara instan!

---
