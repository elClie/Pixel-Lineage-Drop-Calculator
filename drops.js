const data = window.DROPS;
data.items.push({
  id: "__potion__",
  name: "Potion",
  category: "Reward",
  rarity: "",
  droppable: true,
  note: "The enemy potion roll. The catalog has no item with this name.",
});
data.items.sort((a, b) => a.name < b.name ? -1 : 1);
const byId = new Map(data.items.map((item) => [item.id, item]));
const enemyById = new Map(data.enemies.map((enemy) => [enemy.id, enemy]));

const enemySources = new Map();
function pushSource(id, row) {
  if (!enemySources.has(id)) enemySources.set(id, []);
  enemySources.get(id).push(row);
}
for (const enemy of data.enemies) {
  for (const drop of enemy.drops) {
    pushSource(drop.id, {
      enemy,
      chance: drop.chance,
      min: drop.min,
      max: drop.max,
    });
  }
  if (enemy.potion > 0) {
    pushSource("__potion__", {
      enemy,
      chance: enemy.potion,
      min: enemy.potionMin,
      max: enemy.potionMax,
    });
  }
}

function num(id) {
  const value = Number(document.getElementById(id).value);
  return Number.isFinite(value) ? value : 0;
}

function lootMult() {
  return 1 + Math.min(100, Math.max(0, num("loot"))) / 100;
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

function source() {
  return document.getElementById("source").value;
}

const storyPoolCache = new Map();
function storyPools(act, cls) {
  const key = act + "|" + (cls || "");
  const cached = storyPoolCache.get(key);
  if (cached) return cached;
  const all = [];
  const area = [];
  const own = [];
  for (const item of data.items) {
    if (!item.gearKind) continue;
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
  const pools = { all, area, own };
  storyPoolCache.set(key, pools);
  return pools;
}

function difficultyIndex() {
  const name = document.getElementById("difficulty").value;
  const index = data.difficulties.indexOf(name);
  return index < 0 ? 1 : index + 1;
}

function className() {
  return document.getElementById("class").value;
}

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
const RARITY_ORDER = { Any: 0, Common: 1, Uncommon: 2, Rare: 3, Epic: 4, Legendary: 5, Secret: 6 };
const RARITY_BOOST = 0.12;

function rarityTable(tier) {
  const rows = RARITY_BASE[Math.min(10, Math.max(1, tier))] || RARITY_BASE[1];
  const extra = Math.max(0, difficultyIndex() - 1);
  let sum = 0;
  const scaled = rows.map(([name, weight]) => {
    const next = Math.max(0, weight * (1 + extra * RARITY_BOOST * ((RARITY_ORDER[name] || 1) - 2)));
    sum += next;
    return [name, next];
  });
  return scaled.map(([name, weight]) => [name, weight / (sum || 1)]);
}

function addSplit(rows, row, weights) {
  const live = weights.filter(([, weight]) => weight > 0);
  if (live.length > 1) {
    rows.push({
      chance: row.chance,
      rarity: "Any",
      label: row.label,
      detail: row.detail,
    });
  }
  for (const [name, weight] of live) {
    rows.push({
      chance: row.chance * weight,
      rarity: name,
      label: row.label,
      detail: row.detail,
    });
  }
}
function gearHappen(kind) {
  if (kind === "miniboss") return 1 - (1 - data.dropChance.elite) ** 2;
  if (kind === "secret") return data.dropChance.boss;
  return data.dropChance[kind] || 0;
}

function enemyRank(enemy) {
  if (enemy.secret) return "secret";
  if (enemy.boss) return "boss";
  if (enemy.miniBoss) return "miniboss";
  return "fight";
}

function enemyVisible(enemy) {
  const kind = source();
  if (kind === "any" || kind === "elite") return enemyRank(enemy) === "fight" || (kind === "any");
  if (kind === "fight") return enemyRank(enemy) === "fight";
  if (kind === "miniboss") return enemy.miniBoss === true;
  if (kind === "boss") return enemy.boss === true;
  if (kind === "secret") return enemy.secret === true;
  return false;
}

function enemyLabel(enemy) {
  const bits = [enemy.name + " (level " + enemy.level + ")"];
  const rank = enemyRank(enemy);
  if (rank !== "fight") bits.push(rank);
  if (enemy.saga) bits.push("saga");
  if (enemy.zone) bits.push(enemy.zone);
  if (enemy.halloween) bits.push("halloween");
  return bits.join(", ");
}

function qty(min, max) {
  return min === max ? "x" + min : "x" + min + "–" + max;
}

function storyChance(item, act, cls) {
  if (!item.gearKind || item.boss || item.starter || item.mythic) return 0;
  const pools = storyPools(act, cls);
  if (act >= 6) {
    if (!item.saga) return 0;
    let p = 0;
    if (pools.own.length && cls && item.class === cls) p += 0.4 / pools.own.length;
    if (pools.area.length) {
      const areaSpan = pools.own.length ? 0.4 : 0.8;
      if (item.area === act - 5 || item.area === 0) p += areaSpan / pools.area.length;
      p += 0.2 / pools.all.length;
    } else if (pools.all.length) {
      p += (pools.own.length ? 0.6 : 1) / pools.all.length;
    }
    return p;
  }
  if (!pools.all.some((other) => other.id === item.id)) return 0;
  if (!pools.own.length) return 1 / pools.all.length;
  const inOwn = item.class === cls;
  return (inOwn ? 0.5 / pools.own.length : 0) + 0.5 / pools.all.length;
}

function dungeonPool(item) {
  const armor = [];
  const weapons = [];
  const byClass = {};
  for (const other of data.items) {
    if (other.dungeon !== item.dungeon || other.dungeonTier !== item.dungeonTier) continue;
    if (other.gearKind === "Weapon") {
      weapons.push(other);
      byClass[other.class] = other;
    } else armor.push(other);
  }
  return { armor, weapons, byClass };
}

function rowsFor(item) {
  const rows = [];
  const kind = source();
  const cls = className();
  const diff = difficultyIndex();
  const mult = 1 + (diff - 1) * 0.2;
  const kinds = kind === "any" ? ["fight", "elite", "miniboss", "boss", "treasure"] : [kind];
  const lands = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  for (const hit of enemySources.get(item.id) || []) {
    if (!enemyVisible(hit.enemy) && kind !== "elite") continue;
    if (kind === "elite" && enemyRank(hit.enemy) !== "fight") continue;
    rows.push({
      chance: capChance(hit.chance),
      rarity: item.rarity || "",
      label: enemyLabel(hit.enemy),
      detail: qty(hit.min, hit.max) + ". This chance is on the kill. The rarity is fixed.",
    });
  }

  if (item.dungeon) {
    const pool = dungeonPool(item);
    const tierChance = (data.dungeon.Chance || {})[item.dungeonTier] || 0;
    let pick = 0;
    if (item.gearKind === "Weapon") {
      const own = pool.byClass[cls];
      if (own) {
        pick = data.dungeon.WeaponChance * (
          (own.id === item.id ? data.dungeon.OwnClassWeapon : 0) +
          (1 - data.dungeon.OwnClassWeapon) / pool.weapons.length
        );
      } else if (pool.weapons.length) pick = data.dungeon.WeaponChance / pool.weapons.length;
    } else if (pool.armor.length) {
      const weaponShare = pool.weapons.length ? data.dungeon.WeaponChance : 0;
      pick = (1 - weaponShare) / pool.armor.length;
    }
    const happen = capChance(tierChance);
    const weights = item.dungeonTier === "nightmare"
      ? [["Legendary", 1 - data.dungeon.SecretChance], ["Secret", data.dungeon.SecretChance]]
      : [[item.dungeonTier === "hard" ? "Legendary" : "Epic", 1]];
    addSplit(rows, {
      chance: happen * pick,
      label: item.dungeon + " " + item.dungeonTier,
      detail: "Gear drop " + fmt(tierChance) + ", then this piece is " + fmt(pick) + " of that roll. " + pool.armor.length + " armor, " + pool.weapons.length + " weapons.",
    }, weights);
  }

  if (item.nightmare) {
    const pool = data.items.filter((other) => other.nightmare && other.nightmare.boss === item.nightmare.boss);
    const base = document.getElementById("torment").checked ? data.tormentNightmareChance : data.nightmareChance;
    const boss = enemyById.get(item.nightmare.boss);
    rows.push({
      chance: capChance(base) / pool.length,
      rarity: "Secret",
      label: "Nightmare, " + (boss ? boss.name : item.nightmare.boss),
      detail: (document.getElementById("torment").checked ? "Torment runs use 5%." : "Normal runs use 12%.") + " Always Secret. " + pool.length + (pool.length === 1 ? " piece shares it." : " pieces share it."),
    });
  }

  if (item.unique) {
    const uniques = data.items.filter((other) => other.unique);
    const bossPool = item.unique.boss ? uniques.filter((other) => other.unique.boss === item.unique.boss) : [];
    bossPool.sort((a, b) => a.id < b.id ? -1 : 1);
    const secretOwn = bossPool.length && bossPool[0].unique.secret === true;
    const ownRate = bossPool.length ? Math.min(1, (secretOwn ? data.uniqueChance.secretOwn : data.uniqueChance.bossOwn) * mult) : 0;
    const showOwn = kind === "any" || kind === "boss" || kind === "secret";
    if (showOwn && bossPool.some((other) => other.id === item.id)) {
      const boss = enemyById.get(item.unique.boss);
      rows.push({
        chance: capChance(ownRate / bossPool.length),
        label: "Unique from " + (boss ? boss.name : item.unique.boss),
        detail: "Own-boss roll " + fmt(ownRate) + " before loot, split " + bossPool.length + " ways. Difficulty ×" + mult.toFixed(2) + ".",
      });
      addSplit(rows, rows.pop(), [["Epic", 0.75], ["Legendary", 0.25]]);
    }
    if (kind !== "secret" && item.unique.act) {
      const act = item.unique.act;
      const actPool = uniques.filter((other) => other.unique.act === act);
      const listed = kind === "any" ? ["fight", "elite", "boss", "treasure"] : [kind === "miniboss" ? "elite" : kind];
      for (const listedKind of listed) {
        const actRate = Math.min(1, (data.uniqueChance[listedKind] || 0) * mult);
        const missOwn = showOwn && item.unique.boss ? (1 - ownRate) : 1;
        rows.push({
          chance: capChance(missOwn * actRate / actPool.length),
          label: "Land " + act + ", " + listedKind,
          detail: "Any foe on this land. Base " + fmt(data.uniqueChance[listedKind] || 0) + " ×" + mult.toFixed(2) + ", split " + actPool.length + " ways.",
        });
        addSplit(rows, rows.pop(), [["Epic", 0.75], ["Legendary", 0.25]]);
      }
    }
  }

  if (item.mythic && !item.giveaway && !item.raid && (kind === "any" || kind === "boss")) {
    const pool = data.items.filter((other) => other.mythic && !other.giveaway && !other.raid);
    const scale = 1 + (diff - 1) * 0.25;
    for (const act of lands) {
      const base = (data.mythicChance[act - 1] || 0) * scale;
      rows.push({
        chance: capChance(Math.min(1, base)) / pool.length,
        label: "Land " + act + " boss",
        detail: "Mythic check " + fmt(data.mythicChance[act - 1] || 0) + " ×" + scale.toFixed(2) + " from difficulty, split " + pool.length + " ways. Torment mythic check is " + fmt(data.tormentMythicChance) + ".",
      });
      addSplit(rows, rows.pop(), [["Legendary", 0.8], ["Secret", 0.2]]);
    }
  }

  if (item.boss && enemyById.has(item.boss)) {
    const pool = data.items.filter((other) => other.boss === item.boss);
    const boss = enemyById.get(item.boss);
    const signature = [];
    if (kind === "any" || kind === "boss") signature.push(["boss", 0.35]);
    if (kind === "any" || kind === "secret") signature.push(["secret", 1]);
    for (const [label, rate] of signature) {
      rows.push({
        chance: capChance(rate / pool.length),
        label: "Signature from " + boss.name + " (" + label + ")",
        detail: fmt(rate) + " split " + pool.length + " ways.",
      });
      addSplit(rows, rows.pop(), item.rarity === "Secret"
        ? [["Secret", 1]]
        : [["Epic", 1 - (data.bossLegendaryChance || 0)], ["Legendary", data.bossLegendaryChance || 0]]);
    }
  }

  if (item.gearKind && !item.dungeon && !item.unique && !item.nightmare && !item.raid && !item.starter && !item.giveaway && !item.mythic && !item.boss) {
    for (const act of lands) {
      const pick = storyChance(item, act, cls);
      if (pick <= 0) continue;
      const where = act >= 6 ? "saga gear" : "tiers " + Math.max(1, act - 1) + "–" + act;
      for (const listedKind of kinds) {
        if (listedKind === "secret") continue;
        const happen = capChance(gearHappen(listedKind));
        rows.push({
          chance: happen * pick,
          label: "Land " + act + ", " + listedKind,
          detail: "Gear drops " + fmt(gearHappen(listedKind)) + " before loot. This piece is " + fmt(pick) + " of that roll (" + where + (cls ? ", " + cls : "") + ").",
        });
        addSplit(rows, rows.pop(), rarityTable(act));
      }
    }
  }

  if (item.raid) rows.push({ chance: 0, rarity: item.rarity || "", label: "Raid shop", detail: "Bought from the " + item.raid + " raid shop." });
  if (item.starter) rows.push({ chance: 0, rarity: item.rarity || "", label: "Starter", detail: "Starting kit. Not a combat drop." });
  if (item.giveaway) rows.push({ chance: 0, rarity: item.rarity || "", label: "Giveaway", detail: "Not a combat drop." });
  if (item.ultraTome) rows.push({ chance: 0, rarity: item.rarity || "", label: "Ultra tome", detail: item.note || "Read in gear after it drops from a great foe." });
  if (!rows.length) {
    rows.push({
      chance: 0,
      rarity: item.rarity || "",
      label: item.droppable ? "No listed drop" : "Not a drop",
      detail: item.note || "No enemy table and no gear roll includes this.",
    });
  }
  return rows;
}

function bestChance(item) {
  let best = 0;
  for (const row of rowsFor(item)) {
    if (row.rarity === "Any") continue;
    best = Math.max(best, row.chance || 0);
  }
  return best;
}

function renderList() {
  const list = document.getElementById("list");
  const q = document.getElementById("search").value.trim().toLowerCase();
  const category = document.getElementById("category").value;
  const dropsOnly = document.getElementById("dropsOnly").checked;
  const current = list.value;
  list.innerHTML = "";
  for (const item of data.items) {
    if (category && item.category !== category) continue;
    if (q && !item.name.toLowerCase().includes(q) && !item.id.toLowerCase().includes(q)) continue;
    const chance = bestChance(item);
    if (dropsOnly && !(chance > 0)) continue;
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name + (chance > 0 ? "  " + fmt(chance) : "");
    list.append(option);
  }
  if ([...list.options].some((option) => option.value === current)) list.value = current;
  else if (list.options.length) list.selectedIndex = 0;
}

function renderDetail() {
  const item = byId.get(document.getElementById("list").value);
  const meta = document.getElementById("meta");
  const box = document.getElementById("rows");
  box.innerHTML = "";
  if (!item) {
    meta.textContent = "";
    return;
  }
  meta.textContent = [item.name, item.rarity, item.category, item.gearKind, item.id].filter(Boolean).join(" · ");
  if (item.note) {
    const note = document.createElement("p");
    note.textContent = item.note;
    box.append(note);
  }
  const rows = rowsFor(item)
    .map((row, index) => ({ row, index }))
    .sort((a, b) => (RARITY_ORDER[a.row.rarity] ?? 99) - (RARITY_ORDER[b.row.rarity] ?? 99) || a.index - b.index)
    .map((entry) => entry.row);
  if (!rows.some((row) => row.chance > 0)) {
    const disclaimer = document.createElement("p");
    disclaimer.className = "disclaimer";
    disclaimer.textContent = "Disclaimer: some items may not have a drop rate. This is because our bitcoin miners are not competent enough. We are sorry for this inconvenience.";
    box.append(disclaimer);
  }
  const table = document.createElement("table");
  const head = document.createElement("tr");
  for (const title of ["Chance", "Rarity", "Where", "Condition"]) {
    const cell = document.createElement("th");
    cell.textContent = title;
    head.append(cell);
  }
  table.append(head);
  let group = "";
  for (const row of rows) {
    const name = row.rarity || "";
    if (name !== group) {
      group = name;
      const banner = document.createElement("tr");
      const title = document.createElement("th");
      title.colSpan = 4;
      title.className = "group";
      title.textContent = name || "No rarity";
      banner.append(title);
      table.append(banner);
    }
    const tr = document.createElement("tr");
    const chance = document.createElement("td");
    chance.textContent = row.chance > 0 ? fmt(row.chance) : "—";
    const rarity = document.createElement("td");
    rarity.textContent = row.rarity || "—";
    const where = document.createElement("td");
    where.textContent = row.label;
    const detail = document.createElement("td");
    detail.textContent = row.detail;
    tr.append(chance, rarity, where, detail);
    table.append(tr);
  }
  box.append(table);
}

function render() {
  renderList();
  renderDetail();
}

function init() {
  const category = document.getElementById("category");
  const cats = [...new Set(data.items.map((item) => item.category))].sort();
  const any = document.createElement("option");
  any.value = "";
  any.textContent = "any";
  category.append(any);
  for (const name of cats) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    category.append(option);
  }
  const difficulty = document.getElementById("difficulty");
  for (const name of data.difficulties) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    difficulty.append(option);
  }
  const cls = document.getElementById("class");
  const anyClass = document.createElement("option");
  anyClass.value = "";
  anyClass.textContent = "any";
  cls.append(anyClass);
  for (const name of data.classes) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    cls.append(option);
  }
  for (const id of ["search", "category", "source", "difficulty", "class", "loot", "torment", "dropsOnly"]) {
    document.getElementById(id).addEventListener("input", render);
    document.getElementById(id).addEventListener("change", render);
  }
  document.getElementById("list").addEventListener("change", renderDetail);
  render();
}

init();
