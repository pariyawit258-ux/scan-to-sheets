// Web App URL จาก Google Apps Script หลังบ้าน[cite: 1, 3]
const API_URL = "https://script.google.com/macros/s/AKfycbwOqznuNpdWpX7nyY7el_Z_ulFmb1VtH6fYOKBb903ukTxDfPGRA3htzOFmBhLQwj95nw/exec";

// Local Application State
let masterDataMap = new Map(); 
let scanQueue = JSON.parse(localStorage.getItem("scanQueue")) || [];

// 1. เริ่มต้นทำงานเมื่อเปิดแอป
document.addEventListener("DOMContentLoaded", async () => {
  updateQueueUI();
  initNetworkListener();
  await loadMasterData();
  initScanner();
});

// 2. ดึง Master Data จาก CacheService ของ API (doGet)[cite: 1, 4]
async function loadMasterData() {
  try {
    const response = await fetch(API_URL);
    const result = await response.json();
    
    if (result.result === "success" && result.data && result.data.items) {
      masterDataMap.clear();
      result.data.items.forEach(row => {
        // คอลัมน์ 0 = SKU/Barcode, คอลัมน์ 1 = ชื่อสินค้า, คอลัมน์ 2 = Location
        masterDataMap.set(String(row[0]).trim(), {
          name: row[1] || "ไม่ระบุชื่อสินค้า",
          location: row[2] || "N/A"
        });
      });
      console.log(`โหลด Master Data สำเร็จ (${result.source}) ทั้งหมด ${masterDataMap.size} รายการ`);
    }
  } catch (error) {
    console.warn("ไม่สามารถดึง Master Data ได้ จะใช้งานข้อมูลแบบ Offline หรือสแกนโดยไม่ Lookup:", error);
  }
}

// 3. เริ่มระบบสแกนด้วย html5-qrcode
function initScanner() {
  const html5QrCode = new Html5Qrcode("reader");
  const config = { fps: 10, qrbox: { width: 250, height: 250 } };

  html5QrCode.start(
    { facingMode: "environment" },
    config,
    onScanSuccess
  ).catch(err => console.error("ไม่สามารถเปิดกล้องได้:", err));
}

// 4. เมื่อสแกนรหัสสำเร็จ
function onScanSuccess(decodedText) {
  const cleanBarcode = String(decodedText).trim();
  
  // Lookup ข้อมูลสินค้าจาก Master Data
  const productInfo = masterDataMap.get(cleanBarcode) || { name: "ไม่พบข้อมูลสินค้าในระบบ", location: "DEFAULT" };

  // แสดงผลที่ UI หน้าเว็บ
  const resCard = document.getElementById("scanResultCard");
  if (resCard) resCard.style.display = "block";
  
  const elBarcode = document.getElementById("resBarcode");
  if (elBarcode) elBarcode.innerText = cleanBarcode;
  
  const elName = document.getElementById("resProductName");
  if (elName) elName.innerText = productInfo.name;
  
  const elLoc = document.getElementById("resLocation");
  if (elLoc) elLoc.innerText = productInfo.location;

  // สร้าง Object ข้อมูลเตรียมส่ง
  const scanItem = {
    timestamp: new Date().toISOString(),
    barcode: cleanBarcode,
    action: "SCAN",
    quantity: 1,
    location: productInfo.location,
    userId: localStorage.getItem("userId") || "USER_MOBILE" // Audit trail[cite: 1, 2, 3]
  };

  // สะสมเข้า Queue ภายในเครื่อง (Offline-First)
  scanQueue.push(scanItem);
  saveQueueToLocalStorage();

  // พยายามส่งซิงค์ลง Google Sheets อัตโนมัติหากเชื่อมต่ออินเทอร์เน็ต[cite: 1, 3]
  if (navigator.onLine) {
    syncQueueWithBackend();
  }
}

// 5. ระบบซิงค์ข้อมูลส่งเข้า API แบบ Batch Operation (doPost)[cite: 1, 2, 3]
async function syncQueueWithBackend() {
  if (scanQueue.length === 0) return;

  const itemsToSend = [...scanQueue];
  const syncBtn = document.getElementById("syncBtn");
  if (syncBtn) {
    syncBtn.innerText = "กำลังซิงค์...";
    syncBtn.disabled = true;
  }

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8" // ป้องกันปัญหาเรื่อง CORS[cite: 3]
      },
      body: JSON.stringify(itemsToSend) // ส่ง Payload แบบ Array[cite: 2, 3]
    });

    const result = await response.json();

    if (result.result === "success") {
      // ลบรายการที่ซิงค์สำเร็จออกจาก Queue
      scanQueue = scanQueue.slice(itemsToSend.length);
      saveQueueToLocalStorage();
      console.log(`ซิงค์ข้อมูลลง Sheets สำเร็จ ${result.inserted} รายการ`);[cite: 2, 3]
    } else {
      alert("เกิดข้อผิดพลาดจากเซิร์ฟเวอร์: " + result.message);
    }
  } catch (error) {
    console.error("การซิงค์ล้มเหลว ข้อมูลยังคงถูกเก็บไว้ใน Queue ออฟไลน์:", error);
  } finally {
    if (syncBtn) {
      syncBtn.innerText = "ซิงค์ข้อมูลลง Sheets";
      syncBtn.disabled = false;
    }
    updateQueueUI();
  }
}

// Helper Functions
function saveQueueToLocalStorage() {
  localStorage.setItem("scanQueue", JSON.stringify(scanQueue));
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
      statusElem.className = "badge badge-online";
      statusElem.innerText = "Online";
      syncQueueWithBackend(); // เมื่อกลับมาเน็ตติด ให้ซิงค์ข้อมูลค้างทันที
    } else {
      statusElem.className = "badge badge-offline";
      statusElem.innerText = "Offline";
    }
  };

  window.addEventListener("online", updateStatus);
  window.addEventListener("offline", updateStatus);
}