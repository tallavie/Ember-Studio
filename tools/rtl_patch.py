# Assembles the Emerald RTL text patch (needs: pip install keystone-engine capstone)
import sys, struct, json
from keystone import Ks, KS_ARCH_ARM, KS_MODE_THUMB
from capstone import Cs, CS_ARCH_ARM, CS_MODE_THUMB

BASE = 0x08FFE000
ASM = r"""
hook_glyph:
    push {r4-r7, lr}
    sub sp, #8
    mov r4, r0
    ldrb r5, [r4, #8]
    str r5, [sp, #0]
    ldr r0, lit_curglyph_w
    ldrb r6, [r0]
    mov r0, r4
    adds r0, #0x20
    ldrb r0, [r0]
    cmp r0, r6
    ble L1
    mov r6, r0
L1:
    ldr r7, [r4, #0]
    @ state 0x17 holds (end of previous glyph + 1), so a fresh printer (0) always starts a segment
    ldrb r0, [r4, #0x17]
    adds r1, r5, #1
    cmp r0, r1
    beq L2
    @ new segment: remember its start and whether it contains Hebrew (state bit1)
    strb r5, [r4, #0x18]
    subs r0, r7, #1
    bl seghasrtl
    lsls r0, r0, #1
    strb r0, [r4, #0x1A]
L2:
    adds r0, r5, r6
    adds r0, #1
    strb r0, [r4, #0x17]
    ldrb r1, [r4, #0x1A]
    movs r0, #2
    tst r1, r0
    bne L2b
    mov r0, r5
    b place
L2b:
    subs r0, r7, #1
    ldrb r0, [r0]
    bl classify
    cmp r0, #0
    bne L3
    ldrb r1, [r4, #0x1A]
    movs r0, #1
    tst r1, r0
    beq L3z
    mov r0, r7
    bl peek
    cmp r0, #1
    beq L3
L3z:
    movs r0, #0
L3:
    cmp r0, #1
    bne notltr
    ldrb r1, [r4, #0x1A]
    movs r2, #1
    tst r1, r2
    bne L4
    strb r5, [r4, #0x19]
L4:
    movs r1, #3
    strb r1, [r4, #0x1A]
    mov r0, r7
    movs r1, #1
    bl scan
    ldrb r1, [r4, #0x18]
    adds r0, r0, r1
    ldrb r1, [r4, #0x19]
    subs r1, r5, r1
    adds r0, r0, r1
    b place
notltr:
    movs r1, #2
    strb r1, [r4, #0x1A]
    mov r0, r7
    movs r1, #0
    bl scan
    ldrb r1, [r4, #0x18]
    adds r0, r0, r1
place:
    strb r0, [r4, #8]
    mov r0, r4
    bl call_orig_glyph
    ldr r0, [sp, #0]
    strb r0, [r4, #8]
    add sp, #8
    pop {r4-r7}
    pop {r0}
    bx r0

@ r0 = ptr; returns 1 if a Hebrew glyph appears before the end of the segment
seghasrtl:
    push {r4, lr}
    mov r4, r0
h_loop:
    ldrb r0, [r4]
    cmp r0, #0xFA
    bhs h_ctrl
    cmp r0, #0xF7
    blo h_glyph
    adds r4, #2
    b h_loop
h_ctrl:
    cmp r0, #0xFD
    bne h_notfd
    adds r4, #2
    b h_loop
h_notfd:
    cmp r0, #0xFC
    bne h_no
    ldrb r0, [r4, #1]
    cmp r0, #0x0C
    bne h_notesc
    adds r4, #2
    b h_loop
h_notesc:
    cmp r0, #0x18
    bhi h_no
    cmp r0, #0x0D
    beq h_no
    cmp r0, #0x0E
    beq h_no
    cmp r0, #0x11
    blo h_skip
    cmp r0, #0x13
    bls h_no
h_skip:
    ldr r1, lit_argc
    ldrb r1, [r1, r0]
    adds r4, #2
    adds r4, r4, r1
    b h_loop
h_glyph:
    adds r4, #1
    bl classify
    cmp r0, #2
    bne h_loop
    movs r0, #1
    b h_ret
h_no:
    movs r0, #0
h_ret:
    pop {r4}
    pop {r1}
    bx r1

@ r0 = ptr -> class of the next glyph, skipping zero-width control codes (keeps r2, r3)
peek:
    ldrb r1, [r0]
    cmp r1, #0xFD
    bne p_notfd
    adds r0, #2
    b peek
p_notfd:
    cmp r1, #0xFC
    bne p_glyph
    ldrb r1, [r0, #1]
    cmp r1, #0x0C
    bne p_notesc
    ldrb r0, [r0, #2]
    b classify
p_notesc:
    cmp r1, #0x18
    bhi p_none
    cmp r1, #0x0D
    beq p_none
    cmp r1, #0x0E
    beq p_none
    cmp r1, #0x11
    blo p_skip
    cmp r1, #0x13
    bls p_none
p_skip:
    push {r2}
    ldr r2, lit_argc
    ldrb r1, [r2, r1]
    pop {r2}
    adds r0, #2
    adds r0, r0, r1
    b peek
p_glyph:
    mov r0, r1
    b classify
p_none:
    movs r0, #0
    bx lr

@ r0 = byte -> r0 = 0 neutral, 1 LTR, 2 RTL (uses r0 only)
classify:
    cmp r0, #0x37
    blo c_low
    cmp r0, #0x4F
    bls c_rtl
    cmp r0, #0x5E
    beq c_rtl
    cmp r0, #0x5F
    beq c_rtl
    cmp r0, #0xA1
    blo c_neu
    cmp r0, #0xAA
    bls c_ltr
    cmp r0, #0xBB
    blo c_neu
    cmp r0, #0xEE
    bls c_ltr
    cmp r0, #0xF1
    blo c_neu
    cmp r0, #0xF6
    bls c_ltr
    b c_neu
c_low:
    cmp r0, #1
    blo c_neu
    cmp r0, #0x2B
    bls c_ltr
c_neu:
    movs r0, #0
    bx lr
c_ltr:
    movs r0, #1
    bx lr
c_rtl:
    movs r0, #2
    bx lr

@ r0 = ptr, r1 = skip LTR run flag, r4 = printer. returns r0 = width sum
scan:
    push {r4-r7, lr}
    mov r5, r0
    movs r6, #0
    mov r7, r1
    mov r0, r4
    adds r0, #0x20
    ldrb r3, [r0]
    ldrb r0, [r4, #0x14]
    lsls r0, r0, #28
    lsrs r0, r0, #28
    cmp r0, #9
    bls L5
    movs r0, #1
L5:
    lsls r0, r0, #2
    ldr r1, lit_widthtbl
    ldr r4, [r1, r0]
s_loop:
    ldrb r0, [r5]
    cmp r0, #0xFA
    bhs s_ctrl
    cmp r0, #0xF7
    beq s_skip2
    cmp r0, #0xF8
    beq s_icon
    cmp r0, #0xF9
    beq s_ext
    mov r2, r0
    adds r5, #1
    b s_glyph
s_ext:
    ldrb r2, [r5, #1]
    adds r2, #0xFF
    adds r2, #1
    adds r5, #2
    movs r0, #0
    b s_glyph
s_icon:
    adds r5, #2
    movs r0, #0
    movs r2, #0
    b s_glyph
s_skip2:
    adds r5, #2
    b s_loop
s_ctrl:
    cmp r0, #0xFC
    beq s_fc
    cmp r0, #0xFD
    beq s_skip2
    b s_done
s_fc:
    ldrb r0, [r5, #1]
    cmp r0, #0x0C
    beq s_esc
    cmp r0, #0x0D
    beq s_done
    cmp r0, #0x0E
    beq s_done
    cmp r0, #0x11
    beq s_done
    cmp r0, #0x12
    beq s_done
    cmp r0, #0x13
    beq s_done
    movs r1, #0
    cmp r0, #0x18
    bhi L6
    ldr r1, lit_argc
    ldrb r1, [r1, r0]
L6:
    adds r5, #2
    adds r5, r5, r1
    b s_loop
s_esc:
    ldrb r0, [r5, #2]
    mov r2, r0
    adds r5, #3
s_glyph:
    cmp r7, #0
    beq s_addw
    bl classify
    cmp r0, #1
    beq s_loop
    cmp r0, #0
    bne s_stop
    mov r0, r5
    bl peek
    cmp r0, #1
    beq s_loop
s_stop:
    movs r7, #0
s_addw:
    cmp r4, #0
    beq s_w8
    ldrb r0, [r4, r2]
    b s_havew
s_w8:
    movs r0, #8
s_havew:
    cmp r0, r3
    bge L7
    mov r0, r3
L7:
    adds r6, r6, r0
    b s_loop
s_done:
    mov r0, r6
    pop {r4-r7}
    pop {r1}
    bx r1

.align 2
call_orig_glyph:
    .byte 0xF0, 0xB5, 0x57, 0x46, 0x4E, 0x46, 0x45, 0x46
    ldr r3, lit_resume
    bx r3
.align 2
lit_resume:     .word {RESUME}
lit_curglyph_w: .word {CURGLYPH_W}
lit_widthtbl:   .word widthtbl
lit_argc:       .word argctbl
widthtbl:
    .word {WIDTHS}
argctbl:
    .byte 0,1,1,1,3,1,1,0,1,0,0,2,1,1,1,0,2,1,1,1,1,0,0,0,0
"""
# Per-game parameters. hookSite = CopyGlyphToWindow, clearSite = the minLetterSpacing ClearTextSpan call in RenderText.
GAMES = {
    'BPEE': dict(name='Emerald (US)', hookSite=0x4DA0, clearSite=0x5C3A, curglyph=0x03002F90,
                 widths=[0x0863BCE4, 0x086542E4, 0x0864C0E4, 0x0864C0E4, 0x0864C0E4, 0x0864C0E4, 0, 0x08643EE4, 0x08633AE4, 0x086542E4]),
    'BPRE1': dict(name='FireRed (US) v1.1', hookSite=0x3028, clearSite=0x5C2C, curglyph=0x03003DA0,
                 widths=[0x081EEF70, 0x081FB170, 0x08207370, 0x08207370, 0x08217688, 0x082279A0, 0, 0x08207370, 0x08207370, 0x08207370]),
}
ORIG = bytes([0xF0,0xB5,0x57,0x46,0x4E,0x46,0x45,0x46])

def build(g):
    src = ASM.replace('{RESUME}', hex(0x08000000 + g['hookSite'] + 8 + 1)).replace('{CURGLYPH_W}', hex(g['curglyph'] + 0x80)) \
             .replace('{WIDTHS}', ', '.join(hex(w) for w in g['widths']))
    enc, _ = Ks(KS_ARCH_ARM, KS_MODE_THUMB).asm(src, BASE)
    return bytes(enc)

# optional sanity check against ROMs: python rtl_patch.py [-d] [rom.gba ...]
for path in [a for a in sys.argv[1:] if a.lower().endswith('.gba')]:
    rom = open(path, 'rb').read()
    key = rom[0xAC:0xB0].decode() + ('1' if rom[0xAC:0xB0] == b'BPRE' and rom[0xBC] == 1 else '')
    if key not in GAMES: print(path, 'unsupported', key, file=sys.stderr); continue
    g = GAMES[key]
    assert rom[g['hookSite']:g['hookSite'] + 8] == ORIG, (path, rom[g['hookSite']:g['hookSite'] + 8].hex())
    print(path, 'OK', key, 'clear call', rom[g['clearSite']:g['clearSite'] + 4].hex(), file=sys.stderr)

out = {}
for key, g in GAMES.items():
    code = build(g)
    if '-d' in sys.argv:
        print('=====', key)
        for i in Cs(CS_ARCH_ARM, CS_MODE_THUMB).disasm(code, BASE):
            print('%08x: %-8s %s' % (i.address, i.mnemonic, i.op_str))
    out[key] = dict(name=g['name'], hookSite=g['hookSite'], clearSite=g['clearSite'], at=BASE - 0x08000000, hex=code.hex())
    print(key, len(code), 'bytes', file=sys.stderr)
import os
path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'js', 'rtl_patch.js')
open(path, 'w').write('// Generated by tools/rtl_patch.py - right-to-left text hook per game, assembled for 0x%08X\nwindow.RTL_PATCHES = %s;\n' % (BASE, json.dumps(out, indent=1)))
print('wrote', path, file=sys.stderr)
