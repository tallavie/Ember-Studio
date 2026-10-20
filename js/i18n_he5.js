// Hebrew interface, part 5: blocks & tiles, characters, title screen (see js/i18n.js).
'use strict';
Object.assign(I18N.dicts.he, {
  // characters & title
  '🧍 Characters & title screen': '🧍 דמויות ומסך כותרת', 'Character from a picture': 'דמות מתמונה',
  'One drawing becomes the battle picture (64×64, its own 15 colours) and the person on the map (16×32, in the colours of the sprite it replaces). A plain background is removed. Touch up the pixels before writing.': 'ציור אחד הופך לתמונת הקרב (64×64, עם 15 צבעים משלה) ולדמות במפה (16×32, בצבעים של הדמות שהיא מחליפה). רקע אחיד מוסר. אפשר לתקן פיקסלים לפני הכתיבה.',
  'Choose another picture…': 'בחירת תמונה אחרת…', 'Choose a picture…': 'בחירת תמונה…', '— no trainer —': '— בלי מאמן —', 'Battle picture': 'תמונת קרב', 'Replaces': 'מחליפה את', 'and give it to': 'ולתת אותה ל',
  'Battle picture written': 'תמונת הקרב נכתבה', 'Write the battle picture': 'כתיבת תמונת הקרב', 'On the map': 'במפה', 'Choose a 16×32 person sprite (most people on the maps are).': 'בחרו דמות בגודל 16×32 (רוב האנשים במפות כאלה).',
  'The colours come from the palette this sprite shares with other people (tag {t}), so other people keep their colours.': 'הצבעים מגיעים מהפלטה שהדמות חולקת עם אנשים אחרים (תג {t}), כך שהצבעים שלהם לא משתנים.',
  '{name} now looks like the picture on every map': '{name} נראה עכשיו כמו התמונה בכל המפות', 'Write the sprite': 'כתיבת הדמות', 'Choose a picture': 'בחירת תמונה', 'Pictures': 'תמונות',
  'Choose a logo picture or a hero picture first': 'קודם בחרו תמונת לוגו או תמונת גיבור', 'Drawing the title screen…': 'מצייר את מסך הכותרת…', 'Title screen written': 'מסך הכותרת נכתב',
  'Starting the game to look at the title screen…': 'מפעיל את המשחק כדי לצלם את מסך הכותרת…', 'Title screen': 'מסך כותרת', 'The title screen tool needs Ember Studio (the EXE or ember/server.py).': 'כלי מסך הכותרת דורש את Ember Studio (ה-EXE או ember/server.py).',
  'The logo picture replaces the Pokémon logo (up to 60 colours, it is fitted into the logo area). The hero picture replaces Charizard (a plain background is removed). The subtitle is drawn under the logo.': 'תמונת הלוגו מחליפה את לוגו הפוקימון (עד 60 צבעים, מותאמת לאזור הלוגו). תמונת הגיבור מחליפה את צ׳אריזרד (רקע אחיד מוסר). כותרת המשנה מצוירת מתחת ללוגו.',
  'Logo picture': 'תמונת לוגו', 'Subtitle': 'כותרת משנה', 'first line': 'שורה ראשונה', 'second line': 'שורה שנייה', 'Hero picture': 'תמונת גיבור', 'Background': 'רקע', 'keep the fire': 'להשאיר את האש',
  'the flag of Israel': 'דגל ישראל', 'Write the title screen': 'כתיבת מסך הכותרת', 'Show the title screen (runs the game)': 'הצגת מסך הכותרת (מריץ את המשחק)',
  // blocks & tiles
  '🧱 Blocks & tiles': '🧱 בלוקים ואריחים', 'Normal ground': 'קרקע רגילה', 'Tall grass (wild Pokémon)': 'דשא גבוה (פוקימונים בטבע)', 'Very tall grass': 'דשא גבוה מאוד', 'Cave floor (wild Pokémon)': 'רצפת מערה (פוקימונים בטבע)',
  'Water (pond)': 'מים (בריכה)', 'Shallow water': 'מים רדודים', 'Deep water': 'מים עמוקים', 'Waterfall': 'מפל', 'Sea water': 'מי ים', 'Door / warp': 'דלת / מעבר', 'Door': 'דלת',
  'Top layer covers the player (trees, roofs)': 'השכבה העליונה מכסה את השחקן (עצים, גגות)', 'Everything below the player': 'הכול מתחת לשחקן', 'Split (bridges)': 'מפוצל (גשרים)',
  'Graphics of the map': 'הגרפיקה של המפה', 'primary tileset {a} (shared by many maps) · secondary {b} (this area)': 'סט ראשי {a} (משותף להרבה מפות) · סט משני {b} (האזור הזה)',
  'Import a picture as new blocks…': 'ייבוא תמונה כבלוקים חדשים…', 'Blocks': 'בלוקים', '{a} shared + {b} of this area': '{a} משותפים + {b} של האזור', 'Top (drawn over the player)': 'עליון (מצויר מעל השחקן)', 'Bottom': 'תחתון',
  'tile {t} · palette {p}': 'אריח {t} · פלטה {p}', 'Square {n}': 'ריבוע {n}', 'Palette': 'פלטה', 'shared': 'משותפת', 'area': 'אזור', 'tile': 'אריח', 'flip ↔': 'היפוך ↔', 'flip ↕': 'היפוך ↕',
  'Click a tile on the right to put it in this square.': 'לחצו על אריח בצד כדי לשים אותו בריבוע הזה.', 'double-click to change': 'לחיצה כפולה לשינוי', '0 = see-through': '0 = שקוף', 'Block {n}': 'בלוק {n}',
  'this area only': 'רק האזור הזה', 'shared by every map with this primary tileset': 'משותף לכל המפות עם הסט הראשי הזה', 'Draw the tile': 'ציור האריח',
  'Left click paints with the chosen colour, right click picks a colour. Double-click a colour to change it (it changes everywhere the palette is used).': 'לחיצה שמאלית מציירת בצבע שנבחר, ימנית דוגמת צבע. לחיצה כפולה על צבע משנה אותו (בכל מקום שהפלטה משמשת).',
  'How the block behaves': 'איך הבלוק מתנהג', 'Behaviour': 'התנהגות', 'Layers': 'שכבות', 'Walls and blocked tiles are set per map with the Collision tool, not here.': 'קירות ומשבצות חסומות נקבעים בכל מפה עם כלי ההתנגשות, לא כאן.',
  'Tiles': 'אריחים', 'shown with palette {p} · tiles {n}+ belong to this area': 'מוצגים עם פלטה {p} · אריחים מ-{n} שייכים לאזור', '{t} tiles needed ({f} free) · {b} blocks ({e} empty ones reused, {n} new)': 'צריך {t} אריחים ({f} פנויים) · {b} בלוקים ({e} ריקים בשימוש חוזר, {n} חדשים)',
  "Not enough free room in this area's tileset for this picture. Use a smaller picture or fewer different tiles.": 'אין מספיק מקום פנוי בסט של האזור לתמונה הזו. השתמשו בתמונה קטנה יותר או עם פחות אריחים שונים.',
  'area palette': 'פלטת אזור', 'Import a picture as new blocks': 'ייבוא תמונה כבלוקים חדשים', 'Each 16×16 square of the picture becomes a block of this area (the secondary tileset). Identical squares share tiles.': 'כל ריבוע 16×16 בתמונה הופך לבלוק של האזור (הסט המשני). ריבועים זהים חולקים אריחים.',
  "Use the picture's own colours (replaces this palette: blocks that use it change colour too)": 'להשתמש בצבעים של התמונה (מחליף את הפלטה: גם בלוקים אחרים שמשתמשים בה ישנו צבע)',
  '{n} new blocks: {list}. Paint with them in the map editor.': '{n} בלוקים חדשים: {list}. ציירו איתם בעורך המפה.', 'Import': 'ייבוא',
  'The picture must be a multiple of 16 pixels wide and high (one block = 16×16).': 'רוחב וגובה התמונה חייבים להיות כפולה של 16 פיקסלים (בלוק = 16×16).',
});
