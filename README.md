# Vážení želv 🐢

Jednoduchá aplikace (PWA) na péči o želvy Buffy, Otíka, Cecíka a Drobečka, v pěti záložkách:

- **Vážení** – týdenní vážení, graf a přírůstek za měsíc.
- **Koupání** – záznam data koupání každé želvy, přehled za měsíc / půlrok / rok.
- **Krmení** – krmení v po, st, pá; výběr z nabídky nebo vlastní krmení, přehled za měsíc / půlrok / rok.
- **Měření** – délka v cm jednou za 3 měsíce, graf vývoje.
- **Rosení** – dny, kdy se rosilo želvárium, graf v čase.

- Data se sdílejí mezi telefony přes Firebase Firestore (pravidla v `firestore.rules`).
- Konfigurace Firebase je v `firebase-config.js`.
- Bez konfigurace funguje aplikace lokálně v jednom zařízení.
