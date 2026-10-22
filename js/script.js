// Game scripts from blocks: an assembler for FireRed's script language and a compiler from "blocks" (a small,
// readable list of actions: say, ask, give, battle, move, if…) to script bytes. Used by the block editor
// (js/blocks.js), the story compiler (js/story.js) and the object templates.
'use strict';

const Script = (() => {
  const R = () => App.rom;
  const VAR_RESULT = 0x800D, PLAYER = 0xFF;
  // FireRed movement actions (verified in mGBA, see HANDOFF)
  const DIRS = { down: 0, up: 1, left: 2, right: 3 };
  const MOVE = {
    face: d => 0x00 + DIRS[d], walkSlow: d => 0x0C + DIRS[d], walk: d => 0x10 + DIRS[d], jump: d => 0x14 + DIRS[d], walkFast: d => 0x1D + DIRS[d],
    turn: d => 0x2D + DIRS[d], delay16: 0x1C, delay8: 0x1B, delay4: 0x1A,
    emote: { '!': 0x62, '?': 0x63, '♥': 0x64 }, invisible: 0x60, visible: 0x61, end: 0xFE,
  };

  // ---------- assembler ----------
  class Asm {
    constructor() { this.bytes = []; this.labels = {}; this.fixLabel = []; this.fixData = []; this.n = 0; }
    b(...v) { for (const x of v) this.bytes.push(x & 255); return this; }
    h(v) { return this.b(v, v >> 8); }
    w(v) { return this.b(v, v >> 8, v >> 16, v >>> 24); }
    label(name) { this.labels[name] = this.bytes.length; return this; }
    fresh(prefix = 'L') { return prefix + (this.n++); }
    ref(name) { this.fixLabel.push([this.bytes.length, name]); return this.w(0); }          // pointer to a label in this script
    data(bytes) { this.fixData.push([this.bytes.length, bytes]); return this.w(0); }        // pointer to separate data (text, movement…)
    ptr(abs) { return this.w((0x08000000 + abs) >>> 0); }                                  // pointer to something already in the ROM
    // write the data and the script into free space; returns { off, allocs: [[off, len], …] }
    write() {
      const r = R(), allocs = [], out = Uint8Array.from(this.bytes);
      for (const [at, d] of this.fixData) { const o = r.writeNew(d); allocs.push([o, d.length]); new DataView(out.buffer).setUint32(at, (0x08000000 + o) >>> 0, true); }
      const off = r.alloc(out.length);
      for (const [at, name] of this.fixLabel) {
        if (!(name in this.labels)) throw new Error('script label not found: ' + name);
        new DataView(out.buffer).setUint32(at, (0x08000000 + off + this.labels[name]) >>> 0, true);
      }
      r.write(off, out); r._hint = off + out.length + 1; allocs.push([off, out.length]);
      return { off, allocs };
    }
  }
  const text = s => TextTab.encodeDialogue(s);
  const COND = { '<': 0, '=': 1, '>': 2, '<=': 3, '>=': 4, '!=': 5 };

  // ---------- commands ----------
  const C = {
    end: a => a.b(0x02), ret: a => a.b(0x03), call: (a, l) => a.b(0x04).ref(l), goto: (a, l) => a.b(0x05).ref(l),
    gotoIf: (a, cond, l) => a.b(0x06, COND[cond]).ref(l), callIf: (a, cond, l) => a.b(0x07, COND[cond]).ref(l),
    gotoAbs: (a, off) => a.b(0x05).ptr(off),
    msg: (a, s, type = 4) => a.b(0x0F, 0x00).data(text(s)).b(0x09, type),                  // loadword 0, text; callstd type
    setvar: (a, v, x) => a.b(0x16).h(v).h(x), copyvarIfNotZero: (a, v, x) => a.b(0x1A).h(v).h(x),
    compare: (a, v, x) => a.b(0x21).h(v).h(x),
    setflag: (a, f) => a.b(0x29).h(f), clearflag: (a, f) => a.b(0x2A).h(f), checkflag: (a, f) => a.b(0x2B).h(f),
    // 0x69 lockall, 0x6A lock, 0x6B releaseall, 0x6C release, 0x6D waitbuttonpress (the game's own trigger scripts start with 0x69)
    lock: a => a.b(0x6A), lockall: a => a.b(0x69), release: a => a.b(0x6C), releaseall: a => a.b(0x68, 0x6B), faceplayer: a => a.b(0x5A),   // releaseall: closemessage first, releaseall leaves the box on screen
    closemessage: a => a.b(0x68), waitmessage: a => a.b(0x66),
    giveitem: (a, item, qty) => { C.copyvarIfNotZero(a, 0x8000, item); C.copyvarIfNotZero(a, 0x8001, qty); a.b(0x09, 0x00); },
    additem: (a, item, qty) => a.b(0x44).h(item).h(qty), removeitem: (a, item, qty) => a.b(0x45).h(item).h(qty), checkitem: (a, item, qty) => a.b(0x47).h(item).h(qty),
    givemon: (a, sp, lvl, item = 0) => a.b(0x79).h(sp).b(lvl).h(item).w(0).w(0).b(0),
    wildbattle: (a, sp, lvl) => a.b(0xB6).h(sp).b(lvl).h(0).b(0xB7),
    trainerNoIntro: (a, id, defeat) => a.b(0x5C, 0x03).h(id).h(0).data(text(defeat)),
    move: (a, who, actions) => a.b(0x4F).h(who).data(Uint8Array.from([...actions, MOVE.end])),
    waitmove: (a, who = 0) => a.b(0x51).h(who),
    removeobject: (a, id) => a.b(0x53).h(id), addobject: (a, id) => a.b(0x55).h(id),
    delay: (a, frames) => a.b(0x28).h(frames),
    playbgm: (a, song) => a.b(0x33).h(song).b(0), fadedefaultbgm: a => a.b(0x35), playse: (a, se) => a.b(0x2F).h(se), playfanfare: (a, f) => a.b(0x31).h(f), waitfanfare: a => a.b(0x32),
    fadescreen: (a, k) => a.b(0x97, k), special: (a, n) => a.b(0x25).h(n),
    warp: (a, g, n, w) => a.b(0x39, g, n, w).h(0xFFFF).h(0xFFFF),
    mart: (a, items) => { const d = new Uint8Array(items.length * 2 + 2); items.forEach((v, k) => { d[k * 2] = v & 255; d[k * 2 + 1] = v >> 8; }); a.b(0x86).data(d); },
  };

  // ---------- blocks -> script ----------
  // ctx: { stageVar, kind: 'object' | 'trigger' | 'frame' } ; who: 'player' | local id number | 'self'
  const whoId = (who, ctx) => who === 'player' || who == null ? PLAYER : who === 'self' ? (ctx.selfId || 0x800F) : +who;
  function steps(list, a, ctx) {
    for (const bl of list || []) step(bl, a, ctx);
  }
  function branch(a, ctx, condEmit, cond, yes, no) {
    const lElse = a.fresh(), lEnd = a.fresh();
    condEmit(); C.gotoIf(a, cond, lElse);
    steps(yes, a, ctx); C.goto(a, lEnd);
    a.label(lElse); steps(no, a, ctx); a.label(lEnd);
  }
  function step(bl, a, ctx) {
    switch (bl.op) {
      case 'say': C.msg(a, bl.text || ' ', 4); break;
      case 'ask': branch(a, ctx, () => { C.msg(a, bl.text || '?', 5); C.compare(a, VAR_RESULT, 1); }, '!=', bl.yes, bl.no); break;
      case 'give_item': C.giveitem(a, bl.item || 13, bl.qty || 1); break;
      case 'take_item': C.removeitem(a, bl.item || 13, bl.qty || 1); break;
      case 'give_mon': C.givemon(a, bl.sp || 25, bl.lvl || 5); if (bl.text) C.msg(a, bl.text, 4); break;
      case 'battle_wild': C.wildbattle(a, bl.sp || 25, bl.lvl || 5); break;
      case 'battle_trainer': if (bl.intro) C.msg(a, bl.intro, 4); C.closemessage(a); C.trainerNoIntro(a, bl.trainer, bl.defeat || '...'); break;
      case 'set_flag': C.setflag(a, bl.flag); break;
      case 'clear_flag': C.clearflag(a, bl.flag); break;
      case 'if_flag': branch(a, ctx, () => C.checkflag(a, bl.flag), bl.not ? '=' : '!=', bl.then, bl.else); break;      // checkflag: result 1 = set
      case 'if_item': branch(a, ctx, () => { C.checkitem(a, bl.item, bl.qty || 1); C.compare(a, VAR_RESULT, 1); }, '!=', bl.then, bl.else); break;
      case 'if_stage': branch(a, ctx, () => C.compare(a, ctx.stageVar, bl.value), ({ '<': '>=', '<=': '>', '=': '!=', '>=': '<', '>': '<=', '!=': '=' })[bl.cmp || '>='], bl.then, bl.else); break;
      case 'set_stage': C.setvar(a, ctx.stageVar, bl.value); break;
      case 'move': {
        const id = whoId(bl.who, ctx), sp = bl.speed === 'fast' ? MOVE.walkFast : bl.speed === 'slow' ? MOVE.walkSlow : MOVE.walk;
        const acts = (bl.steps || []).map(d => sp(d)); if (bl.face) acts.push(MOVE.turn(bl.face));
        if (acts.length) { C.move(a, id, acts); if (bl.wait !== false) C.waitmove(a, id); }
        break;
      }
      case 'face': { const id = whoId(bl.who, ctx); C.move(a, id, [MOVE.turn(bl.dir || 'down')]); C.waitmove(a, id); break; }
      case 'jump': { const id = whoId(bl.who, ctx); C.move(a, id, [MOVE.jump(bl.dir || 'down')]); C.waitmove(a, id); break; }
      case 'face_player': C.faceplayer(a); break;
      case 'emote': { const id = whoId(bl.who, ctx); C.move(a, id, [MOVE.emote[bl.kind || '!'] || MOVE.emote['!']]); C.waitmove(a, id); break; }
      case 'wait': C.delay(a, Math.max(1, Math.round((bl.seconds || 1) * 60))); break;
      case 'hide': C.removeobject(a, whoId(bl.who, ctx)); if (bl.flag) C.setflag(a, bl.flag); break;
      case 'show': if (bl.flag) C.clearflag(a, bl.flag); C.addobject(a, whoId(bl.who, ctx)); break;
      case 'music': if (bl.song) C.playbgm(a, bl.song); else C.fadedefaultbgm(a); break;
      case 'sound': C.playse(a, bl.se || 1); break;
      case 'fade': C.fadescreen(a, bl.out ? 1 : 0); break;
      case 'warp': C.warp(a, bl.g, bl.n, bl.warp || 0); break;
      case 'heal': C.special(a, 0); break;
      case 'shop': C.mart(a, bl.items || [13]); break;
      case 'goto_script': C.gotoAbs(a, bl.off); break;
      case 'emit': bl.fn(a, ctx); break;                                // a compiler of its own (an animated scene)
      case 'end': C.end(a); break;
      default: throw new Error('unknown block: ' + bl.op);
    }
  }
  // a whole script: kind 'object' = talking to a person (lock + face the player), 'trigger' / 'frame' = lockall
  function compile(blocks, ctx = {}) {
    const a = new Asm();
    if (ctx.kind === 'object') { C.lock(a); if (ctx.facePlayer !== false) C.faceplayer(a); }
    else C.lockall(a);
    steps(blocks, a, ctx);
    if (ctx.kind === 'object') C.release(a); else C.releaseall(a);
    C.end(a);
    return a;
  }
  // free space used by an earlier version (only blocks the editor wrote itself)
  function free(allocs) { const r = R(); for (const [o, n] of allocs || []) if (o > 0 && n > 0) { r.u8.fill(0xFF, o, o + n); } r.changed(); }

  // ---------- map scripts: "when the map loads / every frame while var = value" ----------
  // FireRed map script list: { u8 type, u32 ptr } … 0. type 2 = table { u16 var, u16 value, u32 script } … 0 (checked every frame)
  function addFrameScript(g, n, v, value, scriptOff) {
    const r = R(), hdr = App.game.mapGroups[g][n], ms = r.ptr(hdr + 8), entries = [];
    if (ms >= 0) for (let i = 0; i < 16 && r.u8[ms + i * 5]; i++) entries.push([r.u8[ms + i * 5], r.r32(ms + i * 5 + 1)]);
    let table = [], idx = entries.findIndex(e => e[0] === 2);
    if (idx >= 0) { const t = entries[idx][1] - 0x08000000; for (let k = 0; k < 32 && r.r16(t + k * 8); k++) table.push([r.r16(t + k * 8), r.r16(t + k * 8 + 2), r.r32(t + k * 8 + 4)]); }
    table = table.filter(([vv, val]) => !(vv === v && val === value));
    table.push([v, value, (0x08000000 + scriptOff) >>> 0]);
    const tb = new Uint8Array(table.length * 8 + 2), dt = new DataView(tb.buffer);
    table.forEach(([vv, val, p], k) => { dt.setUint16(k * 8, vv, true); dt.setUint16(k * 8 + 2, val, true); dt.setUint32(k * 8 + 4, p, true); });
    const tOff = r.writeNew(tb);
    if (idx >= 0) entries[idx][1] = (0x08000000 + tOff) >>> 0; else entries.push([2, (0x08000000 + tOff) >>> 0]);
    const lst = new Uint8Array(entries.length * 5 + 1), dl = new DataView(lst.buffer);
    entries.forEach(([t, p], k) => { lst[k * 5] = t; dl.setUint32(k * 5 + 1, p, true); });
    const lOff = r.writeNew(lst); r.wptr(hdr + 8, lOff);
    return [[tOff, tb.length], [lOff, lst.length]];
  }
  // a variable no script uses yet (0x4000-0x40FF are saved with the game)
  function freeVar(avoid = []) {
    const used = new Set(avoid), r = R();
    for (let i = 0; i < r.size - 5; i++) {
      const op = r.u8[i];
      if ((op === 0x16 || op === 0x17 || op === 0x21 || op === 0x19 || op === 0x1A) && r.u8[i + 2] === 0x40) used.add(r.r16(i + 1));
    }
    for (let v = 0x40F0; v > 0x4060; v--) if (!used.has(v)) return v;
    throw new Error('No free variable left');
  }
  return { Asm, C, MOVE, compile, emit: steps, free, addFrameScript, freeVar, VAR_RESULT, PLAYER };
})();
