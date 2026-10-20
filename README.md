# Ember Studio

An editor for making your own game on top of **Pokémon FireRed (US) v1.1**: maps, story, Pokémon, trainers, music and text, with a Hebrew or English interface (the **English / עברית** button at the top).
It started as a Hebrew translation editor, and right-to-left text and Hebrew letters in the game fonts are still built in. Emerald (US) still loads for text, Pokémon, maps and graphics.

## Running it

- **`EmberStudio.exe`:** one file, nothing to install.
  - It opens a normal window (Microsoft Edge WebView2, part of Windows 10/11) and holds the editor, the Python backend and build tools, and mGBA.
  - On first start mGBA is copied to `%LOCALAPPDATA%\EmberStudio\mgba`.
  - Settings, the autosave and the work folder (`%LOCALAPPDATA%\EmberStudio`) stay between runs.
  - `EmberStudio.exe --selftest result.json --rom game.gba` checks the window, the emulator and the backend, and writes the result to a file.
- **From the source:** `python ember/server.py` opens the editor at http://localhost:8765 in a browser. `python ember/app.py` opens the same window as the EXE (needs `pip install pywebview pillow`).
- **Without the backend:** opening `index.html` directly still edits ROM files, but there are no projects, building or emulator in that mode.

### Building the EXE

```
python -m venv .venv-ember
.venv-ember\Scripts\pip install pyinstaller pywebview pillow==12.3.0
.venv-ember\Scripts\python editor\ember\build_exe.py          # -> dist\EmberStudio.exe (signed when the certificate is there)
```

- Pillow is pinned to the version the regular build uses: other versions reduce colours slightly differently, and the ROM is then not byte-identical.
- `ember/make_icon.py` draws the icon.

## Projects

A project is a small folder that you can put in Git. It never contains the original ROM: everyone uses their own copy, recognised by its CRC.

```
MyGame/
  project.json      name, language, base ROM (CRC only), custom build steps
  rom/patch.bin     every byte the editor changed (exact)
  data/*.json       the same changes as data: Pokémon, world edits, story
  out/              stage.gba (base + custom steps) and game.gba (the finished game) - not for Git
```

- **✨ New game:** a wizard asks for:
  1. Name and language (Hebrew adds the fonts, right-to-left text and the full translation).
  2. A folder.
  3. Your FireRed ROM.
  4. The professor's name.
  5. 3 starters. The rival's teams follow them through the whole game.
  6. Town names (also changed in every dialogue).
  7. The 8 gym leaders: name, and a type that gives them a new team.

  The answers go into the game right away, plus `data/story.json` (8 badges) for the story editor.
- **📂 Open project:** builds the game (base ROM → custom steps → your changes) and opens it.
  - Custom steps are Python scripts. Their result is cached until their files change.
  - **💾 Save** (Ctrl+S) writes your changes back. **🔨 Build** makes `out/game.gba`. **▶ Build & play** opens it in mGBA.
- **📥 Turn a ROM into a project:** an existing hack or translation becomes a project (its changes against the original become the patch).
- **🩺 Game check** finds problems before you build:
  - doors that lead nowhere;
  - item balls that share a flag, and trainers used on two maps;
  - lines too wide for the message box, and lines still in English in a Hebrew game;
  - a gym leader weaker than the one before, and running out of free space.

  Every finding has a **Show** button.

## Trainers, items & shops, moves

- **Trainers:** a list with filters (on the maps / leaders & Elite Four / rival / free slots) and a card for each trainer.
  - **The card:**
    - picture, name, class (its picture, music and AI follow);
    - music, female trainer, double battle;
    - the team: species, level, strength 0–255, held items, and their own moves or the level-up moves;
    - up to 4 battle items, and how smart they are (Simple / Normal / Smart / Expert, details under Advanced);
    - where they battle, with their lines editable right there.
  - **Difficulty along the story:** every trainer's strongest Pokémon, in story order.
    - Gym leaders are the milestones, and the gym trainers sit with their leader.
    - Red dots are trainers stronger than the next leader, or much weaker than the last one.
    - "Fit them to the curve" fixes them, and "All trainers ±%" makes the whole game easier or harder.
- **Items & shops:**
  - **Every item:** icon, name, price, the bag description, which shops sell it and where it lies on the maps (balls and hidden items). Hold effect and pocket are under Advanced.
  - **Every shop** (every `pokemart` in the scripts): add, remove and reorder items, and jump to the seller.
- **Moves:**
  - **Every move:** name, type, power, accuracy, PP, priority, what it does (all 214 Gen 3 effects, in words), extra-effect chance, who it hits, flags under Advanced, and the description.
  - Who learns it, by level and by TM.
  - The TM / HM list and the 15 move tutors.

## Story and scripts with blocks

- **📖 Story:** the plot as chapters and steps. Each step waits for the one before it.
  - **Step types:**
    - 💬 **talk** to someone;
    - ⚔ **beat a trainer** (the story moves on right after the win);
    - 📍 **reach a place** (a trigger that only fires at that step);
    - 🎬 **a scene when you arrive** (plays on that map at that step);
    - ❓ **a yes/no choice**: two paths that join again;
    - 🥊 **rival battle**: an existing person or a new one you place, a team that grows each time, and lines before, at the end of and after the battle.
  - **A guard** can block the way until a step is done, and disappears afterwards.
  - **Characters:** a person's lines change after a step ("from the start" / "after step …").
  - **✨ Apply the story to the game** compiles everything:
    - a story variable (a free `0x40xx`) counts finished steps;
    - each person gets one script for all their steps (and still says their original lines before and after);
    - trainers get a "continue" battle that moves the story on;
    - places get triggers, and scenes get map frame scripts.

    Applying again first undoes the previous version (scripts, objects, triggers, map scripts and freed space).
- **🧩 Blocks:** scripts without code, as coloured cards.
  - **Talk:** say, ask yes/no with YES / NO branches.
  - **Give:** item, Pokémon, take, heal, shop.
  - **Battle:** wild or trainer.
  - **Movement:** walk (draw the path with arrows), turn, emote ❗❓♥, wait, disappear / appear.
  - **Conditions:** flag, item.
  - **Effects:** music, sound, fade, warp.

  Blocks can be dragged up and down, and nested branches show indented. A preview walks the people across the map in the editor.
  Every person, sign and trigger has **🧩 Script with blocks** in its panel. The block source is saved in the project (`data/scripts.json`), and "Back to the original script" undoes it.

## The game's own story (Story tab)

- **What it shows:** the Story tab shows the story already in the game as grey moments in chapters, merged with your own steps. There are three views: timeline, by place, and flowchart.
- **`js/storymap.js`: finding the story.**
  - **What is followed:** every script, branch by branch. That means people (with their "hidden" flag), signs, triggers, and the per-frame / warp-in tables of the map scripts.
  - **Conditions** come from `compare`, `checkflag` and `checktrainerflag`, plus `goto_if` / `call_if`.
    - A condition that is already known decides later checks.
    - Paths that meet in the same state go on as one.
  - **Results** are setvar / addvar / copyvar on 0x4010–0x40FF, flags 0x20–0x8FF, givemon (also from a variable, as with the starters), items, and trainer / wild battles.
  - **Moments:** each path with a result is an event. Events on the same map and depth that set the same thing form one moment ("beat") with alternatives.
  - **Order:**
    - An event comes after whatever sets the conditions it needs. "New game" flags come from the long setflag run that FireRed runs at the start.
    - Story counters also count: setting a variable to n comes after setting it to the value before (0x4055: Oak, lab, starter, rival, parcel…).
  - **Speed:** about 250 ms for the whole game, cached per ROM version.
- **`js/storymap_fr.js`: names.**
  - There are 16 chapters by map section, and 67 named moments of FireRed matched by map + what they do (`v4055=1`, `f820`, `i265`…).
  - In a game built on FireRed, unnamed moments are side events. A renamed trainer is shown in brackets.
- **`js/storyview.js`: the views and editing.**
  - **Editing a moment:** lines (`Objects.textBubble`), the Pokémon / level / item / quantity it gives (the command's operand, or the setvar that feeds it), and a link to the trainer.
  - **▶ Test from here:** sets the flags / variables its conditions need, via `Emu.testRom`'s `vars` and `clear`.
- **Changing the game's story (`StoryTab.apply` → `hookOriginal`):**
  - **Skip:** the pointer that leads into the moment is redirected to our script. That pointer is a `goto_if` target, the person / trigger / frame-table script pointer, or, for a fall-through, the first ≥5 bytes of commands, which move into our script while a `goto` takes their place.
    - The skip script applies the moment's results (and gifts) and ends.
  - **Your chapter after a moment:** it has its own variable (`story.lineVars`). Its first step requires the moment's result.
    - The moment it "holds" is hooked: `compare var, end; goto_if < (the other branch / end)`.
  - **Order of applying:** hooks are installed before our scripts (a person's new script that goes on into the old one passes through the hook). Undo goes in reverse and is byte-exact. The patches are kept in `story.meta.patches`.
  - **Stable moments:** the analysis runs on a copy of the ROM with our story undone, so a moment keeps the same id after applying.
- **Tests (in `tests/run_all.py`):**
  - "Oak stops you" skipped: stepping on the spot moves the story on within 150 frames, with no scene.
  - A step between the starter and the rival: the rival waits (900 frames, nothing changes), the step works, and then the rival battle comes.

## Graphics: blocks, characters, title screen

- **Maps & Wild → 🧱 Blocks & tiles:** the graphics a map is made of (its primary tileset, shared by many maps, and its secondary one).
  - Pick a block and see its 4 bottom and 4 top squares. Each square has a tile, a palette and flips.
  - Click a tile on the sheet to place it in a square, and draw the tile pixel by pixel (double-click a colour to change the palette).
  - Set the behaviour (grass with wild Pokémon, water, door…) and whether the top layer covers the player.
  - **Import a picture as new blocks:** each 16×16 square becomes a block of the area, identical squares share tiles, and the picture can bring its own 15 colours.
- **Graphics → 🧍 Characters & title screen:**
  - **Character from a picture:** one drawing becomes a battle picture (64×64, its own colours; replaces one of the 148 pictures and can go straight to a trainer) and the person on the map (16×32 in the colours of the sprite it replaces, all 9 frames). Both open in the pixel editor first.
  - **Title screen:** a logo picture instead of the Pokémon logo, two subtitle lines, a hero picture instead of Charizard, and the fire kept or the flag of Israel. Runs `tools/kl/title.py` through the backend. "Show the title screen" runs the game in mGBA and shows a screenshot of it.

## Playing inside the editor

- **🎮 Play** (top bar): the game as it is now, in a floating window inside the editor.
  - The window runs mGBA compiled to WebAssembly (`lib/mgba`, MPL-2.0).
  - Controls: pause, speed 1× / 2× / 4×, sound, save and load state, restart.
  - Keys while the window has focus: arrows, X = A, Z = B, Enter = Start, Backspace = Select, A / S = L / R.
- **▶ Play from here** (map editor, and the World view once a map is selected - the button is grey until then): click a spot and the game starts right there, with the 🎒 test team.
  - The editor makes a test copy of the game: on entering the first room, a script gives the team and warps to the spot.
  - The backend runs the intro at full speed in the native mGBA and saves a state on the spot, and the editor's emulator starts from that state.
  - It takes about 10 seconds.
- **▶ Test from this step** (Story): the same, with the story variable set to that step.

The Kachol-Lavan example project (`projects/KacholLavan`) runs `tools/kl/build.py` as its custom step. Its output is byte-identical to the regular build.

## User guides (PDF)

- `docs/Ember-Studio-Guide-en.pdf` and `docs/Ember-Studio-Guide-he.pdf`: about 50 pages each, with real screenshots of every screen.
- **❓ Guide** in the top bar opens the guide in the interface language, in the system's PDF viewer. The EXE includes both PDFs.
- **Sources:** `docs/manual/en.md` and `docs/manual/he.md` (Markdown). Nested lists use 2 spaces; the build widens them for Python-Markdown.
- **Building them:** `docs/manual/build.py` (needs `pip install markdown websocket-client` and Microsoft Edge).
  - It starts `ember/server.py` on port 8792 and a headless Edge.
  - It opens the editor with `index.html?docshot=<name>&lang=he|en&project=<folder>` for each screen (`js/docshot.js` goes to that screen and says when it is ready). It saves the PNGs to `docs/manual/img/<lang>/`.
  - It converts the Markdown to HTML (cover, contents, right-to-left for Hebrew) and prints it to PDF through Edge.
  - The screenshots use the demo projects `projects/docs_he` (הרפתקת הגחלת) and `projects/docs_en` (Ember Quest), made with the wizard. Personal folders in the pictures become `C:\Users\you\...`.
  - `build.py --pdf-only` keeps the screenshots. `build.py --shots he story trainers` retakes some of them.
  - `docs/manual/missing_he.txt` lists every string the Hebrew interface could not translate while taking the screenshots. Most of them are game data such as trainer names; the interface strings go to `js/i18n_he7.js`.
- `docs/manual/assets/make_hero.py` draws the neutral example character used in the guide.

## Tests

- `python tests/run_all.py` checks four things (see `tests/README.md`):
  - the editor in a headless Edge (every tab, blocks, objects, story and undo, a wizard project: save / reopen / build), in English and Hebrew;
  - every step of a test story up to the first gym leader, played in mGBA;
  - `EmberStudio.exe --selftest`;
  - the Kachol-Lavan build.
- The report goes to `tests/out/report.md`.
- `tests/MANUAL_CHECKLIST.md` lists what to try by hand before a release.

## The ROM file stays in sync (Chrome / Edge)

The file you open with **choose a file**, or drop on the page, is watched. When it changes on disk (for example after `build.py` rebuilt it):
- **No unsaved changes:** the editor reloads it and stays in the same tab.
- **Unsaved changes:** it asks what to do: export your map changes (for build.py), save your version as a copy, overwrite the file with your version, load the new file, or keep working on yours.

**💾 Save to file** (Ctrl+S) writes your changes back into the same file.

## Quick start

1. Open `index.html` (double-click) and drop your ROM on the page.
2. **Hebrew & Fonts → "Do all steps"**:
   - adds the 27 Hebrew letters (22 + 5 final forms) to all five Latin fonts,
   - installs the right-to-left text engine patch,
   - turns the naming screen's lowercase keyboard page into Hebrew.
3. **Text / Translation → Scan ROM** finds about 14,000 strings. Type Hebrew in each box. The preview on the right is drawn with the ROM's real font and the same right-to-left algorithm as the patch. **Ctrl+Enter** saves one string, and "Save all changes" saves every edited string.
4. **Name tables** (in the Text tab) cover Pokémon, moves, items, abilities, types and trainers. These are fixed-size, so each has a character limit.
   **Apply Hebrew name pack** fills them all in one click (from `data/hebrew_names.js`; about 1,140 names): Pokémon transliterated like the Israeli dub (פיקאצ'ו, צ'אריזארד); moves, abilities, types and items translated by meaning (ברק, להביור, פוקדור, שיקוי). Only names still in English are replaced, and you can edit any of them afterwards.
5. **Download ROM** (or **IPS patch**, which is the safe thing to share) and test in an emulator such as mGBA.

Your work is autosaved in the browser (IndexedDB). On the Home tab, choose "Restore" to continue later.
Use **Export / Import translations** (JSON) to back up your translation, or to merge work between people.

## Text format

| You type | Meaning |
|---|---|
| Enter or `\n` | next line |
| `\l` | scroll one line |
| `\p` | new paragraph (wait for A, clear box) |
| `{PLAYER}` `{RIVAL}` `{STR_VAR_1}` … | names and values filled in by the game |
| `{COLOR 02}` `{PAUSE 10}` `{SKIP 20}` … | control codes (hex arguments) |
| `{XX}` | raw byte |

When a translation is longer than the original, the string is moved to free space (from `0xE3D070`) and every pointer to it is updated automatically.

## How the right-to-left patch works

The game normally draws text one glyph at a time from left to right. The patch (`tools/rtl_patch.py`, 681 bytes at `0x08FFE000`) hooks `CopyGlyphToWindow` (Emerald `0x08004DA0`, FireRed v1.1 `0x08003028`):

- Text is split into **segments**: runs between line breaks or position codes (`{SKIP}`, `{CLEAR_TO}` …).
- If a segment **contains Hebrew**, each glyph is drawn at its mirrored position inside that segment. The text reads right-to-left, and the typing animation also starts from the right.
- Inside a Hebrew segment, **numbers and English words stay left-to-right** (a simplified version of the Unicode bidi rules). Values the game inserts at runtime are handled too, such as money amounts and item counts.
- Segments **without Hebrew are drawn exactly like the original**, so untranslated text still looks normal while you work.
- Menus, cursors and window layouts are not moved.
- With "Right-align dialogue" on, the editor adds a `{SKIP n}` to Hebrew dialogue lines so they hug the right edge of the message box.

The patch's per-glyph state lives in four unused bytes of the text printer struct (`+0x17..0x1A`), so it needs no extra RAM.

**Verification:** the patch was run in an ARM CPU emulator (Unicorn) on the patched ROM, including the game's own glyph-drawing code. Its glyph positions matched the editor preview exactly on all test strings: Hebrew, English, numbers, parentheses, control codes, multiple lines, paragraphs and right-alignment.
It has **not yet been played on a real emulator**. Please test in mGBA and report anything odd.

Ready-made test ROMs:
- `D:\GBA\FireRed_hebrew.gba`: Hebrew engine plus all Pokémon, move, ability, type and item names in Hebrew.
- `D:\GBA\emerald_hebrew_test.gba`: the main menu and Professor Birch's first lines in Hebrew.

The FireRed patch passed the same emulator comparison as Emerald.

## Tabs

- **Text / Translation**: all text in the ROM, with search, filters (dialogue / not translated / modified) and a live in-game preview, plus name tables.
- **Hebrew & Fonts**: setup checklist, a 16×16 glyph pixel editor with a width setting for every font, "copy glyph to all fonts", and the naming-screen keyboard editor.
- **Pokémon**: one card per Pokémon (a list with icons and search by Hebrew name or number).
  - **The card:** the picture, the name with a game-font preview and a 10-character counter, type badges, and stat bars with a total compared with similar Pokémon.
  - **Tabs:**
    - **Basics:** advanced fields (EV, EXP, eggs, gender…) sit behind a switch.
    - **Moves:** a level list with move search, a TM/HM grid, and copy from another Pokémon.
    - **Evolutions:** written as sentences, e.g. "evolves into X at level 16 / with the item…".
    - **Pokédex:** category, height, weight and description.
    - **Pictures:** a battle preview and front / back / shiny / icon. PNG import is automatic: background removal, fit to 64×64, 15 colours, and a shifted shiny palette. The pixel editor is still there.
    - **Where it's found:** edit the percent per area, add it to an area, and show it on the world map.
    - **Used in the game:** wild areas, trainers, gifts and evolutions.
  - **Helpers:** "Start from template" (copy chosen parts from another Pokémon), warnings (no level-1 move, an evolution below its wild level, stat total far from similar Pokémon), and "Test in battle", which opens a test ROM in mGBA through tools/devserver.py.
  - **🎁 Starters & gifts:** every givemon / setwildbattle in the maps' scripts. Changing the species also updates showmonpic and the buffered name.
  - **Export Pokémon changes** writes `pokemon_edits.json`, which `tools/kl/pokeedits.py` applies in every build.
- **Wild Pokémon (simple):** in the World view (Wild tab) and the Pokémon card, an area is a list of Pokémon + percent + level range for grass and surfing.
  - The editor spreads them over the game's fixed-odds slots and shows ≈ when a share can only be approximate.
  - Changing one percent adjusts the others, and 🔒 keeps one fixed.
  - The encounter rate is a preset: rare / normal / frequent…
- **Maps & Wild**: 518 maps drawn with their real tilesets.
  - Paint blocks, pick blocks (right click), and paint collision and elevation. Collision mode shows every cell's collision and elevation.
- **Objects (map editor and World view):**
  - **On the map:** people show their real overworld sprite, including the game's own characters (★ in the gallery, names from `data/kachol_lavan/game.json`). Doors, triggers, signs and hidden items have icons, and hidden items are drawn faint.
  - **Hover** over an object to see who it is: "Trainer: Bug Catcher RICK — 'Hey!…'", "Item ball: Poké Ball", "Door: → Rosh HaAyin 4.0".
  - **The side panel is simple by object type:**
    - **Item ball / hidden item:** choose the item (searchable list) and the quantity. It also shows the picked-up flag in plain words, warns when a flag is shared, and has a "Give it its own flag" button.
    - **Trainer:** class (its picture and music follow), name, team (species and level, add or remove members) and how far they see you.
    - **Person:** what it looks like (a sprite gallery grouped as people / Pokémon / objects) and its movement in plain words. The area a walking person may move in is drawn on the map.
    - **Conversation:** every line of the script, with branches ("If you answer YES:", "After you beat them, when you talk again:", "If flag … is set:"). Click a line to edit it, with a game-font preview. What the script does appears as grey sentences: gives an item, sets a flag, starts a battle…
    - **Door:** the destination map from a list of names, the arrival door, and "Jump to destination", which selects that door in the World view or the map editor.
    - **Your own name** for any object, saved in the editor only. Raw fields sit under "Advanced".
  - **New objects from templates:** talking person, item ball (Potion with a free flag), trainer (an unused trainer slot with a Pidgey lv 5 and three lines), sign, hidden item, door and trigger. You then edit them in the panel.
  - Edit the map header (music, weather, map type) and that map's wild encounters (species, levels, rates).
- **Maps & Wild → 🌍 World view**: every outdoor map joined by its connections (BFS from the start town), drawn with real tiles.
  - **Navigation:** wheel zoom, drag to pan, and a mini-map. Each map shows its name, and people and doors show as markers. Red marks overlaps and connections that disagree.
  - **Edit modes:**
    - Paint blocks, with the palette from the selected map's tileset.
    - Drag people, doors, triggers and signs.
    - **Resize** by dragging edges or corners, like a window. The new area gets the map's border pattern. Growing west or north shifts every object and fixes the connection offsets on both sides, so neighbours stay aligned. Shrinking stops at the nearest object. Size is capped at the game's buffer, (w+15)×(h+14) ≤ 10240.
    - **Move a map** along its neighbour, which changes the connection offsets.
    - **Connections:** click ✕ to remove one, or select a map and click a touching map to connect them. Unconnected maps can be added and dragged in, and they snap and connect when dropped touching another map.
  - **Layouts:** a layout shared with other maps gets its own copy (a new entry in gMapLayouts). The game loads layouts from that table.
  - **Editing the selected map:** the side panel has the map editor's tools as tabs: Blocks, Collision, Objects, Header and Wild. You edit directly on the big world view, and the other maps are dimmed slightly.
    - **Blocks:** click the palette for one block, or drag for a rectangle of blocks. A right-drag on any map, including a neighbour, copies that area with its collision as a brush, and a click stamps it. Dragging repeats the brush like tiles.
    - **Collision:** paint collision + elevation, with each cell's value drawn on the selected map. The status line shows the block, collision and elevation under the mouse.
    - **Objects:** add a person, sign, door / warp or trigger, delete them, and edit all their fields and texts.
  - **Undo:** Ctrl+Z undoes any edit.
  - **New maps:** drag a rectangle on the black area, then choose route or city, a Hebrew name and the tileset (taken from the neighbour).
    - The template fills the map with trees and opens paths toward every touching map. If a neighbour's edge is blocked, a path is cleared into it as well.
    - A city also gets a Pokémon Center and a Mart, whose interiors are copied with doors leading back.
    - It gets its own name slot: a free one, then the Sevii Islands slots.
    - For a city, it also gets a Fly point and a return-to-Pokémon-Center spot (the 7 Sevii island Fly slots).
  - **Town map:** the in-game town map (FireRed Kanto) is redrawn automatically after every change to the world: cities are dots, routes are paths, plus land, sea and coast. The name grid, the player-position tables and the picture are all updated, and the World view has a live preview.
  - **Export map changes** writes `world_edits.json` (exact byte changes + the list of edits). If the ROM has changed since, **Import edits** replays the edits on it. In Kachol-Lavan builds, `tools/kl/build.py` applies `data/kachol_lavan/maps_edit/*.json` after the cities are built.
- **Graphics**:
  - Pokémon front and back sprites with normal/shiny palettes, in a pixel editor (pen, fill, picker, undo, PNG import/export).
  - Every one of the ~2,100 compressed images in the ROM (title screen, intro, menus, trainer art, tilesets) is browsable and editable, along with its palettes.

- **Music**: every song in the game (M4A / "Sappy" engine), listed with the maps that play it.
  - **Layers:** one tab per track, with mute / solo, instrument, volume, pan and transpose.
  - **Piano roll:** click to add a note, drag to move or resize, right-click or Delete to remove. Drum layers show drum names on the keys.
  - **Event table:** time, note, length, velocity and commands (tempo, voice, volume, pan, bend, vibrato …) per layer.
  - **Instruments (voicegroup):** replace any slot with an instrument from any song in the game, and edit ADSR. Changes are written as a new voicegroup, so other songs are not affected.
  - **Play** renders the song in the browser with the game's own samples (approximate mix). Tempo, length, loop point, priority and reverb are editable.
  - **Import MIDI:** each channel becomes a layer, and each GM program is matched to an instrument the game's composers used for that program. Channel 10 uses the drum kit.
  - **Import WAV/MP3 as song:** the recording becomes one 8-bit sample (13379 Hz, the game's mixer rate) played as a held note, with an optional loop point. It takes about 0.8 MB per minute, and **Expand ROM to 32 MB** is available when space runs out.
  - **Write song to ROM** writes it to free space and repoints the song table.
  - **Export / Import .song.json** saves an editable copy. For Kachol-Lavan builds, files in `data/kachol_lavan/songs/` are applied by `tools/kl/build.py`.
  - Game limits are shown: 10 layers, and 5 sampled notes at once (square / wave / noise layers are extra).

## Known limitations

- **Hebrew glyph designs** are a first draft (5×7 pixels, with an ascender on ל and descenders on ך ן ף ץ ק). Polish them in the glyph editor.
- **Naming screen:** the keyboard is Hebrew, but the name being typed is drawn one letter per slot, so it likely fills left-to-right while typing. Once saved, the name displays correctly everywhere. Fixing the entry box needs a second small patch.
- Long Hebrew item and move names may be tight in some menus. Check the bag and the move list in the game.
- The "▼" continue arrow is drawn where an English line would end.
- **Bidi is simplified**: a neutral character between two English/number characters joins them, and anything else follows the Hebrew direction. If something reads wrong, rephrase it or use `{SKIP}`.
- Fixed-size names (Pokémon 10, moves/abilities 12, items 13, trainers 11 characters) cannot grow.
- **Map editor limits:** script commands other than text are shown read-only. In the World view's export, object changes (texts, items, teams) replay only on the same ROM; on a rebuilt ROM only positions, fields and new objects replay.

## Files

```
index.html, css/app.css
js/rom.js        ROM access, pointers, free space, LZ77, colors, IPS
js/charmap.js    Gen 3 text encoding + Hebrew + RTL encode/decode
js/game.js       finds all tables (Emerald verified; FR/LG by search)
js/font.js       fonts, Hebrew glyphs, keyboard, RTL patch installer
js/rtl_patch.js  generated patch bytes (per game)
data/hebrew_names.js  Hebrew name pack (Pokémon, moves, abilities, types, items)
js/text.js       text scanner, translation editor, preview/layout simulator
js/pokemon.js    Pokémon card, starters & gifts scanner, battle tester
js/wild.js       wild encounters as Pokémon + percent + levels
js/pokeexport.js export of Pokémon changes for build.py
js/maps.js       map, events, header, wild encounters
js/i18n.js       interface language; js/i18n_he.js + i18n_he2.js = the Hebrew strings
js/host.js       the local backend (files, dialogs, build, mGBA)
js/project.js    projects: open / save / build / import, patch.bin
js/wizard.js     the New game wizard
js/doctor.js     Game check
js/trainers.js   Trainers tab + difficulty curve
js/items.js      Items & shops tab (icon editor, what an item does, new items)
js/itemfx.js     item effects: medicine table, hold effects, ball catch bonuses, repels
js/i18n_he9.js   Hebrew strings of the items tab
js/moves.js      Moves tab (+ TM/HM, tutors)
js/i18n_he3.js   Hebrew strings of the trainers / items / moves tabs
js/script.js     script assembler + blocks compiler (FireRed script language)
js/blocks.js     block editor, map picker, movement preview
js/story.js      Story tab + story compiler
js/i18n_he4.js   Hebrew strings of the story / blocks
js/imgtools.js   picture helpers (load, median cut, quantize, fit)
js/tileset.js    Blocks & tiles
js/artstudio.js  character from a picture, title screen
ember/tools.py   title screen + mGBA screenshot / start-state tools (Python)
ember/app.py     the desktop program (pywebview window + server, --run-script, --selftest)
ember/build_exe.py  PyInstaller build of EmberStudio.exe
js/i18n_he5.js   Hebrew strings of the graphics tools
js/emulator.js   the emulator window, Play from here
lib/mgba/        mGBA compiled to WebAssembly (@thenick775/mgba-wasm 2.5.1, MPL-2.0, unchanged)
js/i18n_he6.js   Hebrew strings of the emulator
ember/server.py  the backend (static files + /api), ember/project.py = building a project
js/objects.js    objects: sprites, descriptions, conversation tree, item / trainer / door panels, templates
js/storymap.js   the game's own story: script paths -> events -> moments, order
js/storymap_fr.js  chapters and names of FireRed's story
js/storyview.js  timeline / by place / flowchart, editing a moment
js/i18n_he8.js   Hebrew strings of the game's story
js/docshot.js    screenshots for the user guide (?docshot=<screen>)
js/i18n_he7.js   Hebrew strings found by the guide's screenshots
tests/          run_all.py, suite.js (editor), step.lua (story steps in mGBA), cdp.py (headless Edge)
docs/manual/     guide sources (en.md, he.md), screenshots (img/), build.py -> docs/Ember-Studio-Guide-*.pdf
js/world.js      world view: all connected maps, map management (move / detach / delete), paint / resize / connect, doors, new maps
js/townmap.js    the in-game town map: preview + redraw from the world (rules in js/townmap_data.js)
js/graphics.js   pixel editor, sprites, compressed graphics browser
js/music.js      M4A song table, track decode/encode, synth, MIDI + WAV import
js/music_ui.js   Music tab (layers, piano roll, event table, instruments)
tools/rtl_patch.py  source of the ASM patch (pip install keystone-engine capstone)
tools/build_translation.py  builds data/translation_BPRE1.js from data/firered_he/*.json (needs your own _english.json)
tools/kl/        tools of the example game Kachol-Lavan (story, sprites, test bots)
```

## Source code and licence

- **Licence:** GPL-3.0 (`LICENSE`). mGBA (`lib/mgba/`) is MPL-2.0 and unchanged.
- **Not in the repository** (see `.gitignore`):
  - ROMs, saves and save states. Everyone uses their own Pokémon FireRed (US) v1.1.
  - `data/firered_he/_english.json`, the original English text of FireRed. `tools/build_translation.py` needs it to rebuild the translation pack: extract it from your own ROM. The pack itself (`data/translation_BPRE1.js`) keeps only a hash of each English line, not the text.
  - `data/kachol_lavan/` and `tools/kl/art/`, the data and pictures of the author's own game.
  - `tests/out/`, `dist/` and `build_exe/` (test runs and builds).
- **The EXE** is not in the repository either: it is attached to each GitHub Release (`ember/build_exe.py` builds it; `EMBER_DIST=folder` builds it into another folder when `dist\EmberStudio.exe` is running).

