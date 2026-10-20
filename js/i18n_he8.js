// Hebrew interface, part 8: the game's own story in the Story tab (js/storymap.js, js/storyview.js; see js/i18n.js).
'use strict';
Object.assign(I18N.dicts.he, {
  'Talking to someone': 'שיחה עם מישהו', 'Reading a sign': 'קריאת שלט', 'Stepping on a spot': 'עלייה על משבצת', 'Arriving on the map (a scene)': 'הגעה למפה (סצנה)', 'Arriving on the map': 'הגעה למפה',
  'Timeline': 'ציר זמן', 'By place': 'לפי מקום', 'Flowchart': 'תרשים זרימה', 'The main story': 'העלילה הראשית', 'Everything that happens': 'כל מה שקורה', 'Search the story…': 'חיפוש בעלילה…',
  'There are alternatives (for example one per starter)': 'יש כמה אפשרויות (למשל אחת לכל פוקימון התחלתי)', 'skipped': 'מדולג',
  'Add your own step right after this moment': 'הוספת צעד משלכם מיד אחרי הרגע הזה', 'Nothing matches.': 'אין תוצאות.', 'Place': 'מקום',
  'Each box is a moment of the story; an arrow means "this has to happen first". Click a box to open it.': 'כל תיבה היא רגע בעלילה; חץ אומר "זה צריך לקרות קודם". לחיצה על תיבה פותחת אותה.',
  'the person is there (flag {f} is not set)': 'הדמות נמצאת שם (דגל {f} לא דלוק)', 'after beating trainer': 'אחרי ניצחון על מאמן', 'before beating trainer': 'לפני ניצחון על מאמן',
  'flag {f} is set': 'דגל {f} דלוק', 'flag {f} is not set': 'דגל {f} לא דלוק', 'variable {v} {op} {n}': 'משתנה {v} {op} {n}', 'the trainer counts as beaten': 'המאמן נחשב מנוצח',
  'sets flag {f}': 'מדליק את דגל {f}', 'clears flag {f}': 'מכבה את דגל {f}', 'variable {v} becomes {n}': 'משתנה {v} נהיה {n}', 'variable {v} goes up by {n}': 'משתנה {v} עולה ב-{n}',
  'Starts the game at a spot you pick, right before this moment': 'מתחיל את המשחק במקום שתבחרו, ממש לפני הרגע הזה', 'Test from here': 'בדיקה מכאן', 'Add a step after this': 'הוספת צעד אחרי זה',
  'From the game': 'מהמשחק המקורי', 'Happens after': 'קורה אחרי', 'Skip this moment': 'דילוג על הרגע הזה',
  'It does not play, but what it changes still happens (so the story goes on). Applied with “Apply the story to the game”.': 'הרגע לא מוצג, אבל מה שהוא משנה עדיין קורה (כך שהעלילה ממשיכה). נכנס למשחק עם "הכנסת העלילה למשחק".',
  'Edit the team': 'עריכת הקבוצה', 'What happens (each alternative)': 'מה קורה (בכל אפשרות)', 'What happens': 'מה קורה', 'What they say': 'מה אומרים',
  'How the game decides (flags and variables)': 'איך המשחק מחליט (דגלים ומשתנים)', 'It can happen when': 'זה יכול לקרות כש', 'always': 'תמיד', 'It changes': 'זה משנה',
  'Script': 'סקריפט', 'this moment starts at': 'הרגע מתחיל ב-',
  "The game's own story is in grey: open a moment to change what is said, what it gives or who you battle, to skip it, or to add your own steps right after it. Your steps happen in order, each one waits for the one before it.":
    'העלילה המקורית של המשחק מופיעה באפור: פותחים רגע כדי לשנות מה נאמר, מה הוא נותן או נגד מי נלחמים, לדלג עליו, או להוסיף צעדים משלכם מיד אחריו. הצעדים שלכם קורים לפי הסדר, וכל אחד מחכה לקודם.',
  'Your own chapters': 'הפרקים שלכם', 'Your story': 'העלילה שלכם', 'The story of the game': 'העלילה של המשחק', 'Choose a moment or a step on the left, or add one.': 'בחרו רגע או צעד בצד, או הוסיפו אחד.',
  'After “{t}”': 'אחרי "{t}"', 'then': 'ואז', 'the game goes on as usual': 'המשחק ממשיך כרגיל', '“{t}” waits for these steps': '"{t}" מחכה לצעדים האלה',
  '{n} moments of the game could not be changed (their script is unusual)': '{n} רגעים במשחק לא שונו (הסקריפט שלהם חריג)',
  'Get {what}': 'קבלת {what}', 'Battle: {who}': 'קרב: {who}', 'A change in the story': 'שינוי בעלילה', 'Story here': 'העלילה כאן',
  'What happens on this map in the story of the game, in order': 'מה קורה במפה הזאת בעלילה של המשחק, לפי הסדר',
  'Keep this town map (do not redraw it after world changes)': 'לשמור את מפת האזור הזו (לא לצייר אותה מחדש אחרי שינויים בעולם)',
  'Kept as it is: world changes do not touch it.': 'נשמרת כמו שהיא: שינויים בעולם לא נוגעים בה.',
  // world view: general map management, the map menu (right click), free moving
  '🧭 General map management': '🧭 ניהול מפה כללי',
  'Change the world on the big map: click a map to select it, drag it to move it (connections to maps it leaves are removed, maps it touches are connected). In every mode the name tag drags the map. Right click a map for everything you can do with it. Esc or a click on the empty area deselects.':
    'כאן משנים את העולם דרך המפה הגדולה: לחיצה על מפה בוחרת אותה, וגרירה מזיזה אותה. החיבורים למפות שהיא מתרחקת מהן נמחקים, ומפות שהיא נוגעת בהן מתחברות. בכל מצב אפשר לגרור מפה בתווית השם שלה. לחיצה ימנית על מפה פותחת את כל מה שאפשר לעשות איתה. Esc או לחיצה על האזור הריק מבטלים את הבחירה.',
  'Disconnected from': 'נותקה מ:', 'Connected to': 'חוברה ל:', ' is not in the world view': ' לא נמצאת בתצוגת העולם',
  'not connected': 'לא מחוברת', '✖ Deselect': '✖ ביטול בחירה', '✔ Select this map': '✔ בחירת המפה', '🎯 Pick this block': '🎯 לקחת את הבלוק הזה',
  '📂 Open in map editor': '📂 פתיחה בעורך המפה', '🌍 Build the world from this map': '🌍 לבנות את העולם מהמפה הזו',
  'Wheel = zoom · Space + drag or middle button = pan · drag a name tag = move the map · drag on the black area = new map · right-drag on a map = copy blocks · right click = the map menu · Esc = deselect · Ctrl+Z = undo':
    'גלגלת = זום · רווח + גרירה או כפתור אמצעי = תזוזה · גרירת תווית שם = הזזת המפה · גרירה על השחור = מפה חדשה · גרירה ימנית על מפה = העתקת בלוקים · לחיצה ימנית = התפריט של המפה · Esc = ביטול בחירה · Ctrl+Z = ביטול',
  '🗑 Delete map': '🗑 מחיקת המפה', 'Delete {a}?': 'למחוק את {a}?',
  'Doors of {b} lead to it: it stays in the map list and only leaves the world.': 'יש דלתות ב{b} שמובילות אליה, ולכן היא תישאר ברשימת המפות ורק תצא מהעולם.',
  '{a} was deleted': '{a} נמחקה', '{a} left the world (it stays in the map list)': '{a} יצאה מהעולם (היא נשארת ברשימת המפות)',
  '↔ Resize: drag an edge': '↔ שינוי גודל: גוררים צלע',
  'Drag an edge or a corner of the yellow frame to make the map bigger or smaller': 'גוררים צלע או פינה של המסגרת הצהובה כדי להגדיל או להקטין את המפה',
  'Go through the door to {a}': 'מעבר בדלת אל {a}', 'the previous map': 'המפה הקודמת', 'Back to {a}': 'חזרה אל {a}',
  'Back to the world map ({a})': 'חזרה למפת העולם ({a})', 'Back through the door you came in by': 'חזרה דרך הדלת שבה נכנסת',
  'This door leads back to wherever the player came from (decided in the game): there is no fixed map to go to': 'הדלת הזו מחזירה את השחקן למקום שממנו הגיע (המשחק קובע את זה), ולכן אין מפה קבועה לעבור אליה',
});
