# Zelekha's lab (map 4.3) with four starters: a longer table, a fourth Poké Ball and new ball scripts.
# The rival takes the Pokémon that is strong against yours, then walks to the spot the old battle script expects
# for his team (VAR 0x4031 = 0 / 1 / 2 picks the rival's teams for the whole game).
import struct
import citykit
from citykit import Script

LAB = (4, 3)
BALL_FLAG4 = 0x114                      # unused flag: hides the fourth ball once taken
# rival teams by VAR 0x4031 (rival_species in game.json): 0 = Wooper, 1 = Gastly, 2 = Sandshrew
RIVAL_END = {0: 10, 1: 8, 2: 9}         # x on row 5 where the lab battle script expects the rival, per team
SANDSHREW, WOOPER, CHARMANDER, GASTLY = 27, 194, 4, 92

# column on the table, player's species, prompt text, 0x4031 value, rival's species, rival's ball column
BALLS = [
    (8, SANDSHREW, 0x18E20C, 0, WOOPER, 9),
    (9, WOOPER, 0x18E27F, 1, GASTLY, 11),
    (10, CHARMANDER, 0x18E2EA, 2, SANDSHREW, 8),
    (11, GASTLY, 'אוווו! גאסטלי! פוקימון רוח מהמערות של מצדה. הוא נעלם כשמחפשים אותו, כמו תקציב.|אז, {PLAYER}, אתה בוחר בפוקימון הרוח גאסטלי?', 0, WOOPER, 9),
]
DOWN, UP, LEFT, RIGHT, FACE_UP = 0x10, 0x11, 0x12, 0x13, 0x01


def rival_path(player_x, ball_x, end_x):
    """from (5,4) to the front of his ball (row 5 if the player is not in the way, else via row 6), then to end_x"""
    if ball_x < player_x: walk = [DOWN] + [RIGHT] * (ball_x - 5) + [FACE_UP]
    else: walk = [DOWN, DOWN] + [RIGHT] * (ball_x - 5) + [UP]
    after = []
    if end_x != ball_x:
        after = [DOWN] + ([RIGHT] * (end_x - ball_x) if end_x > ball_x else [LEFT] * (ball_x - end_x)) + [UP]
    return walk, after


def build(rom, orig_text):
    """orig_text(english_offset) -> current ROM offset of that (translated) string"""
    h = rom.map_header(*LAB)
    lay = rom.ptr(h); W = rom.r32(lay); b = rom.ptr(lay + 12)
    cell = lambda x, y: b + (y * W + x) * 2
    # the table: 4 wide (x 8-11)
    for y, (l, m, r) in ((4, (0x2A8, 0x2A9, 0x2AA)), (5, (0x2B0, 0x2B1, 0x2B2))):
        for x, mt in zip(range(8, 12), (l, m, m, r)):
            v = rom.r16(cell(x, y)); rom.w16(cell(x, y), (v & 0xFC00) | mt)
    E = rom.map_events(h)
    ball_ids = {8: 5, 9: 6, 10: 7, 11: len(E['obj']) + 1}
    scripts = []
    for x, sp, prompt, var, rsp, rball in BALLS:
        walk, after = rival_path(x, rball, RIVAL_END[var])
        s = Script(rom)
        s.lock().faceplayer().setvar(0x4002, sp).setvar(0x4003, rsp)
        s.compare(0x4055, 3).goto_if(4, 0x169E5C)          # already chose
        s.compare(0x4055, 2).goto_if(1, 'choose')
        s.msg(orig_text(0x18EA91)).release().end()
        s.label('choose')
        s.raw(0x4F).h(4); s._ptr(0x1A7667); s.raw(0x51).h(0)  # Zelekha turns
        s.raw(0x75).h(sp).raw(10, 3)                          # showmonpic
        s.msg(orig_text(prompt) if isinstance(prompt, int) else prompt, 5)
        s.compare(0x800D, 1).goto_if(1, 'yes')
        s.raw(0x76).release().end()                           # hidemonpic
        s.label('yes')
        s.raw(0x76).removeobject(0x800F)
        s.msg(orig_text(0x18E35D)).call(0x1A66ED).setflag(0x828).setflag(0x291)
        s.raw(0x79).h(sp).raw(5).h(0).raw(0, 0, 0, 0, 0, 0, 0, 0, 0)   # givemon species, lv 5
        s.setvar(0x4031, var)
        s.raw(0x7D, 0).h(sp).raw(0x67); s._ptr(orig_text(0x18E385)); s.raw(0x66).fanfare(0x13E)
        s.msg(orig_text(0x1A571F), 5).compare(0x800D, 1).goto_if(5, 'noname')     # nickname?
        s.setvar(0x8004, 0).call(0x1A7563)
        s.label('noname').close()
        s.move(8, walk)
        s.msg(orig_text(0x18DDAC)).removeobject(ball_ids[rball])
        s.raw(0x7D, 0).h(rsp).raw(0x67); s._ptr(orig_text(0x18DDCA)); s.raw(0x66).fanfare(0x13E).close()
        if after: s.move(8, after)
        s.setvar(0x4055, 3).checkflag(0x83E).goto_if(1, 'flag')
        s.release().end()
        s.label('flag').setvar(0x4070, 1).release().end()
        scripts.append((x, s.write()))
    # ball objects: the three old ones get new scripts, a fourth one is added
    sc = dict(scripts)
    for x in (8, 9, 10):
        o = next(o for o in E['obj'] if rom.s16(o + 4) == x and rom.s16(o + 6) == 4)
        rom.wptr(o + 16, sc[x])
    ev = rom.ptr(h + 4); n = rom.u8[ev]; po = rom.ptr(ev + 4)
    objs = bytearray(rom.u8[po:po + n * 24])
    t = bytearray(rom.u8[E['obj'][4]:E['obj'][4] + 24])          # copy of a ball
    t[0] = n + 1; struct.pack_into('<hh', t, 4, 11, 4)
    struct.pack_into('<I', t, 16, 0x08000000 + sc[11]); struct.pack_into('<H', t, 20, BALL_FLAG4)
    objs += t
    hdr = bytearray(rom.u8[ev:ev + 20]); hdr[0] = n + 1
    struct.pack_into('<I', hdr, 4, 0x08000000 + rom.write_new(bytes(objs)))
    rom.wptr(h + 4, rom.write_new(bytes(hdr)))
