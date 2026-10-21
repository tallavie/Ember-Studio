// Hebrew interface, part 10: the side bar, search everything, the journey, the path check, the dialogue editor,
// map tools (js/main.js, js/search.js, js/journey.js, js/pathcheck.js, js/dialogue.js, js/world.js; see js/i18n.js).
'use strict';
Object.assign(I18N.dicts.he, {
  // side bar & search
  'Show or hide the side bar': 'הצגה או הסתרה של סרגל הצד', 'Search everything (Ctrl+K)': 'חיפוש בכל העורך (Ctrl+K)', 'Search…': 'חיפוש…',
  'World': 'העולם', 'Story & text': 'עלילה וטקסט', 'Characters': 'דמויות', 'Things': 'חפצים ומהלכים', 'Look & sound': 'מראה וקול', 'Check': 'בדיקה',
  'Search maps, Pokémon, trainers, items, moves, screens…': 'חיפוש מפות, פוקימונים, מאמנים, חפצים, מהלכים, מסכים…',
  'Screen': 'מסך', 'A Pokémon': 'פוקימון', 'Trainer': 'מאמן', 'Item': 'חפץ', 'Move': 'מהלך', 'Legendary': 'אגדי', 'Nothing found.': 'לא נמצא כלום.',
  'Search "{q}" in the game\'s text': 'חיפוש "{q}" בטקסט של המשחק', 'choose': 'בחירה', 'open': 'פתיחה', 'close': 'סגירה',
  // map tools
  'Player view': 'תצוגת שחקן', 'what the player sees': 'מה שהשחקן רואה',
  'A frame the size of the game screen (15×10 squares) around the mouse: what the player sees standing there': 'מסגרת בגודל מסך המשחק (15×10 משבצות) סביב העכבר: מה שהשחקן רואה כשהוא עומד שם',
  'Drag onto the map': 'גרירה אל המפה', 'Drop it on a map': 'צריך לשחרר את זה על מפה',
  'Drag a Pokémon (a legendary that stands there), an item (an item ball) or a trainer onto any map. Double-click a person or a sign to edit what they say.':
    'גוררים פוקימון (אגדי שעומד שם), חפץ (כדור חפץ) או מאמן אל כל מפה. דאבל-קליק על דמות או על שלט עורך את מה שהם אומרים.',
  '{name} stands here now (a legendary: talk to it to battle)': '{name} עומד כאן עכשיו (אגדי: מדברים איתו כדי להילחם)', 'An item ball with {name}': 'כדור חפץ עם {name}', '{name} stands here now': '{name} עומד כאן עכשיו',
  'This one says nothing that can be edited here': 'אין כאן טקסט שאפשר לערוך מהמפה', 'Text saved': 'הטקסט נשמר',
  // the conversation as a chat
  'Open as a conversation': 'פתיחה כשיחה', 'This one has no script': 'אין לו סקריפט', 'Close': 'סגירה', 'Click to edit': 'לחיצה לעריכה',
  'Click a bubble to edit it. Answers and conditions split the conversation into threads.': 'לוחצים על בועה כדי לערוך אותה. תשובות ותנאים מפצלים את השיחה לשרשורים.',
  'YES': 'כן', 'NO': 'לא', 'A trainer battle': 'קרב מאמנים', 'Nothing is said here.': 'לא נאמר כאן כלום.',
  'Before the battle': 'לפני הקרב', 'When you beat them': 'כשמנצחים אותו', 'Defeat line': 'משפט ההפסד', 'Line when you win': 'כשאתם מנצחים', 'Line when you lose': 'כשאתם מפסידים', 'If you have only one Pokémon': 'אם יש לכם רק פוקימון אחד',
  'Otherwise:': 'אחרת:', 'Right after the battle:': 'מיד אחרי הקרב:', 'If you already beat this trainer:': 'אם כבר ניצחתם את המאמן הזה:', 'If you did not beat this trainer yet:': 'אם עוד לא ניצחתם את המאמן הזה:',
  // the journey
  'The journey': 'המסע', '{n} badges': '{n} תגים', '{n} HMs': '{n} HM', '{n} legendaries': '{n} אגדיים', 'Leaders': 'מנהיגים', 'Badge {n}': 'תג {n}',
  'From the first town to the league, left to right. Click a moment to open it in the story.': 'מהעיר הראשונה ועד הליגה, לפי הסדר. לחיצה על רגע פותחת אותו בעלילה.',
  "The level of each gym leader's strongest Pokémon, in order. A red dot is weaker than the one before.": 'הרמה של הפוקימון החזק של כל מנהיג מכון, לפי הסדר. נקודה אדומה חלשה מזו שלפניה.',
  'Open the trainer': 'פתיחת המאמן', 'You get this Pokémon here': 'כאן מקבלים את הפוקימון הזה', 'and {n} more': 'ועוד {n}',
  // can the game be finished?
  'Can the game be finished?': 'אפשר לסיים את המשחק?', 'Check the path': 'בדיקת הדרך', 'Walking through the whole game…': 'עוברים על כל המשחק…',
  "Walks the whole world from the player's room like a player: it opens each HM when its place is reached and the right badge is won, and checks that the league can be reached.":
    'הולכים בכל העולם מהחדר של השחקן, כמו שחקן: כל HM נפתח כשמגיעים למקום שלו ומנצחים את התג המתאים, ובסוף נבדק שאפשר להגיע לליגה.',
  'The game can be finished: the league can be reached.': 'אפשר לסיים את המשחק: אפשר להגיע לליגה.', 'The end of the game was not found in the scripts.': 'סוף המשחק לא נמצא בסקריפטים.',
  'The league cannot be reached with what the game gives.': 'אי אפשר להגיע לליגה עם מה שהמשחק נותן.', '{n} maps can be reached.': 'אפשר להגיע ל-{n} מפות.', 'In this order': 'לפי הסדר הזה',
  'works after badge {n}': 'עובד אחרי תג {n}', 'Badges that can never be won: {list}': 'תגים שאי אפשר לזכות בהם: {list}', 'HMs that can never be got: {list}': 'HM שאי אפשר לקבל: {list}',
  'Places of the main story that cannot be reached': 'מקומות בעלילה הראשית שאי אפשר להגיע אליהם',
  'Checked: walls, ledges, one-way tiles, heights, doors, map edges, water, waterfalls, Cut trees, Rock Smash rocks and Strength boulders, and which badge each HM needs. Not checked: people standing in the way and story roadblocks (guards, a sleeping Snorlax…).':
    'נבדקים: קירות, מדרגות קפיצה, משבצות חד-כיווניות, גבהים, דלתות, קצוות מפה, מים, מפלים, עצי חיתוך, סלעי ניפוץ וסלעי כוח, ואיזה תג כל HM צריך. לא נבדקים: אנשים שעומדים בדרך ומחסומי עלילה (שומרים, סנורלקס ישן…).',
  'Only after the game: {list}': 'רק אחרי סוף המשחק: {list}', 'Cut': 'חיתוך', 'Fly': 'תעופה', 'Surf': 'גלישה', 'Strength': 'כוח', 'Flash': 'הבזק', 'Rock Smash': 'ניפוץ סלעים', 'Waterfall': 'מפל', 'Dive': 'צלילה',
  // test in battle
  "The player's room was not found": 'החדר של השחקן לא נמצא', "There is no free spot in the player's room": 'אין מקום פנוי בחדר של השחקן',
  'Talk to the person below you (X) to battle {who}': 'דברו עם הדמות שמתחתיכם (X) כדי להילחם ב-{who}',
});
