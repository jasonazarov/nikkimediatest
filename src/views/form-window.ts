/*
 * Bausteine für Formulare als ein Glas-Fenster (Vorgabe des Auftraggebers,
 * November 2026): Agentur-Briefing, „Neue Kampagne“ der Agentur und
 * „Neue Kampagne“ im Kunden-Dashboard. Styles: dash-whop.css, Abschnitt
 * „Formular als ein Fenster“.
 */
import { VIEWS_DEFAULT, VIEWS_MAX, VIEWS_MIN, VIEWS_STEP } from '../lib/agency'
import { esc } from './layout'

const VIEW_TICKS = ['100.000', '2,5 Mio.', '5 Mio.', '7,5 Mio.', '10 Mio.'].map((t) => `<span>${t}</span>`).join('')

export const viewsControl = () => `
            <p class="nmg-views"><span data-views-out>${VIEWS_DEFAULT.toLocaleString('de-DE')}</span><small>Views</small></p>
            <input type="range" name="viewsStep" min="${VIEWS_MIN}" max="${VIEWS_MAX}" step="${VIEWS_STEP}" value="${VIEWS_DEFAULT}"
                   class="nmg-range" aria-label="Gewünschte Views">
            <div class="nmg-ticks" aria-hidden="true">${VIEW_TICKS}</div>
            <p class="nmg-est" data-views-est></p>`

export const stationsBar = (titles: string[]) => `<div class="hidden" aria-hidden="true"><span data-step-label></span>${titles
  .map((_, i) => `<i data-dot="${i + 1}"></i>`)
  .join('')}</div>
          <nav class="nmg-stations" aria-label="Abschnitte">${titles
            .map((t, i) => `<a href="#abschnitt-${i + 1}" class="nmg-st" data-station="${i + 1}"><i>${i + 1}</i><span>${esc(t)}</span></a>`)
            .join('')}</nav>`

