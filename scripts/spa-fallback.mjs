// GitHub Pages no reescribe rutas: 404.html = index.html permite recargar /favoritos o /perfil.
import { copyFileSync } from 'node:fs';
copyFileSync('dist/index.html', 'dist/404.html');
