// Web App Deployment URL จาก Google Apps Script[cite: 1]
const API_URL = "https://script.google.com/macros/s/AKfycbzwDPfmlFpGuws-Bn7_yoOsNY0yI72ROQkfqj7WtabpF7LQzhej8nw27DW_6-M6AOIiFQ/exec";

// Application State
let currentMode = "IN"; // IN, OUT, AUDIT
let masterDataMap = new Map(); // Barcode -> Product Info
let scanQueue = JSON.parse(localStorage.getItem("smart_scan_queue")) || [];
let lastScannedCode = "";
let lastScanTime = 0;
const SCAN_COOLDOWN_MS = 2000; // หน่วงเวลาป้องกันสแกนซ้ำ 2 วินาที

// Register Service Worker สำหรับ PWA
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js")
      .then(reg => console.log("[PWA] Service Worker registered:", reg.scope))
      .catch(err => console.error("[PWA] Registration failed:", err));
  });
}

// Audio Feedback (Web Audio API)
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playBeepSound(type = "success") {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);

  if (type === "success") {
    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.15);
  } else {
    osc.frequency.setValueAtTime(300, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
  }
}

// 1. Initial Setup
document.addEventListener("DOMContentLoaded", async () => {
  updateQueueUI();
  initNetworkListener();
  await loadMasterData();
  initScanner();
});

// Switch Modes (IN, OUT, AUDIT)
function setMode(mode) {
  currentMode = mode;
  document.querySelectorAll(".mode-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });
}

// 2. ดึง Master Data มาแคชไว้ในเครื่อง
async function loadMasterData() {
  try {
    const response = await fetch(API_URL);
    const result = await response.json();

    if (result.result === "success" && result.items) {
      masterDataMap.clear();
      result.items.forEach(item => {
        masterDataMap.set(String(item.barcode).trim(), item);
      });
      console.log(`[MasterData] Loaded ${masterDataMap.size} items.`);
    }
  } catch (err) {
    console.warn("[MasterData] Fetch failed. Operating in offline/raw mode:", err);
  }
}

// 3. เริ่มต้นเปิดระบบกล้องด้วย html5-qrcode
function initScanner() {
  const html5QrCode = new Html5Qrcode("reader");
  const config = { fps: 10, qrbox: { width: 250, height: 250 } };

  html5QrCode.start(
    { facingMode: "environment" },
    config,
    onScanSuccess
  ).catch(err => console.error("ไม่สามารถเปิดกล้องได้:", err));
}

// 4. เมื่อสแกนรหัสผ่านสำเร็จ
function onScanSuccess(decodedText) {
  const now = Date.now();
  const cleanBarcode = String(decodedText).trim();

  // ป้องกันการสแกนรหัสเดิมซ้ำอย่างรวดเร็ว (Debounce/Cooldown)
  if (cleanBarcode === lastScannedCode && (now - lastScanTime) < SCAN_COOLDOWN_MS) {
    return;
  }

  lastScannedCode = cleanBarcode;
  lastScanTime = now;

  // อ่านค่าจาก UI
  const qtyInput = parseInt(document.getElementById("scanQty").value) || 1;
  const locationInput = document.getElementById("locationInput").value || "DEFAULT";

  // Lookup สินค้าจาก Master Data
  const product = masterDataMap.get(cleanBarcode) || { name: "ไม่พบสินค้าใน Master Data", qty: 0 };

  // ระบบสั่นเตือนบนมือถือ + เสียง Beep
  if (navigator.vibrate) navigator.vibrate(100);
  playBeepSound("success");

  // อัปเดต UI ผลการสแกน
  const resCard = document.getElementById("resultCard");
  resCard.style.display = "block";
  document.getElementById("resBarcode").innerText = cleanBarcode;
  document.getElementById("resProductName").innerText = product.name;
  document.getElementById("resStockQty").innerText = product.qty;
  
  const badge = document.getElementById("resActionBadge");
  badge.innerText = `โหมด: ${currentMode} (${qtyInput > 0 ? '+' : ''}${qtyInput})`;

  // สร้าง Payload
  const scanItem = {
    timestamp: new Date().toISOString(),
    barcode: cleanBarcode,
    productName: product.name,
    action: currentMode,
    quantity: qtyInput,
    location: locationInput,
    userId: localStorage.getItem("userId") || "OPERATOR"[cite: 1]
  };

  // บันทึกลง Offline Queue ใน LocalStorage
  scanQueue.push(scanItem);
  saveQueueToLocalStorage();

  // ส่งข้อมูลเข้าเซิร์ฟเวอร์แบบ Real-time หากออนไลน์
  if (navigator.onLine) {
    syncQueueWithBackend();
  }
}

// 5. ซิงค์คิวข้อมูลแบบ Batch Operation (doPost)[cite: 1]
async function syncQueueWithBackend() {
  if (scanQueue.length === 0) return;

  const itemsToSend = [...scanQueue];
  const syncBtn = document.getElementById("syncBtn");
  if (syncBtn) {
    syncBtn.innerText = "กำลังซิงค์ข้อมูล...";
    syncBtn.disabled = true;
  }

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // เลี่ยง CORS กับ Apps Script[cite: 1]
      body: JSON.stringify(itemsToSend)[cite: 1]
    });

    const result = await response.json();

    if (result.result === "success") {
      scanQueue = scanQueue.slice(itemsToSend.length);
      saveQueueToLocalStorage();
      console.log(`[Sync] Successfully sent ${result.inserted} items.`);
      await loadMasterData();
    } else {
      alert("เกิดข้อผิดพลาดจากเซิร์ฟเวอร์: " + result.message);
    }
  } catch (err) {
    console.error("[Sync] Failed. Items remain in offline queue.", err);
  } finally {
    if (syncBtn) {
      syncBtn.innerText = "ซิงค์ข้อมูลเข้า Google Sheets";
      syncBtn.disabled = false;
    }
    updateQueueUI();
  }
}

// Helper Functions
function saveQueueToLocalStorage() {
  localStorage.setItem("smart_scan_queue", JSON.stringify(scanQueue));
  updateQueueUI();
}

function updateQueueUI() {
  const qElem = document.getElementById("queueCount");
  if (qElem) qElem.innerText = scanQueue.length;
}

function initNetworkListener() {
  const statusElem = document.getElementById("networkStatus");
  const updateStatus = () => {
    if (!statusElem) return;
    if (navigator.onLine) {
      statusElem.className = "status-badge online";
      statusElem.innerText = "Online";
      syncQueueWithBackend();
    } else {
      statusElem.className = "status-badge offline";
      statusElem.innerText = "Offline";
    }
  };

  window.addEventListener("online", updateStatus);
  window.addEventListener("offline", updateStatus);
}
});