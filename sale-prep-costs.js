const STORAGE_KEY = "ncMoveSalePrepCosts_v1";
const PB_URL = "https://pocketbase-production-3bdd.up.railway.app";
const PB_COLLECTION = "tracker_data";
const COST_RECORD_ID = "jp3lu3rdhczws4o";
const pb = new PocketBase(PB_URL);

let pbRecordId = COST_RECORD_ID;
let items = [];

const defaultItems = [
  { id: 1, category: "Kitchen", name: "Fridge magnets", cost: 0, notes: "Remove for photos. Time only.", included: true },
  { id: 2, category: "Kitchen", name: "Repair cabinet chips", cost: 250, notes: "Filler and touch-up, or a short handyman visit.", included: true },
  { id: 3, category: "Kitchen", name: "Cabinet hinges and hardware", cost: 400, notes: "Broken or sagging hinges plus new pulls. $1,000 is high unless it is a full cabinet day.", included: true },
  { id: 4, category: "Kitchen", name: "Replace counters (quartz)", cost: 5000, notes: "Small Leisure World kitchen, installed. $20,000 is full-remodel money — keep that for NC.", included: true },
  { id: 5, category: "Living Room", name: "Open the front-door view", cost: 0, notes: "Furniture and clutter, not taking out a wall. Already in progress.", included: true },
  { id: 6, category: "Primary Bedroom", name: "Replace worn carpet", cost: 1400, notes: "One bedroom, mid-grade nylon or triexta, new pad, tear-out. Typical range $900–$1,800.", included: true },
  { id: 7, category: "Primary Bedroom", name: "Haul oversized bed and mattress", cost: 150, notes: "Empty the room before the carpet crew arrives.", included: true },
  { id: 8, category: "Primary Bedroom", name: "Storage unit (6 months)", cost: 1200, notes: "Optional. About $200/month nearby. Unchecked because it eats NC remodel money.", included: false },
  { id: 9, category: "Whole Unit", name: "Interior paint (neutral)", cost: 4500, notes: "Pro paint, whole apartment. Highest photo ROI. DIY materials about $250–$500.", included: true }
];

const categoryOrder = [
  "Kitchen",
  "Living Room",
  "Primary Bedroom",
  "Secondary Bedroom",
  "Bathroom",
  "Whole Unit",
  "Other"
];

function setSyncStatus(msg) {
  const el = document.getElementById("sync-status");
  if (el) el.textContent = msg;
}

function money(n) {
  n = Math.round(Number(n) || 0);
  return "$" + n.toLocaleString("en-US");
}

function parseCost(val) {
  if (typeof val === "number") return val;
  return parseFloat(String(val || "0").replace(/[^0-9.]/g, "")) || 0;
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, """);
}

function normalizeItems(list) {
  if (!Array.isArray(list)) return [];
  return list.map(function (item, i) {
    return {
      id: item.id || Date.now() + i,
      category: item.category || "Other",
      name: item.name || "",
      cost: parseCost(item.cost),
      notes: item.notes || "",
      included: item.included !== false
    };
  });
}

function readLocal() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {}
  return null;
}

function writeLocal() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ items: items }));
  } catch (e) {}
}

function payload() {
  return { app: "nc-move-sale-prep-costs", items: items };
}

async function save() {
  writeLocal();
  updateTotals();
  try {
    const body = { state: payload() };
    if (pbRecordId) {
      await pb.collection(PB_COLLECTION).update(pbRecordId, body);
    } else {
      const record = await pb.collection(PB_COLLECTION).create(body);
      pbRecordId = record.id;
    }
    setSyncStatus("Synced just now");
  } catch (err) {
    console.warn(err);
    setSyncStatus("Saved on this device — cloud sync paused");
  }
}

function totals() {
  var included = 0, skipped = 0, count = 0;
  items.forEach(function (item) {
    if (item.included) {
      included += item.cost;
      count++;
    } else {
      skipped += item.cost;
    }
  });
  return { included: included, skipped: skipped, count: count };
}

function updateTotals() {
  var t = totals();
  document.getElementById("included-total").textContent = money(t.included);
  document.getElementById("sticky-total").textContent = money(t.included);
  document.getElementById("skipped-total").textContent = money(t.skipped);
  document.getElementById("item-count").textContent = t.count;
}

function render() {
  var groups = {};
  items.forEach(function (item) {
    var cat = item.category || "Other";
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(item);
  });
  var cats = categoryOrder.filter(function (c) { return groups[c]; });
  Object.keys(groups).forEach(function (c) {
    if (cats.indexOf(c) === -1) cats.push(c);
  });

  var html = "";
  cats.forEach(function (cat) {
    var list = groups[cat];
    var sub = 0;
    list.forEach(function (item) { if (item.included) sub += item.cost; });
    html += '<div class="panel"><div class="cat-head"><h2>' + escapeHtml(cat) + '</h2><div class="sub">' + money(sub) + '</div></div>';
    list.forEach(function (item) {
      var idx = items.indexOf(item);
      html +=
        '<div class="item' + (item.included ? "" : " off") + '">' +
          '<div class="item-top">' +
            '<input type="checkbox"' + (item.included ? " checked" : "") + ' onchange="toggleItem(' + idx + ', this.checked)">' +
            '<div class="item-body">' +
              '<input class="item-name" value="' + escapeHtml(item.name) + '" onchange="updateItem(' + idx + ',\'name\', this.value)" placeholder="Name">' +
              '<div class="item-meta">' +
                '<input type="number" min="0" step="50" value="' + item.cost + '" onchange="updateItem(' + idx + ',\'cost\', this.value)">' +
                '<button class="btn btn-danger btn-small" onclick="deleteItem(' + idx + ')">Remove</button>' +
              '</div>' +
              '<input class="notes" type="text" value="' + escapeHtml(item.notes) + '" onchange="updateItem(' + idx + ',\'notes\', this.value)" placeholder="Note">' +
            '</div>' +
          '</div>' +
        '</div>';
    });
    html += "</div>";
  });
  document.getElementById("categories").innerHTML = html || '<div class="panel">No items yet. Add one above.</div>';
  updateTotals();
}

function toggleItem(idx, on) {
  items[idx].included = !!on;
  save();
  render();
}

function updateItem(idx, field, val) {
  if (field === "cost") items[idx].cost = parseCost(val);
  else items[idx][field] = val;
  save();
  if (field === "cost") render();
}

function addItem() {
  var name = (document.getElementById("new-name").value || "").trim();
  if (!name) {
    document.getElementById("new-name").focus();
    return;
  }
  items.push({
    id: Date.now(),
    category: document.getElementById("new-cat").value,
    name: name,
    cost: parseCost(document.getElementById("new-cost").value),
    notes: (document.getElementById("new-notes").value || "").trim(),
    included: true
  });
  document.getElementById("new-name").value = "";
  document.getElementById("new-notes").value = "";
  document.getElementById("new-cost").value = "0";
  save();
  render();
}

function addPreset(category, name, cost, notes) {
  var exists = items.some(function (item) {
    return (item.name || "").toLowerCase() === name.toLowerCase();
  });
  if (exists) {
    setSyncStatus("Already on the list: " + name);
    return;
  }
  items.push({
    id: Date.now(),
    category: category,
    name: name,
    cost: cost,
    notes: notes,
    included: true
  });
  save();
  render();
}

function deleteItem(idx) {
  if (!confirm("Remove this cost?")) return;
  items.splice(idx, 1);
  save();
  render();
}

function exportData() {
  var data = { items: items, total: totals(), exported: new Date().toISOString() };
  var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = "NC_Sale_Prep_Costs_" + new Date().toISOString().slice(0, 10) + ".json";
  a.click();
  URL.revokeObjectURL(url);
}

async function loadFromCloud() {
  var local = readLocal();
  if (local && Array.isArray(local.items) && local.items.length) {
    items = normalizeItems(local.items);
  } else {
    items = JSON.parse(JSON.stringify(defaultItems));
  }
  try {
    var record = null;
    try { record = await pb.collection(PB_COLLECTION).getOne(COST_RECORD_ID); } catch (e) {}
    if (!record) {
      var records = await pb.collection(PB_COLLECTION).getList(1, 50, { sort: "-updated" });
      record = (records.items || []).find(function (r) {
        return r.state && r.state.app === "nc-move-sale-prep-costs";
      }) || null;
    }
    if (record) {
      pbRecordId = record.id;
      var cloudItems = normalizeItems(record.state && record.state.items);
      if (cloudItems.length) {
        items = cloudItems;
        writeLocal();
        setSyncStatus("Synced with cloud");
      } else {
        await save();
        setSyncStatus("Uploaded planning numbers to the cloud");
      }
    } else {
      await save();
      setSyncStatus("Cloud ready");
    }
  } catch (err) {
    console.warn(err);
    setSyncStatus("Offline — using this device's copy");
  }
  render();
}

document.addEventListener("visibilitychange", function () {
  if (document.visibilityState === "visible") loadFromCloud();
});

loadFromCloud();
