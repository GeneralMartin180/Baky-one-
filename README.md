# Baky One

Baky One is a modern, open-source search engine designed to protect your privacy. It’s built by [Baky OS](https://www.bakyos.com/) as part of its ecosystem.

[Try Baky One](https://baky-one.vercel.app/)

![Baky One on desktop and mobile](docs/baky-one-preview.png)

React rozhranie a spoločné Node API pre webové výsledky, obrázky, YouTube a správy. Vyžaduje Node.js 24 a npm 11. Závislosti sú uzamknuté v `package-lock.json`.

```sh
npm ci
npm run dev
```

Lokálne sa otvorí port 3000; voliteľnú konfiguráciu z `.env.example` možno uložiť do `.env.local`. Základné vyhľadávanie funguje bez API kľúča. Voliteľný `BRAVE_SEARCH_API_KEY` pridá licencovaný webový zdroj. Kľúče patria iba na server, nikdy do premenných s prefixom `VITE_`.

```sh
npm run lint
npm test
npm run build
npm start
```

`lint` vykonáva typovú kontrolu TypeScriptu. Testy zahŕňajú API, SSRF/DNS, HTTP/SOCKS proxy, celé telo odpovede, vyhľadávacie parsery, stránkovanie, stav Reactu a prístupnosť dialógov. `npm start` spustí produkčný server, `PORT` mení lokálny port.

Vercel používa `npm ci` a `npm run build:vercel`. Build Output API obsahuje statické súbory a jednu samostatne zabalenú Node.js funkciu; rovnaké API handlery obsluhujú localhost aj Vercel. Funkcia nepotrebuje pri spustení načítavať zdrojové TypeScript importy. Región funkcie je Frankfurt (`fra1`). Pri pushnutí produkčnej vetvy nasadenie zabezpečuje existujúca Git integrácia.

```sh
node scripts/smoke.mjs https://baky-one.vercel.app --media
```

Živá skúška kontroluje reálne webové výsledky pre viac typov dotazov, odmietnutie nesprávneho vstupu/SSRF a voliteľne obrázky, videá, Shorts a správy. Parametrom `--output=.audit-evidence/post.json` uloží merania lokálne. Dostupnosť a rýchlosť externých vyhľadávacích zdrojov závisia od ich prevádzky a limitov; pri výpadku sa zobrazí chyba, nie vymyslené portály alebo Wikipedia ako náhrada celého webu.

Vyhľadávanie rozlišuje potvrdené nulové výsledky od blokovania alebo neznámeho HTML poskytovateľa. Pri prechodnom zlyhaní doplnkového zdroja vykoná jeden krátky opakovaný pokus. Seznam dopĺňa aj globálne vyhľadávanie, ale nepoužíva sa na obídenie zvoleného časového filtra. Hodnotenie rozpoznáva bežné slovenské a české tvary slov a vyžaduje celé slová pri krátkych názvoch.

Prvá strana zobrazuje najviac desať skutočných výsledkov. Pri nedostatku odkazov alebo nezávislých domén sa načítajú najviac štyri ďalšie stránky zdroja v dvoch súbežných dávkach. Dotaz a filtre sa nemenia. Radenie zohľadňuje zhodu výrazu, názvu a domény, zachováva modelové čísla a presné frázy, spája sledovacie duplicity a obmedzuje opakovanie jednej domény. Vložené mediálne karusely, dlhé kópie oficiálneho popisu a generické používateľské projekty nenahrádzajú relevantné webové odkazy. Stránkovanie používa rovnaký plán získavania výsledkov pre každú stranu.

Ak zdroj výslovne opraví preklep, vyhodnotia sa jeho reálne výsledky podľa overenej opravy a rozhranie zobrazí „Výsledky pre…“. Oprava musí zachovať význam, čísla a modely; nepoužíva sa na zmenu operátorov či úvodzoviek. Nepridáva ďalšiu sieťovú požiadavku ani slovník vymyslených výsledkov. Rozpoznajú sa aj medzery v názvoch, napríklad `space x` / `SpaceX`. Prázdna odpoveď pri nedostupnosti časti zdrojov ponúka opakovanie namiesto definitívneho tvrdenia, že žiadne stránky neexistujú; neplatný formát API sa zobrazí ako chyba.

Pri priamom hľadaní názvu Baky OS, Baky AI, Baky Finance alebo Baky News sa overí aj príslušná oficiálna stránka. Tento zdroj vracia iba titulok a popis z aktuálne načítaného HTML; pri chybe stránky nevytvorí náhradný výsledok a pri časovom filtri sa nepoužíva. Nejde o uložený adresár výsledkov. Aktívny časový filter je viditeľný a používateľ ho môže výslovne zrušiť.

Dotazy sa neukladajú do aplikačných cache, histórie ani aplikačných logov. Server ich počas požiadavky odosiela externým poskytovateľom. Hosting a poskytovatelia môžu spracúvať prevádzkové záznamy podľa vlastných pravidiel. Obrázky a prehrávače načítané priamo z cudzích webov vidia IP prehliadača. SafeSearch sa odovzdáva podporovaným vyhľadávacím zdrojom; Wikipedia a Google News RSS neposkytujú garantované filtrovanie nevhodného obsahu.

Logá webov sa načítavajú cez `/api/favicon` z ikonovej služby DuckDuckGo. Dostáva iba doménu webu, nie vyhľadávací dotaz ani IP prehliadača. Ak logo chýba alebo zdroj neodpovedá, zobrazí sa začiatočné písmeno názvu webu.

Mobilná titulná stránka načítava cez `/api/markets` informačné ceny Microsoftu (MSFT), S&P 500 a Nasdaq Composite z Yahoo Finance. Pri každej cene je čas skutočnej kotácie; mimo obchodovania môže ísť o poslednú obchodnú seansu a údaje môžu byť oneskorené. Výpadok zdroja sa označí ako nedostupný údaj, bez náhradných vymyslených cien. Požiadavky obsahujú iba tieto tri pevné symboly, bez vyhľadávacieho dotazu používateľa.

Pod burzou mobilná stránka zobrazuje skutočné správy z oficiálnych RSS BBC News a The Guardian, pre Slovensko aj Aktuality.sk. Zdroje sa medzi kartami striedajú; fotografie idú cez bezpečný obrazový proxy. Google News sa použije iba pri výpadku všetkých týchto feedov. Odkaz AI Mode otvorí Baky AI. Novinky a burza sa na počítači automaticky nenačítavajú; pri odchode z mobilnej stránky sa rozpracované požiadavky zrušia. Mobilná titulná stránka nepridáva obrázkový skener ani nefunkčné akcie; mikrofón sa zobrazí iba v prehliadači s podporovaným rozpoznávaním hlasu.

Voliteľné HTTP proxy nastavuje `PROXY_URL`/`HTTPS_PROXY`/`HTTP_PROXY`. `TOR_PROXY_URL` alebo `SEARCH_NETWORK_MODE=tor_socks` vyžaduje funkčné SOCKS pripojenie a nikdy neprechádza potichu na direct. Proxy stav ani chyby nezverejňujú prihlasovacie údaje. Bezpečný obrazový proxy endpoint povoľuje len určené HTTPS obrazové domény, verejné DNS adresy a raster do 2 MB; v proxy režime sa odmietne, keď nemožno zaručiť kontrolu cieľovej DNS adresy.

Licencia projektu: [MIT](LICENSE).
