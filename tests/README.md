# Tests

```
pip install websocket-client
python tests/run_all.py                 # everything, about 15 minutes
python tests/run_all.py --only browser  # the editor only
python tests/run_all.py --only game     # replay the story-step ROMs of the last run (quick)
python tests/run_all.py --only game --step gift
```

You need Microsoft Edge, mGBA (`tools/mgba_nightly`, or the copy the EXE installs in `%LOCALAPPDATA%\EmberStudio\mgba`) and your own Pokémon FireRed (US) v1.1. The runner finds the ROM in Ember Studio's settings, or you pass it with `--rom`.

The results go to `tests/out/report.md`. The exit code is 1 when a test failed.

## What is tested

1. **The editor** (`suite.js`, in a headless Edge, in English and in Hebrew).
   - **On the original game:**
     - every tab and sub-view opens without errors;
     - the text scan finds more than 9000 strings;
     - the Game check finds no errors, and the world view shows no warnings;
     - every block compiles;
     - objects of every kind can be added and deleted;
     - every story step type applies, and undoing the story puts the maps back exactly;
     - a "reach a place" step on a tree is refused.
   - **A game made with the wizard:**
     - `out/game.gba` is the ROM the editor shows;
     - two builds give the same bytes;
     - an edit and the story survive save and reopen.
2. **The story in the real game** (`step.lua`, mGBA at full speed).
   - The test game's chapter 1 has these steps:
     - talk;
     - a scene;
     - a choice, answered both yes and no;
     - a talk that only happens after "yes";
     - reach a place;
     - a rival battle.
   - Then comes the first gym leader.
   - **The game's own story:** "Oak stops you" is skipped and must move the story on at once. A step between the starter and the rival battle makes the rival wait until the step is done; the step itself must work, and after it the rival battle must come.
   - **How each step is run:** the editor writes a test ROM that starts right before the step (as **▶ Test from this step** does), with a strong team. The Lua script goes to the person or the spot and keeps pressing A (B for "no").
   - **Pass condition:** the story variable reaches the next stage, and the flag is right. For the gym leader, the flag is the badge.
   - **When a person is not where the map data says:** the script stops with a clear message. FireRed's map scripts move some people, for example the girl in Pallet Town.
3. **The EXE:** `dist/EmberStudio.exe --selftest` opens the window and checks the backend, loading the ROM and the emulator.
4. **Kachol-Lavan:** if `../projects/KacholLavan` and the expected ROM are there, the project must build to the same bytes.

## Before a release, by hand

See `MANUAL_CHECKLIST.md`: about 20 minutes of things a script cannot judge, such as how screens look, sound, and the file dialogs.
