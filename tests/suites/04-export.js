// Saving documents: real PDF and Word files are written, then opened again and checked.
T.run('04-export', async () => {
  const { ok, eq, waitFor, $, mod, sleep } = T;
  const store = await mod('store.js');
  const host = await mod('host.js');
  const main = await mod('main.js');
  const { exportDocs } = await mod('docs/export.js');
  const { extractText } = await mod('extract.js');
  const { unzip, base64ToBytes, clone } = await mod('util.js');
  const pdfjs = await import('/vendor/pdfjs/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('/vendor/pdfjs/pdf.worker.min.mjs', location.href).href;

  const id = store.state.apps[0].id;
  await main.navigate('studio', { id });
  await waitFor(() => window.__studio && $('.studio .sheet-wrap'));
  const app = window.__studio.app;
  const layout = window.__studio.ui.layout;
  const dir = store.state.info.dataDir + '\\dev-out';
  const bytesOf = async (name) => base64ToBytes(await host.store.readBinary('dev-out/' + name));
  const pdfInfo = async (name) => {
    const u8 = await bytesOf(name);
    const head = String.fromCharCode(...u8.subarray(0, 5));
    const doc = await pdfjs.getDocument({ data: u8.slice(), verbosity: 0 }).promise;
    const page = await doc.getPage(1);
    const size = [Math.round(page.view[2]), Math.round(page.view[3])];
    const pages = doc.numPages;
    await doc.destroy();
    const text = (await extractText(new File([u8], name))).text;
    return { head, pages, size, text, bytes: u8.length };
  };

  // ---- PDF
  const both = await exportDocs(app, { kind: 'both', format: 'pdf', dir });
  eq('two PDF files are named after candidate, document and company', both.files.map((f) => f.name),
    ['Lena_Brandt_Lebenslauf_Nordwind_Logistik_GmbH.pdf', 'Lena_Brandt_Anschreiben_Nordwind_Logistik_GmbH.pdf']);
  const cv = await pdfInfo(both.files[0].name);
  const letter = await pdfInfo(both.files[1].name);
  eq('the CV file is a PDF with the previewed page count', [cv.head, cv.pages], ['%PDF-', layout.cvPages]);
  eq('the letter file is a one-page PDF', [letter.head, letter.pages], ['%PDF-', 1]);
  eq('German PDFs are exactly A4', [cv.size, letter.size], [[595, 842], [595, 842]]);
  ok('the CV text is real, selectable text', cv.text.includes('Lena Brandt') && cv.text.includes('Hansa Freight Services GmbH') && cv.text.includes('Berufserfahrung'.toUpperCase()) , cv.text.slice(0, 300));
  ok('the letter carries recipient, subject and closing', letter.text.includes('Frau Katrin Albers') && letter.text.includes('Bewerbung als Werkstudentin') && letter.text.includes('Mit freundlichen Grüßen'), letter.text.slice(0, 400));
  ok('no dash character reaches the PDF', !/[‒-―]/.test(cv.text + letter.text));

  const comb = await exportDocs(app, { kind: 'combined', format: 'pdf', dir });
  const combined = await pdfInfo(comb.files[0].name);
  eq('the combined PDF is the letter followed by the CV', [comb.files[0].name, combined.pages], ['Lena_Brandt_Application_Nordwind_Logistik_GmbH.pdf', layout.cvPages + 1]);
  ok('the letter comes first in the combined file', combined.text.indexOf('Sehr geehrte Frau Albers') < combined.text.indexOf('Berufserfahrung'.toUpperCase()));

  const us = clone(app);
  us.id = 'app_test_us_letter'; us.country = 'US'; us.language = 'en';
  const usPdf = await exportDocs(us, { kind: 'cv', format: 'pdf', dir });
  const usInfo = await pdfInfo(usPdf.files[0].name);
  eq('a US resume is printed on US Letter', [usPdf.files[0].name, usInfo.size], ['Lena_Brandt_Resume_Nordwind_Logistik_GmbH.pdf', [612, 792]]);
  await store.removeApp(us.id);

  // ---- Word
  const docx = await exportDocs(app, { kind: 'both', format: 'docx', dir });
  eq('two Word files are written', docx.files.map((f) => f.name), ['Lena_Brandt_Lebenslauf_Nordwind_Logistik_GmbH.docx', 'Lena_Brandt_Anschreiben_Nordwind_Logistik_GmbH.docx']);
  for (const f of docx.files) {
    const u8 = await bytesOf(f.name);
    const entries = unzip(u8);
    const names = [...entries.keys()];
    ok(`${f.name} has the parts Word requires`, ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml'].every((n) => names.includes(n)), names);
    const broken = [];
    for (const n of names.filter((x) => /\.(xml|rels)$/.test(x))) {
      const xml = new TextDecoder().decode(await entries.get(n)());
      if (new DOMParser().parseFromString(xml, 'application/xml').querySelector('parsererror')) broken.push(n);
    }
    eq(`${f.name} contains only well-formed XML`, broken, []);
    const text = (await extractText(new File([u8], f.name))).text;
    ok(`${f.name} can be read back`, text.includes('Lena Brandt') && (text.includes('Hansa Freight Services GmbH') || text.includes('Sehr geehrte Frau Albers')), text.slice(0, 300));
    ok(`${f.name} has no dash characters`, !/[‒-―]/.test(text));
  }
  const cvDocx = unzip(await bytesOf(docx.files[0].name));
  ok('the Word CV embeds the portrait', [...cvDocx.keys()].some((n) => /^word\/media\/.+\.(jpe?g|png)$/.test(n)), [...cvDocx.keys()]);

  // ---- bookkeeping
  const saved = await store.getApp(id);
  ok('saved files are remembered on the application', saved.exports.length === 5 && saved.exports.every((e) => e.dir === dir), saved.exports.map((e) => e.name));
  eq('the last folder is remembered', store.state.settings.export.lastDir, dir);
  ok('saving does not count as a change to the application', saved.updatedAt === app.updatedAt);
  ok('the print area is emptied afterwards', $('#print-root').children.length === 0);
  await sleep(30);
});
