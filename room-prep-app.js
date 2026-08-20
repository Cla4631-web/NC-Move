const STORAGE_KEY = "ncMoveRoomPrep_v1";
const PB_URL = "https://pocketbase-production-3bdd.up.railway.app";
const PB_COLLECTION = "tracker_data";
const ROOM_RECORD_ID = "2ne1d07lzec4v6d";
const pb = new PocketBase(PB_URL);

let pbRecordId = ROOM_RECORD_ID;
let rooms = [];

const defaultRooms = [
  { id: 1, name: "Living Room", condition: "", updates: [] },
  { id: 2, name: "Kitchen", condition: "", updates: [] },
  { id: 3, name: "Primary Bedroom", condition: "", updates: [] },
  { id: 4, name: "Secondary Bedroom / Office", condition: "", updates: [] },
  { id: 5, name: "Bathroom 1", condition: "", updates: [] },
  { id: 6, name: "Bathroom 2", condition: "", updates: [] },
  { id: 7, name: "Entry / Hallways", condition: "", updates: [] },
  { id: 8, name: "Patio / Outdoor / Storage", condition: "", updates: [] }
];

function setSyncStatus(msg) {
  const el = document.getElementById("sync-status");
  if (el) el.textContent = msg;
}

function hasWork(list) {
  if (!Array.isArray(list) || list.length === 0) return false;
  return list.some(function (r) {
    const cond = (r.condition || "").trim();
    return cond || (r.updates && r.updates.length > 0);
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rooms));
  } catch (e) {}
}

function roomPayload() {
  return { app: "nc-move-room-prep", rooms: rooms };
}

async function findRoomRecord() {
  try {
    const record = await pb.collection(PB_COLLECTION).getOne(ROOM_RECORD_ID);
    if (record && record.state && record.state.app === "nc-move-room-prep") return record;
  } catch (e) {}
  try {
    const records = await pb.collection(PB_COLLECTION).getList(1, 50, { sort: "-updated" });
    return (records.items || []).find(function (r) {
      return r.state && r.state.app === "nc-move-room-prep";
    }) || null;
  } catch (e) {
    return null;
  }
}

async function save() {
  writeLocal();
  updateSummary();
  try {
    const payload = { state: roomPayload() };
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

function mergeRooms(primary, secondary) {
  const map = new Map();
  (primary || []).concat(secondary || []).forEach(function (room) {
    const key = (room.name || "").trim().toLowerCase();
    if (!key) return;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, JSON.parse(JSON.stringify(room)));
      return;
    }
    const prevWork = (prev.updates && prev.updates.length) || (prev.condition || "").trim();
    const newWork = (room.updates && room.updates.length) || (room.condition || "").trim();
    if (newWork && !prevWork) map.set(key, JSON.parse(JSON.stringify(room)));
    else if (newWork && prevWork && (room.updates || []).length > (prev.updates || []).length) {
      map.set(key, JSON.parse(JSON.stringify(room)));
    }
  });
  return Array.from(map.values());
}

async function loadFromCloud(fromRefresh) {
  const local = readLocal();
  if (Array.isArray(local) && local.length) {
    rooms = local;
  } else {
    rooms = JSON.parse(JSON.stringify(defaultRooms));
  }
  try {
    const record = await findRoomRecord();
    if (record) {
      pbRecordId = record.id;
      const cloudRooms = Array.isArray(record.state.rooms) ? record.state.rooms : [];
      if (!hasWork(cloudRooms) && hasWork(rooms)) {
        await save();
        setSyncStatus("Uploaded this device's list to the cloud");
      } else if (hasWork(cloudRooms) && hasWork(rooms) && !fromRefresh) {
        rooms = mergeRooms(cloudRooms, rooms);
        await save();
        setSyncStatus("Merged phone and laptop lists");
      } else if (hasWork(cloudRooms) || cloudRooms.length > 0) {
        rooms = cloudRooms;
        writeLocal();
        setSyncStatus("Synced with cloud");
      } else {
        await save();
        setSyncStatus("Cloud ready - using starter rooms");
      }
    } else if (hasWork(rooms)) {
      await save();
      setSyncStatus("Uploaded this device's list to the cloud");
    } else {
      setSyncStatus("Cloud ready - using starter rooms");
    }
  } catch (err) {
    console.warn("PocketBase load failed, using this device", err);
    setSyncStatus("Offline - using this device's copy");
  }
  render();
}

function updateSummary() {
  var total = 0, aCount = 0, done = 0;
  rooms.forEach(function (r) {
    (r.updates || []).forEach(function (u) {
      total++;
      if (u.priority === "A") aCount++;
      if (u.status === "Done") done++;
    });
  });
  var t = document.getElementById("total-updates");
  var a = document.getElementById("a-count");
  var d = document.getElementById("done-count");
  if (t) t.textContent = total;
  if (a) a.textContent = aCount;
  if (d) d.textContent = done;
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "\u0026amp;")
    .replace(/</g, "\u0026lt;")
    .replace(/>/g, "\u0026gt;")
    .replace(/"/g, "\u0026quot;");
}

function renderUpdate(rIdx, uIdx, u) {
  const doneClass = u.status === "Done" ? " done" : "";
  return (
    '<div class="update ' + (u.priority || "B") + doneClass + '">' +
      '<div class="update-top">' +
        '<div class="update-name">' +
          '<input value="' + escapeHtml(u.name) + '" onchange="updateField(' + rIdx + ',' + uIdx + ',\'name\', this.value)" placeholder="What needs doing?">' +
        '</div>' +
        '<div class="controls">' +
          '<select onchange="updateField(' + rIdx + ',' + uIdx + ',\'priority\', this.value)">' +
            '<option value="A"' + (u.priority === "A" ? " selected" : "") + '>A - High ROI</option>' +
            '<option value="B"' + (u.priority === "B" ? " selected" : "") + '>B - Important</option>' +
            '<option value="C"' + (u.priority === "C" ? " selected" : "") + '>C - Nice</option>' +
          '</select>' +
          '<select onchange="updateField(' + rIdx + ',' + uIdx + ',\'status\', this.value)">' +
            '<option value="Not started"' + (u.status === "Not started" ? " selected" : "") + '>Not started</option>' +
            '<option value="In progress"' + (u.status === "In progress" ? " selected" : "") + '>In progress</option>' +
            '<option value="Done"' + (u.status === "Done" ? " selected" : "") + '>Done</option>' +
          '</select>' +
          '<input type="text" placeholder="$ cost" value="' + escapeHtml(u.cost || "") + '" style="width:80px" onchange="updateField(' + rIdx + ',' + uIdx + ',\'cost\', this.value)">' +
          '<button class="btn btn-small btn-danger" onclick="deleteUpdate(' + rIdx + ',' + uIdx + ')">x</button>' +
        '</div>' +
      '</div>' +
    '</div>'
  );
}

function render() {
  const container = document.getElementById("rooms");
  container.innerHTML = "";
  rooms.forEach(function (room, rIdx) {
    const openClass = room._open ? " open" : "";
    const aCount = (room.updates || []).filter(function (u) {
      return u.priority === "A" && u.status !== "Done";
    }).length;
    const total = (room.updates || []).length;
    const done = (room.updates || []).filter(function (u) {
      return u.status === "Done";
    }).length;
    const div = document.createElement("div");
    div.className = "room" + openClass;
    div.innerHTML =
      '<div class="room-header" onclick="toggleRoom(' + rIdx + ')">' +
        '<div>' +
          '<h2>' + escapeHtml(room.name) + '</h2>' +
          '<div class="room-meta">' + total + ' updates • ' + done + ' done' +
            (aCount ? ' • ' + aCount + ' Priority A open' : '') +
          '</div>' +
        '</div>' +
        '<div style="font-size:1.4rem; color:var(--muted);">' + (room._open ? 'v' : '>') + '</div>' +
      '</div>' +
      '<div class="room-body">' +
        '<div class="condition">' +
          '<label style="font-size:0.9rem; color:var(--muted);">Quick condition note</label>' +
          '<textarea placeholder="e.g. Walls need touch-up paint..." onchange="updateCondition(' + rIdx + ', this.value)">' +
            escapeHtml(room.condition || '') +
          '</textarea>' +
        '</div>' +
        '<div id="updates-' + rIdx + '">' +
          (total === 0
            ? '<div class="empty">No updates yet. Add the first one.</div>'
            : (room.updates || []).map(function (u, uIdx) {
                return renderUpdate(rIdx, uIdx, u);
              }).join('')) +
        '</div>' +
        '<div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;">' +
          '<button class="btn btn-small" onclick="addUpdate(' + rIdx + ')">+ Add Update</button>' +
          '<button class="btn btn-small btn-secondary" onclick="renameRoom(' + rIdx + ')">Rename Room</button>' +
          '<button class="btn btn-small btn-danger" onclick="deleteRoom(' + rIdx + ')">Delete Room</button>' +
        '</div>' +
      '</div>';
    container.appendChild(div);
  });
  updateSummary();
}

function toggleRoom(idx) {
  rooms[idx]._open = !rooms[idx]._open;
  render();
}

function expandAll() {
  rooms.forEach(function (r) { r._open = true; });
  render();
}

function updateCondition(idx, val) {
  rooms[idx].condition = val;
  save();
}

function updateField(rIdx, uIdx, field, val) {
  rooms[rIdx].updates[uIdx][field] = val;
  save();
  render();
}

function addUpdate(rIdx) {
  rooms[rIdx].updates.push({
    id: Date.now(),
    name: "",
    priority: "A",
    status: "Not started",
    cost: ""
  });
  rooms[rIdx]._open = true;
  save();
  render();
  setTimeout(function () {
    const inputs = document.querySelectorAll("#updates-" + rIdx + " .update-name input");
    if (inputs.length) inputs[inputs.length - 1].focus();
  }, 50);
}

function deleteUpdate(rIdx, uIdx) {
  if (!confirm("Remove this update?")) return;
  rooms[rIdx].updates.splice(uIdx, 1);
  save();
  render();
}

function addRoom() {
  const name = prompt("Room name?");
  if (!name || !name.trim()) return;
  rooms.push({
    id: Date.now(),
    name: name.trim(),
    condition: "",
    updates: [],
    _open: true
  });
  save();
  render();
}

function renameRoom(idx) {
  const name = prompt("New room name?", rooms[idx].name);
  if (!name || !name.trim()) return;
  rooms[idx].name = name.trim();
  save();
  render();
}

function deleteRoom(idx) {
  if (!confirm('Delete "' + rooms[idx].name + '" and all its updates?')) return;
  rooms.splice(idx, 1);
  save();
  render();
}

function exportData() {
  const data = { rooms: rooms, exported: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "NC_Room_Prep_" + new Date().toISOString().slice(0, 10) + ".json";
  a.click();
  URL.revokeObjectURL(url);
}

document.addEventListener("visibilitychange", function () {
  if (document.visibilityState === "visible") loadFromCloud(true);
});

loadFromCloud(false);
