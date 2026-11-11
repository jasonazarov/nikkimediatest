/**
 * /terminbuchung/: die Seite von marinabetke.de (Kopf, Text, Marina-Karte,
 * „So läuft das Gespräch“, Fußzeile) als Vorlage, an der Stelle des alten
 * Fragebogens der Stepper aus views/stepper.ts.
 */
import template from '../templates/terminbuchung.html'
import { stepper } from './stepper'

const ASSET_V = '20261111'

export const terminbuchungPage = (): string =>
  template
    .replace('</head>', `<link rel="stylesheet" href="/assets/css/stepper.css?v=${ASSET_V}">\n</head>`)
    .replace('<!--STEPPER-->', stepper())
    .replace('<!--STEPPER-SCRIPTS-->', `<script src="/assets/js/stepper.js?v=${ASSET_V}" defer></script>`)
