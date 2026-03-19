/* ============================================
   FIREBASE CONFIGURATION
   ============================================

   To set up Firebase (free):
   1. Go to https://console.firebase.google.com
   2. Click "Create a project" (name it anything, e.g., "march-madness-2026")
   3. Disable Google Analytics (not needed), click Create
   4. In the left sidebar, click "Build" > "Realtime Database"
   5. Click "Create Database", choose any location, start in TEST MODE
   6. Go to Project Settings (gear icon top-left) > General
   7. Scroll down to "Your apps" > click the web icon (</>)
   8. Register app (name it anything), copy the config values below
   9. Paste them into the firebaseConfig object below

   IMPORTANT: After setup, go to Realtime Database > Rules and set:
   {
     "rules": {
       ".read": true,
       ".write": true
     }
   }
   This allows the admin page to write and everyone to read.
   ============================================ */

const firebaseConfig = {
    apiKey: "AIzaSyD1ECgPlt8hmQpL43yS1nrRLh6QpiCKiZY",
    authDomain: "heritage-march-madness.firebaseapp.com",
    databaseURL: "https://heritage-march-madness-default-rtdb.firebaseio.com",
    projectId: "heritage-march-madness",
    storageBucket: "heritage-march-madness.firebasestorage.app",
    messagingSenderId: "685955386674",
    appId: "1:685955386674:web:e2f110ca4fadfd8925db2b"
};

// Admin password — change this to whatever you want
const ADMIN_PASSWORD = "marchmadness2026";
