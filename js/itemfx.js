// What an item does, in words and in fields: the medicine effect table (healing, status, revive, PP, vitamins,
// stones), hold effects, Poké Ball catch bonuses, repels. FireRed (US) v1.1.
//   effect data (gItemEffectTable[item - 13]): 6 flag bytes, then one parameter byte per flag that takes one, in order:
//     b0: 0x0F X Attack stages, 0x20 Dire Hit, 0x40 Sacred Ash (whole party), 0x80 cures infatuation
//     b1: 0xF0 X Defend, 0x0F X Speed · b2: 0xF0 X Accuracy, 0x0F X Special
//     b3: 0x80 Guard Spec, 0x40 level up, 0x20 sleep, 0x10 poison, 0x08 burn, 0x04 freeze, 0x02 paralysis, 0x01 confusion
//     b4: 0x01 HP EV*, 0x02 Attack EV*, 0x04 heal HP*, 0x08 restore PP*, 0x10 (PP: one move), 0x20 PP Up, 0x40 revive, 0x80 evolution stone
//     b5: 0x01 Defense EV*, 0x02 Speed EV*, 0x04 Sp. Def EV*, 0x08 Sp. Atk EV*, 0x10 PP Max, 0x20/0x40/0x80 friendship*
//   (* = takes a parameter). Heal HP: 0xFF all, 0xFE half, 0xFD as much as a level up gives. PP: 0x7F all.
'use strict';

const ItemFx = (() => {
  const R = () => App.rom, O = () => App.game.offsets;
  const EFFECTS = 0x25292C, FIRST = 13, LAST = 176;               // gItemEffectTable: items 13..176
  const BALL_BONUS = 0x250902;                                    // sBallCatchBonuses: Ultra, Great, Poké, Safari (x10)
  const FR11 = () => App.game && App.game.patchKey === 'BPRE1';

  // ---------- medicine effects ----------
  const PARAM_BITS = [[4, 0x01, 'evHp'], [4, 0x02, 'evAtk'], [4, 0x04, 'heal'], [4, 0x08, 'pp'], [5, 0x01, 'evDef'], [5, 0x02, 'evSpe'], [5, 0x04, 'evSpd'], [5, 0x08, 'evSpa'],
    [5, 0x20, 'friend1'], [5, 0x40, 'friend2'], [5, 0x80, 'friend3']];
  function effectPtr(item) { if (!FR11() || item < FIRST || item > LAST) return -1; return R().ptr(EFFECTS + (item - FIRST) * 4); }
  function readEffect(item) {
    const p = effectPtr(item); if (p < 0) return null;
    const u = R().u8, f = Array.from(u.slice(p, p + 6)), par = {}; let k = 6;
    for (const [b, m, name] of PARAM_BITS) if (f[b] & m) par[name] = u[p + k++];
    return { f, par };
  }
  function encode(e) {
    const out = e.f.slice(0, 6);
    for (const [b, m, name] of PARAM_BITS) if (out[b] & m) out.push((e.par[name] ?? 0) & 255);
    return Uint8Array.from(out);
  }
  // a new copy every time (items may share their effect data)
  function writeEffect(item, e) {
    const r = R(); if (item < FIRST || item > LAST) throw new Error('item ' + item + ' has no slot in the effect table');
    r.wptr(EFFECTS + (item - FIRST) * 4, r.writeNew(encode(e)));
  }
  const STATUS = [[0x20, 'sleep'], [0x10, 'poison'], [0x08, 'burn'], [0x04, 'freeze'], [0x02, 'paralysis'], [0x01, 'confusion']];
  const EVS = [['evHp', 'HP'], ['evAtk', 'Attack'], ['evDef', 'Defense'], ['evSpe', 'Speed'], ['evSpa', 'Sp. Atk'], ['evSpd', 'Sp. Def']];
  const EV_BIT = { evHp: [4, 1], evAtk: [4, 2], evDef: [5, 1], evSpe: [5, 2], evSpd: [5, 4], evSpa: [5, 8] };
  const healText = v => v === 0xFF ? T('all its HP') : v === 0xFE ? T('half its HP') : v === 0xFD ? T('the HP of a level up') : v + ' HP';
  // the effect in plain words (a list of short sentences)
  function describeEffect(e) {
    if (!e) return [];
    const f = e.f, p = e.par, out = [];
    if (f[3] & 0x40) out.push(T('Raises the level by one.'));
    if (f[4] & 0x40) out.push(Tf('Revives a fainted Pokémon with {hp}.', { hp: healText(p.heal ?? 0xFE) }));
    else if (f[4] & 0x04 && !(f[3] & 0x40)) out.push(Tf('Restores {hp}.', { hp: healText(p.heal) }));
    if (f[0] & 0x40) out.push(T('Works on the whole party.'));
    const cures = STATUS.filter(([m]) => f[3] & m).map(([, n]) => T(n));
    if (cures.length === 6) out.push(T('Cures every status problem.'));
    else if (cures.length) out.push(Tf('Cures {list}.', { list: cures.join(', ') }));
    if (f[0] & 0x80) out.push(T('Cures infatuation.'));
    if (f[4] & 0x08) out.push(p.pp === 0x7F ? T((f[4] & 0x10) ? 'Restores all PP of one move.' : 'Restores all PP of every move.') : Tf((f[4] & 0x10) ? 'Restores {pp} PP of one move.' : 'Restores {pp} PP of every move.', { pp: p.pp }));
    if (f[4] & 0x20) out.push(T('Raises the maximum PP of one move a little (PP Up).'));
    if (f[5] & 0x10) out.push(T('Raises the maximum PP of one move to the top (PP Max).'));
    for (const [k, n] of EVS) if (p[k] != null) out.push(Tf('Adds {n} effort points to {stat}.', { n: p[k], stat: T(n) }));
    const st = [['Attack', f[0] & 0x0F], ['Defense', f[1] >> 4], ['Speed', f[1] & 0x0F], ['Accuracy', f[2] >> 4], ['Sp. Atk', f[2] & 0x0F]].filter(x => x[1]);
    for (const [n, v] of st) out.push(Tf('In battle: raises {stat} by {n}.', { stat: T(n), n: v }));
    if (f[0] & 0x20) out.push(T('In battle: raises the chance of critical hits.'));
    if (f[3] & 0x80) out.push(T('In battle: stops stats from being lowered for five turns (Guard Spec.).'));
    if (f[4] & 0x80) out.push(T('An evolution stone: some Pokémon evolve when it is used on them (list below).'));
    const fr = [p.friend1, p.friend2, p.friend3].filter(v => v != null).map(v => v > 127 ? v - 256 : v);
    if (fr.length) out.push(Tf('Friendship {sign} ({list}, depending on how friendly the Pokémon already is).', { sign: fr[0] < 0 ? T('goes down') : T('goes up'), list: fr.map(v => (v > 0 ? '+' : '') + v).join(' / ') }));
    return out;
  }
  const isStone = e => e && (e.f[4] & 0x80);
  const isMedicine = e => e && !isStone(e) && (e.f[3] & 0x3F || e.f[4] & 0x7F || e.f[5] & 0x1F || e.f[0] & 0xC0);
  const isBattleBoost = e => e && !isMedicine(e) && !isStone(e) && (e.f[0] & 0x2F || e.f[1] || e.f[2] || e.f[3] & 0x80);

  // ---------- hold effects ----------
  // [id, name, what the strength means (or null), short explanation]
  const HOLD = [
    [0, 'None', null, ''],
    [1, 'Restores HP when low', 'HP restored', 'Eaten when its HP drops below half: restores that much HP.'],
    [2, 'Cures paralysis', null, 'Eaten when paralysed: cures it.'], [3, 'Cures sleep', null, 'Eaten when asleep: wakes it up.'],
    [4, 'Cures poison', null, 'Eaten when poisoned: cures it.'], [5, 'Cures a burn', null, 'Eaten when burned: cures it.'],
    [6, 'Cures freezing', null, 'Eaten when frozen: thaws it.'], [7, 'Restores PP', 'PP restored', 'Eaten when a move runs out of PP: restores that much PP.'],
    [8, 'Cures confusion', null, 'Eaten when confused: cures it.'], [9, 'Cures any status', null, 'Eaten when it gets any status problem: cures it.'],
    [10, 'Restores HP (spicy)', '1 / this of max HP', 'Eaten at low HP: restores part of its HP; confuses Pokémon that dislike spicy flavours.'],
    [11, 'Restores HP (dry)', '1 / this of max HP', 'Eaten at low HP: restores part of its HP; confuses Pokémon that dislike dry flavours.'],
    [12, 'Restores HP (sweet)', '1 / this of max HP', 'Eaten at low HP: restores part of its HP; confuses Pokémon that dislike sweet flavours.'],
    [13, 'Restores HP (bitter)', '1 / this of max HP', 'Eaten at low HP: restores part of its HP; confuses Pokémon that dislike bitter flavours.'],
    [14, 'Restores HP (sour)', '1 / this of max HP', 'Eaten at low HP: restores part of its HP; confuses Pokémon that dislike sour flavours.'],
    [15, 'Raises Attack at low HP', 'works below 1 / this of HP', 'Eaten when its HP is low: raises Attack.'],
    [16, 'Raises Defense at low HP', 'works below 1 / this of HP', 'Eaten when its HP is low: raises Defense.'],
    [17, 'Raises Speed at low HP', 'works below 1 / this of HP', 'Eaten when its HP is low: raises Speed.'],
    [18, 'Raises Sp. Atk at low HP', 'works below 1 / this of HP', 'Eaten when its HP is low: raises Special Attack.'],
    [19, 'Raises Sp. Def at low HP', 'works below 1 / this of HP', 'Eaten when its HP is low: raises Special Defense.'],
    [20, 'Raises critical hits at low HP', 'works below 1 / this of HP', 'Eaten when its HP is low: critical hits become more likely.'],
    [21, 'Raises a random stat at low HP', 'works below 1 / this of HP', 'Eaten when its HP is low: sharply raises a random stat.'],
    [22, 'Raises evasion', 'percent', 'Makes the holder harder to hit.'],
    [23, 'Restores lowered stats', null, 'Used up when a stat is lowered: puts it back.'],
    [24, 'Doubles effort points, lowers Speed', null, 'The holder gains twice the effort points, but is slower in battle.'],
    [25, 'Shares experience', null, 'The holder gets part of the experience even without battling.'],
    [26, 'Sometimes moves first', 'chance in percent', 'Sometimes lets the holder move first.'],
    [27, 'Raises friendship faster', null, 'The holder becomes friendly faster.'],
    [28, 'Cures infatuation', null, 'Used up when the holder is infatuated: cures it.'],
    [29, 'Boosts Attack, locks one move', null, 'Raises Attack by half, but the holder can only use the first move it chooses.'],
    [30, 'May make the target flinch', 'chance in percent', 'Moves that hit may make the target flinch.'],
    [31, 'Boosts Bug moves', 'percent', 'Bug-type moves get stronger by this percent.'],
    [32, 'Doubles prize money', null, 'Prize money from trainer battles is doubled.'],
    [33, 'Keeps wild Pokémon away', null, 'Fewer wild Pokémon appear.'],
    [34, 'Boosts Latios / Latias', null, 'Raises the Special stats of Latios and Latias.'],
    [35, 'Boosts Clamperl Sp. Atk', null, 'Doubles the Special Attack of Clamperl.'],
    [36, 'Boosts Clamperl Sp. Def', null, 'Doubles the Special Defense of Clamperl.'],
    [37, 'Always escapes', null, 'The holder can always run from wild battles.'],
    [38, 'Stops evolution', null, 'The holder does not evolve.'],
    [39, 'May survive a knockout', 'chance in percent', 'Sometimes the holder survives a hit with 1 HP.'],
    [40, 'More experience', null, 'The holder gets half more experience.'],
    [41, 'Raises critical hits', null, 'The holder\'s moves become critical hits more often.'],
    [42, 'Boosts Steel moves', 'percent', 'Steel-type moves get stronger by this percent.'],
    [43, 'Restores HP every turn', '1 / this of max HP', 'Restores a little HP at the end of every turn (Leftovers).'],
    [44, 'Evolves when traded (Dragon Scale)', null, 'Used for evolution when traded.'],
    [45, 'Boosts Pikachu', null, 'Doubles the Special Attack of Pikachu.'],
    [46, 'Boosts Ground moves', 'percent', 'Ground-type moves get stronger by this percent.'],
    [47, 'Boosts Rock moves', 'percent', 'Rock-type moves get stronger by this percent.'],
    [48, 'Boosts Grass moves', 'percent', 'Grass-type moves get stronger by this percent.'],
    [49, 'Boosts Dark moves', 'percent', 'Dark-type moves get stronger by this percent.'],
    [50, 'Boosts Fighting moves', 'percent', 'Fighting-type moves get stronger by this percent.'],
    [51, 'Boosts Electric moves', 'percent', 'Electric-type moves get stronger by this percent.'],
    [52, 'Boosts Water moves', 'percent', 'Water-type moves get stronger by this percent.'],
    [53, 'Boosts Flying moves', 'percent', 'Flying-type moves get stronger by this percent.'],
    [54, 'Boosts Poison moves', 'percent', 'Poison-type moves get stronger by this percent.'],
    [55, 'Boosts Ice moves', 'percent', 'Ice-type moves get stronger by this percent.'],
    [56, 'Boosts Ghost moves', 'percent', 'Ghost-type moves get stronger by this percent.'],
    [57, 'Boosts Psychic moves', 'percent', 'Psychic-type moves get stronger by this percent.'],
    [58, 'Boosts Fire moves', 'percent', 'Fire-type moves get stronger by this percent.'],
    [59, 'Boosts Dragon moves', 'percent', 'Dragon-type moves get stronger by this percent.'],
    [60, 'Boosts Normal moves', 'percent', 'Normal-type moves get stronger by this percent.'],
    [61, 'Evolves when traded (Up-Grade)', null, 'Used for evolution when traded.'],
    [62, 'Heals from damage dealt', '1 / this of the damage', 'Restores part of the damage the holder deals (Shell Bell).'],
    [63, 'Raises Chansey\'s critical hits', null, 'Chansey lands critical hits more often.'],
    [64, 'Boosts Ditto Defense', null, 'Doubles the Defense of Ditto.'],
    [65, 'Boosts Cubone / Marowak', null, 'Doubles the Attack of Cubone and Marowak.'],
    [66, 'Raises Farfetch\'d\'s critical hits', null, 'Farfetch\'d lands critical hits more often.'],
  ];
  const hold = id => HOLD.find(x => x[0] === id) || [id, 'Effect ' + id, 'value', ''];

  // ---------- Poké Balls ----------
  const BALLS = {
    1: 'Always catches the Pokémon.',
    6: 'Net Ball: ×3 on Water and Bug Pokémon, otherwise ×1.',
    7: 'Dive Ball: ×3.5 underwater, otherwise ×1.',
    8: 'Nest Ball: better on low-level Pokémon: ×(40 − level) / 10, at least ×1.',
    9: 'Repeat Ball: ×3 on Pokémon you have caught before, otherwise ×1.',
    10: 'Timer Ball: better the longer the battle: ×(turns + 10) / 10, up to ×4.',
    11: 'Luxury Ball: ×1, and the Pokémon becomes friendly faster.',
    12: 'Premier Ball: ×1 (a Poké Ball with a different look).',
  };
  const ballSlot = id => (FR11() && id >= 2 && id <= 5) ? BALL_BONUS + (id - 2) : -1;     // Ultra, Great, Poké, Safari
  const ballBonus = id => { const a = ballSlot(id); return a < 0 ? null : R().u8[a] / 10; };
  function setBallBonus(id, x) { const a = ballSlot(id); if (a < 0) return; R().w8(a, Math.max(1, Math.min(255, Math.round(x * 10)))); }

  // ---------- field use: which kind of item (from the template items of the original game) ----------
  const fieldOf = i => R().r32(O().items + i * 44 + 28) >>> 0;
  const isRepel = i => FR11() && fieldOf(i) === fieldOf(86) && fieldOf(86) !== 0;

  return { readEffect, writeEffect, encode, describeEffect, isStone, isMedicine, isBattleBoost, effectPtr, STATUS, EVS, EV_BIT, healText,
    HOLD, hold, BALLS, ballBonus, setBallBonus, isRepel, FIRST, LAST, FR11 };
})();
