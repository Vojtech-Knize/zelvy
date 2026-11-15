// Sem přijde konfigurace z Firebase (Project settings → Your apps → Web app → firebaseConfig).
// Dokud je tu null, aplikace funguje jen lokálně v tomto zařízení.
// Tyto údaje nejsou tajné, ochranu dat řeší pravidla databáze (viz firestore.rules).
export const firebaseConfig = null;

/* Příklad:
export const firebaseConfig = {
  apiKey: "...",
  authDomain: "...firebaseapp.com",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
*/
