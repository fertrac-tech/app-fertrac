// Aplica versionCode/versionName de package.json (appVersion) a android/app/build.gradle.
// Se ejecuta después de "cap add" / "cap sync" porque android/ lo genera Capacitor.
const fs = require('fs');
const path = require('path');
const { versionCode, versionName } = require('../package.json').appVersion;
const gradle = path.join(__dirname, '..', 'android', 'app', 'build.gradle');
if (!fs.existsSync(gradle)) { console.error('No existe android/app/build.gradle. Ejecuta primero: npm run add:android'); process.exit(1); }
let s = fs.readFileSync(gradle, 'utf8');
s = s.replace(/versionCode\s+\d+/, 'versionCode ' + versionCode)
     .replace(/versionName\s+"[^"]*"/, 'versionName "' + versionName + '"');
fs.writeFileSync(gradle, s);
console.log('build.gradle -> versionCode ' + versionCode + ', versionName ' + versionName);
