// Names for the story that is already in Pokémon FireRed (see js/storymap.js): chapters by place, and the main
// beats by what they do. A beat matches when it is on that map and does that thing:
//   'v4055=1' sets a variable · 'f820' sets a flag · 'c9d' clears one · 'i265' gives an item · 'm131' gives a Pokémon · 't414' a battle
// Hacks keep most of FireRed's scripts, so what still matches keeps its name; everything else gets a name from what it does.
'use strict';

const StoryNames = (() => {
  // chapters in the order of the game: [English, Hebrew, map sections (header byte 20), maps that belong elsewhere]
  const CHAPTERS = [
    ['Pallet Town', 'עיירת פלט', [0x58, 0x65]],
    ['Viridian City and the parcel', 'העיר ורידיאן והחבילה', [0x59, 0x66, 0x7A]],
    ['Viridian Forest and Pewter: Brock', 'יער ורידיאן ופיוטר: ברוק', [0x7E, 0x5A, 0x67]],
    ['Mt. Moon', 'הר הירח', [0x7F, 0x68]],
    ['Cerulean: Misty and Bill', 'סרוליאן: מיסטי וביל', [0x5B, 0x7C, 0x7D, 0x69, 0x81]],
    ['Vermilion: the S.S. Anne and Lt. Surge', "ורמיליון: האונייה ולוטננט סרג'", [0x5D, 0x6A, 0x80, 0x83, 0x82]],
    ['Rock Tunnel and Lavender Town', 'מנהרת הסלע ולוונדר', [0x6D, 0x6E, 0x8A, 0x8E, 0x5C, 0x6C, 0x6B]],
    ['Celadon: the Rocket Hideout and Erika', 'סלדון: המחבוא של רוקט ואריקה', [0x5E, 0xC4, 0x85]],
    ['The Pokémon Tower', 'מגדל הפוקימונים', [0x8C]],
    ['Fuchsia: the Safari Zone and Koga', 'פוקסיה: הספארי וקוגה', [0x6F, 0x70, 0x71, 0x72, 0x73, 0x74, 0x75, 0x76, 0x5F, 0x88]],
    ['Saffron: Silph Co. and Sabrina', 'ספרון: סילף וסברינה', [0x62, 0x86]],
    ['Cinnabar Island: Blaine', 'האי סינבר: בליין', [0x77, 0x78, 0x8B, 0x60, 0x87, 0x79]],
    ['The Sevii Islands 1–3', 'איי סבי 1–3', [0x8F, 0x90, 0x91, 0x96, 0x97, 0x98, 0x99, 0xAF, 0xB0, 0x9A, 0xB9]],
    ['Viridian Gym: Giovanni', "המכון בוורידיאן: ג'ובאני", [], ['5.1']],
    ['Victory Road and the Pokémon League', 'דרך הניצחון והליגה', [0x7B, 0x84, 0x61, 0x89]],
    ['After the game: Sevii Islands 4–7', 'אחרי המשחק: איי סבי 4–7', [0x92, 0x93, 0x94, 0x95, 0x9B, 0x9C, 0x9D, 0x9E, 0x9F, 0xA0, 0xA1, 0xA2, 0xA3, 0xA4, 0xA5, 0xA6,
      0xA7, 0xA8, 0xA9, 0xAA, 0xAE, 0xB1, 0xB2, 0xB3, 0xB4, 0xB5, 0xB6, 0xB7, 0xBA, 0xBB, 0xBC, 0xBD, 0xBE, 0xBF, 0xC0, 0xC1, 0xC2, 0xC3, 0x8D]],
  ];
  const OTHER = ['Other places', 'מקומות אחרים'];
  const FR_NAMES = ['BROCK', 'MISTY', 'LT. SURGE', 'ERIKA', 'KOGA', 'SABRINA', 'BLAINE', 'GIOVANNI', 'LORELEI', 'BRUNO', 'AGATHA', 'LANCE', 'TERRY', 'GARY', 'BLUE', 'GRUNT', 'SUPER NERD', 'MIGUEL', 'ADMIN'];

  // the main story of FireRed: [map, what it does, English, Hebrew]
  const BEATS = [
    ['3.0', 'v4055=1', 'Oak stops you at the tall grass', 'אוק עוצר אותך ליד הדשא הגבוה'],
    ['4.3', 'v4055=2', 'In the lab: Oak lets you choose a Pokémon', 'במעבדה: אוק מציע לבחור פוקימון'],
    ['4.3', 'f828', 'Choose your first Pokémon', 'בחירת הפוקימון הראשון'],
    ['4.3', 'v4055=4', 'First battle with the rival', 'קרב ראשון ביריב'],
    ['5.3', 'v4055=5', "Viridian Mart: Oak's Parcel", 'החנות בוורידיאן: החבילה של אוק'],
    ['4.3', 'f829', 'Deliver the parcel, get the Pokédex', 'מסירת החבילה וקבלת הפוקידקס'],
    ['4.2', 'i361', 'Daisy gives you the Town Map', 'דייזי נותנת את מפת העיר'],
    ['3.1', 'v4051=2', 'The old man shows how to catch Pokémon', 'הזקן מראה איך תופסים פוקימונים'],
    ['3.41', 'v4054=2', 'The rival on Route 22', 'היריב בכביש 22'],
    ['6.2', 'f820', 'Brock: the Boulder Badge', 'ברוק: תג הסלע'],
    ['3.2', 'f82f', "Oak's aide gives the Running Shoes", 'העוזר של אוק נותן נעלי ריצה'],
    ['1.3', 'v408b=1', 'Mt. Moon: the Super Nerd and the fossils', 'הר הירח: החנון והמאובנים'],
    ['1.3', 'i358', 'Choose a fossil', 'בחירת מאובן'],
    ['3.3', 'v4054=2', 'The rival in Cerulean', 'היריב בסרוליאן'],
    ['3.43', 'v406b=1', 'Nugget Bridge', 'גשר הנאגט'],
    ['3.3', 'v407d=1', 'The Team Rocket thief', 'הגנב של צוות רוקט'],
    ['7.5', 'f821', 'Misty: the Cascade Badge', 'מיסטי: תג המפל'],
    ['30.0', 'i265', 'Help Bill, get the S.S. Ticket', 'עזרה לביל וכרטיס לאונייה'],
    ['9.3', 'i352', 'The Pokémon Fan Club: the Bike Voucher', 'מועדון המעריצים: שובר לאופניים'],
    ['7.6', 'i360', 'Get the Bicycle', 'קבלת האופניים'],
    ['1.6', 'v405b=1', 'The rival on the S.S. Anne', 'היריב באונייה'],
    ['1.11', 'i339', 'The captain gives HM01 Cut', 'הקפטן נותן את HM01 חיתוך'],
    ['9.6', 'f822', 'Lt. Surge: the Thunder Badge', "לוטננט סרג': תג הרעם"],
    ['10.16', 'f823', 'Erika: the Rainbow Badge', 'אריקה: תג הקשת'],
    ['1.45', 'i356', 'The Rocket Hideout: the Lift Key', 'המחבוא של רוקט: מפתח המעלית'],
    ['1.45', 'i359', 'Giovanni in the hideout: the Silph Scope', "ג'ובאני במחבוא: משקפת סילף"],
    ['1.89', 'v405d=1', 'The rival in the Pokémon Tower', 'היריב במגדל הפוקימונים'],
    ['1.93', 'v4059=1', "The ghost of Marowak", 'רוח הרפאים של מארואק'],
    ['8.2', 'i350', 'Mr. Fuji gives the Poké Flute', "מר פוג'י נותן את חליל הפוקה"],
    ['3.30', 'f253', 'Wake up the Snorlax on Route 12', 'להעיר את סנורלקס בכביש 12'],
    ['3.34', 'f80', 'Wake up the Snorlax on Route 16', 'להעיר את סנורלקס בכביש 16'],
    ['25.0', 'i340', 'HM02 Fly', 'HM02 תעופה'],
    ['1.66', 'i353', 'The Safari Zone: the Gold Teeth', 'הספארי: שיני הזהב'],
    ['11.7', 'i342', 'The Warden gives HM04 Strength', 'השומר נותן את HM04 כוח'],
    ['1.71', 'i341', 'HM03 Surf', 'HM03 גלישה'],
    ['11.3', 'f824', 'Koga: the Soul Badge', 'קוגה: תג הנשמה'],
    ['1.51', 'i355', 'Silph Co.: the Card Key', 'סילף: כרטיס המפתח'],
    ['1.53', 'v405c=1', 'The rival in Silph Co.', 'היריב בסילף'],
    ['1.53', 'm131', 'A gift: Lapras', 'מתנה: לאפרס'],
    ['1.57', 'v4060=1', 'Giovanni in Silph Co.', "ג'ובאני בסילף"],
    ['14.3', 'f825', 'Sabrina: the Marsh Badge', 'סברינה: תג הביצה'],
    ['14.2', 'v4081=1', 'The Fighting Dojo', 'דוג׳ו הקרב'],
    ['1.62', 'i351', 'Pokémon Mansion: the Secret Key', 'אחוזת הפוקימונים: המפתח הסודי'],
    ['12.0', 'f826', 'Blaine: the Volcano Badge', 'בליין: תג הר הגעש'],
    ['3.8', 'v4071=2', 'Bill takes you to the Sevii Islands', 'ביל לוקח אותך לאיי סבי'],
    ['32.0', 'v4076=1', 'One Island: meet Celio, get the Tri-Pass', "האי הראשון: סליו והכרטיס המשולש"],
    ['1.97', 'v407f=2', 'Mt. Ember: stop Team Rocket', 'הר הגחלת: לעצור את צוות רוקט'],
    ['1.102', 'i373', 'Find the Ruby', 'מציאת האודם'],
    ['1.109', 'v4079=2', 'Berry Forest: find Lostelle', 'יער הפירות: למצוא את לוסטל'],
    ['32.0', 'v4076=5', 'Give the Ruby to Celio: the Rainbow Pass', 'האודם לסליו: כרטיס הקשת'],
    ['5.1', 'f827', 'Giovanni: the Earth Badge', "ג'ובאני: תג האדמה"],
    ['3.41', 'v4054=4', 'The rival on Route 22, again', 'היריב בכביש 22, שוב'],
    ['1.75', 'v4068=1', 'Elite Four: Lorelei', 'ארבעת הגדולים: לורליי'],
    ['1.76', 'v4068=2', 'Elite Four: Bruno', 'ארבעת הגדולים: ברונו'],
    ['1.77', 'v4068=3', 'Elite Four: Agatha', 'ארבעת הגדולים: אגתה'],
    ['1.78', 'v4068=4', 'Elite Four: Lance', 'ארבעת הגדולים: לאנס'],
    ['1.79', 'f4bc', 'The Champion: your rival', 'האלוף: היריב שלך'],
    ['1.80', 'c9d', 'The Hall of Fame', 'היכל התהילה'],
    ['3.15', 'v4086=1', 'Four Island: the rival', 'האי הרביעי: היריב'],
    ['1.113', 'v4080=1', 'Icefall Cave: Lorelei and Team Rocket', 'מערת המפל הקפוא: לורליי וצוות רוקט'],
    ['1.114', 'v4088=1', 'The Rocket Warehouse', 'המחסן של רוקט'],
    ['1.114', 'i374', 'Get the Sapphire', 'קבלת הספיר'],
    ['32.0', 'v4076=6', 'Give the Sapphire to Celio', 'הספיר לסליו'],
    ['1.74', 'f2bc', 'Cerulean Cave: Mewtwo', 'המערה בסרוליאן: מיוטו'],
    ['1.87', 'f2be', 'Seafoam Islands: Articuno', 'איי הקצף: ארטיקונו'],
    ['1.95', 'f2bf', 'The Power Plant: Zapdos', 'תחנת הכוח: זאפדוס'],
    ['1.101', 'f2bd', 'Mt. Ember: Moltres', 'הר הגחלת: מולטרס'],
  ];

  function tokens(b) {
    const t = new Set();
    for (const e of b.events) {
      for (const x of e.eff) t.add(x.k === 'flag' ? (x.set ? 'f' : 'c') + x.f.toString(16) : x.k === 'var' ? 'v' + x.v.toString(16) + '=' + x.n : 'a' + x.v.toString(16));
      for (const x of e.gives) t.add(x.k === 'mon' ? 'm' + x.sp : 'i' + x.item);
      for (const x of e.battles) t.add(x.k === 'trainer' ? 't' + x.id : 'w' + x.sp);
    }
    return t;
  }

  function apply(m) {
    const r = App.rom, g = App.game, he = I18N.lang === 'he';
    const secOf = (gi, ni) => r.u8[g.mapGroups[gi][ni] + 20];
    const chapterOf = (gi, ni) => {
      const k = gi + '.' + ni, sec = secOf(gi, ni);
      let i = CHAPTERS.findIndex(c => (c[3] || []).includes(k)); if (i >= 0) return i;
      i = CHAPTERS.findIndex(c => c[2].includes(sec)); return i >= 0 ? i : CHAPTERS.length;
    };
    m.chapters = CHAPTERS.map(c => ({ title: he ? c[1] : c[0] })).concat([{ title: he ? OTHER[1] : OTHER[0] }]);
    const L = App.getLists(), pocket = it => r.u8[g.offsets.items + it * 44 + 26];
    for (const b of m.beats) {
      b.chapter = chapterOf(b.g, b.n);
      const t = tokens(b), k = b.g + '.' + b.n;
      const hit = BEATS.findIndex(x => x[0] === k && t.has(x[1]));
      b.named = hit >= 0; b.rank = hit >= 0 ? hit : 1e6;
      if (hit >= 0) {
        b.title = he ? BEATS[hit][3] : BEATS[hit][2]; b.main = true;
        // a hack that renamed the trainer of this moment: say who it is now
        const tb = b.events.flatMap(x => x.battles).find(x => x.k === 'trainer'), o = tb && Objects.trainer(tb.id);
        if (o && o.name && !FR_NAMES.includes(o.name.trim().toUpperCase())) b.title += ' (' + o.name.trim() + ')';
        continue;
      }
      // no hand-written name: say what it does
      const e = b.events[0], cls = Objects.classNames();
      const tr = b.events.flatMap(x => x.battles).find(x => x.k === 'trainer'), mon = b.events.flatMap(x => x.gives).filter(x => x.k === 'mon');
      const item = b.events.flatMap(x => x.gives).find(x => x.k === 'item' && !x.found);
      const trName = tr ? (() => { const o = Objects.trainer(tr.id); return o ? ((cls[o.cls] || '') + ' ' + o.name).trim() : '#' + tr.id; })() : '';
      const leader = tr && [0x54, 0x51, 0x55, 0x59, 0x5A, 0x57].includes((Objects.trainer(tr.id) || {}).cls);
      if (mon.length) b.title = Tf('Get {what}', { what: [...new Set(mon.map(x => L.species[x.sp] || '#' + x.sp))].join(' / ') });
      else if (tr) b.title = Tf('Battle: {who}', { who: trName });
      else if (item) b.title = Tf('Get {what}', { what: L.items[item.item] || '#' + item.item });
      else {
        const p = (e.texts[0] || {}).p;
        let s = ''; try { if (p >= 0) s = Charmap.decodeEditable(r.u8, p, App.settings.rtl).text.replace(/\\[pnl]/g, ' ').replace(/\s+/g, ' ').trim(); } catch (x) { s = ''; }
        b.title = s ? '“' + (s.length > 48 ? s.slice(0, 46) + '…' : s) + '”' : T('A change in the story');
      }
      b.main = !!(mon.length || leader || (item && pocket(item.item) === 2) || b.events.some(x => x.eff.some(f => f.k === 'flag' && f.set && f.f >= 0x820 && f.f < 0x828)));
    }
    // the same named moment found twice (its variants came out at different depths): one beat
    const keep = [];
    for (const b of m.beats) {
      const twin = b.named && keep.find(x => x.named && x.rank === b.rank && x.g === b.g && x.n === b.n);
      if (twin) { twin.events.push(...b.events); twin.depth = Math.min(twin.depth, b.depth); twin.after = [...new Set(twin.after.concat(b.after))]; for (const e of b.events) e.beat = twin.id; for (const x of m.beats) x.after = x.after.map(a => a === b.id ? twin.id : a); }
      else keep.push(b);
    }
    for (const b of keep) b.after = [...new Set(b.after)].filter(a => a !== b.id);
    m.beats = keep;
    // a game built on FireRed: its own moments have names; the rest are side events (shown with "everything")
    const fr = keep.filter(b => b.named).length >= 20;
    if (fr) for (const b of keep) if (!b.named) b.main = false;
    // the order inside a chapter: the named moments in the order of the game, the others after the last named one before them
    for (const b of keep) {
      if (b.named) { b.key = b.rank; continue; }
      const d = isFinite(b.depth) ? b.depth : 1e4;
      const prev = keep.filter(x => x.named && x.chapter === b.chapter && (isFinite(x.depth) ? x.depth : 1e4) <= d).sort((x, y) => y.rank - x.rank)[0];
      b.key = (prev ? prev.rank : -1) + 0.5 + d / 1e5;
    }
    if (!fr) for (const b of keep) b.key = isFinite(b.depth) ? b.depth : 1e4;
    m.timeline = keep.slice().sort((x, y) => x.chapter - y.chapter || x.key - y.key || x.g - y.g || x.n - y.n);
  }
  return { apply, CHAPTERS, BEATS, tokens };
})();
