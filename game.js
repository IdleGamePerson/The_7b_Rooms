const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let currentRoomNumber = 0;

let fatigue = 0; // Müdigkeit in Prozent
let fatigueMax = 100;
let fatigueStep = 0.1; // Anstieg pro Frame bei Bewegung
let fatigueRecovery = 0.2; // Erholung pro Frame ohne Bewegung
let exhausted = false;
let exhaustionTimer = 0;
let isSprinting = false;

let enemyActive = false;
let enemyAppearing = false;
let enemyTimer = 0;
let enemyRoom = null;
let enemyPosition = { x: 0, y: 0 };
let enemyVisibleSince = 0;

let teacher2Active = false;
let teacher2Visible = false;
let teacher2Timer = 0;
let teacher2Pos = { x: 0, y: 0 };
let lastMovementTime = 0;

let clockActive = false;
let clockStartTime = 0;
let clockDuration = 0;

let hp = 3;
let deathReason = "";

let oxygen = 100;
let lastOxygenUpdate = Date.now();

let hiding = false;
let hidingSpots = [];
let lastHidingExitTime = 0;

let books = [];
let totalBookPoints = 0;

let lastFatigueUpdate = Date.now();

// Quadrat™️-Spieler
const player = {
  x: 0,
  y: 0,
  size: 20,
  speed: 2
};

const itemSlots = [
  { type: "", amount: 0 },
  { type: "", amount: 0 },
  { type: "", amount: 0 },
  { type: "", amount: 0 }
];

let keys = {};
document.addEventListener("keydown", e => {
  const key = e.key.toLowerCase();
  keys[key] = true;

  // === Item-Slots (1–4)
  if (["1", "2", "3", "4"].includes(key)) {
    const index = parseInt(key) - 1;
    useItem(index);
  }

  // === Sprint starten
  if (key === "q") {
    isSprinting = true;
  }

  // === Verstecken / Verlassen
  if (key === "e") {
    if (!hiding && isPlayerInHidingSpot()) {
      hiding = true;
    } else if (hiding) {
      hiding = false;
      pushPlayerOutOfHidingSpot();
      lastHidingExitTime = Date.now();
    }
  }
});

document.addEventListener("keyup", e => {
  const key = e.key.toLowerCase();
  keys[key] = false;

  // === Sprint beenden
  if (key === "q") {
    isSprinting = false;
  }
});

// Rechtecke = Räume
let rooms = [];
let walls = [];
let groundItems = []; // { x, y, type }

function goalZone() {
  if (currentRoomNumber >= 999) return null;

  const last = rooms[rooms.length - 1];
  return {
    x: last.x + last.width / 2 - 20,
    y: last.y + last.height - 10,
    width: 40,
    height: 10
  };
}

// Mindestens eine Ecke muss im Zielbereich liegen
let mouseX = 0;
let mouseY = 0;

canvas.addEventListener("mousemove", e => {
  mouseX = e.clientX;
  mouseY = e.clientY;
});

const itemDescriptions = {
  medizin: {
    name: "Medizin",
    effect: "Heilt 1 HP (nur bei HP < 3)"
  }
  // Weitere Items später hier rein!
};

function generateRooms() {
  let numRooms = Math.floor(Math.random() * 9) + 2;
  let startX = 0, startY = 0;

  for (let i = 0; i < numRooms; i++) {
    let w = Math.floor(Math.random() * 200) + 100;
    let h = Math.floor(Math.random() * 200) + 100;

    let rect = {
      x: startX,
      y: startY,
      width: w,
      height: h,
    };

    rooms.push(rect);

    // Wände hinzufügen

    // Position für nächsten Raum (nebeneinander)
    if (Math.random() < 0.5) {
      startX += w;
    } else {
      startY += h;
    }
  }

  // Startposition
  player.x = rooms[0].x + 30;
  player.y = rooms[0].y + 30;
}

function isPointInAnyRoom(x, y) {
  for (let room of rooms) {
    if (
      x >= room.x &&
      x <= room.x + room.width &&
      y >= room.y &&
      y <= room.y + room.height
    ) {
      return true;
    }
  }
  return false;
}

function isWallExposedBelow(rect, allRooms) {
    const testX = rect.x + rect.width / 2;
    const testY = rect.y + rect.height + 1;
  
    for (let other of allRooms) {
      if (other === rect) continue;
      if (
        testX >= other.x &&
        testX <= other.x + other.width &&
        testY >= other.y &&
        testY <= other.y + other.height
      ) {
        return false; // etwas berührt die Wand
      }
    }
    return true;
  }
  
function isPointInAnyHidingSpot(x, y) {
  return hidingSpots.some(spot =>
    x >= spot.x &&
    x <= spot.x + spot.width &&
    y >= spot.y &&
    y <= spot.y + spot.height
  );
}

function pushPlayerOutOfHidingSpot() {
  const offset = 35;

  const downY = player.y + offset;
  const upY = player.y - offset;

  // Versuche nach unten
  if (
    areAllCornersInsideRooms(player.x, downY, player.size) &&
    !isPointInAnyHidingSpot(player.x + player.size / 2, downY + player.size / 2)
  ) {
    player.y = downY;
    return;
  }

  // Versuche nach oben
  if (
    areAllCornersInsideRooms(player.x, upY, player.size) &&
    !isPointInAnyHidingSpot(player.x + player.size / 2, upY + player.size / 2)
  ) {
    player.y = upY;
    return;
  }

  // Wenn beides nicht geht, bleib stehen
}

function areAllCornersInsideRooms(x, y, size) {
  let corners = [
    [x, y],                       // oben links
    [x + size, y],               // oben rechts
    [x, y + size],               // unten links
    [x + size, y + size]         // unten rechts
  ];

  return corners.every(([cx, cy]) => isPointInAnyRoom(cx, cy));
}

function isPlayerInGoal() {
    const goal = goalZone();
    if (!goal) return false;
    if (goalLocked && !hasKey) return false;
  
    const inside = anyCornerInside(goal, player.x, player.y, player.size);
  
    if (inside && clockActive) {
      clockActive = false;
    }
  
    return inside;
  }  

function anyCornerInside(area, x, y, size) {
  const corners = [
    [x, y],
    [x + size, y],
    [x, y + size],
    [x + size, y + size]
  ];
  return corners.some(([cx, cy]) =>
    cx >= area.x &&
    cx <= area.x + area.width &&
    cy >= area.y &&
    cy <= area.y + area.height
  );
}

function spawnBookInRect(rect) {
  const bookTypes = [
    { value: 1, color: "red" },
    { value: 2, color: "orange" },
    { value: 5, color: "yellow" },
    { value: 10, color: "green" },
    { value: 25, color: "lightblue" },
    { value: 50, color: "blue" },
    { value: 100, color: "purple" }
  ];

  const possibleBooks = bookTypes.filter(type => {
    const chance = 1 / (1.87 * type.value);
    return Math.random() < chance;
  });

  const chosen = possibleBooks.length > 0
    ? possibleBooks[Math.floor(Math.random() * possibleBooks.length)]
    : bookTypes[0];

  books.push({
    x: rect.x + Math.random() * (rect.width - 10),
    y: rect.y + Math.random() * (rect.height - 10),
    size: 10,
    value: chosen.value,
    color: chosen.color
  });
}

function loadRoom(roomNumber) {
    currentRoomNumber = roomNumber;
    rooms = [];
    hidingSpots = [];
    books = [];
    groundItems = [];
    keyObject = null;
    hasKey = false;
    vacuumTrap = null;
    clockActive = false;
  
    player.x = 0;
    player.y = 0;
  
    const numRects = Math.floor(Math.random() * 9) + 2;
    let startX = 0, startY = 0;
  
    const bookChancePerRect = 2.5 / numRects;
  
    for (let i = 0; i < numRects; i++) {
      const w = Math.floor(Math.random() * 200) + 100;
      const h = Math.floor(Math.random() * 200) + 100;
  
      const rect = {
        x: startX,
        y: startY,
        width: w,
        height: h
      };
  
      rooms.push(rect);
  
      // Bücher
      if (Math.random() < bookChancePerRect) {
        spawnBookInRect(rect);
      }
  
      // Items (90% Chance für Medizin)
      if (Math.random() < 0.02) {
        groundItems.push({
          x: rect.x + Math.random() * (rect.width - 20) + 10,
          y: rect.y + Math.random() * (rect.height - 20) + 10,
          type: "medizin"
        });
      }
  
      // Verstecke
      let placeHiding = false;
      if (i === 1) placeHiding = true;
      else if (i > 1 && Math.random() < 1 / 3) placeHiding = true;
  
      if (placeHiding) {
        hidingSpots.push({
          x: rect.x + Math.floor(Math.random() * (w - 30)) + 5,
          y: rect.y + Math.floor(Math.random() * (h - 30)) + 5,
          width: 14,
          height: 14
        });
      }
  
      // Nächstes Rechteck anschließen
      if (Math.random() < 0.5) startX += w;
      else startY += h;
    }
  
    // Startposition
    player.x = rooms[0].x + 30;
    player.y = rooms[0].y + 30;
  
    // === Zielzone-Sperre
    goalLocked = false;
    if (currentRoomNumber >= 10 && Math.random() < 0.2) {
      goalLocked = true;
  
      // Schlüssel in zufälligem Raum platzieren
      const keyRoom = rooms[Math.floor(Math.random() * rooms.length)];
      keyObject = {
        x: keyRoom.x + keyRoom.width / 2,
        y: keyRoom.y + keyRoom.height / 2,
        size: 8
      };
    }
  
    // === Schüler 😄
    enemyActive = false;
    enemyAppearing = false;
    enemyRoom = null;
  
    if (currentRoomNumber >= 40 && Math.random() < 0.1) {
      enemyAppearing = true;
      enemyTimer = Date.now();
      enemyRoom = [...rooms];
    }
  
    // === Lehrer 🙂
    teacher2Active = false;
    teacher2Visible = false;
  
    if (currentRoomNumber >= 70 && rooms.length >= 3 && Math.random() < 0.2) {
      const r = rooms[2];
      teacher2Pos.x = r.x + r.width / 2;
      teacher2Pos.y = r.y + r.height / 2;
      teacher2Timer = Date.now();
      teacher2Visible = true;
    }
  
    // === Uhr ⏱️
    if (currentRoomNumber >= 100 && Math.random() < 0.05) {
      const hasSchueler = enemyAppearing;
      const randomOffset = (Math.random() * 6 - 3) * 1000; // -3 bis +3 s
  
      clockDuration = Math.max(3000,
        Math.floor(5000 + numRects * 2000 + (hasSchueler ? 4000 : 0) + randomOffset));
      clockStartTime = Date.now();
      clockActive = true;
    }
    
    // === Vakuum (ab B-90, im zweitletzten Rechteck unten MIT Wand)
    if (currentRoomNumber >= 90 && rooms.length >= 3 && Math.random() < 0.3) {
      const vr = rooms[rooms.length - 2];
      const vacuumWidth = 40;
      const y = vr.y + vr.height;
  
      const step = 2;
      const segments = [];
      let currentStart = null;
  
      for (let x = vr.x; x <= vr.x + vr.width - step; x += step) {
        const isBlocked = rooms.some(r =>
          r !== vr &&
          x + step > r.x &&
          x < r.x + r.width &&
          y >= r.y &&
          y < r.y + r.height
        );
  
        if (!isBlocked) {
          if (currentStart === null) currentStart = x;
        } else {
          if (currentStart !== null) {
            segments.push({ start: currentStart, end: x });
            currentStart = null;
          }
        }
      }
      if (currentStart !== null) {
        segments.push({ start: currentStart, end: vr.x + vr.width });
      }
  
      const viable = segments.filter(s => s.end - s.start >= vacuumWidth);
      if (viable.length > 0) {
        const best = viable.reduce((a, b) => b.end - b.start > a.end - a.start ? b : a);
        const centerX = best.start + (best.end - best.start) / 2;
        const labelOffset = Math.random() < 0.5 ? 0 : 2;
  
        vacuumTrap = {
          x: centerX - vacuumWidth / 2,
          y: vr.y + vr.height - 10,
          width: vacuumWidth,
          height: 10,
          label: `B-${currentRoomNumber + labelOffset}`
        };
      }
    }
  }
  
function isPlayerInHidingSpot() {
  for (let spot of hidingSpots) {
    if (
      player.x + player.size > spot.x &&
      player.x < spot.x + spot.width &&
      player.y + player.size > spot.y &&
      player.y < spot.y + spot.height
    ) {
      return true;
    }
  }
  return false;
}

function movePlayer(fatigueDelta) {
  // === Keine Bewegung bei Erschöpfung oder versteckt
  if (exhausted || hiding) return;

  // === Richtung berechnen
  let dx = 0, dy = 0;
  if (keys["w"]) dy -= 1;
  if (keys["s"]) dy += 1;
  if (keys["a"]) dx -= 1;
  if (keys["d"]) dx += 1;

  const moved = dx !== 0 || dy !== 0;
  if (moved) lastMovementTime = Date.now();

  // === Normalisieren bei Diagonalen
  const length = Math.hypot(dx, dy);
  if (length > 0) {
    dx /= length;
    dy /= length;
  }

  // === Geschwindigkeit
  let speed = player.speed;
  isSprinting = false;
  if (keys["q"] && !exhausted) {
    speed *= 2;
    isSprinting = true;
  }

  // === Neue Position berechnen
  const nextX = player.x + dx * speed;
  const nextY = player.y + dy * speed;

  // === Nur bewegen, wenn erlaubt
  if (areAllCornersInsideRooms(nextX, nextY, player.size)) {
    player.x = nextX;
    player.y = nextY;
  }

  // === Energie-Verbrauch
  let fatigueChangePerSecond = 0;

  if (hiding) {
    fatigueChangePerSecond = -1.5;
  } else if (moved) {
    fatigueChangePerSecond = isSprinting ? 5 : 0.5;
  } else {
    fatigueChangePerSecond = -1;
  }

  fatigue += fatigueChangePerSecond * (fatigueDelta / 1000);
  fatigue = Math.max(0, Math.min(100, fatigue));

  // === Erschöpfung
  if (fatigue >= 100 && !exhausted) {
    exhausted = true;
    exhaustionTimer = Date.now();
    fatigue = 100;
    hp--;
    deathReason = "Zu müde geworden.";
  }
}

function addItem(type, amount = 1) {
  for (let slot of itemSlots) {
    if (slot.type === type) {
      if (type === "medizin" && slot.amount >= 5) continue;
      slot.amount = Math.min(slot.amount + amount, 5);
      return;
    }
  }

  for (let slot of itemSlots) {
    if (slot.type === "") {
      slot.type = type;
      slot.amount = Math.min(amount, 5);
      return;
    }
  }

  console.log("Kein Platz für Item:", type);
}

function useItem(slotIndex) {
  const slot = itemSlots[slotIndex];
  if (slot.amount <= 0 || slot.type === "") return;

  if (slot.type === "medizin") {
    if (hp >= 3) return; // blockiert, wenn HP ≥ 3
    hp = Math.min(hp + 1, 4);
  }

  slot.amount--;
  if (slot.amount <= 0) {
    slot.type = "";
    slot.amount = 0;
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // === Kamera starten ===
  ctx.save();
  ctx.translate(Math.floor(canvas.width / 2 - player.x), Math.floor(canvas.height / 2 - player.y));

  // === Räume & Zielzone ===
  for (let i = 0; i < rooms.length; i++) {
    const room = rooms[i];
    ctx.fillStyle = "#222";
    ctx.fillRect(room.x, room.y, room.width, room.height);

    if (i === rooms.length - 1 && currentRoomNumber < 999) {
      const goal = goalZone();
      ctx.fillStyle = goalLocked ? "#664400" : "brown";
      ctx.fillRect(goal.x, goal.y, goal.width, goal.height);
      ctx.fillStyle = "white";
      ctx.font = "12px monospace";
      ctx.fillText(`B-${currentRoomNumber + 1}`, goal.x + 4, goal.y - 4);
      if (goalLocked && !hasKey) {
        ctx.fillText("🔒", goal.x + 14, goal.y + 4);
      }
    }
  }

  // === Bücher ===
  for (let b of books) {
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.size, b.size);
  }

  // === Verstecke ===
  for (let spot of hidingSpots) {
    ctx.fillStyle = "#444";
    ctx.fillRect(spot.x, spot.y, spot.width, spot.height);
  }

  // === Boden-Items ===
  for (let item of groundItems) {
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(item.x, item.y, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  // === Schlüssel ===
  if (goalLocked && keyObject && !hasKey) {
    ctx.fillStyle = "gold";
    ctx.beginPath();
    ctx.arc(keyObject.x, keyObject.y, keyObject.size, 0, Math.PI * 2);
    ctx.fill();
  }

  // === Vakuum ===
  if (vacuumTrap) {
    ctx.fillStyle = "brown";
    ctx.fillRect(vacuumTrap.x, vacuumTrap.y, vacuumTrap.width, vacuumTrap.height);
    ctx.fillStyle = "white";
    ctx.font = "12px monospace";
    ctx.fillText(vacuumTrap.label, vacuumTrap.x + 4, vacuumTrap.y - 4);
  }

  // === Spieler ===
  if (!hiding) {
    ctx.fillStyle = fatigue >= 80 ? "red" : "blue";
    ctx.fillRect(player.x, player.y, player.size, player.size);
  }

  // === Lehrer :) anzeigen
  if (teacher2Visible) {
    ctx.fillStyle = "white";
    ctx.font = "40px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(":)", teacher2Pos.x, teacher2Pos.y);
  }

  // === Kamera beenden ===
  ctx.restore();

  // === Schüler-Flackern
  if (enemyAppearing) {
    const t = (Date.now() - enemyTimer) / 1000;
    const isFlashing = (t >= 1.0 && t < 1.1) || (t >= 1.2 && t < 1.3) || (t >= 1.4 && t < 1.5);
    if (isFlashing) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  // === Schüler :D
  if (enemyActive) {
    ctx.fillStyle = "white";
    ctx.font = "100px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(":D", canvas.width / 2, canvas.height / 2);
  }

  // === Uhr-Flackern (blau)
  if (clockActive) {
    const t = (Date.now() - clockStartTime) / 200;
    if (Math.floor(t) % 2 === 0) {
      ctx.fillStyle = "rgba(0, 0, 255, 0.02)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  // === HUD links oben ===
  ctx.fillStyle = "white";
  ctx.font = "14px monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  let lineY = 20;
  let statusText = "";

  switch (hp) {
    case 4: statusText = "Status: Super"; break;
    case 3: statusText = "Status: Gut"; break;
    case 2: statusText = "Status: Neutral"; break;
    case 1: statusText = "Status: Schlecht"; break;
    default: statusText = "Status: Tot"; break;
  }

  ctx.fillText(statusText, 20, lineY); lineY += 20;

  ctx.fillStyle = "gold";
  ctx.fillText(`Bücher: ${totalBookPoints}`, 20, lineY); lineY += 20;

  ctx.fillStyle = "white";
  ctx.fillText(`Energie: ${Math.floor(100 - fatigue)}%`, 20, lineY); lineY += 20;

  ctx.fillStyle = "lightblue";
  ctx.fillText(`Sauerstoff: ${Math.floor(oxygen)}%`, 20, lineY); lineY += 20;

  if (clockActive) {
    const timeLeft = Math.max(0, clockDuration - (Date.now() - clockStartTime));
    ctx.fillStyle = "lightblue";
    ctx.fillText(`Uhr: ${Math.ceil(timeLeft / 1000)}s`, 20, lineY); lineY += 20;
  }

  if (goalLocked) {
    ctx.fillStyle = hasKey ? "gold" : "gray";
    ctx.fillText(`Schlüssel: ${hasKey ? "🗝️" : "–"}`, 20, lineY); lineY += 20;
  }

  if (hiding) {
    ctx.fillStyle = "lime";
    ctx.fillText("Versteckt (E zum Verlassen)", 20, lineY); lineY += 20;
  } else if (exhausted) {
    ctx.fillStyle = "red";
    ctx.fillText("Erschöpft! Pause...", 20, lineY); lineY += 20;
  } else if (isSprinting) {
    ctx.fillStyle = "cyan";
    ctx.fillText("Sprint!", 20, lineY); lineY += 20;
  }

  // === Inventar rechts oben ===
  const slotX = canvas.width - 140;
  let slotY = 20;

  for (let i = 0; i < itemSlots.length; i++) {
    const slot = itemSlots[i];
    ctx.fillStyle = "#000";
    ctx.fillRect(slotX, slotY, 120, 30);
    ctx.strokeStyle = "#fff";
    ctx.strokeRect(slotX, slotY, 120, 30);

    ctx.fillStyle = "white";
    ctx.font = "14px monospace";
    const label = slot.type === "" ? "Leer" : slot.type[0].toUpperCase() + slot.type.slice(1);
    const shortLabel = label.length > 10 ? label.slice(0, 9) + "…" : label;
    const amount = slot.amount > 0 ? ` (${slot.amount})` : "";
    ctx.fillText(`${i + 1}: ${shortLabel}${amount}`, slotX + 6, slotY + 8);
    slotY += 40;
  }

  // === Tooltip unten rechts ===
  for (let i = 0; i < itemSlots.length; i++) {
    const slot = itemSlots[i];
    if (slot.type === "") continue;

    const slotBox = {
      x: canvas.width - 140,
      y: 20 + i * 40,
      w: 120,
      h: 30
    };

    if (
      mouseX >= slotBox.x &&
      mouseX <= slotBox.x + slotBox.w &&
      mouseY >= slotBox.y &&
      mouseY <= slotBox.y + slotBox.h
    ) {
      const data = itemDescriptions[slot.type];
      if (!data) continue;

      const boxW = 220;
      const boxH = 50;
      const boxX = canvas.width - boxW - 20;
      const boxY = canvas.height - boxH - 20;

      ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
      ctx.fillRect(boxX, boxY, boxW, boxH);
      ctx.strokeStyle = "white";
      ctx.strokeRect(boxX, boxY, boxW, boxH);

      ctx.fillStyle = "white";
      ctx.font = "14px monospace";
      ctx.fillText(data.name, boxX + 10, boxY + 14);
      ctx.font = "12px monospace";
      ctx.fillText(data.effect, boxX + 10, boxY + 32);
    }
  }
}

function drawDeathScreen() {
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "red";
  ctx.font = "48px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillText("Du bist gestorben!", canvas.width / 2, canvas.height / 2 - 40);

  ctx.font = "28px monospace";
  ctx.fillText(`Grund: ${deathReason}`, canvas.width / 2, canvas.height / 2 + 20);
}

function gameLoop() {
  const now = Date.now();
  if (hp <= 0) {
    drawDeathScreen();
    return;
  }

  // === Erschöpfung vorbei
  if (exhausted && now - exhaustionTimer >= 5000) {
    exhausted = false;
    fatigue = 0;
  }

  // === Schüler-Aktivierung
  if (enemyAppearing && !enemyActive && now - enemyTimer >= 8000) {
    enemyActive = true;
    enemyAppearing = false;
    enemyVisibleSince = now;
    const room = enemyRoom[Math.floor(Math.random() * enemyRoom.length)];
    enemyPosition.x = room.x + room.width / 2;
    enemyPosition.y = room.y + room.height / 2;
  }

  // === Schüler-Sichtzeit vorbei
  if (enemyActive && now - enemyVisibleSince >= 200) {
    if (!hiding) {
      hp = 0;
      deathReason = "Vom Schüler erwischt.";
    }
    enemyActive = false;
  }

  // === Lehrer Bewegungspflicht
  if (teacher2Visible && !teacher2Active && now - teacher2Timer >= 2000) {
    teacher2Active = true;
  }

  if (teacher2Active && !hiding && now - lastMovementTime > 250  && now - lastHidingExitTime > 250) {
    hp--;
    teacher2Active = false;
    teacher2Visible = false;
    if (hp <= 0) deathReason = "Der Lehrer hat dich erwischt.";
  }

  // === Sauerstoff
  const oxygenDelta = now - lastOxygenUpdate;
  lastOxygenUpdate = now;
  oxygen += (hiding ? -20 : 50) / 1000 * oxygenDelta;
  oxygen = Math.max(0, Math.min(100, oxygen));
  if (oxygen <= 0) {
    hp--;
    deathReason = "Erstickung im Versteck.";
    if (hp <= 0) exhausted = true;
    else {
      hiding = false;
      pushPlayerOutOfHidingSpot();
      oxygen = 1;
    }
  }

  // === Energie
  const fatigueDelta = now - lastFatigueUpdate;
  lastFatigueUpdate = now;
  let energyChange = hiding ? 27 : (keys["w"] || keys["a"] || keys["s"] || keys["d"] ? (isSprinting ? -25 : -5) : 18);
  fatigue -= energyChange * (fatigueDelta / 1000);
  fatigue = Math.max(0, Math.min(100, fatigue));
  if (fatigue >= 100 && !exhausted) {
    exhausted = true;
    exhaustionTimer = Date.now();
    hp--;
    deathReason = "Zu erschöpft.";
  }

  movePlayer(fatigueDelta);

  // === Uhr-Timer
  if (clockActive) {
    const elapsed = now - clockStartTime;
    if (elapsed >= clockDuration) {
      hp -= 3;
      clockActive = false;
      if (hp <= 0) {
        deathReason = "Von der Uhr bestraft.";
      }
    }
  }

  // === Items sammeln
  for (let i = groundItems.length - 1; i >= 0; i--) {
    const item = groundItems[i];
    const dx = player.x + player.size / 2 - item.x;
    const dy = player.y + player.size / 2 - item.y;
    if (Math.hypot(dx, dy) < 12) {
      addItem(item.type, 1);
      groundItems.splice(i, 1);
    }
  }

  // === Bücher sammeln
  for (let i = books.length - 1; i >= 0; i--) {
    const b = books[i];
    const dx = player.x + player.size / 2 - (b.x + b.size / 2);
    const dy = player.y + player.size / 2 - (b.y + b.size / 2);
    if (Math.hypot(dx, dy) < 12) {
      totalBookPoints += b.value;
      books.splice(i, 1);
    }
  }

  // === Schlüssel sammeln
  if (goalLocked && keyObject && !hasKey) {
    const dx = player.x + player.size / 2 - keyObject.x;
    const dy = player.y + player.size / 2 - keyObject.y;
    if (Math.hypot(dx, dy) < 12) {
      hasKey = true;
      keyObject = null;
    }
  }

  // === Vakuum-Kollision
  if (vacuumTrap) {
    const playerBox = {
      x: player.x,
      y: player.y,
      w: player.size,
      h: player.size
    };
    const trapBox = {
      x: vacuumTrap.x,
      y: vacuumTrap.y,
      w: vacuumTrap.width,
      h: vacuumTrap.height
    };
    const overlaps = !(
      playerBox.x + playerBox.w < trapBox.x ||
      playerBox.x > trapBox.x + trapBox.w ||
      playerBox.y + playerBox.h < trapBox.y ||
      playerBox.y > trapBox.y + trapBox.h
    );
    if (overlaps) {
      hp -= 2;
      deathReason = "Ins Vakuum reingelaufen.";
      vacuumTrap = null;
    }
  }

  draw();

  // === Zielzone erreicht
  if (isPlayerInGoal()) {
    if (currentRoomNumber < 999) {
      loadRoom(currentRoomNumber + 1);
    } else {
      alert("End-Raum B-999 erreicht");
    }
  }

  requestAnimationFrame(gameLoop);
}

loadRoom(100);
gameLoop();
