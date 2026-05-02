(function () {
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const minimap = document.getElementById("minimap");
  const miniCtx = minimap.getContext("2d");

  const MAP_SIZE = 64;
  const FOV = Math.PI / 3;
  const MAX_DEPTH = 20;
  const INTERACT_RANGE = 1.45;
  const TURN_SPEED = 3.4;
  const WALK_SPEED = 4.2;
  const RUN_MULTIPLIER = 1.55;
  const GRAVITY = 18;
  const JUMP_FORCE = 6.8;
  const PLAYER_RADIUS = 0.22;
  const MOUSE_SENSITIVITY = 0.0026;
  const CAMERA_BOB_SPEED = 11;
  const SAVE_KEY = "frontier-crafter-save-v2";

  const keys = new Set();
  const world = [];
  const entities = [];

  const ui = {
    roleButtons: document.getElementById("roleButtons"),
    roleDescription: document.getElementById("roleDescription"),
    craftingList: document.getElementById("craftingList"),
    questList: document.getElementById("questList"),
    inventoryList: document.getElementById("inventoryList"),
    roleLabel: document.getElementById("roleLabel"),
    dayLabel: document.getElementById("dayLabel"),
    timeLabel: document.getElementById("timeLabel"),
    healthLabel: document.getElementById("healthLabel"),
    energyLabel: document.getElementById("energyLabel"),
    messageLog: document.getElementById("messageLog"),
    pointerLockHint: document.getElementById("pointerLockHint"),
    interactionPrompt: document.getElementById("interactionPrompt"),
  };

  const roles = {
    farmer: {
      label: "Ciftci",
      description: "Tohum ve hasatta daha verimli. Tarla verimi yuksektir.",
      bonuses: { harvestBonus: 2, cropGrowRate: 1.4 },
    },
    hunter: {
      label: "Avci",
      description: "Hayvanlardan daha cok ganimet alir. Kosu enerjisi daha iyi.",
      bonuses: { meatBonus: 2, staminaUse: 0.7 },
    },
    producer: {
      label: "Uretici",
      description: "Craft islerinde daha tasarruflu ve daha guclu ekonomi kurar.",
      bonuses: { craftRefundChance: 0.3, marketBonus: 1.3 },
    },
  };

  const recipes = [
    {
      id: "axe",
      label: "Tas Balta",
      needs: { wood: 4, stone: 2, fiber: 2 },
      gives: { axe: 1 },
      station: "camp",
      description: "Agac toplamayi hizlandirir.",
    },
    {
      id: "pickaxe",
      label: "Kazma",
      needs: { wood: 3, stone: 4, fiber: 2 },
      gives: { pickaxe: 1 },
      station: "camp",
      description: "Tas toplamada daha verimli.",
    },
    {
      id: "spear",
      label: "Mizrak",
      needs: { wood: 5, fiber: 3, stone: 2 },
      gives: { spear: 1 },
      station: "camp",
      description: "Avcilik icin gerekli.",
    },
    {
      id: "seedBag",
      label: "Tohum Kesesi",
      needs: { berry: 4, fiber: 2 },
      gives: { seed: 5 },
      station: "camp",
      description: "Tarla ekimi icin tohum uretir.",
    },
    {
      id: "bread",
      label: "koy Ekmek",
      needs: { wheat: 4, wood: 1 },
      gives: { bread: 1 },
      station: "camp",
      description: "Enerjiyi hizla doldurur.",
    },
    {
      id: "stew",
      label: "Etli Yahni",
      needs: { meat: 2, berry: 2, wood: 1 },
      gives: { stew: 1 },
      station: "camp",
      description: "Can ve enerji yeniler.",
    },
    {
      id: "plank",
      label: "Tahta Paket",
      needs: { wood: 4 },
      gives: { plank: 2 },
      station: "workbench",
      description: "Gelismis yapilar ve ticaret icin.",
    },
  ];

  const quests = [
    {
      id: "gather-start",
      title: "Temel Kaynaklar",
      text: "8 odun, 6 tas ve 4 lif topla.",
      isDone: (state) =>
        state.inventory.wood >= 8 &&
        state.inventory.stone >= 6 &&
        state.inventory.fiber >= 4,
      reward: { coin: 20 },
    },
    {
      id: "craft-tools",
      title: "Aletlerini Kur",
      text: "Bir balta, bir kazma ve bir mizrak craft et.",
      isDone: (state) =>
        state.inventory.axe >= 1 &&
        state.inventory.pickaxe >= 1 &&
        state.inventory.spear >= 1,
      reward: { coin: 35, seed: 4 },
    },
    {
      id: "first-harvest",
      title: "Ilk Hasat",
      text: "En az 6 bugday elde et.",
      isDone: (state) => state.inventory.wheat >= 6,
      reward: { coin: 30, bread: 1 },
    },
    {
      id: "hunter-table",
      title: "Avci Sofrasi",
      text: "4 et topla ve bir yahni craft et.",
      isDone: (state) => state.inventory.stew >= 1 && state.stats.meatCollected >= 4,
      reward: { coin: 45 },
    },
  ];

  const state = {
    role: null,
    day: 1,
    timeMinutes: 6 * 60,
    message: "Haritaya hos geldin. Rol sec, sonra kaynak toplamaya basla.",
    inventory: {
      wood: 0,
      stone: 0,
      fiber: 0,
      berry: 3,
      meat: 0,
      hide: 0,
      wheat: 0,
      seed: 3,
      coin: 10,
      axe: 0,
      pickaxe: 0,
      spear: 0,
      bread: 0,
      stew: 0,
      plank: 0,
    },
    stats: {
      meatCollected: 0,
    },
    completedQuests: new Set(),
    player: {
      x: 5.5,
      y: 5.5,
      angle: 0.2,
      pitch: -0.02,
      health: 100,
      energy: 100,
      vx: 0,
      vy: 0,
      z: 0,
      vz: 0,
      grounded: true,
      bob: 0,
      speed: 0,
    },
    focusEntityId: null,
  };

  const stars = Array.from({ length: 90 }, () => ({
    x: Math.random(),
    y: Math.random() * 0.7,
    size: 1 + Math.random() * 2,
    alpha: 0.25 + Math.random() * 0.6,
  }));

  function setMessage(message) {
    state.message = message;
    ui.messageLog.textContent = message;
    saveGame();
  }

  function addEntity(entity) {
    entities.push({ ...entity, id: `${entity.type}-${entities.length + 1}` });
  }

  function makeWorld() {
    for (let y = 0; y < MAP_SIZE; y += 1) {
      const row = [];
      for (let x = 0; x < MAP_SIZE; x += 1) {
        const edge = x === 0 || y === 0 || x === MAP_SIZE - 1 || y === MAP_SIZE - 1;
        row.push(edge ? 1 : 0);
      }
      world.push(row);
    }

    for (let y = 10; y < 22; y += 1) {
      for (let x = 12; x < 25; x += 1) {
        if ((x + y) % 7 !== 0) world[y][x] = 2;
      }
    }

    for (let y = 28; y < 40; y += 1) {
      for (let x = 6; x < 18; x += 1) {
        world[y][x] = 3;
      }
    }

    for (let y = 42; y < 56; y += 1) {
      for (let x = 36; x < 54; x += 1) {
        if (x === 36 || y === 42 || x === 53 || y === 55 || (x + y) % 8 === 0) {
          world[y][x] = 4;
        }
      }
    }
  }

  function scatterEntities() {
    addEntity({ type: "camp", label: "Kamp Alani", x: 6.5, y: 6.8, color: "#f7d26a" });
    addEntity({ type: "workbench", label: "Tezgah", x: 8.6, y: 7.4, color: "#d29f62" });
    addEntity({ type: "market", label: "Takas Arabasi", x: 10.6, y: 7.2, color: "#9fd0ff" });
  }

  function getTile(x, y) {
    const cellX = Math.floor(x);
    const cellY = Math.floor(y);
    if (cellX < 0 || cellY < 0 || cellX >= MAP_SIZE || cellY >= MAP_SIZE) return 1;
    return world[cellY][cellX];
  }

  function isSolidTile(tile) {
    return tile === 1 || tile === 3 || tile === 4;
  }

  function isWall(x, y) {
    return isSolidTile(getTile(x, y));
  }

  function tileColor(tile) {
    switch (tile) {
      case 1:
        return "#3b4b31";
      case 2:
        return "#365a36";
      case 3:
        return "#2c5e72";
      case 4:
        return "#6d665f";
      default:
        return "#5f8a54";
    }
  }

  function collidesAt(x, y) {
    const offsets = [
      [0, 0],
      [PLAYER_RADIUS, 0],
      [-PLAYER_RADIUS, 0],
      [0, PLAYER_RADIUS],
      [0, -PLAYER_RADIUS],
      [PLAYER_RADIUS * 0.7, PLAYER_RADIUS * 0.7],
      [-PLAYER_RADIUS * 0.7, PLAYER_RADIUS * 0.7],
      [PLAYER_RADIUS * 0.7, -PLAYER_RADIUS * 0.7],
      [-PLAYER_RADIUS * 0.7, -PLAYER_RADIUS * 0.7],
    ];

    return offsets.some(([ox, oy]) => isWall(x + ox, y + oy));
  }

  function moveWithCollisions(dt) {
    const nextX = state.player.x + state.player.vx * dt;
    const nextY = state.player.y + state.player.vy * dt;

    if (!collidesAt(nextX, state.player.y)) {
      state.player.x = nextX;
    } else {
      state.player.vx *= -0.18;
    }

    if (!collidesAt(state.player.x, nextY)) {
      state.player.y = nextY;
    } else {
      state.player.vy *= -0.18;
    }
  }

  function jump() {
    if (!state.player.grounded || state.player.energy < 8) return;
    state.player.vz = JUMP_FORCE;
    state.player.grounded = false;
    state.player.energy = Math.max(0, state.player.energy - 8);
    setMessage("Zipladin.");
  }

  function updatePlayer(dt) {
    const runPressed = keys.has("Shift");
    const staminaUse = state.role === "hunter" ? roles.hunter.bonuses.staminaUse : 1;
    const speed = WALK_SPEED * (runPressed && state.player.energy > 0 ? RUN_MULTIPLIER : 1);
    const acceleration = state.player.grounded ? 10 : 5.2;
    const damping = state.player.grounded ? 8 : 2.5;

    if (keys.has("ArrowLeft")) state.player.angle -= TURN_SPEED * dt;
    if (keys.has("ArrowRight")) state.player.angle += TURN_SPEED * dt;

    let forward = 0;
    let strafe = 0;
    if (keys.has("w")) forward += 1;
    if (keys.has("s")) forward -= 1;
    if (keys.has("a")) strafe -= 1;
    if (keys.has("d")) strafe += 1;

    const inputLength = Math.hypot(forward, strafe) || 1;
    forward /= inputLength;
    strafe /= inputLength;

    const desiredVX =
      Math.cos(state.player.angle) * forward * speed +
      Math.cos(state.player.angle + Math.PI / 2) * strafe * speed * 0.86;
    const desiredVY =
      Math.sin(state.player.angle) * forward * speed +
      Math.sin(state.player.angle + Math.PI / 2) * strafe * speed * 0.86;

    const hasMovementInput = Math.abs(forward) > 0.01 || Math.abs(strafe) > 0.01;
    const blend = Math.min(1, acceleration * dt);
    if (hasMovementInput) {
      state.player.vx += (desiredVX - state.player.vx) * blend;
      state.player.vy += (desiredVY - state.player.vy) * blend;
    } else {
      const slow = Math.max(0, 1 - damping * dt);
      state.player.vx *= slow;
      state.player.vy *= slow;
    }

    moveWithCollisions(dt);

    if (runPressed && hasMovementInput) {
      state.player.energy = Math.max(0, state.player.energy - 12 * staminaUse * dt);
    } else {
      state.player.energy = Math.min(100, state.player.energy + 8 * dt);
    }

    state.player.vz -= GRAVITY * dt;
    state.player.z += state.player.vz * dt;
    if (state.player.z <= 0) {
      state.player.z = 0;
      state.player.vz = 0;
      state.player.grounded = true;
    }

    state.player.speed = Math.hypot(state.player.vx, state.player.vy);
    if (state.player.grounded && state.player.speed > 0.2) {
      state.player.bob += dt * CAMERA_BOB_SPEED * Math.min(1.4, state.player.speed / WALK_SPEED);
    }

    state.player.angle = ((state.player.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    state.player.pitch = Math.max(-0.32, Math.min(0.25, state.player.pitch));
  }

  function castRay(angle) {
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);

    for (let depth = 0; depth < MAX_DEPTH; depth += 0.02) {
      const x = state.player.x + cos * depth;
      const y = state.player.y + sin * depth;
      if (isWall(x, y)) {
        return { depth, tile: world[Math.floor(y)][Math.floor(x)] };
      }
    }

    return { depth: MAX_DEPTH, tile: 0 };
  }

  function angleDifference(a, b) {
    let diff = a - b;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return diff;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(start, end, amount) {
    return start + (end - start) * amount;
  }

  function lerpColor(a, b, amount) {
    return [
      Math.round(lerp(a[0], b[0], amount)),
      Math.round(lerp(a[1], b[1], amount)),
      Math.round(lerp(a[2], b[2], amount)),
    ];
  }

  function colorString(color, alpha = 1) {
    return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
  }

  function getLighting() {
    const timeRatio = state.timeMinutes / (24 * 60);
    const solarArc = Math.sin((timeRatio - 0.25) * Math.PI * 2);
    const daylight = clamp((solarArc + 0.16) / 1.16, 0, 1);
    const twilight = clamp(1 - Math.abs(solarArc) * 1.55, 0, 1) * (1 - daylight * 0.85);
    const ambient = clamp(0.18 + daylight * 0.82 + twilight * 0.08, 0.18, 1);

    const nightTop = [9, 14, 28];
    const dayTop = [126, 199, 255];
    const nightHorizon = [39, 43, 67];
    const dayHorizon = [228, 244, 255];
    const dawnGlow = [244, 160, 98];

    return {
      daylight,
      twilight,
      ambient,
      timeRatio,
      skyTop: lerpColor(lerpColor(nightTop, dayTop, daylight), dawnGlow, twilight * 0.22),
      skyBottom: lerpColor(lerpColor(nightHorizon, dayHorizon, daylight), dawnGlow, twilight * 0.55),
      groundTop: lerpColor([28, 40, 35], [94, 143, 79], daylight),
      groundBottom: lerpColor([8, 14, 12], [42, 68, 44], daylight),
      fogColor: lerpColor([12, 16, 24], [153, 192, 170], daylight * 0.55 + twilight * 0.1),
      glowColor: dawnGlow,
    };
  }

  function getHorizon(height) {
    const bobOffset = Math.sin(state.player.bob) * Math.min(7, state.player.speed * 1.7);
    return clamp(height * 0.5 + bobOffset - state.player.z * 42 - state.player.pitch * height * 0.55, height * 0.22, height * 0.8);
  }

  function drawCelestials(width, horizon, lighting) {
    const celestialX = width * lighting.timeRatio;
    const arc = Math.sin(lighting.timeRatio * Math.PI);
    const sunY = horizon - 190 * arc - 40;
    const moonY = horizon - 170 * Math.sin(((lighting.timeRatio + 0.5) % 1) * Math.PI) - 20;

    if (lighting.daylight < 0.55) {
      stars.forEach((star) => {
        ctx.fillStyle = colorString([255, 255, 255], star.alpha * (1 - lighting.daylight));
        ctx.beginPath();
        ctx.arc(star.x * width, star.y * horizon, star.size, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    if (lighting.daylight > 0.08 || lighting.twilight > 0.15) {
      const radius = 34 + lighting.twilight * 10;
      const glow = ctx.createRadialGradient(celestialX, sunY, 0, celestialX, sunY, radius * 2.4);
      glow.addColorStop(0, colorString([255, 252, 235], 0.95));
      glow.addColorStop(0.4, colorString(lighting.glowColor, 0.45));
      glow.addColorStop(1, colorString(lighting.glowColor, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(celestialX, sunY, radius * 2.4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = colorString([255, 244, 205], 0.9);
      ctx.beginPath();
      ctx.arc(celestialX, sunY, radius, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const moonX = width * ((lighting.timeRatio + 0.45) % 1);
      ctx.fillStyle = colorString([232, 240, 255], 0.85);
      ctx.beginPath();
      ctx.arc(moonX, moonY, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = colorString([181, 198, 229], 0.25);
      ctx.beginPath();
      ctx.arc(moonX + 8, moonY - 5, 18, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawGroundPerspective(width, height, horizon, lighting) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, horizon, width, height - horizon);
    ctx.clip();

    for (let index = 0; index < 30; index += 1) {
      const depth = (index + 1) / 30;
      const y = lerp(horizon + 8, height, depth * depth);
      ctx.strokeStyle = colorString([255, 255, 255], 0.01 + (1 - depth) * 0.05 * lighting.ambient);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    for (let index = -8; index <= 8; index += 1) {
      const x = width / 2 + index * 70;
      ctx.strokeStyle = colorString(lighting.fogColor, 0.06);
      ctx.beginPath();
      ctx.moveTo(x, height);
      ctx.lineTo(width / 2 + index * 18, horizon + 10);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawEntitySprite(entity, screenX, screenY, size, shade) {
    const alpha = clamp(shade * 0.95 + 0.15, 0.25, 1);
    ctx.save();
    ctx.translate(screenX, screenY);
    ctx.globalAlpha = alpha;

    ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
    ctx.beginPath();
    ctx.ellipse(0, size * 0.32, size * 0.45, size * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();

    if (entity.type === "tree") {
      ctx.fillStyle = "#5b3f25";
      ctx.fillRect(-size * 0.1, -size * 0.18, size * 0.2, size * 0.58);
      ctx.fillStyle = entity.color;
      ctx.beginPath();
      ctx.arc(0, -size * 0.28, size * 0.36, 0, Math.PI * 2);
      ctx.arc(-size * 0.22, -size * 0.16, size * 0.24, 0, Math.PI * 2);
      ctx.arc(size * 0.22, -size * 0.16, size * 0.24, 0, Math.PI * 2);
      ctx.fill();
    } else if (entity.type === "stone") {
      ctx.fillStyle = entity.color;
      ctx.beginPath();
      ctx.moveTo(-size * 0.35, size * 0.18);
      ctx.lineTo(-size * 0.14, -size * 0.3);
      ctx.lineTo(size * 0.18, -size * 0.22);
      ctx.lineTo(size * 0.34, size * 0.12);
      ctx.lineTo(0, size * 0.32);
      ctx.closePath();
      ctx.fill();
    } else if (entity.type === "animal") {
      ctx.fillStyle = entity.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 0.36, size * 0.24, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(size * 0.27, -size * 0.08, size * 0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#8d6646";
      [-0.18, -0.05, 0.08, 0.21].forEach((leg) => {
        ctx.fillRect(size * leg, size * 0.08, size * 0.05, size * 0.3);
      });
    } else if (entity.type === "plot") {
      ctx.fillStyle = entity.color;
      ctx.fillRect(-size * 0.42, -size * 0.06, size * 0.84, size * 0.18);
      if (entity.planted) {
        const growth = clamp(entity.growth / 100, 0.1, 1);
        ctx.fillStyle = `rgba(163, 230, 126, ${0.55 + growth * 0.35})`;
        for (let sprout = -3; sprout <= 3; sprout += 1) {
          const sx = sprout * size * 0.11;
          ctx.beginPath();
          ctx.moveTo(sx, size * 0.02);
          ctx.lineTo(sx - size * 0.04, -size * (0.12 + growth * 0.16));
          ctx.lineTo(sx + size * 0.04, -size * (0.06 + growth * 0.12));
          ctx.closePath();
          ctx.fill();
        }
      }
    } else if (entity.type === "camp" || entity.type === "workbench" || entity.type === "market") {
      ctx.fillStyle = entity.color;
      ctx.fillRect(-size * 0.3, -size * 0.2, size * 0.6, size * 0.46);
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fillRect(-size * 0.3, -size * 0.2, size * 0.6, size * 0.12);
    } else {
      ctx.fillStyle = entity.color;
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.28, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function renderSprites(depthBuffer, horizon, lighting) {
    const width = canvas.width;
    const visible = [];

    entities.forEach((entity) => {
      if (entity.removed) return;
      const dx = entity.x - state.player.x;
      const dy = entity.y - state.player.y;
      const distance = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      const diff = angleDifference(angle, state.player.angle);

      if (Math.abs(diff) < FOV * 0.7 && distance < MAX_DEPTH) {
        visible.push({ entity, distance, diff });
      }
    });

    visible
      .sort((a, b) => b.distance - a.distance)
      .forEach(({ entity, distance, diff }) => {
        const scaleBoost = entity.type === "plot" ? 0.7 : entity.type === "animal" ? 0.92 : 1;
        const size = Math.max(16, (420 / distance) * scaleBoost);
        const screenX = width / 2 + (diff / (FOV / 2)) * (width / 2);
        const screenY = horizon + 54 / distance - size * 0.16;
        const occlusionDepth = depthBuffer[clamp(Math.floor(screenX), 0, width - 1)] || MAX_DEPTH;
        if (occlusionDepth < distance - 0.15) return;

        const shade = clamp((1 - distance / MAX_DEPTH) * 0.82 + 0.25, 0.25, 1) * lighting.ambient;
        drawEntitySprite(entity, screenX, screenY, size, shade);

        if (distance < 5.6 || state.focusEntityId === entity.id) {
          ctx.fillStyle = "rgba(0,0,0,0.45)";
          ctx.fillRect(screenX - size * 0.58, screenY - size * 0.96, size * 1.16, 16);
          ctx.fillStyle = "#f6fff6";
          ctx.font = "12px Segoe UI";
          ctx.textAlign = "center";
          ctx.fillText(entity.label, screenX, screenY - size * 0.58);
        }
      });
  }

  function renderCrosshair() {
    const focused = !!getFocusEntity();
    ctx.strokeStyle = focused ? "rgba(248, 206, 109, 0.92)" : "rgba(255,255,255,0.78)";
    ctx.lineWidth = 2;
    const x = canvas.width / 2;
    const y = canvas.height / 2;
    ctx.beginPath();
    ctx.moveTo(x - 10, y);
    ctx.lineTo(x + 10, y);
    ctx.moveTo(x, y - 10);
    ctx.lineTo(x, y + 10);
    ctx.stroke();

    if (focused) {
      ctx.strokeStyle = "rgba(248, 206, 109, 0.35)";
      ctx.beginPath();
      ctx.arc(x, y, 18, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function renderWorld() {
    const width = canvas.width;
    const height = canvas.height;
    const lighting = getLighting();
    const horizon = getHorizon(height);
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, colorString(lighting.skyTop));
    sky.addColorStop(1, colorString(lighting.skyBottom));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, horizon);
    drawCelestials(width, horizon, lighting);

    const ground = ctx.createLinearGradient(0, horizon, 0, height);
    ground.addColorStop(0, colorString(lighting.groundTop));
    ground.addColorStop(1, colorString(lighting.groundBottom));
    ctx.fillStyle = ground;
    ctx.fillRect(0, horizon, width, height - horizon);
    drawGroundPerspective(width, height, horizon, lighting);

    const depthBuffer = new Array(width);

    for (let column = 0; column < width; column += 1) {
      const rayAngle = state.player.angle - FOV / 2 + (column / width) * FOV;
      const hit = castRay(rayAngle);
      const correctedDepth = hit.depth * Math.cos(rayAngle - state.player.angle);
      const wallHeight = Math.min(height, (height / Math.max(correctedDepth, 0.1)) * 0.9);
      const startY = horizon - wallHeight / 2;
      const wallShade = clamp((1 - correctedDepth / MAX_DEPTH) * 0.78 + 0.22, 0.18, 1) * lighting.ambient;
      const pattern = 0.92 + Math.sin(column * 0.17 + correctedDepth * 3.4) * 0.08;
      const base = hit.tile === 3 ? [47, 97, 120] : hit.tile === 4 ? [102, 97, 91] : [74, 96, 60];
      const finalColor = base.map((channel) => Math.round(channel * wallShade * pattern));
      ctx.fillStyle = colorString(finalColor);
      ctx.fillRect(column, startY, 1, wallHeight);

      ctx.fillStyle = colorString([255, 255, 255], 0.06 * wallShade);
      ctx.fillRect(column, startY, 1, 2);

      ctx.fillStyle = colorString(lighting.fogColor, clamp(correctedDepth / MAX_DEPTH, 0, 1) * 0.28);
      ctx.fillRect(column, startY, 1, wallHeight);
      depthBuffer[column] = correctedDepth;
    }

    renderSprites(depthBuffer, horizon, lighting);
    renderCrosshair();

    const vignette = ctx.createRadialGradient(width / 2, height / 2, width * 0.15, width / 2, height / 2, width * 0.72);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, `rgba(0,0,0,${0.2 + (1 - lighting.ambient) * 0.24})`);
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
  }

  function renderMinimap() {
    const scale = minimap.width / MAP_SIZE;
    miniCtx.clearRect(0, 0, minimap.width, minimap.height);
    miniCtx.fillStyle = "rgba(8, 18, 16, 0.95)";
    miniCtx.fillRect(0, 0, minimap.width, minimap.height);

    for (let y = 0; y < MAP_SIZE; y += 1) {
      for (let x = 0; x < MAP_SIZE; x += 1) {
        miniCtx.fillStyle = tileColor(world[y][x]);
        miniCtx.fillRect(x * scale, y * scale, scale + 1, scale + 1);
      }
    }

    entities.forEach((entity) => {
      if (entity.removed) return;
      miniCtx.fillStyle = entity.color;
      miniCtx.beginPath();
      miniCtx.arc(entity.x * scale, entity.y * scale, entity.type === "plot" ? 3 : 2.5, 0, Math.PI * 2);
      miniCtx.fill();

      if (entity.id === state.focusEntityId) {
        miniCtx.strokeStyle = "#f8ce6d";
        miniCtx.lineWidth = 1.5;
        miniCtx.beginPath();
        miniCtx.arc(entity.x * scale, entity.y * scale, 6, 0, Math.PI * 2);
        miniCtx.stroke();
      }
    });

    miniCtx.fillStyle = "rgba(248, 206, 109, 0.14)";
    miniCtx.beginPath();
    miniCtx.moveTo(state.player.x * scale, state.player.y * scale);
    miniCtx.lineTo(
      (state.player.x + Math.cos(state.player.angle - 0.32) * 5) * scale,
      (state.player.y + Math.sin(state.player.angle - 0.32) * 5) * scale
    );
    miniCtx.lineTo(
      (state.player.x + Math.cos(state.player.angle + 0.32) * 5) * scale,
      (state.player.y + Math.sin(state.player.angle + 0.32) * 5) * scale
    );
    miniCtx.closePath();
    miniCtx.fill();

    miniCtx.fillStyle = "#ffffff";
    miniCtx.beginPath();
    miniCtx.arc(state.player.x * scale, state.player.y * scale, 4, 0, Math.PI * 2);
    miniCtx.fill();
    miniCtx.strokeStyle = "#ffec9b";
    miniCtx.beginPath();
    miniCtx.moveTo(state.player.x * scale, state.player.y * scale);
    miniCtx.lineTo(
      (state.player.x + Math.cos(state.player.angle) * 3) * scale,
      (state.player.y + Math.sin(state.player.angle) * 3) * scale
    );
    miniCtx.stroke();
  }

  function getNearbyEntity(filterFn) {
    let closest = null;
    let minDistance = Infinity;

    entities.forEach((entity) => {
      if (entity.removed || (filterFn && !filterFn(entity))) return;
      const distance = Math.hypot(entity.x - state.player.x, entity.y - state.player.y);
      if (distance < INTERACT_RANGE && distance < minDistance) {
        minDistance = distance;
        closest = entity;
      }
    });

    return closest;
  }

  function getFocusEntity() {
    let focused = null;
    let bestScore = Infinity;

    entities.forEach((entity) => {
      if (entity.removed) return;
      const dx = entity.x - state.player.x;
      const dy = entity.y - state.player.y;
      const distance = Math.hypot(dx, dy);
      if (distance > INTERACT_RANGE + 0.55) return;

      const angle = Math.atan2(dy, dx);
      const diff = Math.abs(angleDifference(angle, state.player.angle));
      if (diff > 0.36) return;

      const score = distance + diff * 2.5;
      if (score < bestScore) {
        bestScore = score;
        focused = entity;
      }
    });

    state.focusEntityId = focused ? focused.id : null;
    return focused;
  }

  function getInteractionCopy(entity) {
    if (!entity) return "";
    const interactionMap = {
      tree: "E ile kes",
      stone: "E ile kaz",
      fiber: "E ile topla",
      berry: "E ile topla",
      animal: "E ile avlan",
      camp: "E ile dinlen / ye",
      workbench: "E ile tezgaha gec",
      market: "E ile takas yap",
      plot: "F ile ek / hasat yap",
    };
    return `${entity.label} • ${interactionMap[entity.type] || "E ile etkilesim"}`;
  }

  function updateInteractionPrompt() {
    const focused = getFocusEntity();
    if (!focused) {
      ui.interactionPrompt.textContent = "";
      ui.interactionPrompt.classList.add("hidden");
      return;
    }

    ui.interactionPrompt.textContent = getInteractionCopy(focused);
    ui.interactionPrompt.classList.remove("hidden");
  }

  function addItem(item, amount) {
    state.inventory[item] = (state.inventory[item] || 0) + amount;
  }

  function consumeItem(item, amount) {
    state.inventory[item] = Math.max(0, (state.inventory[item] || 0) - amount);
  }

  function translateItem(item) {
    const labels = {
      wood: "Odun",
      stone: "Tas",
      fiber: "Lif",
      berry: "Meyve",
      meat: "Et",
      hide: "Deri",
      wheat: "Bugday",
      seed: "Tohum",
      coin: "Coin",
      axe: "Balta",
      pickaxe: "Kazma",
      spear: "Mizrak",
      bread: "Ekmek",
      stew: "Yahni",
      plank: "Tahta",
    };
    return labels[item] || item;
  }

  function handlePlotInteraction(plot) {
    if (!plot.planted) {
      if (state.inventory.seed < 1) {
        setMessage("Bu tarlaya ekim icin tohum gerekiyor.");
        return;
      }
      consumeItem("seed", 1);
      plot.planted = true;
      plot.growth = 0;
      setMessage("Tarlaya ekim yaptin. Zamanla bugday buyuyecek.");
      return;
    }

    if (plot.growth < 100) {
      setMessage(`Bugday henuz tam buyumedi. Su an %${Math.floor(plot.growth)} buyuklukte.`);
      return;
    }

    const harvestBonus = state.role === "farmer" ? roles.farmer.bonuses.harvestBonus : 0;
    addItem("wheat", 3 + harvestBonus);
    plot.planted = false;
    plot.growth = 0;
    setMessage(`Hasat tamamlandi. ${3 + harvestBonus} bugday aldiniz.`);
  }

  function eatBestFood() {
    if (state.inventory.stew > 0) {
      consumeItem("stew", 1);
      state.player.health = Math.min(100, state.player.health + 25);
      state.player.energy = Math.min(100, state.player.energy + 35);
      setMessage("Yahni yedin. Can ve enerji yenilendi.");
      return;
    }
    if (state.inventory.bread > 0) {
      consumeItem("bread", 1);
      state.player.energy = Math.min(100, state.player.energy + 28);
      setMessage("Ekmek yedin. Enerji toparlandi.");
      return;
    }
    setMessage("Kampta dinlenebilirsin ama yiyecegin kalmamis.");
  }

  function interact() {
    const entity = getFocusEntity() || getNearbyEntity();
    if (!entity) {
      setMessage("Yakinda etkilesime girecek bir sey yok.");
      return;
    }

    if (entity.type === "tree") {
      const bonus = state.inventory.axe > 0 ? 2 : 0;
      addItem("wood", entity.amount + bonus);
      entity.removed = true;
      setMessage(`Agac kestin. ${entity.amount + bonus} odun toplandi.`);
      return;
    }

    if (entity.type === "stone") {
      const bonus = state.inventory.pickaxe > 0 ? 2 : 0;
      addItem("stone", entity.amount + bonus);
      entity.removed = true;
      setMessage(`Tas toplandi. ${entity.amount + bonus} tas kazandin.`);
      return;
    }

    if (entity.type === "fiber" || entity.type === "berry") {
      addItem(entity.resource, entity.amount);
      entity.removed = true;
      setMessage(`${entity.label} toplandi. ${entity.amount} ${translateItem(entity.resource)} elde edildi.`);
      return;
    }

    if (entity.type === "animal") {
      if (state.inventory.spear < 1) {
        setMessage("Avlanmak icin once mizrak craft etmelisin.");
        return;
      }
      entity.hp -= 1;
      if (entity.hp <= 0) {
        const meatBonus = state.role === "hunter" ? roles.hunter.bonuses.meatBonus : 0;
        addItem("meat", 2 + meatBonus);
        addItem("hide", 1);
        state.stats.meatCollected += 2 + meatBonus;
        entity.removed = true;
        setMessage(`Av basarili. ${2 + meatBonus} et ve 1 deri toplandi.`);
      } else {
        setMessage("Hayvani yaraladin. Bir kez daha vurman gerekebilir.");
      }
      return;
    }

    if (entity.type === "camp") {
      eatBestFood();
      return;
    }

    if (entity.type === "workbench") {
      setMessage("Tezgah yakininda oldugun icin gelismis craft acildi.");
      renderCrafting();
      return;
    }

    if (entity.type === "market") {
      if (state.inventory.plank >= 2) {
        consumeItem("plank", 2);
        const bonus = state.role === "producer" ? roles.producer.bonuses.marketBonus : 1;
        addItem("coin", Math.round(18 * bonus));
        setMessage("Tahtalari sattin ve para kazandin.");
      } else {
        setMessage("Takas icin 2 plank getirirsen coin kazanirsin.");
      }
      return;
    }

    if (entity.type === "plot") {
      handlePlotInteraction(entity);
    }
  }

  function farmAction() {
    const plot = getFocusEntity();
    if (plot && plot.type === "plot") {
      handlePlotInteraction(plot);
      return;
    }

    const nearbyPlot = getNearbyEntity((entity) => entity.type === "plot");
    if (!nearbyPlot) {
      setMessage("Yakinda tarla parseli yok.");
      return;
    }
    handlePlotInteraction(nearbyPlot);
  }

  function canCraft(recipe) {
    return Object.entries(recipe.needs).every(([item, amount]) => (state.inventory[item] || 0) >= amount);
  }

  function isNearStation(station) {
    if (station === "camp") return !!getNearbyEntity((entity) => entity.type === "camp");
    if (station === "workbench") return !!getNearbyEntity((entity) => entity.type === "workbench");
    return true;
  }

  function checkQuests() {
    quests.forEach((quest) => {
      if (!state.completedQuests.has(quest.id) && quest.isDone(state)) {
        state.completedQuests.add(quest.id);
        Object.entries(quest.reward).forEach(([item, amount]) => addItem(item, amount));
        setMessage(`${quest.title} gorevi tamamlandi. Odul kazanildi.`);
      }
    });
  }

  function craft(recipe) {
    if (!isNearStation(recipe.station)) {
      setMessage(recipe.station === "workbench" ? "Bu craft icin tezgaha git." : "Bu craft icin kampa don.");
      return;
    }
    if (!canCraft(recipe)) {
      setMessage("Yeterli malzeme yok.");
      return;
    }

    Object.entries(recipe.needs).forEach(([item, amount]) => consumeItem(item, amount));
    Object.entries(recipe.gives).forEach(([item, amount]) => addItem(item, amount));

    if (state.role === "producer" && Math.random() < roles.producer.bonuses.craftRefundChance) {
      const [firstNeed] = Object.entries(recipe.needs);
      if (firstNeed) addItem(firstNeed[0], 1);
      setMessage(`${recipe.label} craft edildi. Uretici bonusuyla biraz malzeme geri kazandin.`);
    } else {
      setMessage(`${recipe.label} craft edildi.`);
    }

    checkQuests();
    renderAllUI();
  }

  function renderCrafting() {
    ui.craftingList.innerHTML = "";
    recipes.forEach((recipe) => {
      const button = document.createElement("button");
      button.className = "craft-btn";
      button.disabled = !canCraft(recipe);
      const needs = Object.entries(recipe.needs)
        .map(([item, amount]) => `${amount} ${translateItem(item)}`)
        .join(", ");
      button.innerHTML = `<strong>${recipe.label}</strong><br /><small>${recipe.description}</small><br /><small>Gerekli: ${needs}</small>`;
      button.addEventListener("click", () => craft(recipe));
      ui.craftingList.appendChild(button);
    });
  }

  function renderInventory() {
    ui.inventoryList.innerHTML = "";
    Object.entries(state.inventory).forEach(([item, amount]) => {
      if (amount <= 0) return;
      const row = document.createElement("div");
      row.className = "list-row";
      row.innerHTML = `<span>${translateItem(item)}</span><strong>${amount}</strong>`;
      ui.inventoryList.appendChild(row);
    });
  }

  function renderQuests() {
    ui.questList.innerHTML = "";
    quests.forEach((quest) => {
      const done = state.completedQuests.has(quest.id);
      const current = !done && quest.isDone(state);
      const row = document.createElement("div");
      row.className = `list-row quest-item ${done ? "done" : ""} ${current ? "current" : ""}`;
      row.innerHTML = `<div class="list-copy"><strong>${quest.title}</strong><br /><small>${quest.text}</small></div><span>${done ? "Tamam" : current ? "Teslim Hazir" : "Suruyor"}</span>`;
      ui.questList.appendChild(row);
    });
  }

  function renderRoles() {
    ui.roleButtons.innerHTML = "";
    Object.entries(roles).forEach(([id, role]) => {
      const button = document.createElement("button");
      button.className = `role-btn ${state.role === id ? "active" : ""}`;
      button.innerHTML = `<strong>${role.label}</strong><br /><small>${role.description}</small>`;
      button.addEventListener("click", () => {
        state.role = id;
        ui.roleLabel.textContent = role.label;
        ui.roleDescription.textContent = role.description;
        renderRoles();
        setMessage(`${role.label} secildi. Maceraya hazirsin.`);
      });
      ui.roleButtons.appendChild(button);
    });

    if (!state.role) {
      ui.roleDescription.textContent = "Her rol farkli bonuslar getirir.";
    }
  }

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(640, Math.floor(canvas.clientWidth * dpr));
    const height = Math.max(360, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width === width && canvas.height === height) return;
    canvas.width = width;
    canvas.height = height;
  }

  function updatePointerLockHint() {
    const locked = document.pointerLockElement === canvas;
    ui.pointerLockHint.classList.toggle("hidden", locked);
    ui.pointerLockHint.textContent = state.role
      ? "Oyuna tikla, mouse ile bak ve daha akici kontrol et"
      : "Rolunu sec, sonra oyuna tiklayip mouse kontrolunu ac";
  }

  function saveGame() {
    try {
      const payload = {
        role: state.role,
        day: state.day,
        timeMinutes: state.timeMinutes,
        message: state.message,
        inventory: state.inventory,
        stats: state.stats,
        completedQuests: Array.from(state.completedQuests),
        player: {
          x: state.player.x,
          y: state.player.y,
          angle: state.player.angle,
          pitch: state.player.pitch,
          health: state.player.health,
          energy: state.player.energy,
        },
        entities: entities,
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    } catch (error) {
      console.warn("Kayit yapilamadi", error);
    }
  }

  function loadGame() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const save = JSON.parse(raw);
      state.role = save.role || null;
      state.day = save.day || 1;
      state.timeMinutes = save.timeMinutes || 6 * 60;
      state.message = save.message || state.message;
      state.inventory = { ...state.inventory, ...(save.inventory || {}) };
      state.stats = { ...state.stats, ...(save.stats || {}) };
      state.completedQuests = new Set(save.completedQuests || []);
      state.player = {
        ...state.player,
        ...(save.player || {}),
        vx: 0,
        vy: 0,
        vz: 0,
        z: 0,
        grounded: true,
        bob: 0,
        speed: 0,
      };

      if (Array.isArray(save.entities) && save.entities.length > 0) {
        entities.length = 0;
        save.entities.forEach((entity) => entities.push(entity));
      }
    } catch (error) {
      console.warn("Kayit yuklenemedi", error);
    }
  }

  function renderAllUI() {
    renderRoles();
    renderCrafting();
    renderInventory();
    renderQuests();
    ui.roleLabel.textContent = state.role ? roles[state.role].label : "Secilmedi";
    ui.dayLabel.textContent = String(state.day);
    const hours = Math.floor(state.timeMinutes / 60)
      .toString()
      .padStart(2, "0");
    const minutes = Math.floor(state.timeMinutes % 60)
      .toString()
      .padStart(2, "0");
    ui.timeLabel.textContent = `${hours}:${minutes}`;
    ui.healthLabel.textContent = String(Math.floor(state.player.health));
    ui.energyLabel.textContent = String(Math.floor(state.player.energy));
    ui.messageLog.textContent = state.message;
    updatePointerLockHint();
  }

  function updateClock(dt) {
    state.timeMinutes += dt * 16;
    if (state.timeMinutes >= 24 * 60) {
      state.timeMinutes -= 24 * 60;
      state.day += 1;
      setMessage("Yeni gun dogdu. Tarlalari ve kampi kontrol et.");
    }

    const growRate = state.role === "farmer" ? roles.farmer.bonuses.cropGrowRate : 1;
    entities.forEach((entity) => {
      if (entity.type === "plot" && entity.planted) {
        entity.growth = Math.min(100, entity.growth + dt * 4.5 * growRate);
      }

      if (entity.type === "animal" && !entity.removed) {
        entity.roamAngle += (Math.random() - 0.5) * 0.8 * dt;
        const nextX = entity.x + Math.cos(entity.roamAngle) * 0.45 * dt;
        const nextY = entity.y + Math.sin(entity.roamAngle) * 0.45 * dt;
        if (!isWall(nextX, nextY)) {
          entity.x = nextX;
          entity.y = nextY;
        }
      }
    });
  }

  function respawnResources() {
    if (entities.filter((e) => !e.removed && e.type === "tree").length < 6) {
      addEntity({
        type: "tree",
        label: "Agac",
        x: 14 + Math.random() * 40,
        y: 8 + Math.random() * 18,
        color: "#3ca35b",
        resource: "wood",
        amount: 5,
      });
    }
    if (entities.filter((e) => !e.removed && e.type === "animal").length < 4) {
      addEntity({
        type: "animal",
        label: "Geyik",
        x: 25 + Math.random() * 28,
        y: 42 + Math.random() * 10,
        color: "#d7aa74",
        hp: 3,
        roamAngle: Math.random() * Math.PI * 2,
      });
    }
    if (entities.filter((e) => !e.removed && e.type === "fiber").length < 4) {
      addEntity({
        type: "fiber",
        label: "Yabani Lif",
        x: 7 + Math.random() * 52,
        y: 10 + Math.random() * 22,
        color: "#c8ef91",
        resource: "fiber",
        amount: 3,
      });
    }
    if (entities.filter((e) => !e.removed && e.type === "stone").length < 4) {
      addEntity({
        type: "stone",
        label: "Tas Damari",
        x: 9 + Math.random() * 46,
        y: 18 + Math.random() * 20,
        color: "#9ca5aa",
        resource: "stone",
        amount: 4,
      });
    }
    if (entities.filter((e) => !e.removed && e.type === "berry").length < 3) {
      addEntity({
        type: "berry",
        label: "Meyve Cilisi",
        x: 16 + Math.random() * 28,
        y: 28 + Math.random() * 14,
        color: "#d7496d",
        resource: "berry",
        amount: 4,
      });
    }
  }

  function seedWorldEntities() {
    const trees = [
      [15.5, 8.4], [18.2, 12.4], [21.4, 9.8], [13.5, 17.4], [24.2, 18.8], [30.5, 15.8],
      [34.5, 12.2], [27.4, 20.8], [19.6, 21.2], [41.5, 11.5], [45.2, 17.3], [50.1, 12.5],
    ];
    trees.forEach(([x, y]) => addEntity({ type: "tree", label: "Agac", x, y, color: "#3ca35b", resource: "wood", amount: 5 }));

    const stones = [
      [9.5, 18.3], [11.3, 21.2], [22.5, 24.2], [28.5, 31.5], [14.8, 34.2], [39.4, 32.4],
      [47.4, 36.2], [52.2, 29.6], [44.8, 24.5],
    ];
    stones.forEach(([x, y]) => addEntity({ type: "stone", label: "Tas Damari", x, y, color: "#9ca5aa", resource: "stone", amount: 4 }));

    const fibers = [
      [7.5, 12.2], [6.4, 14.6], [12.3, 16.2], [16.5, 27.8], [20.4, 31.2], [33.1, 27.6],
      [37.8, 18.4], [49.1, 16.6], [54.5, 20.3], [58.2, 24.8],
    ];
    fibers.forEach(([x, y]) => addEntity({ type: "fiber", label: "Yabani Lif", x, y, color: "#c8ef91", resource: "fiber", amount: 3 }));

    const berries = [
      [17.1, 29.8], [18.3, 33.1], [23.8, 36.1], [30.6, 37.8], [34.2, 34.6], [41.6, 39.4],
    ];
    berries.forEach(([x, y]) => addEntity({ type: "berry", label: "Meyve Cilisi", x, y, color: "#d7496d", resource: "berry", amount: 4 }));

    const plots = [
      [39.5, 45.5], [41.5, 45.5], [43.5, 45.5], [45.5, 45.5], [39.5, 47.5], [41.5, 47.5],
      [43.5, 47.5], [45.5, 47.5],
    ];
    plots.forEach(([x, y]) => addEntity({ type: "plot", label: "Tarla Parseli", x, y, color: "#8c5d34", planted: false, growth: 0 }));

    const animals = [
      [26.5, 43.5], [29.2, 46.4], [33.4, 49.8], [48.8, 49.5], [50.5, 45.2], [53.8, 48.2],
    ];
    animals.forEach(([x, y]) => addEntity({ type: "animal", label: "Geyik", x, y, color: "#d7aa74", hp: 3, roamAngle: Math.random() * Math.PI * 2 }));
  }

  let lastTime = performance.now();
  let resourceTimer = 0;
  let saveTimer = 0;
  let uiTimer = 0;

  function loop(now) {
    const dt = Math.min(0.033, (now - lastTime) / 1000);
    lastTime = now;
    resizeCanvas();
    updatePlayer(dt);
    updateClock(dt);
    checkQuests();
    updateInteractionPrompt();
    resourceTimer += dt;
    saveTimer += dt;
    uiTimer += dt;
    if (resourceTimer > 14) {
      resourceTimer = 0;
      respawnResources();
    }
    if (saveTimer > 8) {
      saveTimer = 0;
      saveGame();
    }
    renderWorld();
    renderMinimap();
    if (uiTimer > 0.15) {
      uiTimer = 0;
      renderAllUI();
    }
    requestAnimationFrame(loop);
  }

  window.addEventListener("keydown", (event) => {
    if (["Space", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.code)) {
      event.preventDefault();
    }
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    keys.add(key);
    if (key === "e") interact();
    if (key === "f") farmAction();
    if (event.code === "Space") jump();
  });

  window.addEventListener("keyup", (event) => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    keys.delete(key);
  });

  canvas.addEventListener("click", () => {
    if (document.pointerLockElement !== canvas) {
      canvas.requestPointerLock?.();
    }
  });

  ui.pointerLockHint.addEventListener("click", () => {
    canvas.requestPointerLock?.();
  });

  document.addEventListener("pointerlockchange", () => {
    updatePointerLockHint();
  });

  document.addEventListener("mousemove", (event) => {
    if (document.pointerLockElement !== canvas) return;
    state.player.angle += event.movementX * MOUSE_SENSITIVITY;
    state.player.pitch += event.movementY * 0.0016;
    state.player.pitch = clamp(state.player.pitch, -0.32, 0.25);
  });

  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("beforeunload", saveGame);

  makeWorld();
  scatterEntities();
  seedWorldEntities();
  loadGame();
  resizeCanvas();
  renderAllUI();
  renderWorld();
  renderMinimap();
  requestAnimationFrame(loop);
})();
