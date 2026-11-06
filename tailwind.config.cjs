/**
 * Tailwind wird NICHT mehr per CDN im Browser übersetzt, sondern einmal als
 * statische Datei gebaut: public/assets/tw.css (npm run css).
 * Das Theme ist dasselbe, das vorher inline als `tailwind.config` in
 * layout.ts und login.ts stand.
 * Wer in src/ oder public/assets/*.js neue Tailwind-Klassen benutzt, baut
 * neu; `npm run ship` erledigt das automatisch.
 */
module.exports = {
  content: ['./src/**/*.ts', './public/assets/*.js'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', 'Inter', 'system-ui', 'sans-serif'],
        display: ['"Bricolage Grotesque"', 'Geist', 'system-ui', 'sans-serif'],
      },
      colors: { ink: '#000000', panel: '#060c09', brand: { DEFAULT: '#2fe08c', 2: '#5eeaa6' } },
    },
  },
  plugins: [],
}
