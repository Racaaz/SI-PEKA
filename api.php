<?php
/* ============================================================
   api.php — SPK Kualitas Air | Backend API (PDO + MySQL)
   Endpoint terpadu untuk:
     - POST ?action=login        -> login admin (username, password)
     - POST ?action=logout       -> logout admin (hapus sesi)
     - GET  ?action=check_session -> cek status sesi admin saat ini
     - GET  ?action=history   -> ambil semua riwayat pemeriksaan (terbaru dulu)   [publik]
     - POST ?action=history   -> simpan satu riwayat pemeriksaan baru            [publik]
     - GET  ?action=depot     -> ambil seluruh data depot (data_depot)           [publik]
     - POST ?action=depot     -> simpan data depot baru                         [BUTUH LOGIN]
     - GET  ?action=bobot     -> ambil bobot kriteria (id_pengaturan = 1)        [publik]
     - POST ?action=bobot     -> update bobot kriteria (id_pengaturan = 1)       [BUTUH LOGIN]
     - (bonus) POST ?action=reset_history -> hapus seluruh riwayat              [BUTUH LOGIN]
   ============================================================ */

/* --- Sesi harus dimulai SEBELUM ada output apa pun --- */
session_set_cookie_params([
    "lifetime" => 0,        // habis saat browser ditutup
    "path"     => "/",
    "httponly" => true,     // tidak bisa dibaca lewat JS (mencegah XSS mencuri sesi)
    "samesite" => "Lax",
    // "secure" => true,     // aktifkan ini jika situs sudah pakai HTTPS
]);
session_start();

header("Content-Type: application/json; charset=utf-8");

/* --- Izinkan akses dari origin lain saat development (opsional) ---
   CATATAN: Access-Control-Allow-Origin harus SPESIFIK (bukan "*") agar
   cookie sesi (kredensial) bisa ikut terkirim lintas origin. Untuk
   pemakaian normal (frontend & api.php di server yang sama), header
   CORS di bawah ini tidak berpengaruh karena request dianggap same-origin. */
$allowedOrigin = $_SERVER["HTTP_ORIGIN"] ?? "*";
header("Access-Control-Allow-Origin: {$allowedOrigin}");
header("Access-Control-Allow-Credentials: true");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(200);
    exit;
}

/* ══════════════════════════════════════════════════════════
   1. KONEKSI DATABASE (PDO)
   ══════════════════════════════════════════════════════════ */

$configPath = __DIR__ . "/config.php";

if (!file_exists($configPath)) {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "message" => "config.php tidak ditemukan. Salin config.example.php menjadi config.php lalu isi kredensial database Anda.",
    ]);
    exit;
}

$config = require $configPath;

$DB_HOST = $config["DB_HOST"];
$DB_NAME = $config["DB_NAME"];
$DB_USER = $config["DB_USER"];
$DB_PASS = $config["DB_PASS"];

try {
    $pdo = new PDO(
        "mysql:host={$DB_HOST};dbname={$DB_NAME};charset=utf8mb4",
        $DB_USER,
        $DB_PASS,
        [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false, // pakai prepared statement asli MySQL, bukan emulasi
        ]
    );
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => "Koneksi database gagal: " . $e->getMessage()]);
    exit;
}

/* ══════════════════════════════════════════════════════════
   2. HELPER
   ══════════════════════════════════════════════════════════ */

/** Kirim response JSON lalu hentikan eksekusi. */
function respond($data, int $statusCode = 200): void {
    http_response_code($statusCode);
    echo json_encode($data);
    exit;
}

/** Format id_pemeriksaan (int) -> "SMPL-001" agar konsisten dengan frontend lama. */
function formatSampleId($idInt): string {
    return "SMPL-" . str_pad((string) $idInt, 3, "0", STR_PAD_LEFT);
}

/** Ambil & decode JSON body dari request (untuk method POST). */
function getJsonBody(): array {
    $raw = file_get_contents("php://input");
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

/** True jika sesi admin sedang login. */
function isLoggedIn(): bool {
    return !empty($_SESSION["admin_logged_in"]) && $_SESSION["admin_logged_in"] === true;
}

/** Wajibkan login sebelum lanjut; hentikan request dengan 401 jika belum login.
 *  Dipakai HANYA di action CRUD admin (tambah depot, ubah bobot, reset riwayat). */
function requireLogin(): void {
    if (!isLoggedIn()) {
        respond(["success" => false, "message" => "Sesi tidak valid. Silakan login kembali."], 401);
    }
}

$action = $_GET["action"] ?? "";
$method = $_SERVER["REQUEST_METHOD"];

/* ══════════════════════════════════════════════════════════
   3. ROUTING
   ══════════════════════════════════════════════════════════ */

/* ---------- 3.0.A POST: Login admin ---------- */
if ($method === "POST" && $action === "login") {
    $body = getJsonBody();
    $username = trim((string) ($body["username"] ?? ""));
    $password = (string) ($body["password"] ?? "");

    if ($username === "" || $password === "") {
        respond(["success" => false, "message" => "Username dan password wajib diisi."], 400);
    }

    $stmt = $pdo->prepare("SELECT id_admin, username, password_hash FROM admin WHERE username = :u LIMIT 1");
    $stmt->bindValue(":u", $username);
    $stmt->execute();
    $row = $stmt->fetch();

    // Selalu jalankan password_verify walau username tidak ditemukan (pakai dummy hash)
    // agar waktu respons tidak membocorkan apakah username terdaftar di DB.
    $dummyHash = '$2y$10$C6UzMDM.H6dfI/f/IKcEeO0kD9AtQmvqEG5Fx2E8Nk8Rk5v6E9Yy2';
    $hash = $row["password_hash"] ?? $dummyHash;
    $valid = password_verify($password, $hash);

    if (!$row || !$valid) {
        respond(["success" => false, "message" => "Username atau password salah."], 401);
    }

    session_regenerate_id(true); // cegah session fixation
    $_SESSION["admin_logged_in"] = true;
    $_SESSION["admin_id"]        = (int) $row["id_admin"];
    $_SESSION["admin_username"]  = $row["username"];

    respond(["success" => true, "message" => "Login berhasil.", "username" => $row["username"]]);
}

/* ---------- 3.0.B POST: Logout admin ---------- */
if ($method === "POST" && $action === "logout") {
    $_SESSION = [];
    session_destroy();
    respond(["success" => true, "message" => "Logout berhasil."]);
}

/* ---------- 3.0.C GET: Cek status sesi admin saat ini ---------- */
if ($method === "GET" && $action === "check_session") {
    respond([
        "success"   => true,
        "logged_in" => isLoggedIn(),
        "username"  => $_SESSION["admin_username"] ?? null,
    ]);
}

/* ---------- 3.A GET: Ambil semua riwayat pemeriksaan (PUBLIK) ---------- */
if ($method === "GET" && $action === "history") {
    $stmt = $pdo->query(
        "SELECT r.id_pemeriksaan, r.waktu_pemeriksaan, r.nilai_ph, r.nilai_tds,
                r.nilai_turbidity, r.skor_v, r.status_kelayakan,
                r.id_depot, d.nama_depot
         FROM riwayat_pemeriksaan r
         LEFT JOIN data_depot d ON d.id_depot = r.id_depot
         ORDER BY r.waktu_pemeriksaan DESC, r.id_pemeriksaan DESC"
    );
    $rows = $stmt->fetchAll();

    $result = array_map(function ($row) {
        return [
            "id"         => formatSampleId($row["id_pemeriksaan"]),
            "ts_raw"     => $row["waktu_pemeriksaan"], // ISO datetime mentah, biar diformat di JS
            "ph"         => (float) $row["nilai_ph"],
            "tds"        => (float) $row["nilai_tds"],
            "turb"       => (float) $row["nilai_turbidity"],
            "v"          => (float) $row["skor_v"],
            "label"      => $row["status_kelayakan"],
            "id_depot"   => (int) $row["id_depot"],
            "nama_depot" => $row["nama_depot"] ?? "(Depot Terhapus)",
        ];
    }, $rows);

    respond(["success" => true, "data" => $result]);
}

/* ---------- 3.B POST: Simpan riwayat pemeriksaan baru ---------- */
if ($method === "POST" && $action === "history") {
    $body = getJsonBody();

    $ph      = $body["ph"]     ?? null;
    $tds     = $body["tds"]    ?? null;
    $turb    = $body["turb"]   ?? null;
    $v       = $body["v"]      ?? null;
    $label   = $body["status_kelayakan"] ?? null;
    // id_depot dikirim dari dropdown "Depot yang Diuji" di frontend.
    // Fallback ke 1 hanya untuk menjaga kompatibilitas mundur jika field tidak dikirim.
    $idDepot = $body["id_depot"] ?? 1;

    if (!is_numeric($ph) || !is_numeric($tds) || !is_numeric($turb) ||
        !is_numeric($v) || empty($label)) {
        respond(["success" => false, "message" => "Data tidak lengkap atau tidak valid."], 400);
    }

    if (!is_numeric($idDepot)) {
        respond(["success" => false, "message" => "id_depot tidak valid."], 400);
    }

    $stmt = $pdo->prepare(
        "INSERT INTO riwayat_pemeriksaan
            (id_depot, waktu_pemeriksaan, nilai_ph, nilai_tds, nilai_turbidity, skor_v, status_kelayakan)
         VALUES
            (:id_depot, NOW(), :ph, :tds, :turb, :v, :label)"
    );
    $stmt->bindValue(":id_depot", (int) $idDepot, PDO::PARAM_INT);
    $stmt->bindValue(":ph",    (float) $ph);
    $stmt->bindValue(":tds",   (float) $tds);
    $stmt->bindValue(":turb",  (float) $turb);
    $stmt->bindValue(":v",     (float) $v);
    $stmt->bindValue(":label", (string) $label);
    $stmt->execute();

    $newId = (int) $pdo->lastInsertId();

    respond([
        "success" => true,
        "message" => "Riwayat berhasil disimpan.",
        "id"      => formatSampleId($newId),
    ], 201);
}

/* ---------- 3.C GET: Ambil seluruh data depot ---------- */
if ($method === "GET" && $action === "depot") {
    $stmt = $pdo->query(
        "SELECT id_depot, nama_depot, alamat_depot, kontak
         FROM data_depot
         ORDER BY nama_depot ASC"
    );
    $rows = $stmt->fetchAll();

    respond(["success" => true, "data" => $rows]);
}

/* ---------- 3.D POST: Simpan data depot baru (WAJIB LOGIN) ---------- */
if ($method === "POST" && $action === "depot") {
    requireLogin();
    $body = getJsonBody();

    $nama   = trim((string) ($body["nama_depot"]   ?? ""));
    $alamat = trim((string) ($body["alamat_depot"] ?? ""));
    $kontak = trim((string) ($body["kontak"]       ?? ""));

    if ($nama === "") {
        respond(["success" => false, "message" => "Nama depot wajib diisi."], 400);
    }

    $stmt = $pdo->prepare(
        "INSERT INTO data_depot (nama_depot, alamat_depot, kontak)
         VALUES (:nama, :alamat, :kontak)"
    );
    $stmt->bindValue(":nama",   $nama);
    $stmt->bindValue(":alamat", $alamat !== "" ? $alamat : null);
    $stmt->bindValue(":kontak", $kontak !== "" ? $kontak : null);
    $stmt->execute();

    $newId = (int) $pdo->lastInsertId();

    respond([
        "success"      => true,
        "message"      => "Depot baru berhasil disimpan.",
        "id_depot"     => $newId,
        "nama_depot"   => $nama,
        "alamat_depot" => $alamat,
        "kontak"       => $kontak,
    ], 201);
}

/* ---------- 3.E GET: Ambil bobot kriteria saat ini ---------- */
if ($method === "GET" && $action === "bobot") {
    $stmt = $pdo->prepare(
        "SELECT bobot_ph, bobot_tds, bobot_turb, terakhir_diubah
         FROM pengaturan_bobot WHERE id_pengaturan = 1"
    );
    $stmt->execute();
    $row = $stmt->fetch();

    if (!$row) {
        respond(["success" => false, "message" => "Pengaturan bobot tidak ditemukan."], 404);
    }

    respond([
        "success" => true,
        "data" => [
            "bobot_ph"   => (float) $row["bobot_ph"],
            "bobot_tds"  => (float) $row["bobot_tds"],
            "bobot_turb" => (float) $row["bobot_turb"],
        ],
    ]);
}

/* ---------- 3.F POST: Update bobot kriteria (khusus id_pengaturan = 1) (WAJIB LOGIN) ---------- */
if ($method === "POST" && $action === "bobot") {
    requireLogin();
    $body = getJsonBody();

    $bPh   = $body["bobot_ph"]   ?? null;
    $bTds  = $body["bobot_tds"]  ?? null;
    $bTurb = $body["bobot_turb"] ?? null;

    if (!is_numeric($bPh) || !is_numeric($bTds) || !is_numeric($bTurb)) {
        respond(["success" => false, "message" => "Nilai bobot tidak valid."], 400);
    }

    $stmt = $pdo->prepare(
        "UPDATE pengaturan_bobot
         SET bobot_ph = :ph, bobot_tds = :tds, bobot_turb = :turb, terakhir_diubah = NOW()
         WHERE id_pengaturan = 1"
    );
    $stmt->bindValue(":ph",   (float) $bPh);
    $stmt->bindValue(":tds",  (float) $bTds);
    $stmt->bindValue(":turb", (float) $bTurb);
    $stmt->execute();

    respond(["success" => true, "message" => "Bobot berhasil diperbarui."]);
}

/* ---------- 3.G (BONUS, opsional) POST: Hapus seluruh riwayat ---------- */
/* Tidak diminta secara eksplisit, tapi tombol "Reset Riwayat" di frontend
   Anda sudah ada — endpoint ini menjaga fitur itu tetap berfungsi setelah
   migrasi ke MySQL. Hapus blok ini jika tidak ingin menyediakannya. */
if ($method === "POST" && $action === "reset_history") {
    requireLogin();
    // TRUNCATE menghapus seluruh baris SEKALIGUS mengembalikan AUTO_INCREMENT
    // ke 1 — beda dengan DELETE yang cuma menghapus isi baris tanpa
    // mereset penghitung id_pemeriksaan.
    $pdo->exec("TRUNCATE TABLE riwayat_pemeriksaan");
    respond(["success" => true, "message" => "Seluruh riwayat berhasil dihapus."]);
}

/* ---------- Fallback: action tidak dikenali ---------- */
respond(["success" => false, "message" => "Aksi tidak dikenali atau method tidak sesuai."], 404);