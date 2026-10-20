# FireRed Hebrew glossary (keep translations consistent)

Style: casual, kid-friendly; the player is addressed in masculine forms; places in Hebrew style.

| English | Hebrew |
|---|---|
| POKéMON | פוקימון (plural פוקימונים) |
| TRAINER | מאמן |
| GYM / GYM LEADER | מכון / מנהיג המכון |
| BADGE | תג |
| POKé BALL | פוקדור |
| POKéDEX | פוקידקס |
| POKéMON CENTER | מרכז פוקימון |
| POKé MART | חנות פוקימון |
| PC | מחשב |
| PROF. OAK | פרופסור אוק |
| TEAM ROCKET | צוות רוקט |
| ELITE FOUR / CHAMPION | ארבעת המובחרים / אלוף |
| HM / TM | דיסק נסתר / דיסק |
| HP / PP / LV / EXP | חיים / נק' / רמה / ניסיון |
| POKé DUDE | פוקי-דוד |
| PALLET TOWN | עיירת פאלט |
| VIRIDIAN CITY | העיר ויריידיאן |
| PEWTER CITY | העיר פיוטר |
| CERULEAN CITY | העיר סרוליאן |
| VERMILION CITY | העיר ורמיליון |
| LAVENDER TOWN | עיירת לבנדר |
| CELADON CITY | העיר סלדון |
| FUCHSIA CITY | העיר פוקסיה |
| SAFFRON CITY | העיר ספרון |
| CINNABAR ISLAND | אי סינבר |
| INDIGO PLATEAU | רמת אינדיגו |
| ROUTE n | כביש n |
| MT. MOON | הר הירח |
| SILPH CO. | חברת סילף |
| SEVII ISLANDS | איי סבי |
| BROCK, MISTY, LT. SURGE, ERIKA, KOGA, SABRINA, BLAINE, GIOVANNI | ברוק, מיסטי, סגן סרג', אריקה, קוגה, סברינה, בליין, ג'ובאני |
| LORELEI, BRUNO, AGATHA, LANCE | לורליי, ברונו, אגתה, לאנס |
| BILL, MOM, DAISY, MR. FUJI | ביל, אמא, דייזי, מר פוג'י |
| BOULDER/CASCADE/THUNDER/RAINBOW/SOUL/MARSH/VOLCANO/EARTH BADGE | תג הסלע / תג המפל / תג הרעם / תג הקשת / תג הנשמה / תג הביצה / תג הר הגעש / תג האדמה |
| RUNNING SHOES / TOWN MAP / POKé DUDE | נעלי ריצה / מפת העיר / פוקי-דוד |
| HELP System / UNION ROOM / DIRECT CORNER | מערכת העזרה / חדר האיחוד / הפינה הישירה |

Fixed windows (help panel, move/item/ability descriptions, Pokédex) are line-wrapped with tools/wrap_fixed.py (sources: data/firered_he/src/h0NN.py -> bNNN.json):
move descriptions 126px x4 lines, item descriptions 200px x3, Pokédex 250px x3. Units in the Pokédex text are metric.
Skipped on purpose (Ruby/Sapphire leftovers): Easy Chat words (0x3E7xxx-0x3ECxxx), secret-base decorations (0x454xxx), contest text.
