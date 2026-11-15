// Colour palettes and font sets the user may choose from. The layout itself is decided by the country.
// Every font is a stock Windows / Office font, so PDF and Word output match the preview.

export const PALETTES = [
  { id: 'navy',     name: 'Navy',      primary: '#1B365D', secondary: '#2F5C8F', tint: '#EEF3F8' },
  { id: 'ink',      name: 'Black',     primary: '#16181D', secondary: '#4A4F58', tint: '#F1F2F4' },
  { id: 'slate',    name: 'Slate',     primary: '#27364A', secondary: '#5B6B80', tint: '#EFF2F6' },
  { id: 'teal',     name: 'Teal',      primary: '#0F4C5C', secondary: '#1F7A8C', tint: '#EAF4F6' },
  { id: 'forest',   name: 'Forest',    primary: '#1D4332', secondary: '#3A7D5B', tint: '#ECF4EF' },
  { id: 'burgundy', name: 'Burgundy',  primary: '#5C1D24', secondary: '#8C3540', tint: '#F8EFF0' },
  { id: 'espresso', name: 'Espresso',  primary: '#3E2A22', secondary: '#7A5646', tint: '#F6F1EE' },
  { id: 'royal',    name: 'Royal',     primary: '#1F3A93', secondary: '#4063C9', tint: '#EDF1FB' },
];

export const FONTS = [
  { id: 'calibri', name: 'Calibri', note: 'Modern, the Office standard', head: 'Calibri', body: 'Calibri', css: 'Calibri, "Segoe UI", Arial, sans-serif', scale: 1 },
  { id: 'arial',   name: 'Arial',   note: 'Neutral, safest for scanners', head: 'Arial', body: 'Arial', css: 'Arial, Helvetica, sans-serif', scale: 0.94 },
  { id: 'cambria', name: 'Cambria', note: 'Classic serif, formal', head: 'Cambria', body: 'Cambria', css: 'Cambria, Georgia, "Times New Roman", serif', scale: 0.98 },
  { id: 'georgia', name: 'Georgia + Calibri', note: 'Serif headings, clean text', head: 'Georgia', body: 'Calibri', css: 'Calibri, "Segoe UI", Arial, sans-serif', headCss: 'Georgia, Cambria, serif', scale: 1 },
  { id: 'segoe',   name: 'Segoe UI', note: 'Crisp and contemporary', head: 'Segoe UI', body: 'Segoe UI', css: '"Segoe UI", Calibri, Arial, sans-serif', scale: 0.93 },
];

export const palette = (id) => PALETTES.find((p) => p.id === id) || PALETTES[0];
export const font = (id) => FONTS.find((f) => f.id === id) || FONTS[0];

export const DENSITY = [
  { id: 'compact', label: 'Compact', k: 0.94 },
  { id: 'normal', label: 'Normal', k: 1 },
  { id: 'airy', label: 'Airy', k: 1.06 },
];
export const density = (id) => DENSITY.find((d) => d.id === id) || DENSITY[1];
