// Test helpers, prepended to every suite. Suites run inside the real JobMech window.
window.T = (() => {
  const results = [];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ok = (name, cond, info) => { results.push({ name, pass: !!cond, info: cond ? undefined : (info === undefined ? '' : info) }); return !!cond; };
  const eq = (name, got, want) => ok(name, JSON.stringify(got) === JSON.stringify(want), { got, want });
  const waitFor = async (fn, ms = 15000, step = 60) => {
    const t0 = Date.now();
    for (;;) {
      let v = null;
      try { v = await fn(); } catch { v = null; }
      if (v) return v;
      if (Date.now() - t0 > ms) return null;
      await sleep(step);
    }
  };
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const byText = (sel, text, r = document) => $$(sel, r).find((e) => e.textContent.trim().includes(text)) || null;
  const type = (el, v) => {
    el.focus();
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const mod = (p) => import('/js/' + p);
  const throws = async (name, fn, re) => {
    try { await fn(); ok(name, false, 'did not fail'); }
    catch (e) { ok(name, !re || re.test(e.message), e.message); }
  };
  const toastText = () => $$('.toast').map((t) => t.textContent).join(' | ');
  /** Clicks the button of the open modal dialog whose label contains `label`. */
  const dialogClick = async (label) => {
    const b = await waitFor(() => byText('.overlay .modal-foot .btn', label), 4000);
    if (b) b.click();
    await sleep(60);
    return !!b;
  };
  const menuClick = async (label) => {
    const b = await waitFor(() => byText('.menu .mi', label), 3000);
    if (b) b.click();
    await sleep(60);
    return !!b;
  };
  /** A small valid JPEG portrait as a data URL. */
  const portrait = () => {
    const c = document.createElement('canvas');
    c.width = 140; c.height = 180;
    const g = c.getContext('2d');
    g.fillStyle = '#2b5d8a'; g.fillRect(0, 0, 140, 180);
    g.fillStyle = '#f2d2b6'; g.beginPath(); g.arc(70, 75, 38, 0, 7); g.fill();
    return c.toDataURL('image/jpeg', 0.85);
  };
  const run = async (suite, fn) => {
    try { await fn(); }
    catch (e) { ok('suite ran to the end', false, String(e && e.stack ? e.stack : e)); }
    return JSON.stringify({ suite, total: results.length, failed: results.filter((r) => !r.pass) });
  };
  return { results, sleep, ok, eq, waitFor, $, $$, byText, type, mod, throws, toastText, dialogClick, menuClick, portrait, run };
})();

// One fictional candidate and posting, matching the canned answers of the offline test engine (app/js/ai/mock.js).
window.FIX = {
  profile: ['Lena Brandt', 'Studentin der Wirtschaftsinformatik', 'lena.brandt@example.com', '+49 40 5550123', 'Beispielweg 7', '20457 Hamburg',
    'Hamburg, Germany', 'German', '', '2003-04-17', 'linkedin.com/in/lena-brandt-example', '', 'German (native), English (C1), Spanish (A2)'],
  story: [
    'Lena Brandt, Studentin der Wirtschaftsinformatik (B.Sc.) an der Universität Hamburg, 5. Semester, seit 10/2024, Abschluss voraussichtlich 09/2027.',
    'Schwerpunkte: Controlling, Datenbanken, Business Intelligence. Studienprojekt: Power-BI-Dashboard zu Lieferzeiten mit 12.000 Datensätzen.',
    'Seit 10/2024 Werkstudentin Finanzen bei Hansa Freight Services GmbH in Hamburg: monatliche Kostenberichte in Excel für 14 Kostenstellen mit Pivot-Tabellen und SVERWEIS,',
    'Abweichungen zwischen Plan und Ist aufbereitet, rund 300 Eingangsrechnungen pro Monat mit Lieferscheinen abgeglichen, Vorlage für den Wochenbericht überarbeitet (von etwa 3 Stunden auf 1 Stunde).',
    '06/2022 bis 08/2024 Aushilfe im Verkauf in der Buchhandlung Seitenwind in Lübeck, zwei Tage pro Woche.',
    'Abitur 2022 am Katharineum zu Lübeck (2014 bis 2022), Abschlussnote 1,8.',
    'Kenntnisse: Excel (Pivot-Tabellen, SVERWEIS, Power Query), Power BI Grundlagen, SQL Grundlagen, Microsoft 365, DATEV, Confluence.',
    'Zertifikat "Excel für Controller", IHK Hamburg, 2025. Sprachen: Deutsch Muttersprache, Englisch C1, Spanisch A2.',
  ].join('\n'),
  job: [
    'Werkstudent Controlling & Reporting (m/w/d)',
    'Nordwind Logistik GmbH, Am Sandtorkai 41, 20457 Hamburg. Referenz NW-2026-118.',
    'Start: 01.01.2027, 20 Stunden pro Woche. Ansprechpartnerin: Katrin Albers.',
    'Aufgaben: Unterstützung beim Monatsabschluss, Reporting je Kostenstelle, Abweichungsanalyse, KPI-Dashboards in Power BI.',
    'Profil: eingeschriebene Studierende der Wirtschaftswissenschaften, sehr gute Excel-Kenntnisse inklusive Pivot-Tabellen, erste Erfahrung mit Power BI,',
    'SAP FI/CO von Vorteil, Deutsch fließend, Englisch gut.',
  ].join('\n'),
};
