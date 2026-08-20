const STORAGE_KEY = "asheville-clutter-clear-v2";
const LEGACY_KEY = "asheville-clutter-clear-v1";
const PB_URL = "https://pocketbase-production-3bdd.up.railway.app";
const PB_COLLECTION = "tracker_data";
const CLUTTER_RECORD_ID = "yxsmakutx6w4akl";
const pb = new PocketBase(PB_URL);

let pbRecordId = CLUTTER_RECORD_ID;
let data = {
  title: "Clutter Clear",
  items: []
};

function setSyncStatus(msg) {
  const el = document.getElementById("sync-status");
  if (el) el.textContent = msg;
}

function readLocal() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {}
  return null;
}

function writeLocal() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {}
}

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map(function (item, i) {
    return {
      id: item.id || i + 1,
      name: item.name || "Unnamed item",
      location: item.location || "",
      notes: item.notes || "",
      completed: !!item.completed,
      completedDate: item.completedDate || null
    };
  });
}

function itemKey(item) {
  return (item.name || "").trim().toLowerCase() + "|" + (item.location || "").trim().toLowerCase();
}

function mergeLists(primary, secondary) {
  const map = new Map();
  (primary || []).concat(secondary || []).forEach(function (item) {
    const key = itemKey(item);
    if (!key.replace("|", "")) return;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, Object.assign({}, item));
      return;
    }
    if (item.completed && !prev.completed) map.set(key, Object.assign({}, item));
  });
  return normalizeItems(Array.from(map.values()));
}

function clutterPayload() {
  return {
    app: "asheville-clutter-clear",
    title: data.title || "Clutter Clear",
    items: data.items || []
  };
}

async function findClutterRecord() {
  try {
    const record = await pb.collection(PB_COLLECTION).getOne(CLUTTER_RECORD_ID);
    if (record && record.state && record.state.app === "asheville-clutter-clear") return record;
  } catch (e) {}
  try {
    const records = await pb.collection(PB_COLLECTION).getList(1, 50, { sort: "-updated" });
    return (records.items || []).find(function (r) {
      return r.state && r.state.app === "asheville-clutter-clear";
    }) || null;
  } catch (e) {
    return null;
  }
}

async function save() {
  writeLocal();
  try {
    const payload = { state: clutterPayload() };
    if (pbRecordId) {
      await pb.collection(PB_COLLECTION).update(pbRecordId, payload);
    } else {
      const record = await pb.collection(PB_COLLECTION).create(payload);
      pbRecordId = record.id;
    }
    setSyncStatus("Synced just now");
  } catch (err) {
    console.warn("PocketBase save failed (data still saved on this device)", err);
    setSyncStatus("Saved on this device - cloud sync paused");
  }
}

async function load(fromRefresh) {
  const local = readLocal();
  if (local && Array.isArray(local.items)) {
    data.title = local.title || data.title;
    data.items = normalizeItems(local.items);
  }
  try {
    const record = await findClutterRecord();
    if (record) {
      pbRecordId = record.id;
      const cloudItems = normalizeItems((record.state && record.state.items) || []);
      const localItems = data.items || [];
      if (cloudItems.length === 0 && localItems.length > 0) {
        data.items = localItems;
        await save();
        setSyncStatus("Uploaded this device's list to the cloud");
      } else if (cloudItems.length > 0 && localItems.length > 0 && !fromRefresh) {
        data.title = (record.state && record.state.title) || data.title;
        data.items = mergeLists(cloudItems, localItems);
        await save();
        setSyncStatus("Merged phone and laptop lists");
      } else {
        data.title = (record.state && record.state.title) || data.title;
        data.items = cloudItems;
        writeLocal();
        setSyncStatus("Synced with cloud");
      }
    } else if (localItemsHaveData(local)) {
      await save();
      setSyncStatus("Uploaded this device's list to the cloud");
    } else {
      setSyncStatus("Cloud ready - no items yet");
    }
  } catch (err) {
    console.warn("PocketBase load failed, using this device", err);
    setSyncStatus("Offline - using this device's copy");
  }
  render();
}

function localItemsHaveData(local) {
  return !!(local && Array.isArray(local.items) && local.items.length);
}

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(function () { t.classList.remove("show"); }, 1600);
}

function addItem() {
  const nameInput = document.getElementById("new-name");
  const locInput = document.getElementById("new-location");
  const name = nameInput.value.trim();
  if (!name) {
    nameInput.focus();
    return;
  }
  const nextId = data.items.length ? Math.max.apply(null, data.items.map(function (i) { return i.id || 0; })) + 1 : 1;
  data.items.push({
    id: nextId,
    name: name,
    location: locInput.value.trim(),
    notes: "",
    completed: false,
    completedDate: null
  });
  nameInput.value = "";
  locInput.value = "";
  nameInput.focus();
  save();
  render();
}

document.getElementById("new-name").addEventListener("keydown", function (e) {
  if (e.key === "Enter") addItem();
});
document.getElementById("new-location").addEventListener("keydown", function (e) {
  if (e.key === "Enter") addItem();
});

function toggleItem(id) {
  const item = data.items.find(function (i) { return i.id === id; });
  if (!item) return;
  item.completed = !item.completed;
  item.completedDate = item.completed
    ? new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
    : null;
  save();
  render();
}

function clearList() {
  if (confirm("Clear the entire list?")) {
    data.items = [];
    save();
    render();
  }
}

function copyList() {
  const text = JSON.stringify(data, null, 2);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () {
      showToast("List copied");
    }).catch(function () {
      fallbackCopy(text);
    });
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
    showToast("List copied");
  } catch (e) {
    showToast("Copy failed");
  }
  document.body.removeChild(ta);
}

function importJSON() {
  const raw = document.getElementById("json-input").value.trim();
  if (!raw) {
    alert("Paste some JSON first.");
    return;
  }
  try {
    const parsed = JSON.parse(raw);
    let items = [];
    if (Array.isArray(parsed)) {
      items = parsed;
    } else if (parsed.items && Array.isArray(parsed.items)) {
      items = parsed.items;
      if (parsed.title) data.title = parsed.title;
    } else {
      alert("JSON needs an array of items (or an object with an items array).");
      return;
    }
    data.items = normalizeItems(items);
    document.getElementById("json-input").value = "";
    save();
    render();
    showToast("Imported");
  } catch (e) {
    alert("Could not read that JSON.");
  }
}

function printCompleted() {
  const completed = data.items.filter(function (i) { return i.completed; });
  if (completed.length === 0) {
    alert("No completed items yet.");
    return;
  }
  document.getElementById("print-date").textContent =
    "Printed " + new Date().toLocaleDateString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric"
    });
  document.getElementById("print-title").textContent = data.title;
  document.getElementById("print-items").innerHTML = completed.map(function (item) {
    return '<div class="print-item"><strong>' +
      escapeHtml(item.name) + '</strong>' +
      (item.location ? " \u2014 " + escapeHtml(item.location) : "") +
      '<br><span style="font-size:0.9rem; color:#555;">Cleared: ' +
      (item.completedDate || "\u2014") + '</span></div>';
  }).join("");
  window.print();
}

function render() {
  const list = document.getElementById("item-list");
  const total = data.items.length;
  const done = data.items.filter(function (i) { return i.completed; }).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  document.getElementById("progress-fill").style.width = pct + "%";
  document.getElementById("progress-text").textContent = done + " of " + total + " cleared";
  if (total === 0) {
    list.innerHTML = '<li class="empty">No items yet. Add one above.</li>';
    return;
  }
  list.innerHTML = data.items.map(function (item) {
    return '<li class="item ' + (item.completed ? "completed" : "") + '">' +
      '<input type="checkbox" ' + (item.completed ? "checked" : "") +
      ' onchange="toggleItem(' + item.id + ')" />' +
      '<div><div class="item-name">' + escapeHtml(item.name) + '</div>' +
      '<div class="item-meta">' +
      (item.location ? escapeHtml(item.location) : "") +
      (item.completed && item.completedDate ? " \u2022 Cleared " + item.completedDate : "") +
      '</div></div></li>';
  }).join("");
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "\u0026amp;")
    .replace(/</g, "\u0026lt;")
    .replace(/>/g, "\u0026gt;")
    .replace(/"/g, "\u0026quot;");
}

document.addEventListener("visibilitychange", function () {
  if (document.visibilityState === "visible") load(true);
});

load(false);
