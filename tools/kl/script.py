# Minimal Gen 3 (FireRed) event-script disassembler: opcode sizes, names, and a tracer that follows
# goto/call so we can find every text pointer, species constant and movement a script uses.
import struct

# opcode: (name, arg layout) - b=u8, h=u16, w=u32, p=script pointer, t=text pointer, m=movement pointer
OPS = {
    0x00: ('nop', ''), 0x01: ('nop1', ''), 0x02: ('end', ''), 0x03: ('return', ''), 0x04: ('call', 'p'), 0x05: ('goto', 'p'),
    0x06: ('goto_if', 'bp'), 0x07: ('call_if', 'bp'), 0x08: ('gotostd', 'b'), 0x09: ('callstd', 'b'), 0x0A: ('gotostd_if', 'bb'),
    0x0B: ('callstd_if', 'bb'), 0x0C: ('returnram', ''), 0x0D: ('endram', ''), 0x0E: ('setmysteryeventstatus', 'b'),
    0x0F: ('loadword', 'bt'), 0x10: ('loadbyte', 'bb'), 0x11: ('writebytetoaddr', 'bw'), 0x12: ('loadbytefromaddr', 'bw'),
    0x13: ('setptrbyte', 'bw'), 0x14: ('copylocal', 'bb'), 0x15: ('copybyte', 'ww'), 0x16: ('setvar', 'hh'), 0x17: ('addvar', 'hh'),
    0x18: ('subvar', 'hh'), 0x19: ('copyvar', 'hh'), 0x1A: ('setorcopyvar', 'hh'), 0x1B: ('compare_local_to_local', 'bb'),
    0x1C: ('compare_local_to_value', 'bb'), 0x1D: ('compare_local_to_addr', 'bw'), 0x1E: ('compare_addr_to_local', 'wb'),
    0x1F: ('compare_addr_to_value', 'wb'), 0x20: ('compare_addr_to_addr', 'ww'), 0x21: ('compare_var_to_value', 'hh'),
    0x22: ('compare_var_to_var', 'hh'), 0x23: ('callnative', 'w'), 0x24: ('gotonative', 'w'), 0x25: ('special', 'h'),
    0x26: ('specialvar', 'hh'), 0x27: ('waitstate', ''), 0x28: ('delay', 'h'), 0x29: ('setflag', 'h'), 0x2A: ('clearflag', 'h'),
    0x2B: ('checkflag', 'h'), 0x2C: ('initclock', 'hh'), 0x2D: ('dotimebasedevents', ''), 0x2E: ('gettime', ''), 0x2F: ('playse', 'h'),
    0x30: ('waitse', ''), 0x31: ('playfanfare', 'h'), 0x32: ('waitfanfare', ''), 0x33: ('playbgm', 'hb'), 0x34: ('savebgm', 'h'),
    0x35: ('fadedefaultbgm', ''), 0x36: ('fadenewbgm', 'h'), 0x37: ('fadeoutbgm', 'b'), 0x38: ('fadeinbgm', 'b'),
    0x39: ('warp', 'bbbhh'), 0x3A: ('warpsilent', 'bbbhh'), 0x3B: ('warpdoor', 'bbbhh'), 0x3C: ('warphole', 'bb'),
    0x3D: ('warpteleport', 'bbbhh'), 0x3E: ('setwarp', 'bbbhh'), 0x3F: ('setdynamicwarp', 'bbbhh'), 0x40: ('setdivewarp', 'bbbhh'),
    0x41: ('setholewarp', 'bbbhh'), 0x42: ('getplayerxy', 'hh'), 0x43: ('getpartysize', ''), 0x44: ('additem', 'hh'),
    0x45: ('removeitem', 'hh'), 0x46: ('checkitemspace', 'hh'), 0x47: ('checkitem', 'hh'), 0x48: ('checkitemtype', 'h'),
    0x49: ('addpcitem', 'hh'), 0x4A: ('checkpcitem', 'hh'), 0x4B: ('adddecoration', 'h'), 0x4C: ('removedecoration', 'h'),
    0x4D: ('checkdecor', 'h'), 0x4E: ('checkdecorspace', 'h'), 0x4F: ('applymovement', 'hm'), 0x50: ('applymovementat', 'hmbb'),
    0x51: ('waitmovement', 'h'), 0x52: ('waitmovementat', 'hbb'), 0x53: ('removeobject', 'h'), 0x54: ('removeobjectat', 'hbb'),
    0x55: ('addobject', 'h'), 0x56: ('addobjectat', 'hbb'), 0x57: ('setobjectxy', 'hhh'), 0x58: ('showobjectat', 'hbb'),
    0x59: ('hideobjectat', 'hbb'), 0x5A: ('faceplayer', ''), 0x5B: ('turnobject', 'hb'), 0x5C: ('trainerbattle', None),
    0x5D: ('dotrainerbattle', ''), 0x5E: ('gotopostbattlescript', ''), 0x5F: ('gotobeatenscript', ''), 0x60: ('checktrainerflag', 'h'),
    0x61: ('settrainerflag', 'h'), 0x62: ('cleartrainerflag', 'h'), 0x63: ('setobjectxyperm', 'hhh'), 0x64: ('moveobjectoffscreen', 'h'),
    0x65: ('setobjectmovementtype', 'hb'), 0x66: ('waitmessage', ''), 0x67: ('message', 't'), 0x68: ('closemessage', ''),
    0x69: ('lockall', ''), 0x6A: ('lock', ''), 0x6B: ('releaseall', ''), 0x6C: ('release', ''), 0x6D: ('waitbuttonpress', ''),
    0x6E: ('yesnobox', 'bb'), 0x6F: ('multichoice', 'bbbb'), 0x70: ('multichoicedefault', 'bbbbb'), 0x71: ('multichoicegrid', 'bbbbb'),
    0x72: ('drawbox', ''), 0x73: ('erasebox', 'bbbb'), 0x74: ('drawboxtext', 'bbbb'), 0x75: ('showmonpic', 'hbb'), 0x76: ('hidemonpic', ''),
    0x77: ('showcontestwinner', 'b'), 0x78: ('braillemessage', 'w'), 0x79: ('givemon', 'hbhwwb'), 0x7A: ('giveegg', 'h'),
    0x7B: ('setmonmove', 'bbh'), 0x7C: ('checkpartymove', 'h'), 0x7D: ('bufferspeciesname', 'bh'), 0x7E: ('bufferleadmonspeciesname', 'b'),
    0x7F: ('bufferpartymonnick', 'bh'), 0x80: ('bufferitemname', 'bh'), 0x81: ('bufferdecorationname', 'bh'), 0x82: ('buffermovename', 'bh'),
    0x83: ('buffernumberstring', 'bh'), 0x84: ('bufferstdstring', 'bh'), 0x85: ('bufferstring', 'bt'), 0x86: ('pokemart', 'w'),
    0x87: ('pokemartdecoration', 'w'), 0x88: ('pokemartdecoration2', 'w'), 0x89: ('playslotmachine', 'h'), 0x8A: ('setberrytree', 'bbb'),
    0x8B: ('choosecontestmon', ''), 0x8C: ('startcontest', ''), 0x8D: ('showcontestresults', ''), 0x8E: ('contestlinktransfer', ''),
    0x8F: ('random', 'h'), 0x90: ('addmoney', 'wb'), 0x91: ('removemoney', 'wb'), 0x92: ('checkmoney', 'wb'), 0x93: ('showmoneybox', 'bbb'),
    0x94: ('hidemoneybox', ''), 0x95: ('updatemoneybox', 'bbb'), 0x96: ('getpokenewsactive', 'h'), 0x97: ('fadescreen', 'b'),
    0x98: ('fadescreenspeed', 'bb'), 0x99: ('setflashradius', 'h'), 0x9A: ('animateflash', 'b'), 0x9B: ('messageautoscroll', 't'),
    0x9C: ('dofieldeffect', 'h'), 0x9D: ('setfieldeffectargument', 'bh'), 0x9E: ('waitfieldeffect', 'h'), 0x9F: ('setrespawn', 'h'),
    0xA0: ('checkplayergender', ''), 0xA1: ('playmoncry', 'hh'), 0xA2: ('setmetatile', 'hhhh'), 0xA3: ('resetweather', ''),
    0xA4: ('setweather', 'h'), 0xA5: ('doweather', ''), 0xA6: ('setstepcallback', 'b'), 0xA7: ('setmaplayoutindex', 'h'),
    0xA8: ('setobjectsubpriority', 'hbbb'), 0xA9: ('resetobjectsubpriority', 'hbb'), 0xAA: ('createvobject', 'bbhhbb'),
    0xAB: ('turnvobject', 'bb'), 0xAC: ('opendoor', 'hh'), 0xAD: ('closedoor', 'hh'), 0xAE: ('waitdooranim', ''), 0xAF: ('setdooropen', 'hh'),
    0xB0: ('setdoorclosed', 'hh'), 0xB1: ('addelevmenuitem', 'bhhh'), 0xB2: ('showelevmenu', ''), 0xB3: ('checkcoins', 'h'),
    0xB4: ('addcoins', 'h'), 0xB5: ('removecoins', 'h'), 0xB6: ('setwildbattle', 'hbh'), 0xB7: ('dowildbattle', ''),
    0xB8: ('setvaddress', 'w'), 0xB9: ('vgoto', 'w'), 0xBA: ('vcall', 'w'), 0xBB: ('vgoto_if', 'bw'), 0xBC: ('vcall_if', 'bw'),
    0xBD: ('vmessage', 'w'), 0xBE: ('vloadptr', 'w'), 0xBF: ('vbufferstring', 'bw'), 0xC0: ('showcoinsbox', 'bb'), 0xC1: ('hidecoinsbox', 'bb'),
    0xC2: ('updatecoinsbox', 'bb'), 0xC3: ('incrementgamestat', 'b'), 0xC4: ('setescapewarp', 'bbbhh'), 0xC5: ('waitmoncry', ''),
    0xC6: ('bufferboxname', 'bh'), 0xC7: ('textcolor', 'b'), 0xC8: ('loadhelp', 'w'), 0xC9: ('unloadhelp', ''), 0xCA: ('signmsg', ''),
    0xCB: ('normalmsg', ''), 0xCC: ('comparehiddenvar', 'bw'), 0xCD: ('setmonmodernfatefulencounter', 'h'),
    0xCE: ('checkmonmodernfatefulencounter', 'h'), 0xCF: ('trywondercardscript', ''), 0xD0: ('setworldmapflag', 'h'),
    0xD1: ('warpspinenter', 'bbbhh'), 0xD2: ('setmonmetlocation', 'hb'), 0xD3: ('moverotatingtileobjects', 'h'),
    0xD4: ('turnrotatingtileobjects', ''), 0xD5: ('initrotatingtilepuzzle', 'h'), 0xD6: ('freerotatingtilepuzzle', ''),
}
SIZES = {'b': 1, 'h': 2, 'w': 4, 'p': 4, 't': 4, 'm': 4}
# trainerbattle type -> pointer kinds after (type, trainer, local id)
TB = {0: 'tt', 1: 'ttp', 2: 'ttp', 3: 't', 4: 'ttt', 5: 'tt', 6: 'tttp', 7: 'ttt', 8: 'tttp', 9: 'tt'}
ENDS = {'end', 'return', 'goto', 'gotostd', 'returnram', 'endram', 'gotonative', 'vgoto'}


def ptr(rom, o):
    v = struct.unpack_from('<I', rom, o)[0]
    return v - 0x08000000 if 0x08000000 <= v < 0x0A000000 else -1


def decode_one(rom, o):
    """(name, [(kind, value, arg_offset)], next_offset) or None for an unknown opcode"""
    op = rom[o]
    if op not in OPS:
        return None
    name, lay = OPS[op]
    args, i = [], o + 1
    if op == 0x5C:
        t = rom[i]
        args.append(('b', t, i)); i += 1
        args.append(('h', struct.unpack_from('<H', rom, i)[0], i)); i += 2
        args.append(('h', struct.unpack_from('<H', rom, i)[0], i)); i += 2
        for k in TB.get(t, 'tt'):
            args.append((k, ptr(rom, i), i)); i += 4
        return name, args, i
    for k in lay:
        n = SIZES[k]
        v = rom[i] if n == 1 else struct.unpack_from('<H' if n == 2 else '<I', rom, i)[0]
        if k in 'ptm':
            v = ptr(rom, i)
        args.append((k, v, i)); i += n
    return name, args, i


def disasm(rom, start, follow=True, limit=4000):
    """Disassemble from start, following goto/call targets. Returns sorted [(offset, name, args)]"""
    seen, todo, out = set(), [start], []
    while todo and len(out) < limit:
        o = todo.pop()
        while 0 <= o < len(rom) and o not in seen and len(out) < limit:
            seen.add(o)
            d = decode_one(rom, o)
            if not d:
                out.append((o, '??%02X' % rom[o], []))
                break
            name, args, n = d
            out.append((o, name, args))
            if follow:
                todo.extend(v for k, v, _ in args if k == 'p' and v >= 0)
            if name in ENDS:
                break
            o = n
    return sorted(out)


def fmt(ins):
    o, name, args = ins
    a = ', '.join(('0x%X' % v) if k != 'b' else str(v) for k, v, _ in args)
    return '%06X  %s %s' % (o, name, a)
