const RARITY_BASE = {
  1: [["Common", 0.7], ["Uncommon", 0.25], ["Rare", 0.05]],
  2: [["Common", 0.5], ["Uncommon", 0.35], ["Rare", 0.12], ["Epic", 0.03]],
  3: [["Common", 0.3], ["Uncommon", 0.4], ["Rare", 0.22], ["Epic", 0.075], ["Legendary", 0.005]],
  4: [["Common", 0.15], ["Uncommon", 0.38], ["Rare", 0.32], ["Epic", 0.135], ["Legendary", 0.015]],
  5: [["Common", 0.05], ["Uncommon", 0.32], ["Rare", 0.4], ["Epic", 0.195], ["Legendary", 0.035]],
  6: [["Common", 0.03], ["Uncommon", 0.28], ["Rare", 0.42], ["Epic", 0.22], ["Legendary", 0.05]],
  7: [["Uncommon", 0.26], ["Rare", 0.42], ["Epic", 0.255], ["Legendary", 0.065]],
  8: [["Uncommon", 0.22], ["Rare", 0.42], ["Epic", 0.28], ["Legendary", 0.08]],
  9: [["Uncommon", 0.18], ["Rare", 0.42], ["Epic", 0.3], ["Legendary", 0.1]],
  10: [["Uncommon", 0.15], ["Rare", 0.4], ["Epic", 0.33], ["Legendary", 0.12]],
};

const RARITIES = ["Common", "Uncommon", "Rare", "Epic", "Legendary", "Secret"];
const BLIGHT_10 = 1.7;
const PLUS_STEP = 0.08;
const PERCENT_PLUS_STEP = 0.02;
const MAX_PLUS = 10;
const RATE_STATS = { goldRate: true, xpRate: true, lootRate: true, masteryRate: true, jackpotChance: true };
const STAT_TUNING = { dodgeChance: 0.8, critChance: 0.6 };
const ITEM_PLUS = {
  ApprenticeRobe: { maxHpFlat: 2 },
  EmberweaveRobe: { maxHpFlat: 1.5 },
  JustARock: { maxHpFlat: 0.5666666666666667, defenseFlat: 0.45 },
  ColossusHeart: { maxHpFlat: 0.625, healthPercent: 0.8 },
};
let rolled = [];
let rollKey = "";

const catalog = window.CATALOG;
const byId = new Map(catalog.items.map((item) => [item.id, item]));
const affixByName = new Map(catalog.affixes.map((affix) => [affix.name, affix]));

function num(id) {
  const value = Number(document.getElementById(id).value);
  return Number.isFinite(value) ? value : 0;
}

function lootMult() {
  const loot = Math.min(100, Math.max(0, num("loot")));
  return 1 + loot / 100;
}

function capChance(chance) {
  return Math.min(1, Math.max(0, chance) * lootMult());
}

function fmt(p) {
  if (!(p > 0)) return "0";
  if (p >= 1) return "100%";
  const pct = p * 100;
  const digits = pct < 0.01 ? 4 : pct < 1 ? 3 : 2;
  const one = 1 / p;
  const oneText = one >= 100 ? String(Math.round(one)) : one.toFixed(1);
  return pct.toFixed(digits) + "% (1 in " + oneText + ")";
}

function roundStat(stat, value) {
  if (catalog.percent[stat]) return Math.floor(value * 200 + 0.5) / 200;
  return Math.floor(value + 0.5);
}

function clampCap(stat, value, useCap) {
  if (!useCap) return value;
  const cap = catalog.pieceCaps[stat];
  if (typeof cap !== "number") return value;
  return Math.max(-cap, Math.min(cap, value));
}

function tormentScale(n) {
  n = Math.max(0, Math.floor(n));
  if (n <= 0) return 1;
  return Math.min(0.3, 0.03 * n) + 1;
}

function dungeonScale(item, land, stat) {
  const gear = catalog.dungeon;
  const index = Math.min(10, Math.max(1, Math.floor(land))) - 1;
  let scale = gear.ArmorScale[index];
  if (item.gearKind === "Weapon") {
    const main = item.weaponType === "Staff" || item.weaponType === "Lute" ? "magicFlat" : "attackFlat";
    scale = stat === main ? gear.WeaponScale[index] : gear.ExtraScale[index];
  }
  return scale * (gear.DifficultyScale[item.dungeonTier] || 1);
}

function plusScale(stat, plus, item) {
  const level = Math.min(MAX_PLUS, Math.max(0, Math.floor(plus)));
  const step = catalog.percent[stat] && !RATE_STATS[stat] ? PERCENT_PLUS_STEP : PLUS_STEP;
  const extra = (ITEM_PLUS[item.id] && ITEM_PLUS[item.id][stat]) || 1;
  return (STAT_TUNING[stat] || 1) * (1 + step * level) * extra;
}

function applyPlus(stat, value, plus, item) {
  return roundStat(stat, value * plusScale(stat, plus, item));
}

function statRange(item, stat, base, rarity, land, torment, plus) {
  const power = catalog.rarityPower[rarity] || 1;
  const steps = [];
  if (item.dungeon) {
    const useLand = torment > 0 ? 10 : land;
    const scale = dungeonScale(item, useLand, stat);
    steps.push((v) => v * scale, (v) => roundStat(stat, v), (v) => clampCap(stat, v, true));
    if (torment > 0) {
      const t = tormentScale(torment);
      steps.push((v) => v * t, (v) => roundStat(stat, v), (v) => clampCap(stat, v, true));
    }
  } else if (torment > 0) {
    const t = tormentScale(torment);
    steps.push(
      (v) => roundStat(stat, v),
      (v) => roundStat(stat, v * BLIGHT_10),
      (v) => clampCap(stat, v, true),
      (v) => roundStat(stat, v * t),
      (v) => clampCap(stat, v, true)
    );
  } else {
    steps.push((v) => roundStat(stat, v));
  }
  function apply(jitter) {
    let value = base * power * jitter;
    for (const step of steps) value = step(value);
    return applyPlus(stat, value, plus, item);
  }
  return [apply(0.85), apply(1.15)];
}

function suffixLandScale(item, land) {
  if (!item.dungeon) return 1;
  const gear = catalog.dungeon;
  const index = Math.min(10, Math.max(1, Math.floor(land))) - 1;
  const scale = item.gearKind === "Weapon" ? gear.ExtraScale[index] : gear.ArmorScale[index];
  return scale * (gear.DifficultyScale[item.dungeonTier] || 1);
}

function suffixRange(affix, item, rarity, land, torment, plus) {
  const power = catalog.rarityPower[rarity] || 1;
  const tier = Math.max(1, item.tier || 1);
  const factor = 0.8 + power * 0.2;
  const useLand = item.dungeon && torment > 0 ? 10 : land;
  const scale = (affix.flat ? tier : 1) * factor * suffixLandScale(item, useLand);
  let low = roundStat(affix.stat, affix.min * scale);
  let high = roundStat(affix.stat, affix.max * scale);
  if (!item.dungeon && torment > 0) {
    low = roundStat(affix.stat, low * BLIGHT_10);
    high = roundStat(affix.stat, high * BLIGHT_10);
  }
  if (torment > 0) {
    const t = tormentScale(torment);
    low = roundStat(affix.stat, low * t);
    high = roundStat(affix.stat, high * t);
  }
  return [applyPlus(affix.stat, low, plus, item), applyPlus(affix.stat, high, plus, item)];
}

function formatSpan(stat, low, high) {
  if (low === high) return formatStat(stat, low);
  return formatStat(stat, low) + "–" + formatStat(stat, high);
}

function formatStat(stat, value) {
  if (catalog.percent[stat]) return (value * 100).toFixed(1).replace(/\.0$/, "") + "%";
  return String(value);
}

function rarityTable(tier, difficulty) {
  const rows = RARITY_BASE[Math.min(10, Math.max(1, tier))] || RARITY_BASE[1];
  const order = {};
  for (const row of catalog.rarities) order[row.name] = row.order;
  const extra = Math.max(0, difficulty - 1);
  let sum = 0;
  const scaled = rows.map(([name, weight]) => {
    const next = Math.max(0, weight * (1 + extra * catalog.difficultyRarityBoost * ((order[name] || 1) - 2)));
    sum += next;
    return [name, next];
  });
  return scaled.map(([name, weight]) => [name, weight / (sum || 1)]);
}

function dungeonPool(item) {
  const armor = [];
  const weapons = [];
  const byClass = {};
  for (const other of catalog.items) {
    if (other.dungeon !== item.dungeon || other.dungeonTier !== item.dungeonTier) continue;
    if (other.gearKind === "Weapon") {
      weapons.push(other);
      byClass[other.class] = other;
    } else {
      armor.push(other);
    }
  }
  weapons.sort((a, b) => a.id < b.id ? -1 : 1);
  return { armor, weapons, byClass };
}

function storyPools(act, cls) {
  const all = [];
  const area = [];
  const own = [];
  for (const item of catalog.items) {
    if (act >= 6) {
      if (!(item.saga && !item.boss && !item.mythic)) continue;
      all.push(item);
      if (item.area === act - 5 || item.area === 0) area.push(item);
      if (cls && item.class === cls) own.push(item);
    } else if (!item.boss && !item.starter && !item.mythic && item.tier <= act && item.tier >= act - 1) {
      all.push(item);
      if (cls && item.class === cls) own.push(item);
    }
  }
  return { all, area, own };
}

function storyChance(item, act, cls) {
  const pools = storyPools(act, cls);
  if (act >= 6) {
    if (!item.saga || item.boss || item.mythic) return 0;
    let p = 0;
    if (pools.own.length && cls && item.class === cls) p += 0.4 / pools.own.length;
    if (pools.area.length) {
      const areaSpan = pools.own.length ? 0.4 : 0.8;
      const anySpan = pools.own.length ? 0.2 : 0.2;
      if (item.area === act - 5 || item.area === 0) p += areaSpan / pools.area.length;
      p += anySpan / pools.all.length;
    } else if (pools.all.length) {
      p += (pools.own.length ? 0.6 : 1) / pools.all.length;
    }
    return p;
  }
  const inAll = pools.all.some((other) => other.id === item.id);
  if (!inAll) return 0;
  if (!pools.own.length) return 1 / pools.all.length;
  const inOwn = item.class === cls;
  return (inOwn ? 0.5 / pools.own.length : 0) + 0.5 / pools.all.length;
}

function uniqueChance(item, act, source, bossOn) {
  const uniques = catalog.items.filter((other) => other.unique && typeof other.unique === "object");
  const boss = item.unique && item.unique.boss;
  const bossPool = bossOn && boss ? uniques.filter((other) => other.unique.boss === boss) : [];
  const actPool = uniques.filter((other) => other.unique.act === act);
  bossPool.sort((a, b) => a.id < b.id ? -1 : 1);
  const mult = Math.max(0, act - 1) * 0.2 + 1;
  const secretOwn = bossPool.length && bossPool[0].unique.secret === true;
  const ownRate = bossPool.length
    ? Math.min(1, (secretOwn ? catalog.uniqueChance.secretOwn : catalog.uniqueChance.bossOwn) * mult)
    : 0;
  const actRate = Math.min(1, (catalog.uniqueChance[source] || 0) * mult);
  let p = 0;
  if (bossPool.some((other) => other.id === item.id)) p += ownRate / bossPool.length;
  if (actPool.some((other) => other.id === item.id)) p += (1 - ownRate) * actRate / actPool.length;
  return { p, ownRate, actRate, bossPool: bossPool.length, actPool: actPool.length, mult };
}

function dropReport(item) {
  const lines = [];
  const torment = Math.max(0, Math.floor(num("torment")));
  const act = Math.min(10, Math.max(1, Math.floor(num("land"))));
  const cls = document.getElementById("class").value;
  const source = document.getElementById("source").value;
  const baseSource = catalog.dropChance[source] || 0;

  if (item.dungeon) {
    const pool = dungeonPool(item);
    const tierChance = catalog.dungeon.Chance[item.dungeonTier] || 0;
    const happen = capChance(tierChance);
    let pick = 0;
    if (item.gearKind === "Weapon") {
      const own = pool.byClass[cls];
      if (own) {
        pick = catalog.dungeon.WeaponChance * (
          (own.id === item.id ? catalog.dungeon.OwnClassWeapon : 0) +
          (1 - catalog.dungeon.OwnClassWeapon) / pool.weapons.length
        );
      } else if (pool.weapons.length) {
        pick = catalog.dungeon.WeaponChance / pool.weapons.length;
      }
    } else if (pool.armor.length) {
      const weaponShare = pool.weapons.length ? catalog.dungeon.WeaponChance : 0;
      pick = (1 - weaponShare) / pool.armor.length;
    }
    lines.push(["This piece, once a drop happens", pick, pool.armor.length + " armor, " + pool.weapons.length + " weapons in " + item.dungeon + " " + item.dungeonTier]);
    lines.push(["A gear drop on this floor", happen, "base " + fmt(tierChance) + ", then × loot"]);
    lines.push(["This piece from one clear", happen * pick, ""]);
    if (item.dungeonTier === "nightmare") {
      lines.push(["Secret upgrade", catalog.dungeon.SecretChance, "nightmare drops start Legendary, then 10% become Secret"]);
    }
    return lines;
  }

  if (item.nightmare && typeof item.nightmare === "object") {
    const pool = catalog.items.filter((other) => other.nightmare && other.nightmare.boss === item.nightmare.boss);
    const base = torment > 0 ? catalog.tormentNightmareChance : catalog.nightmareChance;
    const happen = capChance(base);
    lines.push(["Nightmare drop check", happen, torment > 0 ? "torment runs use 5%" : "normal runs use 12%"]);
    lines.push(["This piece", happen / pool.length, pool.length + (pool.length === 1 ? " piece on " : " pieces on ") + item.nightmare.boss]);
    return lines;
  }

  if (item.unique && typeof item.unique === "object") {
    const info = uniqueChance(item, act, source, true);
    lines.push(["This unique", capChance(info.p), "act " + act + " " + source + ", ×" + info.mult.toFixed(2) + " from the act"]);
    lines.push(["Then rarity", 0.25, "25% Legendary, otherwise Epic. No suffixes."]);
    return lines;
  }

  if (item.raid) {
    lines.push(["Not rolled", 0, "Bought from the " + item.raid + " raid shop."]);
    return lines;
  }

  if (item.mythic && !item.giveaway) {
    const pool = catalog.items.filter((other) => other.mythic && !other.giveaway && !other.raid);
    const base = catalog.mythicChance[Math.min(10, Math.max(1, act)) - 1] || 0;
    const happen = capChance(base);
    lines.push(["Mythic check on land " + act, happen, "base " + fmt(base)]);
    lines.push(["This piece", happen / pool.length, pool.length + " mythics share the pool"]);
    lines.push(["Then rarity", 0.2, "20% Secret, otherwise Legendary"]);
    return lines;
  }

  if (item.starter) {
    lines.push(["Starter kit", 0, "Not a drop. No suffixes."]);
    return lines;
  }
  if (item.giveaway || item.blueprint || item.promo) {
    lines.push(["Not a combat drop", 0, item.giveaway ? "Giveaway." : item.blueprint ? "Blueprint." : "Promo."]);
    return lines;
  }

  if (item.boss) {
    lines.push(["Not in the story roller", 0, "Tagged " + item.boss + ", so the act roll skips it."]);
    return lines;
  }

  const pick = storyChance(item, act, cls);
  const happen = capChance(baseSource);
  const where = act >= 6 ? "saga land " + act : "acts " + Math.max(1, act - 1) + "–" + act;
  lines.push(["Gear drop from a " + source, happen, "base " + fmt(baseSource)]);
  lines.push(["This piece, once gear drops", pick, where + (cls ? ", class " + cls : ", no class bias")]);
  lines.push(["This piece from one " + source, happen * pick, ""]);
  const weights = rarityTable(act, 1);
  lines.push(["Rarity on that land", 0, weights.map(([name, p]) => name + " " + fmt(p)).join(", ")]);
  return lines;
}

function legalAffixes(kind) {
  const weights = catalog.weights[kind] || {};
  return catalog.affixes.filter((affix) => (weights[affix.group] || 0) > 0);
}

function suffixCount(item, rarity) {
  if (item.unique || item.starter) return 0;
  return catalog.affixCount[rarity] || 0;
}

function pickAffix(pool, kind, used) {
  const weights = catalog.weights[kind] || {};
  let sum = 0;
  const options = [];
  for (const affix of pool) {
    if (used[affix.stat]) continue;
    const weight = weights[affix.group] || 0;
    if (weight > 0) {
      options.push([affix, weight]);
      sum += weight;
    }
  }
  if (sum <= 0) return null;
  let roll = Math.random() * sum;
  for (const [affix, weight] of options) {
    roll -= weight;
    if (roll <= 0) return affix;
  }
  return options[options.length - 1][0];
}

function rollSuffixes(item, rarity, mode, wanted) {
  const n = suffixCount(item, rarity);
  const pool = legalAffixes(item.gearKind);
  const used = {};
  const locked = [];
  if (mode !== "random") {
    for (const name of wanted) {
      const affix = affixByName.get(name);
      const weight = (catalog.weights[item.gearKind] || {})[affix && affix.group] || 0;
      if (!affix || used[affix.stat] || weight <= 0) continue;
      if (locked.length >= n) break;
      locked.push(affix);
      used[affix.stat] = true;
    }
  }
  if (mode === "exact") return locked;
  const picked = locked.slice();
  while (picked.length < n) {
    const affix = pickAffix(pool, item.gearKind, used);
    if (!affix) break;
    picked.push(affix);
    used[affix.stat] = true;
  }
  return picked;
}

function currentRollKey(item, rarity, mode, wanted) {
  return [item.id, rarity, mode, wanted.slice().sort().join(",")].join("|");
}

function ensureRoll(item, rarity, mode, wanted, force) {
  const key = currentRollKey(item, rarity, mode, wanted);
  if (!force && key === rollKey) return;
  rollKey = key;
  rolled = rollSuffixes(item, rarity, mode, wanted);
}

function suffixOdds(item, rarity, mode, wanted) {
  const kind = item.gearKind;
  const weights = catalog.weights[kind] || {};
  const pool = legalAffixes(kind);
  const n = suffixCount(item, rarity);
  const appear = {};
  let hit = 0;
  let total = 0;

  function finish(prob, names) {
    total += prob;
    if (mode === "exact") {
      if (names.length === wanted.length && wanted.every((name) => names.includes(name))) hit += prob;
    } else if (mode === "atleast") {
      if (wanted.every((name) => names.includes(name))) hit += prob;
    } else {
      for (const name of names) appear[name] = (appear[name] || 0) + prob;
    }
  }

  function walk(used, names, prob, left) {
    if (left === 0) {
      finish(prob, names);
      return;
    }
    let sum = 0;
    const options = [];
    for (const affix of pool) {
      if (used[affix.stat]) continue;
      const weight = weights[affix.group] || 0;
      if (weight > 0) {
        options.push([affix, weight]);
        sum += weight;
      }
    }
    if (sum <= 0) {
      finish(prob, names);
      return;
    }
    for (const [affix, weight] of options) {
      used[affix.stat] = true;
      names.push(affix.name);
      walk(used, names, prob * weight / sum, left - 1);
      names.pop();
      used[affix.stat] = false;
    }
  }

  if (n <= 0) {
    return { n, total: 1, hit: mode === "random" ? {} : wanted.length ? 0 : 1, appear: {}, pool };
  }
  walk({}, [], 1, n);
  if (mode === "random") {
    for (const name of Object.keys(appear)) appear[name] /= total || 1;
  }
  return { n, total, hit: hit / (total || 1), appear, pool };
}

function selectedItem() {
  return byId.get(document.getElementById("list").value);
}

function selectedAffixes() {
  return [...document.querySelectorAll("#affixes input:checked")].map((box) => box.value);
}

function drawSprite(item) {
  const canvas = document.getElementById("sprite");
  const ctx = canvas.getContext("2d");
  const sprite = item.sprite;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!sprite || !sprite.rows) return;
  const rows = sprite.rows;
  const height = rows.length;
  const width = rows[0].length;
  canvas.width = width;
  canvas.height = height;
  const image = ctx.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ch = rows[y][x];
      const color = sprite.palette[ch];
      if (!color || ch === "." || ch === " ") continue;
      const i = (y * width + x) * 4;
      image.data[i] = parseInt(color.slice(1, 3), 16);
      image.data[i + 1] = parseInt(color.slice(3, 5), 16);
      image.data[i + 2] = parseInt(color.slice(5, 7), 16);
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
}

function fillAffixes(item) {
  const box = document.getElementById("affixes");
  const previous = new Set(selectedAffixes());
  const weights = catalog.weights[item.gearKind] || {};
  box.innerHTML = "";
  for (const affix of catalog.affixes) {
    const weight = weights[affix.group] || 0;
    const label = document.createElement("label");
    label.className = weight > 0 ? "" : "zero";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = affix.name;
    input.disabled = weight <= 0;
    input.checked = previous.has(affix.name) && weight > 0;
    label.append(input, " " + affix.name);
    box.append(label);
  }
}

function renderList() {
  const list = document.getElementById("list");
  const q = document.getElementById("search").value.trim().toLowerCase();
  const current = list.value;
  list.innerHTML = "";
  for (const item of catalog.items) {
    if (q && !item.name.toLowerCase().includes(q) && !item.id.toLowerCase().includes(q)) continue;
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name;
    list.append(option);
  }
  if ([...list.options].some((option) => option.value === current)) {
    list.value = current;
  } else if (list.options.length) {
    list.selectedIndex = 0;
  }
}

function defaultRarity(item) {
  if (item.dungeon) return catalog.dungeon.Rarity[item.dungeonTier] || item.rarity;
  if (item.nightmare) return "Secret";
  if (item.mythic && !item.giveaway && !item.raid) return "Legendary";
  if (item.unique) return "Epic";
  return item.rarity;
}

function render() {
  const item = selectedItem();
  if (!item) return;
  drawSprite(item);
  const torment = Math.max(0, Math.floor(num("torment")));
  const land = Math.min(10, Math.max(1, Math.floor(num("land"))));
  const plus = Math.min(MAX_PLUS, Math.max(0, Math.floor(num("forge"))));
  const rarity = document.getElementById("rarity").value;
  const mode = document.querySelector("input[name=mode]:checked").value;
  const wanted = selectedAffixes();
  ensureRoll(item, rarity, mode, wanted, false);
  const meta = document.getElementById("meta");
  meta.textContent = [
    item.name,
    item.rarity + " " + item.gearKind + ", tier " + item.tier,
    item.dungeon ? item.dungeon + " " + item.dungeonTier : "",
    item.class ? "class " + item.class : "",
    plus > 0 ? "forge +" + plus : "",
    torment > 0 ? "torment ×" + tormentScale(torment).toFixed(2) : "",
  ].filter(Boolean).join(" · ");

  const drop = document.getElementById("drop");
  drop.innerHTML = "";
  const table = document.createElement("table");
  for (const [label, p, note] of dropReport(item)) {
    const row = document.createElement("tr");
    row.innerHTML = "<th></th><td></td><td></td>";
    row.children[0].textContent = label;
    row.children[1].textContent = p > 0 ? fmt(p) : note && label.startsWith("Rarity") ? "" : p === 0 ? "—" : "";
    row.children[2].textContent = note || "";
    table.append(row);
  }
  drop.append(table);

  const affixBox = document.getElementById("affixes");
  affixBox.classList.toggle("locked", mode === "random");
  for (const input of affixBox.querySelectorAll("input")) {
    input.disabled = mode === "random" || input.parentElement.classList.contains("zero");
  }

  const stats = document.getElementById("stats");
  const statTable = document.createElement("table");
  statTable.className = "stats";
  const statHead = document.createElement("tr");
  for (const title of ["", "Default stat", "Suffix", "Final"]) {
    const cell = document.createElement("th");
    cell.textContent = title;
    statHead.append(cell);
  }
  statTable.append(statHead);
  const effects = item.effects || {};
  const suffixByStat = {};
  for (const affix of rolled) {
    const range = suffixRange(affix, item, rarity, land, torment, plus);
    const slot = suffixByStat[affix.stat] || { low: 0, high: 0, names: [] };
    slot.low += range[0];
    slot.high += range[1];
    slot.names.push(affix.name);
    suffixByStat[affix.stat] = slot;
  }
  const keys = [...new Set([...Object.keys(effects), ...Object.keys(suffixByStat)])].sort();
  for (const stat of keys) {
    const row = document.createElement("tr");
    const cap = catalog.pieceCaps[stat];
    let baseRange = null;
    if (effects[stat] != null) baseRange = statRange(item, stat, effects[stat], rarity, land, torment, plus);
    const extra = suffixByStat[stat];
    let finalLow;
    let finalHigh;
    if (baseRange && extra) {
      finalLow = baseRange[0] + extra.low;
      finalHigh = baseRange[1] + extra.high;
    } else if (baseRange) {
      finalLow = baseRange[0];
      finalHigh = baseRange[1];
    } else {
      finalLow = extra.low;
      finalHigh = extra.high;
    }
    const name = document.createElement("th");
    name.textContent = catalog.statLabels[stat] || stat;
    const defaultCell = document.createElement("td");
    defaultCell.textContent = baseRange ? formatSpan(stat, baseRange[0], baseRange[1]) : "—";
    const suffixCell = document.createElement("td");
    suffixCell.textContent = extra ? "+" + formatSpan(stat, extra.low, extra.high) + "  " + extra.names.join(", ") : "—";
    const finalCell = document.createElement("td");
    finalCell.textContent = formatSpan(stat, finalLow, finalHigh);
    row.append(name, defaultCell, suffixCell, finalCell);
    if (!extra && cap != null && (item.dungeon || torment > 0)) {
      const capCell = document.createElement("td");
      capCell.textContent = "cap " + formatStat(stat, cap);
      row.append(capCell);
    }
    statTable.append(row);
  }
  stats.innerHTML = "";
  const blurb = document.createElement("p");
  const rolledNames = rolled.map((affix) => affix.name);
  blurb.textContent = rolledNames.length
    ? "Suffixes on this line: " + rolledNames.join(", ") + ". Forge +" + plus + " is already in the numbers (flats +8% a level, most percents +2%)."
    : "No suffixes on this rarity. Forge +" + plus + " is already in the numbers.";
  const slots = suffixCount(item, rarity);
  const locked = mode === "random" ? 0 : Math.min(wanted.length, slots);
  document.getElementById("reroll").disabled = slots === 0 || locked >= slots;
  stats.append(blurb, statTable);

  const odds = suffixOdds(item, rarity, mode, wanted);
  const suffix = document.getElementById("suffix");
  suffix.innerHTML = "";
  const head = document.createElement("p");
  head.textContent = odds.n === 0
    ? "This rarity rolls no suffixes."
    : rarity + " rolls " + odds.n + " suffix" + (odds.n === 1 ? "" : "es") + ". Same stat cannot roll twice. A legendary power is extra and is not one of these.";
  suffix.append(head);
  if (mode === "random") {
    const rows = odds.pool
      .map((affix) => [affix.name, odds.appear[affix.name] || 0])
      .sort((a, b) => b[1] - a[1]);
    const list = document.createElement("table");
    for (const [name, p] of rows) {
      const affix = affixByName.get(name);
      const range = suffixRange(affix, item, rarity, land, torment, plus);
      const row = document.createElement("tr");
      row.innerHTML = "<th></th><td></td><td></td>";
      row.children[0].textContent = name;
      row.children[1].textContent = (catalog.statLabels[affix.stat] || affix.stat) + " +" + formatSpan(affix.stat, range[0], range[1]);
      row.children[2].textContent = fmt(p);
      list.append(row);
    }
    suffix.append(list);
  } else {
    const line = document.createElement("p");
    const shared = sharedStat(wanted);
    if (!wanted.length) line.textContent = "Check at least one suffix.";
    else if (shared) line.textContent = shared + " share a stat, so that pair cannot land together.";
    else if (mode === "exact" && wanted.length !== odds.n) line.textContent = "An exact set has to be " + odds.n + " suffixes. This is " + wanted.length + ".";
    else line.textContent = (mode === "exact" ? "Exactly " : "At least ") + wanted.join(" + ") + ": " + fmt(odds.hit);
    suffix.append(line);
    const detail = document.createElement("table");
    for (const name of wanted) {
      const affix = affixByName.get(name);
      if (!affix) continue;
      const range = suffixRange(affix, item, rarity, land, torment, plus);
      const row = document.createElement("tr");
      row.innerHTML = "<th></th><td></td>";
      row.children[0].textContent = name;
      row.children[1].textContent = (catalog.statLabels[affix.stat] || affix.stat) + " +" + formatSpan(affix.stat, range[0], range[1]);
      detail.append(row);
    }
    suffix.append(detail);
  }
}

function sharedStat(names) {
  const seen = {};
  for (const name of names) {
    const affix = catalog.affixes.find((row) => row.name === name);
    if (!affix) continue;
    if (seen[affix.stat]) return name + " and " + seen[affix.stat];
    seen[affix.stat] = name;
  }
  return "";
}

function init() {
  const rarity = document.getElementById("rarity");
  for (const name of RARITIES) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    rarity.append(option);
  }
  const cls = document.getElementById("class");
  const any = document.createElement("option");
  any.value = "";
  any.textContent = "any";
  cls.append(any);
  for (const name of catalog.classes) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    cls.append(option);
  }
  renderList();
  document.getElementById("list").selectedIndex = 0;
  const item = selectedItem();
  if (item) {
    rarity.value = defaultRarity(item);
    fillAffixes(item);
  }
  document.getElementById("search").addEventListener("input", () => {
    const before = document.getElementById("list").value;
    renderList();
    const list = document.getElementById("list");
    if (list.value !== before) {
      const next = selectedItem();
      if (next) {
        document.getElementById("rarity").value = defaultRarity(next);
        if (!next.dungeon && next.tier) {
          document.getElementById("land").value = String(Math.min(10, Math.max(1, next.tier || 1)));
        }
        fillAffixes(next);
      }
    }
    render();
  });
  document.getElementById("list").addEventListener("change", () => {
    const next = selectedItem();
    if (!next) return;
    document.getElementById("rarity").value = defaultRarity(next);
    if (!next.dungeon && next.tier) document.getElementById("land").value = String(Math.min(10, Math.max(1, next.tier || 1)));
    fillAffixes(next);
    render();
  });
  document.getElementById("reroll").addEventListener("click", () => {
    const itemNow = selectedItem();
    if (!itemNow) return;
    const modeNow = document.querySelector("input[name=mode]:checked").value;
    ensureRoll(itemNow, document.getElementById("rarity").value, modeNow, selectedAffixes(), true);
    render();
  });
  for (const id of ["torment", "loot", "forge", "rarity", "class", "land", "source"]) {
    document.getElementById(id).addEventListener("input", render);
    document.getElementById(id).addEventListener("change", render);
  }
  document.getElementById("affixes").addEventListener("change", render);
  for (const radio of document.querySelectorAll("input[name=mode]")) radio.addEventListener("change", render);
  render();
}

if (typeof document !== "undefined") init();

window.PB = { statRange, suffixRange, rollSuffixes, dropReport, suffixOdds, storyChance, fmt, tormentScale, plusScale };
