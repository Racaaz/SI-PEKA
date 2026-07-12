/* ============================================================
   script.js — SPK Kualitas Air | Depot Isi Ulang
   Tahap 2: Logika Weighted Product (WP) + Toggle Tema
   Diperbarui: Standar Permenkes No. 2 Tahun 2023
   ============================================================ */

/* ══════════════════════════════════════════════════════════
   1. ANTI-FLASH THEME INIT
   (Jalankan secepat mungkin sebelum render)
   Blok ini tetap harus ada sebagai <script> inline di <head>
   SEBELUM <link rel="stylesheet"> — tidak bisa dipindah ke sini.
   ══════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════
   2. THEME TOGGLE
   ══════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════
   0. RIWAYAT PEMERIKSAAN — Diambil & disimpan lewat api.php (MySQL)
   ══════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════
   0.A UTILITAS UI — Toast, Modal Konfirmasi, Debounce, Count-up
   (Menggantikan alert()/confirm() bawaan browser + animasi angka)
   ══════════════════════════════════════════════════════════ */

/**
 * Tampilkan notifikasi toast custom (pengganti alert()).
 * @param {string} message
 * @param {'success'|'error'|'warn'|'info'} type
 * @param {number} duration - ms sebelum toast hilang otomatis
 */
function showToast(message, type = "info", duration = 3200) {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const icons = {
    success: `<svg class="w-4 h-4 flex-shrink-0 mt-0.5 text-layak" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>`,
    error: `<svg class="w-4 h-4 flex-shrink-0 mt-0.5 text-bahaya" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>`,
    warn: `<svg class="w-4 h-4 flex-shrink-0 mt-0.5 text-waspada" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m0 3.75h.008v.008H12v-.008zM21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
    info: `<svg class="w-4 h-4 flex-shrink-0 mt-0.5 text-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
  };

  const toast = document.createElement("div");
  toast.className = `toast-item toast-${type}`;
  toast.innerHTML = `${icons[type] || icons.info}<span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("toast-out");
    setTimeout(() => toast.remove(), 220);
  }, duration);
}

/**
 * Tampilkan modal konfirmasi custom (pengganti confirm()).
 * @param {string} message
 * @returns {Promise<boolean>} true jika user menekan "Ya"
 */
function showConfirm(message) {
  return new Promise((resolve) => {
    const modal = document.getElementById("confirm-modal");
    const text = document.getElementById("confirm-modal-text");
    const btnOk = document.getElementById("confirm-modal-ok");
    const btnCancel = document.getElementById("confirm-modal-cancel");
    if (!modal || !text || !btnOk || !btnCancel) { resolve(window.confirm(message)); return; }

    text.textContent = message;
    modal.classList.remove("hidden");
    modal.classList.add("flex");

    const cleanup = (result) => {
      modal.classList.add("hidden");
      modal.classList.remove("flex");
      btnOk.removeEventListener("click", onOk);
      btnCancel.removeEventListener("click", onCancel);
      resolve(result);
    };
    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);

    btnOk.addEventListener("click", onOk);
    btnCancel.addEventListener("click", onCancel);
  });
}

/** Debounce sederhana untuk membatasi frekuensi eksekusi fungsi. */
function debounce(fn, wait = 150) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

/**
 * Animasi count-up pada elemen teks numerik.
 * @param {HTMLElement} el
 * @param {number} from
 * @param {number} to
 * @param {number} decimals
 * @param {number} duration - ms
 */
function animateNumber(el, from, to, decimals = 4, duration = 700) {
  if (!el) return;
  const start = performance.now();
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  function tick(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = easeOutCubic(progress);
    const val = from + (to - from) * eased;
    el.textContent = val.toFixed(decimals);
    if (progress < 1) {
      requestAnimationFrame(tick);
    } else {
      el.textContent = to.toFixed(decimals);
      el.classList.add("value-pulse");
      setTimeout(() => el.classList.remove("value-pulse"), 400);
    }
  }
  requestAnimationFrame(tick);
}

/** Trigger efek confetti singkat (dipanggil saat status LAYAK). */
function fireConfetti() {
  if (typeof confetti !== "function") return;
  confetti({
    particleCount: 90,
    spread: 70,
    startVelocity: 32,
    origin: { y: 0.6 },
    colors: ["#00D4B4", "#22C55E", "#00A890", "#F9FAFB"],
  });
}

/** Base URL endpoint backend PHP (lihat api.php). */
const API_BASE = "api.php";

/** @type {Array<{id:string, ts:string, ph:number, tds:number, turb:number, v:number, label:string, color:string}>} */
let historyLog = [];

/* ══════════════════════════════════════════════════════════
   FUNGSI RIWAYAT
   ══════════════════════════════════════════════════════════ */

/**
 * Kirim satu hasil pemeriksaan baru ke server (INSERT ke riwayat_pemeriksaan),
 * lalu ambil ulang seluruh riwayat dari server agar tabel selalu sinkron dengan DB.
 */
async function addHistoryEntry(ph, tds, turb, v, status) {
  // Depot yang dipilih di dropdown wajib ada sebelum riwayat disimpan.
  const idDepot = document.getElementById("depot-select")?.value || "";
  if (!idDepot) {
    showToast('Pilih "Depot yang Diuji" terlebih dahulu sebelum menyimpan riwayat.', "warn");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}?action=history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ph, tds, turb, v, status_kelayakan: status.label, id_depot: idDepot }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message || "Gagal menyimpan riwayat.");

    await renderHistory(true); // true = animasi untuk baris pertama (baru ditambahkan)
  } catch (err) {
    console.error(err);
    showToast("Gagal menyimpan riwayat ke server.", "error");
  }
}

/** Format string datetime MySQL ("2026-07-06 14:30:00") ke format tanggal id-ID. */
function formatTanggalID(mysqlDatetime) {
  const d = new Date(String(mysqlDatetime).replace(" ", "T"));
  return d.toLocaleString("id-ID", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

/** Peta label status_kelayakan dari DB -> kelas warna badge (layak/waspada/bahaya). */
function labelToColor(label) {
  if (label === "LAYAK") return "layak";
  if (label === "WASPADA") return "waspada";
  return "bahaya";
}

/**
 * Render seluruh riwayat ke tabel HTML. Data diambil langsung dari server (GET api.php)
 * setiap kali fungsi ini dipanggil, sehingga tabel selalu mencerminkan isi database.
 * @param {boolean} animateFirst - Jika true, baris pertama diberi class animasi.
 */
/** Cek apakah satu entri riwayat lolos filter depot + status + pencarian teks waktu. */
function passesHistoryFilter(entry) {
  const depotSel = document.getElementById("filter-depot")?.value || "all";
  const statusSel = document.getElementById("filter-status")?.value || "all";
  const searchVal = (document.getElementById("filter-search")?.value || "").toLowerCase().trim();
  if (depotSel !== "all" && String(entry.idDepot) !== depotSel) return false;
  if (statusSel !== "all" && entry.color !== statusSel) return false;
  if (searchVal && !entry.ts.toLowerCase().includes(searchVal)) return false;
  return true;
}

async function renderHistory(animateFirst = false) {
  try {
    const res = await fetch(`${API_BASE}?action=history`);
    const json = await res.json();
    if (!json.success) throw new Error(json.message || "Gagal memuat riwayat.");

    historyLog = json.data.map((row) => ({
      id: row.id,
      ts: formatTanggalID(row.ts_raw),
      ph: row.ph,
      tds: row.tds,
      turb: row.turb,
      v: row.v,
      label: row.label,
      color: labelToColor(row.label),
      idDepot: row.id_depot,
      namaDepot: row.nama_depot,
    }));
  } catch (err) {
    console.error(err);
    showToast("Gagal memuat riwayat dari server.", "error");
    return;
  }

  const empty = document.getElementById("history-empty");
  const wrap  = document.getElementById("history-table-wrap");
  const tbody = document.getElementById("history-tbody");
  const countEl = document.getElementById("filter-count");
  const trendWrap = document.getElementById("trend-chart-wrap");
  if (!empty || !wrap || !tbody) return;

  updateStreakBadge();

  if (historyLog.length === 0) {
    empty.classList.remove("hidden");
    wrap.classList.add("hidden");
    trendWrap?.classList.add("hidden");
    if (countEl) countEl.textContent = "0 data";
    return;
  }

  empty.classList.add("hidden");
  wrap.classList.remove("hidden");

  // Warna & badge berdasarkan status
  const badgeStyles = {
    layak:   { bg: "rgba(34,197,94,0.12)",  border: "rgba(34,197,94,0.35)",  text: "#22C55E" },
    waspada: { bg: "rgba(234,179,8,0.10)",  border: "rgba(234,179,8,0.35)",  text: "#EAB308" },
    bahaya:  { bg: "rgba(239,68,68,0.10)",  border: "rgba(239,68,68,0.30)",  text: "#EF4444" },
  };

  // idx = posisi asli di historyLog (dipakai untuk nomor urut & cek "baru")
  const filtered = historyLog
    .map((entry, idx) => ({ entry, idx }))
    .filter(({ entry }) => passesHistoryFilter(entry));

  if (countEl) countEl.textContent = `${filtered.length} data`;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr class="filter-empty-row"><td colspan="8">Tidak ada data yang cocok dengan filter/pencarian.</td></tr>`;
  } else {
    tbody.innerHTML = filtered.map(({ entry, idx }, pos) => {
      const isNew = animateFirst && idx === 0;
      const animClass = isNew ? " history-row-new" : "";
      const s = badgeStyles[entry.color] || badgeStyles.bahaya;
      const zebraStyle = pos % 2 === 0 ? "" : "background:rgba(0,0,0,0.04);";

      return `
      <tr class="${animClass}" style="${zebraStyle}border-bottom:1px solid var(--border-soft);">
        <td class="py-2.5 px-3 tabular-nums">
          <button type="button"
            class="sample-id-btn font-mono text-[11px] font-semibold tracking-wide px-2 py-1 rounded-md border t-text-primary hover:text-[#00D4B4] hover:border-[#00D4B4]"
            style="border-color:var(--border-soft);background:var(--bg-card-inner);transition:color 0.15s ease,border-color 0.15s ease;"
            onclick="loadSampleToPreview('${entry.id}')"
            title="Klik untuk memuat ulang sampel ini ke form input">
            ${entry.id}
          </button>
        </td>
        <td class="py-2.5 px-3 t-text-secondary whitespace-nowrap">${entry.namaDepot}</td>
        <td class="py-2.5 px-3 t-text-secondary whitespace-nowrap">${entry.ts}</td>
        <td class="py-2.5 px-3 text-right tabular-nums t-text-primary font-semibold">${parseFloat(entry.ph).toFixed(1)}</td>
        <td class="py-2.5 px-3 text-right tabular-nums t-text-primary">${parseFloat(entry.tds).toFixed(0)}</td>
        <td class="py-2.5 px-3 text-right tabular-nums t-text-primary">${parseFloat(entry.turb).toFixed(1)}</td>
        <td class="py-2.5 px-3 text-right tabular-nums font-bold" style="color:${s.text};">${parseFloat(entry.v).toFixed(4)}</td>
        <td class="py-2.5 px-3 text-center">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap"
            style="background:${s.bg};color:${s.text};border:1px solid ${s.border};">
            ${entry.label}
          </span>
        </td>
      </tr>`;
    }).join("");
  }

  updateTrendChart(filtered.map((f) => f.entry));
}

/* Filter & search listener */
document.getElementById("filter-depot")?.addEventListener("change", () => renderHistory());
document.getElementById("filter-status")?.addEventListener("change", () => renderHistory());
document.getElementById("filter-search")?.addEventListener("input", debounce(() => renderHistory(), 200));

/**
 * Hitung dan tampilkan streak "Layak" berturut-turut dari entri terbaru.
 */
function updateStreakBadge() {
  const badge = document.getElementById("streak-badge");
  if (!badge) return;

  let streak = 0;
  for (const entry of historyLog) {
    if (entry.color === "layak") streak++;
    else break;
  }

  if (historyLog.length === 0) {
    badge.textContent = "—";
    badge.style.color = "";
    badge.parentElement?.classList.remove("streak-active");
    return;
  }

  badge.textContent = streak > 0 ? `${streak}x 🏅` : "0x";
  badge.style.color = streak >= 3 ? "#EAB308" : streak > 0 ? "#22C55E" : "";
  badge.parentElement?.classList.toggle("streak-active", streak >= 3);
}

/* ══════════════════════════════════════════════════════════
   EXPORT RIWAYAT — Excel (SheetJS) & PDF (jsPDF)
   ══════════════════════════════════════════════════════════ */

/** Ambil data riwayat yang saat ini lolos filter, urut lama → baru. */
function getFilteredHistoryForExport() {
  return historyLog.filter(passesHistoryFilter).slice().reverse();
}

document.getElementById("btn-export-excel")?.addEventListener("click", () => {
  const data = getFilteredHistoryForExport();
  if (data.length === 0) {
    showToast("Tidak ada data riwayat untuk diekspor.", "warn");
    return;
  }
  if (typeof XLSX === "undefined") {
    showToast("Modul export Excel gagal dimuat.", "error");
    return;
  }
  try {
    const rows = data.map((e, i) => ({
      No: i + 1,
      "Depot": e.namaDepot,
      "Waktu Pemeriksaan": e.ts,
      "pH": parseFloat(e.ph).toFixed(1),
      "TDS (ppm)": parseFloat(e.tds).toFixed(0),
      "Turbidity (NTU)": parseFloat(e.turb).toFixed(1),
      "Skor Vektor V": parseFloat(e.v).toFixed(4),
      "Status": e.label,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Riwayat SPK");
    XLSX.writeFile(wb, `Riwayat_SPK_Kualitas_Air_${Date.now()}.xlsx`);
    showToast("Riwayat berhasil diekspor ke Excel.", "success");
  } catch (err) {
    console.error(err);
    showToast("Gagal mengekspor ke Excel.", "error");
  }
});

document.getElementById("btn-export-pdf")?.addEventListener("click", () => {
  const data = getFilteredHistoryForExport();
  if (data.length === 0) {
    showToast("Tidak ada data riwayat untuk diekspor.", "warn");
    return;
  }
  const JsPDFCtor = window.jspdf?.jsPDF;
  if (!JsPDFCtor) {
    showToast("Modul export PDF gagal dimuat.", "error");
    return;
  }
  try {
    const doc = new JsPDFCtor({ orientation: "landscape", unit: "pt" });
    doc.setFontSize(14);
    doc.text("Riwayat Pemeriksaan Kualitas Air — SPK Weighted Product", 40, 40);
    doc.setFontSize(9);
    doc.text(`Diekspor: ${new Date().toLocaleString("id-ID")}`, 40, 58);

    const headers = ["No", "Depot", "Waktu Pemeriksaan", "pH", "TDS (ppm)", "Turbidity (NTU)", "Skor V", "Status"];
    const colX = [40, 90, 220, 370, 415, 470, 545, 610];
    let y = 90;

    doc.setFontSize(10);
    doc.setFont(undefined, "bold");
    headers.forEach((h, i) => doc.text(h, colX[i], y));
    doc.setFont(undefined, "normal");
    y += 6;
    doc.line(40, y, 750, y);
    y += 16;

    data.forEach((e, i) => {
      if (y > 560) { doc.addPage(); y = 40; }
      const row = [
        String(i + 1),
        e.namaDepot,
        e.ts,
        parseFloat(e.ph).toFixed(1),
        parseFloat(e.tds).toFixed(0),
        parseFloat(e.turb).toFixed(1),
        parseFloat(e.v).toFixed(4),
        e.label,
      ];
      row.forEach((val, ci) => doc.text(String(val), colX[ci], y));
      y += 18;
    });

    doc.save(`Riwayat_SPK_Kualitas_Air_${Date.now()}.pdf`);
    showToast("Riwayat berhasil diekspor ke PDF.", "success");
  } catch (err) {
    console.error(err);
    showToast("Gagal mengekspor ke PDF.", "error");
  }
});

/** Hapus seluruh riwayat (di server/database, lewat api.php) */
async function resetHistory() {
  try {
    const res = await fetch(`${API_BASE}?action=reset_history`, { method: "POST" });
    const json = await res.json();
    if (!json.success) throw new Error(json.message || "Gagal menghapus riwayat.");
    await renderHistory();
  } catch (err) {
    console.error(err);
    showToast("Gagal menghapus riwayat di server.", "error");
  }
}

/* Render riwayat saat halaman pertama kali dimuat */
document.addEventListener("DOMContentLoaded", () => renderHistory());

/* ══════════════════════════════════════════════════════════
   FUNGSI DATA DEPOT — GET/POST api.php?action=depot
   ══════════════════════════════════════════════════════════ */

const depotSelect = document.getElementById("depot-select");

/**
 * Ambil seluruh data depot dari server dan render ke dropdown <select> input
 * (#depot-select) sekaligus dropdown filter riwayat (#filter-depot).
 * @param {number|string|null} selectIdAfterLoad - id_depot yang otomatis dipilih setelah render (mis. depot yang baru saja ditambahkan).
 */
async function loadDepotOptions(selectIdAfterLoad = null) {
  if (!depotSelect) return;
  try {
    const res = await fetch(`${API_BASE}?action=depot`);
    const json = await res.json();
    if (!json.success) throw new Error(json.message || "Gagal memuat data depot.");

    const depots = json.data || [];

    if (depots.length === 0) {
      depotSelect.innerHTML = `<option value="">Belum ada data depot — tambahkan dahulu</option>`;
      return;
    }

    const previousValue = depotSelect.value;
    depotSelect.innerHTML = depots
      .map((d) => `<option value="${d.id_depot}">${d.nama_depot}</option>`)
      .join("");

    // Prioritas pemilihan: id yang diminta eksplisit > nilai sebelumnya (jika masih ada) > opsi pertama (default browser)
    if (selectIdAfterLoad != null) {
      depotSelect.value = String(selectIdAfterLoad);
    } else if (previousValue && depots.some((d) => String(d.id_depot) === previousValue)) {
      depotSelect.value = previousValue;
    }

    // Isi juga dropdown filter riwayat, dengan opsi "Semua Depot" tetap di posisi pertama.
    const filterDepot = document.getElementById("filter-depot");
    if (filterDepot) {
      const previousFilterValue = filterDepot.value || "all";
      filterDepot.innerHTML =
        `<option value="all">Semua Depot</option>` +
        depots.map((d) => `<option value="${d.id_depot}">${d.nama_depot}</option>`).join("");
      if (previousFilterValue === "all" || depots.some((d) => String(d.id_depot) === previousFilterValue)) {
        filterDepot.value = previousFilterValue;
      }
    }
  } catch (err) {
    console.error(err);
    depotSelect.innerHTML = `<option value="">Gagal memuat daftar depot</option>`;
    showToast("Gagal memuat daftar depot dari server.", "error");
  }
}
document.addEventListener("DOMContentLoaded", () => loadDepotOptions());

/* ── Modal Tambah Depot Baru ── */
const depotModal = document.getElementById("depot-modal");
const depotForm = document.getElementById("depot-form");

function openDepotModal() {
  depotModal?.classList.remove("hidden");
  depotModal?.classList.add("flex");
  document.getElementById("depot-nama")?.focus();
}
function closeDepotModal() {
  depotModal?.classList.add("hidden");
  depotModal?.classList.remove("flex");
  depotForm?.reset();
}

document.getElementById("btn-open-depot-modal")?.addEventListener("click", openDepotModal);
document.getElementById("depot-modal-close")?.addEventListener("click", closeDepotModal);
document.getElementById("depot-modal-cancel")?.addEventListener("click", closeDepotModal);

/* Tutup modal jika klik area gelap di luar kartu */
depotModal?.addEventListener("click", (e) => {
  if (e.target === depotModal) closeDepotModal();
});

/** Kirim data depot baru ke server, lalu perbarui dropdown & pilih depot yang baru dibuat. */
depotForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const nama_depot = document.getElementById("depot-nama")?.value.trim();
  const alamat_depot = document.getElementById("depot-alamat")?.value.trim();
  const kontak = document.getElementById("depot-kontak")?.value.trim();

  if (!nama_depot) {
    showToast("Nama depot wajib diisi.", "warn");
    return;
  }

  const submitBtn = depotForm.querySelector('button[type="submit"]');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.style.opacity = "0.7"; }

  try {
    const res = await fetch(`${API_BASE}?action=depot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nama_depot, alamat_depot, kontak }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message || "Gagal menyimpan depot.");

    await loadDepotOptions(json.id_depot); // muat ulang dropdown & langsung pilih depot baru
    closeDepotModal();
    showToast(`Depot "${nama_depot}" berhasil ditambahkan.`, "success");
  } catch (err) {
    console.error(err);
    showToast("Gagal menyimpan depot ke server.", "error");
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.style.opacity = "1"; }
  }
});

/* Tombol Reset Riwayat */
document.getElementById("btn-reset-history")?.addEventListener("click", async () => {
  if (historyLog.length === 0) {
    showToast("Belum ada riwayat untuk dihapus.", "info");
    return;
  }
  const confirmed = await showConfirm("Hapus seluruh riwayat pemeriksaan? Tindakan ini tidak dapat dibatalkan.");
  if (confirmed) {
    await resetHistory();
    showToast("Seluruh riwayat berhasil dihapus.", "success");
  }
});

/* ══════════════════════════════════════════════════════════ */

const STORAGE_KEY = "spk-theme";
const htmlEl = document.documentElement;
const themeBtn = document.getElementById("theme-toggle");

/**
 * Terapkan tema ke <html> dan simpan ke localStorage.
 * @param {'dark'|'light'} theme
 */
function applyTheme(theme) {
  const isDark = theme === "dark";
  htmlEl.classList.toggle("dark", isDark);
  htmlEl.classList.toggle("light", !isDark);
  localStorage.setItem(STORAGE_KEY, theme);
}

/** Toggle antara dark ↔ light */
function toggleTheme() {
  applyTheme(htmlEl.classList.contains("dark") ? "light" : "dark");
}

/* Event listener tombol */
themeBtn.addEventListener("click", toggleTheme);

/* Keyboard accessibility: Space / Enter */
themeBtn.addEventListener("keydown", (e) => {
  if (e.key === " " || e.key === "Enter") {
    e.preventDefault();
    toggleTheme();
  }
});

/* Ikuti perubahan preferensi OS saat runtime (jika belum ada pilihan manual) */
window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", (e) => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      applyTheme(e.matches ? "dark" : "light");
    }
  });

/* ══════════════════════════════════════════════════════════
   3. LIVE pH SLIDER → DISPLAY SYNC
   ══════════════════════════════════════════════════════════ */

const phSlider = document.getElementById("ph-slider");
const phBarVal = document.getElementById("ph-bar-val");
const phBarFill = document.getElementById("ph-bar-fill");

phSlider.addEventListener("input", () => {
  const raw = parseFloat(phSlider.value);
  if (isNaN(raw)) return; // biarkan tampilan terakhir tetap saat kotak input sedang dikosongkan/diketik ulang
  const val = raw.toFixed(1);
  phBarVal.textContent = val;
  phBarFill.style.width = ((Math.min(Math.max(raw, 0), 14) / 14) * 100).toFixed(2) + "%";
  updatePhBadge(raw);
});

/** Update badge warna pH di kolom kanan */
function updatePhBadge(ph) {
  const badge = document.getElementById("ph-bar-badge");
  if (!badge) return;
  if (ph >= 6.5 && ph <= 8.5) {
    badge.textContent = "Normal";
    badge.style.cssText =
      "background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.25);";
    badge.className = "px-2 py-0.5 rounded text-[10px] font-mono text-layak";
  } else if ((ph >= 5.5 && ph < 6.5) || (ph > 8.5 && ph <= 9.5)) {
    badge.textContent = "Waspada";
    badge.style.cssText =
      "background:rgba(234,179,8,0.08);border:1px solid rgba(234,179,8,0.25);";
    badge.className = "px-2 py-0.5 rounded text-[10px] font-mono text-waspada";
  } else {
    badge.textContent = "Tidak Layak";
    badge.style.cssText =
      "background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);";
    badge.className = "px-2 py-0.5 rounded text-[10px] font-mono text-bahaya";
  }
}

/* ══════════════════════════════════════════════════════════
   4. KONSTANTA WEIGHTED PRODUCT
   Diperbarui sesuai Permenkes No. 2 Tahun 2023
   ══════════════════════════════════════════════════════════ */

/**
 * Bobot ternormalisasi kriteria WP (default: pH 0.4 · TDS 0.3 · Turbidity 0.3).
 * Bersifat mutable — dapat diubah pengguna melalui slider "Kustomisasi Bobot".
 * Total selalu dijaga = 1 melalui redistribusi proporsional (lihat syncWeightsFromSliders).
 */
let W = { pH: 0.40, tds: 0.30, turb: 0.30 };

/* ══════════════════════════════════════════════════════════
   4.B SLIDER BOBOT KRITERIA — Redistribusi Proporsional
   ══════════════════════════════════════════════════════════ */

const DEFAULT_WEIGHTS_PCT = { pH: 40, tds: 30, turb: 30 };
const weightSliders = {
  pH: document.getElementById("weight-ph-slider"),
  tds: document.getElementById("weight-tds-slider"),
  turb: document.getElementById("weight-turb-slider"),
};
const weightLabels = {
  pH: document.getElementById("weight-ph-val"),
  tds: document.getElementById("weight-tds-val"),
  turb: document.getElementById("weight-turb-val"),
};

/** Ambil bobot tersimpan dari server saat halaman dimuat, lalu set posisi slider + W. */
async function loadWeightsFromServer() {
  try {
    const res = await fetch(`${API_BASE}?action=bobot`);
    const json = await res.json();
    if (!json.success) throw new Error(json.message || "Gagal memuat bobot.");

    const { bobot_ph, bobot_tds, bobot_turb } = json.data;
    W = { pH: bobot_ph, tds: bobot_tds, turb: bobot_turb };

    if (weightSliders.pH)   weightSliders.pH.value   = Math.round(bobot_ph * 100);
    if (weightSliders.tds)  weightSliders.tds.value  = Math.round(bobot_tds * 100);
    if (weightSliders.turb) weightSliders.turb.value = Math.round(bobot_turb * 100);

    if (weightLabels.pH)   weightLabels.pH.textContent   = W.pH.toFixed(2);
    if (weightLabels.tds)  weightLabels.tds.textContent  = W.tds.toFixed(2);
    if (weightLabels.turb) weightLabels.turb.textContent = W.turb.toFixed(2);
  } catch (err) {
    console.error(err);
    showToast("Gagal memuat bobot dari server, memakai nilai default.", "warn");
  }
}
document.addEventListener("DOMContentLoaded", loadWeightsFromServer);

/** Kirim bobot ke server; di-debounce agar tidak spam request selama slider masih digeser. */
const saveWeightsToServer = debounce(async () => {
  try {
    const res = await fetch(`${API_BASE}?action=bobot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bobot_ph: W.pH, bobot_tds: W.tds, bobot_turb: W.turb }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message || "Gagal menyimpan bobot.");
  } catch (err) {
    console.error(err);
    showToast("Gagal menyimpan bobot ke server.", "error");
  }
}, 600); // request UPDATE terkirim 600ms setelah slider berhenti digeser

/** Baca nilai slider bobot, normalisasi ke total 1, lalu perbarui W global + label. */
function syncWeightsFromSliders() {
  if (!weightSliders.pH || !weightSliders.tds || !weightSliders.turb) return;
  const raw = {
    pH: parseFloat(weightSliders.pH.value),
    tds: parseFloat(weightSliders.tds.value),
    turb: parseFloat(weightSliders.turb.value),
  };
  const total = raw.pH + raw.tds + raw.turb || 1;
  W = { pH: raw.pH / total, tds: raw.tds / total, turb: raw.turb / total };

  if (weightLabels.pH) weightLabels.pH.textContent = W.pH.toFixed(2);
  if (weightLabels.tds) weightLabels.tds.textContent = W.tds.toFixed(2);
  if (weightLabels.turb) weightLabels.turb.textContent = W.turb.toFixed(2);

  if (isLivePreviewOn()) runLiveCalculation();

  saveWeightsToServer(); // kirim perubahan bobot ke database (debounced)
}

/**
 * Saat satu slider digeser, sisa persentase (100 - nilai baru) didistribusikan
 * secara proporsional ke dua slider lainnya berdasarkan rasio nilai mereka saat ini,
 * sehingga total ketiga slider selalu konsisten di sekitar 100.
 */
function handleWeightSliderChange(changedKey) {
  const keys = ["pH", "tds", "turb"];
  const otherKeys = keys.filter((k) => k !== changedKey);
  const newVal = parseFloat(weightSliders[changedKey].value);
  const remaining = 100 - newVal;
  const otherSum = otherKeys.reduce((sum, k) => sum + parseFloat(weightSliders[k].value), 0);

  if (otherSum <= 0) {
    otherKeys.forEach((k) => { weightSliders[k].value = Math.round(remaining / otherKeys.length); });
  } else {
    let assigned = 0;
    otherKeys.forEach((k, i) => {
      const ratio = parseFloat(weightSliders[k].value) / otherSum;
      let v = Math.round(remaining * ratio);
      if (i === otherKeys.length - 1) v = remaining - assigned; // sisa pembulatan ke slider terakhir
      assigned += v;
      weightSliders[k].value = Math.max(1, v);
    });
  }
  syncWeightsFromSliders();
}

["pH", "tds", "turb"].forEach((key) => {
  weightSliders[key]?.addEventListener("input", () => handleWeightSliderChange(key));
});

document.getElementById("btn-reset-weights")?.addEventListener("click", () => {
  if (weightSliders.pH) weightSliders.pH.value = DEFAULT_WEIGHTS_PCT.pH;
  if (weightSliders.tds) weightSliders.tds.value = DEFAULT_WEIGHTS_PCT.tds;
  if (weightSliders.turb) weightSliders.turb.value = DEFAULT_WEIGHTS_PCT.turb;
  syncWeightsFromSliders();
  showToast("Bobot kriteria dikembalikan ke default (0.4 / 0.3 / 0.3).", "info");
});

/**
 * Rentang nilai sensor untuk normalisasi.
 * Permenkes No. 2 Tahun 2023:
 *   TDS  → batas maksimum layak = 300 ppm
 *   Turb → batas maksimum layak = 3 NTU
 *
 * Catatan: RANGE.tds.max dan RANGE.turb.max digunakan sebagai
 * batas layak SEKALIGUS batas atas normalisasi cost.
 * Nilai di atas batas max akan diklem ke max sehingga
 * menghasilkan skor normalisasi = 0 (terburuk).
 */
const RANGE = {
  pH:   { min: 0, max: 14, ideal: 7 },
  tds:  { min: 0, max: 300 },  // ← Permenkes 2023: maks 300 ppm
  turb: { min: 0, max: 3   },  // ← Permenkes 2023: maks 3 NTU
};

/** Batas klasifikasi Vektor V */
const THRESHOLD = { layak: 0.7, waspada: 0.4 };

/* ══════════════════════════════════════════════════════════
   5. FUNGSI MATEMATIKA WEIGHTED PRODUCT
   ══════════════════════════════════════════════════════════ */

/**
 * Normalisasi nilai pH menjadi skor 0–1.
 * Benefit dengan target tengah → skor tertinggi saat pH = ideal (7).
 * Skor dihitung sebagai 1 - (|pH - ideal| / (max - ideal)).
 * Nilai di luar [0, 14] diklem ke 0.
 *
 * @param {number} ph - Nilai pH mentah (0–14)
 * @returns {number} Skor normalisasi pH (0–1)
 */
function normPH(ph) {
  const { min, max, ideal } = RANGE.pH;
  const phClamped = Math.min(Math.max(ph, min), max);
  const halfRange = Math.max(ideal - min, max - ideal); // = 7
  const score = 1 - Math.abs(phClamped - ideal) / halfRange;
  return Math.max(0, Math.min(1, score));
}

/**
 * Normalisasi nilai Cost (TDS / Turbidity) menjadi skor 0–1.
 * Semakin rendah nilai asli → skor mendekati 1.
 * Nilai di atas RANGE.max diklem ke max → skor = 0 (Tidak Layak).
 * Formula: (max - value) / (max - min)
 *
 * Dengan RANGE.tds.max = 300 dan RANGE.turb.max = 3,
 * nilai TDS > 300 ppm atau Turbidity > 3 NTU secara otomatis
 * menghasilkan skor = 0, sehingga Vektor V akan jatuh ke
 * kategori "Tidak Layak".
 *
 * @param {number} value - Nilai mentah sensor
 * @param {'tds'|'turb'} key  - Kunci rentang di RANGE
 * @returns {number} Skor normalisasi (0–1)
 */
function normCost(value, key) {
  const { min, max } = RANGE[key];
  const v = Math.min(Math.max(value, min), max);
  return (max - v) / (max - min);
}

/**
 * Hitung Vektor S (produk berbobot satu alternatif).
 *
 * Formula WP:
 *   S = ∏ (x_i ^ w_i)
 *
 * Karena kita sudah menormalisasi semua kriteria menjadi skor
 * Benefit (0–1), pangkat selalu positif untuk semua kriteria.
 * (Normalisasi Cost membalik arah, sehingga tidak perlu pangkat negatif.)
 *
 * @param {number} scorePH   - Skor normalisasi pH   (0–1)
 * @param {number} scoreTDS  - Skor normalisasi TDS  (0–1)
 * @param {number} scoreTurb - Skor normalisasi Turb (0–1)
 * @returns {number} Vektor S
 */
function hitungVektorS(scorePH, scoreTDS, scoreTurb) {
  // Hindari pangkat 0 (log(0) = -∞): geser skor minimum ke epsilon kecil
  const eps = 1e-9;
  const s1 = Math.max(scorePH, eps);
  const s2 = Math.max(scoreTDS, eps);
  const s3 = Math.max(scoreTurb, eps);

  return Math.pow(s1, W.pH) * Math.pow(s2, W.tds) * Math.pow(s3, W.turb);
}

/**
 * Hitung Vektor V (skor akhir ternormalisasi 0–1).
 *
 * Dalam SPK WP multi-alternatif, V = S_i / ΣS.
 * Karena sistem ini single-sample (satu pengukuran sekaligus),
 * kita normalisasi V terhadap S_ideal (semua skor = 1):
 *
 *   S_ideal = 1^W.pH * 1^W.tds * 1^W.turb = 1
 *   V = S_sampel / S_ideal = S_sampel
 *
 * Hasil ini sudah berada di [0, 1] dan dapat langsung digunakan.
 *
 * @param {number} vektorS - Hasil hitungVektorS(...)
 * @returns {number} Vektor V (0–1)
 */
function hitungVektorV(vektorS) {
  return Math.min(1, Math.max(0, vektorS));
}

/**
 * Klasifikasi status berdasarkan Vektor V.
 * @param {number} v - Vektor V (0–1)
 * @returns {{ label: string, desc: string, color: string, hex: string }}
 */
/** Variasi kalimat deskripsi agar tidak terasa template setiap kali dihitung. */
const MICROCOPY = {
  layak: [
    "Air memenuhi standar baku mutu Permenkes No. 2 Tahun 2023. Aman untuk dikonsumsi.",
    "Hasil pemeriksaan menunjukkan kualitas air sangat baik dan sesuai baku mutu.",
    "Semua parameter berada dalam rentang aman — air layak dikonsumsi.",
  ],
  waspada: [
    "Kualitas air berada di batas toleransi. Disarankan pemeriksaan lebih lanjut.",
    "Beberapa parameter mendekati ambang batas. Perlu pengecekan berkala.",
    "Kondisi air masih dapat diterima, namun perlu diwaspadai dan dipantau.",
  ],
  bahaya: [
    "Air tidak memenuhi standar Permenkes No. 2 Tahun 2023. Jangan dikonsumsi sebelum diolah.",
    "Terdapat parameter yang melebihi ambang batas. Air tidak disarankan untuk dikonsumsi.",
    "Kualitas air berada di bawah standar. Perlu tindakan perbaikan/penyaringan ulang.",
  ],
};
function pickMicrocopy(category) {
  const arr = MICROCOPY[category] || MICROCOPY.bahaya;
  return arr[Math.floor(Math.random() * arr.length)];
}

function klasifikasi(v) {
  if (v >= THRESHOLD.layak) {
    return {
      label: "LAYAK",
      desc: pickMicrocopy("layak"),
      color: "layak",
      hex: "#22C55E",
      hexDim: "#16A34A",
    };
  } else if (v >= THRESHOLD.waspada) {
    return {
      label: "WASPADA",
      desc: pickMicrocopy("waspada"),
      color: "waspada",
      hex: "#EAB308",
      hexDim: "#CA8A04",
    };
  } else {
    return {
      label: "TIDAK LAYAK",
      desc: pickMicrocopy("bahaya"),
      color: "bahaya",
      hex: "#EF4444",
      hexDim: "#DC2626",
    };
  }
}

/* ══════════════════════════════════════════════════════════
   6. DOM MANIPULATION — UPDATE UI
   ══════════════════════════════════════════════════════════ */

/** Cache elemen DOM yang sering diakses */
const el = {
  /* Input */
  phSlider: document.getElementById("ph-slider"),
  tdsInput: document.getElementById("tds-input"),
  turbInput: document.getElementById("turb-input"),

  /* Status Card */
  statusCard: document.getElementById("status-card"),
  statusAccentBar: document.getElementById("status-accent-bar"),
  statusBadge: document.getElementById("status-badge"),
  statusIconWrap: document.getElementById("status-icon-wrap"),
  statusIcon: document.getElementById("status-icon"),
  statusLabel: document.getElementById("status-label"),
  statusDesc: document.getElementById("status-desc"),

  /* Skor */
  vScore: document.getElementById("v-score"),
  vCategory: document.getElementById("v-category"),
  calcTs: document.getElementById("calc-timestamp"),

  /* Progress bar kolom kanan */
  vProgressBar: document.getElementById("v-progress-bar"),

  /* Bar Visualisasi */
  phBarVal: document.getElementById("ph-bar-val"),
  phBarFill: document.getElementById("ph-bar-fill"),
  tdsBarVal: document.getElementById("tds-bar-val"),
  tdsBarFill: document.getElementById("tds-bar-fill"),
  tdsBarBadge: document.getElementById("tds-bar-badge"),
  turbBarVal: document.getElementById("turb-bar-val"),
  turbBarFill: document.getElementById("turb-bar-fill"),
  turbBarBadge: document.getElementById("turb-bar-badge"),
};

/**
 * Perbarui seluruh Status Card berdasarkan hasil klasifikasi.
 * @param {number} v      - Vektor V
 * @param {object} status - Hasil klasifikasi()
 */
let lastVValue = 0;

/** Putar jarum gauge SVG sesuai skor V (0–1) pada rentang -90° s.d. 90°. */
function updateGaugeNeedle(v) {
  const needle = document.getElementById("gauge-needle");
  if (!needle) return;
  const angle = -90 + Math.min(Math.max(v, 0), 1) * 180;
  needle.style.transform = `rotate(${angle}deg)`;
}

function updateStatusCard(v, status, isPreview = false) {
  /* ── Accent bar ── */
  el.statusAccentBar.style.cssText = `background:linear-gradient(90deg,${status.hex},${status.hexDim});transition:background 0.5s ease;`;

  /* ── Badge ── */
  el.statusBadge.textContent = status.label;
  el.statusBadge.style.cssText = `background:${status.hex}1A;color:${status.hex};border:1px solid ${status.hex}40;`;

  /* ── Icon wrap ── */
  el.statusIconWrap.style.cssText = `background:${status.hex}14;border:2px solid ${status.hex}33;transition:background 0.5s ease,border-color 0.5s ease;`;

  /* ── Icon SVG ── */
  el.statusIcon.style.opacity = "1";
  const icons = {
    layak: `<path stroke-linecap="round" stroke-linejoin="round"
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>`,
    waspada: `<path stroke-linecap="round" stroke-linejoin="round"
              d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>`,
    bahaya: `<path stroke-linecap="round" stroke-linejoin="round"
              d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/>`,
  };
  el.statusIcon.innerHTML = icons[status.color];
  el.statusIcon.style.color = status.hex;

  /* ── Label + Desc ── */
  el.statusLabel.style.cssText = ""; // hapus shimmer-text default
  el.statusLabel.className = `text-2xl sm:text-3xl font-bold mb-1`;
  el.statusLabel.style.color = status.hex;
  el.statusLabel.textContent = status.label;
  el.statusDesc.textContent = status.desc;

  /* ── Skor Vektor V (animasi count-up) ── */
  animateNumber(el.vScore, lastVValue, v, 4, 700);
  el.vScore.style.color = status.hex;
  el.vCategory.textContent = status.label;
  el.vCategory.style.color = status.hex;
  lastVValue = v;

  /* ── Gauge jarum ── */
  updateGaugeNeedle(v);

  /* ── Progress bar (jika elemen tersedia) ── */
  if (el.vProgressBar) {
    el.vProgressBar.style.width = (v * 100).toFixed(1) + "%";
    el.vProgressBar.style.background = `linear-gradient(90deg, ${status.hexDim}, ${status.hex})`;
  }

  /* ── Timestamp ── */
  const now = new Date();
  el.calcTs.textContent = `Dihitung pada: ${now.toLocaleTimeString("id-ID")} — ${now.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}${isPreview ? " (pratinjau)" : ""}`;

  /* ── Confetti untuk hasil LAYAK (hanya saat perhitungan resmi, bukan live preview) ── */
  if (!isPreview && status.color === "layak") {
    fireConfetti();
  }
}

/**
 * Perbarui bar visualisasi kolom kanan.
 * Menggunakan standar Permenkes No. 2 Tahun 2023:
 *   TDS  > 300 ppm → langsung Tidak Layak (Merah)
 *   Turb > 3 NTU   → langsung Tidak Layak (Merah)
 *
 * @param {number} ph   - Nilai pH
 * @param {number} tds  - Nilai TDS (ppm)
 * @param {number} turb - Nilai Turbidity (NTU)
 */
function updateVisualisasi(ph, tds, turb) {
  /* pH */
  el.phBarVal.textContent = ph.toFixed(1);
  el.phBarFill.style.width = ((ph / 14) * 100).toFixed(2) + "%";

  /* ── TDS (batas layak = 300 ppm sesuai Permenkes 2023) ── */
  el.tdsBarVal.textContent = tds.toFixed(0) + " ppm";
  // Progress bar relatif terhadap batas maksimum 300 ppm
  el.tdsBarFill.style.width =
    ((Math.min(tds, RANGE.tds.max) / RANGE.tds.max) * 100).toFixed(2) + "%";

  if (tds <= RANGE.tds.max) {
    // ≤ 300 ppm → Layak
    el.tdsBarBadge.textContent = "Layak";
    el.tdsBarBadge.style.cssText =
      "background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.25);";
    el.tdsBarBadge.className =
      "px-2 py-0.5 rounded text-[10px] font-mono text-layak";
  } else {
    // > 300 ppm → Tidak Layak (tidak ada zona Waspada untuk TDS)
    el.tdsBarBadge.textContent = "Tidak Layak";
    el.tdsBarBadge.style.cssText =
      "background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);";
    el.tdsBarBadge.className =
      "px-2 py-0.5 rounded text-[10px] font-mono text-bahaya";
  }

  /* ── Turbidity (batas layak = 3 NTU sesuai Permenkes 2023) ── */
  el.turbBarVal.textContent = turb.toFixed(1) + " NTU";
  // Progress bar relatif terhadap batas maksimum 3 NTU
  el.turbBarFill.style.width =
    ((Math.min(turb, RANGE.turb.max) / RANGE.turb.max) * 100).toFixed(2) + "%";

  if (turb <= RANGE.turb.max) {
    // ≤ 3 NTU → Layak
    el.turbBarBadge.textContent = "Layak";
    el.turbBarBadge.style.cssText =
      "background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.25);";
    el.turbBarBadge.className =
      "px-2 py-0.5 rounded text-[10px] font-mono text-layak";
  } else {
    // > 3 NTU → Tidak Layak (tidak ada zona Waspada untuk Turbidity)
    el.turbBarBadge.textContent = "Tidak Layak";
    el.turbBarBadge.style.cssText =
      "background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);";
    el.turbBarBadge.className =
      "px-2 py-0.5 rounded text-[10px] font-mono text-bahaya";
  }
}

/**
 * Tampilkan pesan error validasi di elemen tertentu.
 * @param {string} msg  - Pesan error
 * @param {string} elId - ID elemen input yang error (opsional, untuk highlight)
 */
function showValidationError(msg, elId) {
  showToast(msg, "warn");
  if (elId) {
    const target = document.getElementById(elId);
    target?.focus();
    target?.classList.add("value-pulse");
    setTimeout(() => target?.classList.remove("value-pulse"), 400);
  }
}

/* ══════════════════════════════════════════════════════════
   6B. GRAFIK PERBANDINGAN SENSOR (Chart.js)
   Bar Chart berdampingan: Nilai Input vs Batas Maksimal Kemenkes.
   Karena rentang pH (0–14), TDS (0–300), Turbidity (0–3) jauh
   berbeda, nilai DINORMALISASI ke persentase (%) terhadap
   masing-masing batas Permenkes 2023 agar tidak "jomplang".
   Nilai asli tetap ditampilkan via tooltip callback.
   ══════════════════════════════════════════════════════════ */

/** Batas maksimal standar Kemenkes per parameter (nilai asli) */
const STANDAR_MAKS = { pH: 8.5, tds: 300, turb: 3 };

/** Cache nilai asli (raw) untuk ditampilkan di tooltip */
const chartRawData = {
  input: { pH: 7.0, tds: 0, turb: 0 },
  standar: { pH: STANDAR_MAKS.pH, tds: STANDAR_MAKS.tds, turb: STANDAR_MAKS.turb },
};

/**
 * Konversi nilai asli ke persentase (0–100+) relatif terhadap
 * batas maksimal Kemenkes masing-masing parameter.
 */
function toPercent(value, key) {
  return (value / STANDAR_MAKS[key]) * 100;
}

/** Ambil warna mengikuti tema aktif (dark/light) untuk grid & font chart */
function getChartThemeColors() {
  const isDark = htmlEl.classList.contains("dark");
  return {
    grid: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
    font: isDark ? "rgba(255,255,255,0.65)" : "rgba(15,23,42,0.65)",
  };
}

const sensorChartCanvas = document.getElementById("sensorChart");
let sensorChart;

if (sensorChartCanvas && typeof Chart !== "undefined") {
  const themeColors = getChartThemeColors();

  sensorChart = new Chart(sensorChartCanvas, {
    type: "bar",
    data: {
      labels: ["pH", "TDS", "Turbidity"],
      datasets: [
        {
          label: "Nilai Input",
          data: [
            toPercent(chartRawData.input.pH, "pH"),
            toPercent(chartRawData.input.tds, "tds"),
            toPercent(chartRawData.input.turb, "turb"),
          ],
          backgroundColor: "#00D4B4",
          borderRadius: 6,
          borderSkipped: false,
          maxBarThickness: 42,
        },
        {
          label: "Batas Maksimal Standar Kemenkes",
          data: [100, 100, 100], // batas selalu = 100% terhadap dirinya sendiri
          backgroundColor: "rgba(239,68,68,0.45)",
          borderColor: "#EF4444",
          borderWidth: 1.5,
          borderRadius: 6,
          borderSkipped: false,
          maxBarThickness: 42,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 500 },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false }, // legenda kustom sudah ada di HTML
        tooltip: {
          backgroundColor: "#0A0F1E",
          titleColor: "#00D4B4",
          bodyColor: "#E5E7EB",
          borderColor: "#00D4B4",
          borderWidth: 1,
          padding: 10,
          callbacks: {
            label: function (ctx) {
              const key = ["pH", "tds", "turb"][ctx.dataIndex];
              const src = ctx.dataset.label === "Nilai Input" ? chartRawData.input : chartRawData.standar;
              const unit = key === "pH" ? "" : key === "tds" ? " ppm" : " NTU";
              return `${ctx.dataset.label}: ${src[key].toFixed(key === "tds" ? 0 : 1)}${unit} (${ctx.parsed.y.toFixed(1)}%)`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: themeColors.font, font: { family: "JetBrains Mono", size: 11 } },
        },
        y: {
          beginAtZero: true,
          grid: { color: themeColors.grid },
          ticks: {
            color: themeColors.font,
            font: { family: "JetBrains Mono", size: 10 },
            callback: (val) => val + "%",
          },
          title: {
            display: true,
            text: "% terhadap Batas Maks. Kemenkes",
            color: themeColors.font,
            font: { family: "JetBrains Mono", size: 10 },
          },
        },
      },
    },
  });
}

/**
 * Perbarui grafik perbandingan sensor dengan nilai input terbaru.
 * Dipanggil setelah perhitungan WP selesai (klik "Hitung Kelayakan").
 * @param {number} ph
 * @param {number} tds
 * @param {number} turb
 */
function updateSensorChart(ph, tds, turb) {
  if (!sensorChart) return;

  chartRawData.input = { pH: ph, tds: tds, turb: turb };

  sensorChart.data.datasets[0].data = [
    toPercent(ph, "pH"),
    toPercent(tds, "tds"),
    toPercent(turb, "turb"),
  ];

  sensorChart.update();
}

/**
 * Reset grafik: batang "Nilai Input" dikembalikan ke 0
 * (kecuali pH yang direset ke nilai default 7.0 sesuai slider).
 */
function resetSensorChart() {
  if (!sensorChart) return;

  chartRawData.input = { pH: 7.0, tds: 0, turb: 0 };

  sensorChart.data.datasets[0].data = [
    toPercent(7.0, "pH"),
    0,
    0,
  ];

  sensorChart.update();
}

/* Sinkronkan warna grid/font chart saat tema berganti */
themeBtn.addEventListener("click", () => {
  if (!sensorChart) return;
  const c = getChartThemeColors();
  sensorChart.options.scales.x.ticks.color = c.font;
  sensorChart.options.scales.y.ticks.color = c.font;
  sensorChart.options.scales.y.title.color = c.font;
  sensorChart.options.scales.y.grid.color = c.grid;
  sensorChart.update();
});

/* ══════════════════════════════════════════════════════════
   6.B RADAR CHART — Profil Kriteria (pH / TDS / Turbidity)
   ══════════════════════════════════════════════════════════ */

const radarChartCanvas = document.getElementById("radarChart");
let radarChart;

if (radarChartCanvas && typeof Chart !== "undefined") {
  const themeColors = getChartThemeColors();
  radarChart = new Chart(radarChartCanvas, {
    type: "radar",
    data: {
      labels: ["pH", "TDS", "Turbidity"],
      datasets: [{
        label: "Skor Normalisasi (%)",
        data: [0, 0, 0],
        backgroundColor: "rgba(0,212,180,0.2)",
        borderColor: "#00D4B4",
        pointBackgroundColor: "#00D4B4",
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600, easing: "easeOutCubic" },
      plugins: { legend: { display: false } },
      scales: {
        r: {
          angleLines: { color: themeColors.grid },
          grid: { color: themeColors.grid },
          pointLabels: { color: themeColors.font, font: { family: "JetBrains Mono", size: 11 } },
          ticks: { display: false, stepSize: 25 },
          suggestedMin: 0,
          suggestedMax: 100,
        },
      },
    },
  });
}

/**
 * Perbarui radar chart dengan skor normalisasi terbaru (0–1 → dikonversi ke %).
 * @param {number} scorePH
 * @param {number} scoreTDS
 * @param {number} scoreTurb
 */
function updateRadarChart(scorePH, scoreTDS, scoreTurb) {
  if (!radarChart) return;
  radarChart.data.datasets[0].data = [scorePH * 100, scoreTDS * 100, scoreTurb * 100];
  radarChart.update();
}

themeBtn.addEventListener("click", () => {
  if (!radarChart) return;
  const c = getChartThemeColors();
  radarChart.options.scales.r.angleLines.color = c.grid;
  radarChart.options.scales.r.grid.color = c.grid;
  radarChart.options.scales.r.pointLabels.color = c.font;
  radarChart.update();
});

/* ══════════════════════════════════════════════════════════
   6.C TREND CHART — Perkembangan Skor V dari Riwayat
   ══════════════════════════════════════════════════════════ */

const trendChartCanvas = document.getElementById("trendChart");
let trendChart;

if (trendChartCanvas && typeof Chart !== "undefined") {
  const themeColors = getChartThemeColors();
  trendChart = new Chart(trendChartCanvas, {
    type: "line",
    data: {
      labels: [],
      datasets: [{
        label: "Skor Vektor V",
        data: [],
        borderColor: "#00D4B4",
        backgroundColor: "rgba(0,212,180,0.12)",
        tension: 0.3,
        fill: true,
        pointRadius: 3,
        pointBackgroundColor: "#00D4B4",
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 500 },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `Skor V: ${ctx.parsed.y.toFixed(4)}`,
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: themeColors.font, font: { size: 9 }, maxRotation: 0 } },
        y: { min: 0, max: 1, grid: { color: themeColors.grid }, ticks: { color: themeColors.font, font: { size: 9 } } },
      },
    },
  });
}

/**
 * Perbarui trend chart berdasarkan entri riwayat yang sedang ditampilkan (setelah filter).
 * Data diurutkan dari lama → baru agar tren terbaca dari kiri ke kanan.
 * @param {Array} entries - subset historyLog yang lolos filter (urutan asli: baru → lama)
 */
function updateTrendChart(entries) {
  const wrap = document.getElementById("trend-chart-wrap");
  if (!trendChart || !wrap) return;

  if (!entries || entries.length === 0) {
    wrap.classList.add("hidden");
    return;
  }
  wrap.classList.remove("hidden");

  const chronological = entries.slice().reverse(); // lama → baru
  trendChart.data.labels = chronological.map((e) => e.ts.split(", ").pop() || e.ts);
  trendChart.data.datasets[0].data = chronological.map((e) => parseFloat(e.v));

  const colors = chronological.map((e) => {
    if (e.color === "layak") return "#22C55E";
    if (e.color === "waspada") return "#EAB308";
    return "#EF4444";
  });
  trendChart.data.datasets[0].pointBackgroundColor = colors;
  trendChart.update();
}

themeBtn.addEventListener("click", () => {
  if (!trendChart) return;
  const c = getChartThemeColors();
  trendChart.options.scales.x.ticks.color = c.font;
  trendChart.options.scales.y.ticks.color = c.font;
  trendChart.options.scales.y.grid.color = c.grid;
  trendChart.update();
});

/* ══════════════════════════════════════════════════════════
   7. PERHITUNGAN WP — Fungsi Bersama (dipakai tombol & live preview)
   ══════════════════════════════════════════════════════════ */

/** Cek apakah toggle "Live Preview" sedang aktif. */
function isLivePreviewOn() {
  return !!document.getElementById("live-preview-toggle")?.checked;
}

/**
 * Validasi input TDS & Turbidity. Mengembalikan {ph, tds, turb} jika valid,
 * atau null jika tidak valid (toast error sudah ditampilkan di dalam, kecuali silent=true).
 */
function readAndValidateInputs(silent = false) {
  const ph = parseFloat(el.phSlider.value);
  const tds = parseFloat(el.tdsInput.value);
  const turb = parseFloat(el.turbInput.value);

  // Validasi pH — dulu tidak diperlukan karena slider otomatis membatasi
  // nilai ke rentang 0–14, tapi kotak input angka bisa diisi bebas
  // (kosong / negatif / di atas 14), jadi perlu dicek eksplisit di sini.
  if (isNaN(ph) || el.phSlider.value.trim() === "") {
    if (!silent) showValidationError("Masukkan nilai pH terlebih dahulu (0 – 14).", "ph-slider");
    return null;
  }
  if (ph < 0 || ph > 14) {
    if (!silent) showValidationError("Nilai pH harus berada di antara 0 dan 14.", "ph-slider");
    return null;
  }
  if (isNaN(tds) || el.tdsInput.value.trim() === "") {
    if (!silent) showValidationError("Masukkan nilai TDS terlebih dahulu (0 – 300 ppm).", "tds-input");
    return null;
  }
  if (tds < 0 || tds > 1000) {
    if (!silent) showValidationError("Nilai TDS harus berada di antara 0 dan 1000 ppm.", "tds-input");
    return null;
  }
  if (isNaN(turb) || el.turbInput.value.trim() === "") {
    if (!silent) showValidationError("Masukkan nilai Turbidity terlebih dahulu (0 – 100 NTU).", "turb-input");
    return null;
  }
  if (turb < 0 || turb > 100) {
    if (!silent) showValidationError("Nilai Turbidity harus berada di antara 0 dan 100 NTU.", "turb-input");
    return null;
  }
  return { ph, tds, turb };
}

/**
 * Jalankan perhitungan WP lengkap dan perbarui seluruh UI.
 * @param {number} ph
 * @param {number} tds
 * @param {number} turb
 * @param {boolean} isPreview - true jika dipanggil dari live preview (tidak dicatat ke riwayat)
 */
function computeAndRender(ph, tds, turb, isPreview) {
  const scorePH = normPH(ph);
  const scoreTDS = normCost(tds, "tds");
  const scoreTurb = normCost(turb, "turb");

  const vektorS = hitungVektorS(scorePH, scoreTDS, scoreTurb);
  const vektorV = hitungVektorV(vektorS);
  const status = klasifikasi(vektorV);

  updateStatusCard(vektorV, status, isPreview);
  updateVisualisasi(ph, tds, turb);
  updateSensorChart(ph, tds, turb);
  updateRadarChart(scorePH, scoreTDS, scoreTurb);

  if (!isPreview) {
    addHistoryEntry(ph, tds, turb, vektorV, status);
    showToast(`Perhitungan selesai — Status: ${status.label}`, status.color === "layak" ? "success" : status.color === "waspada" ? "warn" : "error");
  }

  console.group(`SPK Weighted Product — Hasil Perhitungan${isPreview ? " (Live Preview)" : ""}`);
  console.log("Input        :", { ph, tds, turb });
  console.log("Bobot (W)    :", W);
  console.log("Skor Norm.   :", { scorePH: scorePH.toFixed(4), scoreTDS: scoreTDS.toFixed(4), scoreTurb: scoreTurb.toFixed(4) });
  console.log("Vektor S     :", vektorS.toFixed(6));
  console.log("Vektor V     :", vektorV.toFixed(6));
  console.log("Klasifikasi  :", status.label);
  console.groupEnd();

  return { vektorV, status };
}

/**
 * Muat ulang satu sampel dari riwayat ke form input, lalu tampilkan hasilnya
 * sebagai pratinjau (tanpa mencatatnya sebagai entri riwayat baru).
 * Dipanggil dari tombol "ID Sampel" pada tabel riwayat (lihat renderHistory()).
 * @param {string} id - ID sampel, mis. "SMPL-003"
 */
function loadSampleToPreview(id) {
  const entry = historyLog.find((e) => e.id === id);
  if (!entry) {
    showToast(`Data sampel ${id} tidak ditemukan.`, "error");
    return;
  }

  const ph = parseFloat(entry.ph);
  const tds = parseFloat(entry.tds);
  const turb = parseFloat(entry.turb);

  /* ── Set nilai kembali ke input pH ── */
  el.phSlider.value = ph;
  updatePhBadge(ph);

  /* ── Set nilai kembali ke input TDS & Turbidity ── */
  el.tdsInput.value = tds;
  el.turbInput.value = turb;

  /* ── Hitung ulang & render sebagai pratinjau (isPreview = true) ──
     Status Card, Gauge, Bar Visualisasi, Sensor Chart, dan Radar Chart
     akan menampilkan data sampel ini, tanpa menambah baris riwayat baru. */
  computeAndRender(ph, tds, turb, true);

  showToast(`Sampel ${id} dimuat ke pratinjau.`, "info", 2200);

  /* ── Bawa pandangan pengguna ke Status Card agar hasilnya langsung terlihat ── */
  el.statusCard?.scrollIntoView({ behavior: "smooth", block: "center" });
}

/** Dipanggil oleh input listener saat Live Preview aktif (tanpa mencatat riwayat, tanpa toast). */
function runLiveCalculation() {
  if (!isLivePreviewOn()) return;
  const input = readAndValidateInputs(true); // silent — jangan ganggu user dengan toast saat mengetik
  if (!input) return;
  computeAndRender(input.ph, input.tds, input.turb, true);
}

/* ══════════════════════════════════════════════════════════
   7.B TOGGLE "LIVE PREVIEW"
   ══════════════════════════════════════════════════════════ */

const livePreviewToggle = document.getElementById("live-preview-toggle");
const liveToggleTrack = document.getElementById("live-toggle-track");
const liveToggleThumb = document.getElementById("live-toggle-thumb");

livePreviewToggle?.addEventListener("change", () => {
  const active = livePreviewToggle.checked;
  liveToggleTrack?.classList.toggle("active", active);
  liveToggleThumb?.classList.toggle("active", active);
  showToast(active ? "Live Preview aktif — hasil update otomatis saat nilai diubah." : "Live Preview nonaktif.", "info", 2200);
  if (active) runLiveCalculation();
});

/* Live-update saat slider/input diubah (hanya berlaku jika Live Preview ON) */
el.phSlider.addEventListener("input", () => runLiveCalculation());
el.tdsInput.addEventListener("input", debounce(() => runLiveCalculation(), 250));
el.turbInput.addEventListener("input", debounce(() => runLiveCalculation(), 250));

/* ══════════════════════════════════════════════════════════
   7.C HANDLER TOMBOL "HITUNG KELAYAKAN"
   ══════════════════════════════════════════════════════════ */

document.getElementById("btn-hitung").addEventListener("click", () => {
  const input = readAndValidateInputs(false);
  if (!input) return;

  /* ── Skeleton loading singkat pada kartu status agar terasa "memproses" ── */
  el.statusCard.classList.add("skeleton-loading");
  const btn = document.getElementById("btn-hitung");
  btn.disabled = true;
  btn.style.opacity = "0.7";

  setTimeout(() => {
    computeAndRender(input.ph, input.tds, input.turb, false);
    el.statusCard.classList.remove("skeleton-loading");
    btn.disabled = false;
    btn.style.opacity = "1";
  }, 380);
});

/* ══════════════════════════════════════════════════════════
   8. TOMBOL RESET
   Mengembalikan semua nilai ke kondisi awal dengan
   placeholder sesuai standar Permenkes No. 2 Tahun 2023
   (TDS ≤ 300 ppm, Turbidity ≤ 3 NTU).
   ══════════════════════════════════════════════════════════ */

document.getElementById("btn-reset")?.addEventListener("click", () => {
    /* Reset input pH ke 7.0 */
    el.phSlider.value = "7.0";
    phBarVal.textContent = "7.0";
    phBarFill.style.width = ((7 / 14) * 100).toFixed(2) + "%";
    updatePhBadge(7.0);

    /* Reset input angka */
    el.tdsInput.value = "";
    el.turbInput.value = "";

    /* Reset bar visualisasi */
    el.tdsBarVal.textContent = "— ppm";
    el.tdsBarFill.style.width = "0%";
    el.turbBarVal.textContent = "— NTU";
    el.turbBarFill.style.width = "0%";

    /* Reset badge ke kondisi netral */
    const resetBadgeStyle =
      "background:var(--bg-card-inner);border:1px solid var(--border-soft);";
    el.tdsBarBadge.textContent = "—";
    el.tdsBarBadge.style.cssText = resetBadgeStyle;
    el.tdsBarBadge.className =
      "px-2 py-0.5 rounded text-[10px] font-mono t-text-muted";
    el.turbBarBadge.textContent = "—";
    el.turbBarBadge.style.cssText = resetBadgeStyle;
    el.turbBarBadge.className =
      "px-2 py-0.5 rounded text-[10px] font-mono t-text-muted";

    /* Reset status card ke kondisi awal */
    el.statusAccentBar.style.background =
      "linear-gradient(90deg,#00D4B4,#00A890)";
    el.statusBadge.textContent = "MENUNGGU INPUT";
    el.statusBadge.style.cssText =
      "background:rgba(0,212,180,0.1);color:#00D4B4;border:1px solid rgba(0,212,180,0.25);";
    el.statusIconWrap.style.cssText =
      "background:rgba(0,212,180,0.08);border:2px solid rgba(0,212,180,0.2);";
    el.statusIcon.style.color = "";
    el.statusIcon.style.opacity = "0.4";
    el.statusIcon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round"
      d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>`;

    el.statusLabel.className =
      "text-2xl sm:text-3xl font-bold mb-1 shimmer-text";
    el.statusLabel.style.color = "";
    el.statusLabel.textContent = "— / —";
    el.statusDesc.textContent =
      'Masukkan nilai ketiga sensor dan klik "Hitung Kelayakan"';

    el.vScore.textContent = "0.0000";
    el.vScore.style.color = "";
    el.vCategory.textContent = "—";
    el.vCategory.style.color = "";
    el.calcTs.textContent = "Belum ada perhitungan";
    lastVValue = 0;

    /* Reset gauge jarum ke posisi awal (kiri/0) */
    updateGaugeNeedle(0);

    /* Reset grafik perbandingan sensor & radar */
    resetSensorChart();
    if (radarChart) {
      radarChart.data.datasets[0].data = [0, 0, 0];
      radarChart.update();
    }

    showToast("Nilai input dikembalikan ke default.", "info");
  });