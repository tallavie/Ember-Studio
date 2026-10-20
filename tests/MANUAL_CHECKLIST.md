# Manual checklist (before a release)

About 20 minutes. Use the freshly built `EmberStudio.exe` on a computer where it was never run, if you can.

## Start
- [ ] **First start:** double-click the EXE. On a new computer SmartScreen asks: *More info → Run anyway*. The window opens in a few seconds.
- [ ] **Language:** **English / עברית** switches the language, and in Hebrew the layout runs right to left.
- [ ] **Guide:** **❓ Guide** opens the PDF in the interface language.

## A new game
- [ ] **Starting the wizard:** **✨ New game**. Choose a folder and the FireRed ROM with the **Choose…** buttons. The file dialogs open and the ROM is accepted.
- [ ] **Cancel:** **Cancel** closes the wizard at every step.
- [ ] **Finishing the wizard:** change the professor, the starters, one town and one gym leader, then **Create**. The game opens.
- [ ] **Playing:** **🎮 Play**. The intro plays with sound, and the professor's name and the starters are the new ones.
  - Try ⏸, ⏩ ×2 / ×4, 🔊, 💾 / 📂 save state, ↻ and ✕.

## Maps
- [ ] **Painting:** paint a few blocks, undo with Ctrl+Z, and pick a block with right-click.
- [ ] **Objects:** add a talking person, write two blocks for them (**Write it with blocks**), and press **▶ Play from here** next to them. They say the text.
- [ ] **World view:** select a map. **▶ Play from here** turns active, and the game starts at the clicked spot.
- [ ] **Blocks from a picture:** import a small PNG as new blocks, paint with them, and play. The colours look right.

## Story
- [ ] **A talk step:** add a talk step for a person and press **✨ Put the story into the game**. **▶ Test from this step** starts right before it, and the story moves on after talking.
- [ ] **A choice:** add a choice, then **Test from this step**. Answer yes once and no once.

## Other tabs
- [ ] **Pokémon / trainers / items / moves:** change one value in each, save, close the program, open it again, and open the project. The values stayed.
- [ ] **Graphics:** a character from a picture, and the title screen with **👁 Show the title screen**.
- [ ] **Music:** listen to one song.
- [ ] **Game check:** it runs, and **Show** jumps to the right map.

## Projects
- [ ] **Building:** **🔨 Build** writes `out/game.gba`. Open it in another emulator; it plays.
- [ ] **Turning a ROM into a project:** **📥 Turn a ROM into a project** with some hack. It opens and builds.
- [ ] **Moving a project:** copy the project folder to another place and open it. It asks for the base ROM only if it cannot find it.
