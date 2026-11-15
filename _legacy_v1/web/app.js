// ============================================================================
// JobMech — Tailored International CV & Cover Letter Studio (Frontend Engine)
// ============================================================================

const PALETTES = {
  navy: {
    id: 'navy',
    name: 'Executive Navy',
    desc: 'Classic Engineering, Corporate & Finance',
    primary: '#1B365D',
    secondary: '#2B547E',
    tint: '#F0F4F8'
  },
  slate: {
    id: 'slate',
    name: 'Charcoal & Slate',
    desc: 'Minimalist, High-Contrast & Timeless',
    primary: '#1E293B',
    secondary: '#475569',
    tint: '#F1F5F9'
  },
  forest: {
    id: 'forest',
    name: 'Alpine Forest',
    desc: 'Energy, Sustainability, R&D & Consulting',
    primary: '#1B4332',
    secondary: '#2D6A4F',
    tint: '#ECF3F0'
  },
  burgundy: {
    id: 'burgundy',
    name: 'Oxford Burgundy',
    desc: 'Distinguished European Executive Accent',
    primary: '#5C1D24',
    secondary: '#802F38',
    tint: '#F9F1F2'
  },
  teal: {
    id: 'teal',
    name: 'Nordic Steel Teal',
    desc: 'Modern Tech, Product & Industrial Design',
    primary: '#0F4C5C',
    secondary: '#1F6E82',
    tint: '#EEF6F8'
  },
  espresso: {
    id: 'espresso',
    name: 'Warm Espresso',
    desc: 'Operations, Architecture & Executive Leadership',
    primary: '#3E2723',
    secondary: '#5D4037',
    tint: '#F6F2F0'
  }
};

const COUNTRY_RULES = {
  DE: {
    code: 'DE',
    flag: '🇩🇪',
    name: 'Germany / Austria (DACH)',
    styleName: 'German Tabellarischer Lebenslauf',
    photoPolicy: 'expected',
    photoBadge: 'Recommended in Germany',
    photoDesc: 'In Germany & Austria, a professional portrait photo in the top-right header of the "Tabellarischer Lebenslauf" is standard practice.',
    cultureNote: 'Although the CV and Cover Letter text are in English (matching the job ad), the document structure strictly follows the German "Tabellarischer Lebenslauf" and DIN 5008 "Anschreiben" standard: structured reverse-chronological blocks, portrait photo in top-right, nationality/visa status, CEFR language levels, and city/date signature line.',
    includeMeta: true,
    includeSignature: true
  },
  CH: {
    code: 'CH',
    flag: '🇨🇭',
    name: 'Switzerland',
    styleName: 'Swiss Precision Lebenslauf',
    photoPolicy: 'expected',
    photoBadge: 'Expected in Switzerland',
    photoDesc: 'Swiss employers expect a crisp, factual CV with a professional portrait photo, work permit/nationality status, and CEFR language levels.',
    cultureNote: 'Formatted in the Swiss Precision Lebenslauf layout: clean tabular structure, portrait photo, permit/nationality line, and formal Swiss business Cover Letter.',
    includeMeta: true,
    includeSignature: true
  },
  US: {
    code: 'US',
    flag: '🇺🇸',
    name: 'United States',
    styleName: 'US Executive ATS Standard',
    photoPolicy: 'forbidden',
    photoBadge: 'Omitted (US EEOC Standard)',
    photoDesc: 'In the United States, photos, birth dates, and nationality are strictly omitted to comply with EEOC anti-discrimination and ATS rules.',
    cultureNote: 'Formatted in the American Executive ATS layout: centered header, strictly no photo or personal demographic metadata, and action-driven bullet points with quantified impact.',
    includeMeta: false,
    includeSignature: false
  },
  GB: {
    code: 'GB',
    flag: '🇬🇧',
    name: 'United Kingdom & Ireland',
    styleName: 'British Executive CV',
    photoPolicy: 'forbidden',
    photoBadge: 'Omitted (UK Standard)',
    photoDesc: 'UK recruitment standards strictly discourage photos and personal demographic details on CVs.',
    cultureNote: 'Formatted in the British Executive layout: strong Personal Profile statement at the top, Core Competencies, detailed Career History, and formal UK business letter layout.',
    includeMeta: false,
    includeSignature: false
  },
  NL: {
    code: 'NL',
    flag: '🇳🇱',
    name: 'Netherlands & Nordics',
    styleName: 'Dutch / Nordic Direct Standard',
    photoPolicy: 'optional',
    photoBadge: 'Optional in NL/Nordics',
    photoDesc: 'In the Netherlands and Nordic countries, a clean portrait photo is optional and accepted, while the tone must remain grounded and free of exaggeration.',
    cultureNote: 'Formatted in the Dutch/Nordic layout: direct, factual, egalitarian tone without hyperbole, clear technical competencies, and collaborative impact.',
    includeMeta: true,
    includeSignature: false
  },
  FR: {
    code: 'FR',
    flag: '🇫🇷',
    name: 'France / Spain / Italy (EU)',
    styleName: 'Continental European CV',
    photoPolicy: 'expected',
    photoBadge: 'Common in Continental EU',
    photoDesc: 'In France, Spain, and Italy, including a professional portrait photo and clear language/academic credentials is customary.',
    cultureNote: 'Formatted in the Continental European style: structured header with portrait photo, clear academic & technical credentials, CEFR language levels, and formal Cover Letter.',
    includeMeta: true,
    includeSignature: false
  },
  BR: {
    code: 'BR',
    flag: '🇧🇷',
    name: 'Brazil / Portugal',
    styleName: 'Luso-Brazilian Modern Executive',
    photoPolicy: 'optional',
    photoBadge: 'Optional',
    photoDesc: 'Photo is optional; can be included if desired or omitted for multinational corporate roles.',
    cultureNote: 'Formatted in a clean modern executive layout highlighting results, technical stack, academic background, and language fluency.',
    includeMeta: true,
    includeSignature: false
  },
  CA: {
    code: 'CA',
    flag: '🇨🇦',
    name: 'Canada',
    styleName: 'Canadian ATS Standard',
    photoPolicy: 'forbidden',
    photoBadge: 'Omitted (Canadian Standard)',
    photoDesc: 'Canadian resumes strictly omit photos, age, and nationality.',
    cultureNote: 'Formatted in the Canadian North American ATS standard: clean single-column hierarchy, no photo, and measurable achievements.',
    includeMeta: false,
    includeSignature: false
  },
  AU: {
    code: 'AU',
    flag: '🇦🇺',
    name: 'Australia & New Zealand',
    styleName: 'Australian Commonwealth Standard',
    photoPolicy: 'forbidden',
    photoBadge: 'Omitted (AU Standard)',
    photoDesc: 'Australian CVs omit photos and personal demographic details.',
    cultureNote: 'Formatted in the Australian Executive standard with a clear Career Profile, Key Capabilities, and concrete project outcomes.',
    includeMeta: false,
    includeSignature: false
  },
  JP: {
    code: 'JP',
    flag: '🇯🇵',
    name: 'Japan / APAC International',
    styleName: 'APAC International Standard',
    photoPolicy: 'expected',
    photoBadge: 'Expected in Japan/APAC',
    photoDesc: 'In Japan and many APAC hubs, a formal portrait photo and clear chronological continuity are expected.',
    cultureNote: 'Formatted for international roles in Japan/APAC: formal chronological layout, portrait photo, polite and respectful Cover Letter tone.',
    includeMeta: true,
    includeSignature: true
  }
};

// Global App State
let state = {
  profile: {
    setupCompleted: false,
    fullName: '',
    title: '',
    email: '',
    phone: '',
    location: '',
    nationality: '',
    linkedin: '',
    portfolio: '',
    languages: '',
    autoSaveMemory: true,
    preferredPalette: 'navy',
    aiProvider: 'ollama',
    aiModel: 'qwen2.5:7b',
    apiKey: '',
    customEndpoint: 'http://127.0.0.1:11434'
  },
  memoryMd: '',
  baseStory: '',
  learnedFacts: '',
  photo: '',
  applications: [],
  activeAppId: null,
  currentDraft: {
    jobPosting: '',
    detectedRole: '',
    detectedCompany: '',
    countryCode: 'DE',
    docLanguage: 'English',
    includePhoto: true,
    palette: 'navy',
    gapQuestions: [],
    gapSkipped: [],
    gapAnswers: ''
  },
  attachedStoryFiles: [],
  inlineEditActive: false
};

// ============================================================================
// INITIALIZATION
// ============================================================================
window.addEventListener('DOMContentLoaded', async () => {
  renderPaletteSelector();
  await loadBackendState();
  checkOllamaStatus();
});

async function loadBackendState() {
  try {
    const res = await fetch('/api/state');
    const data = await res.json();
    if (data && data.ok) {
      state.profile = Object.assign(state.profile, data.profile || {});
      state.applications = Array.isArray(data.applications) ? data.applications : [];
      state.memoryMd = data.memoryMd || '';
      state.baseStory = data.baseStory || '';
      state.learnedFacts = data.learnedFacts || '';
      state.photo = data.photo || '';
      state.currentDraft.palette = state.profile.preferredPalette || 'navy';

      syncUiFromState();

      if (!state.profile.setupCompleted) {
        openSetupModal(1);
      }
    }
  } catch (err) {
    console.error('Could not load state from backend:', err);
  }
}

function syncUiFromState(forceStorySync = false) {
  // Topbar Memory Auto-save status
  const autoSave = state.profile.autoSaveMemory !== false;
  document.getElementById('memoryAutoLabel').textContent = autoSave ? 'ON' : 'OFF';
  document.getElementById('saveToMemoryCheck').checked = autoSave;
  document.getElementById('autoSaveAlwaysToggle').checked = autoSave;
  document.getElementById('memoryViewAutoSaveCheck').checked = autoSave;

  // Base story in Step 1
  const baseStoryInput = document.getElementById('baseStoryInput');
  if (forceStorySync || (state.baseStory && !baseStoryInput.value.trim())) {
    baseStoryInput.value = state.baseStory || '';
  }
  const badge = document.getElementById('storyMemoryLoadedBadge');
  if (state.baseStory && state.baseStory.trim().length > 10) {
    badge.textContent = '✓ Loaded from memory.md';
    badge.className = 'badge badge-emerald';
  } else {
    badge.textContent = 'Memory Empty — Paste Story Below';
    badge.className = 'badge badge-amber';
  }

  // Learned facts box
  const factsText = document.getElementById('learnedFactsPreviewText');
  if (state.learnedFacts && state.learnedFacts.trim()) {
    factsText.textContent = state.learnedFacts;
  } else {
    factsText.textContent = 'No extra Q&A facts saved yet. When you answer gap questions for a job and save to memory, they will accumulate here automatically!';
  }

  // Photo previews
  updatePhotoPreviews();

  // Memory view raw markdown
  document.getElementById('rawMemoryTextarea').value = state.memoryMd || '';
  renderMemoryProfileSummary();

  // AI Status pill
  updateAiStatusPill();

  // Render Application History Sidebar
  renderHistorySidebar();
}

function updatePhotoPreviews() {
  const hasPhoto = state.photo && state.photo.startsWith('data:image');
  const thumbs = ['setupPhotoPreview', 'memoryPhotoPreview', 'step2PhotoThumb'];
  thumbs.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (hasPhoto) {
      el.src = state.photo;
      el.style.display = 'block';
    } else {
      el.src = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="100" viewBox="0 0 80 100"><rect width="80" height="100" fill="#1e293b"/><circle cx="40" cy="36" r="16" fill="#475569"/><path d="M14 90 C14 66 66 66 66 90" fill="#475569"/></svg>');
      el.style.display = 'block';
    }
  });

  const sbBadge = document.getElementById('sidebarPhotoBadge');
  if (sbBadge) {
    sbBadge.textContent = hasPhoto ? 'Photo Ready' : 'No Photo';
    sbBadge.className = hasPhoto ? 'badge badge-emerald' : 'badge badge-amber';
  }
}

function renderMemoryProfileSummary() {
  const p = state.profile;
  const el = document.getElementById('memoryProfileSummary');
  if (!el) return;
  el.innerHTML = `
    <div><strong>Name:</strong> ${escHtml(p.fullName || 'Not set')}</div>
    <div><strong>Headline:</strong> ${escHtml(p.title || 'Not set')}</div>
    <div><strong>Email &amp; Phone:</strong> ${escHtml(p.email || '—')} | ${escHtml(p.phone || '—')}</div>
    <div><strong>Location:</strong> ${escHtml(p.location || '—')}</div>
    <div><strong>Nationality / Visa:</strong> ${escHtml(p.nationality || '—')}</div>
    <div><strong>Languages:</strong> ${escHtml(p.languages || '—')}</div>
    <div><strong>Links:</strong> ${escHtml([p.linkedin, p.portfolio].filter(Boolean).join(' • ') || '—')}</div>
  `;
}

function updateAiStatusPill() {
  const p = state.profile;
  const dot = document.getElementById('aiStatusDot');
  const txt = document.getElementById('aiStatusText');
  const prov = (p.aiProvider || 'ollama').toUpperCase();
  const mod = p.aiModel || 'qwen2.5:7b';
  txt.textContent = `AI: ${prov} (${mod})`;
  dot.className = 'status-dot';
}

// ============================================================================
// NAVIGATION & VIEWS
// ============================================================================
function switchMainView(viewName) {
  const studio = document.getElementById('viewStudio');
  const memory = document.getElementById('viewMemory');
  const navMemory = document.getElementById('navMemoryBtn');

  if (viewName === 'memory') {
    studio.classList.add('hidden');
    memory.classList.remove('hidden');
    navMemory.classList.add('active');
    document.getElementById('rawMemoryTextarea').value = state.memoryMd || '';
    renderMemoryProfileSummary();
  } else {
    memory.classList.add('hidden');
    studio.classList.remove('hidden');
    navMemory.classList.remove('active');
  }
}

function startNewApplication() {
  state.activeAppId = null;
  state.attachedStoryFiles = [];
  state.currentDraft.gapQuestions = [];
  state.currentDraft.gapSkipped = [];
  state.currentDraft.gapAnswers = '';
  switchMainView('studio');
  document.getElementById('baseStoryInput').value = state.baseStory || '';
  const chipsEl = document.getElementById('attachedStoryChips');
  if (chipsEl) chipsEl.innerHTML = '';
  const fileEl = document.getElementById('storyFileInput');
  if (fileEl) fileEl.value = '';
  document.getElementById('jobPostingInput').value = '';
  const qList = document.getElementById('gapQuestionsList');
  if (qList) qList.innerHTML = '';
  const extraEl = document.getElementById('gapExtraNotesInput');
  if (extraEl) extraEl.value = '';
  syncUiFromState(true);
  renderHistorySidebar();
  goToWorkflowStep(1);
}

function goToWorkflowStep(stepNum) {
  switchMainView('studio');
  for (let i = 1; i <= 3; i++) {
    const panel = document.getElementById('workflowStep' + i);
    const pill = document.getElementById('stepPill' + i);
    if (i === stepNum) {
      panel.classList.remove('hidden');
      pill.className = 'step-pill active';
    } else if (i < stepNum) {
      panel.classList.add('hidden');
      pill.className = 'step-pill done';
    } else {
      panel.classList.add('hidden');
      pill.className = 'step-pill';
    }
  }
}

// ============================================================================
// ONBOARDING & SETUP MODAL (AI + PROFILE + OLLAMA MANAGER)
// ============================================================================
function openSetupModal(step = 1) {
  const p = state.profile;
  document.getElementById('setupAiProvider').value = p.aiProvider || 'ollama';
  document.getElementById('setupAiModel').value = p.aiModel || 'qwen2.5:7b';
  document.getElementById('setupApiKey').value = p.apiKey || '';

  document.getElementById('profFullName').value = p.fullName || '';
  document.getElementById('profTitle').value = p.title || '';
  document.getElementById('profEmail').value = p.email || '';
  document.getElementById('profPhone').value = p.phone || '';
  document.getElementById('profLocation').value = p.location || '';
  document.getElementById('profNationality').value = p.nationality || '';
  document.getElementById('profLinkedin').value = p.linkedin || '';
  document.getElementById('profPortfolio').value = p.portfolio || '';
  document.getElementById('profLanguages').value = p.languages || '';

  onAiProviderSelectChange();
  switchSetupStep(step);
  document.getElementById('setupModalOverlay').classList.remove('hidden');
  checkOllamaStatus();
}

function closeSetupModal() {
  document.getElementById('setupModalOverlay').classList.add('hidden');
}

function switchSetupStep(stepNum) {
  const s1 = document.getElementById('setupStep1');
  const s2 = document.getElementById('setupStep2');
  const b1 = document.getElementById('setupTabBtn1');
  const b2 = document.getElementById('setupTabBtn2');

  if (stepNum === 1) {
    s1.classList.remove('hidden');
    s2.classList.add('hidden');
    b1.classList.add('active');
    b2.classList.remove('active');
  } else {
    s1.classList.add('hidden');
    s2.classList.remove('hidden');
    b1.classList.remove('active');
    b2.classList.add('active');
  }
}

function onAiProviderSelectChange() {
  const provider = document.getElementById('setupAiProvider').value;
  const cloudBox = document.getElementById('cloudApiBox');
  const ollamaBox = document.getElementById('localOllamaBox');
  const modelInput = document.getElementById('setupAiModel');

  if (provider === 'ollama' || provider === 'lmstudio') {
    cloudBox.classList.add('hidden');
    ollamaBox.classList.remove('hidden');
    if (provider === 'ollama' && (!modelInput.value || modelInput.value.includes('gpt') || modelInput.value.includes('gemini') || modelInput.value.includes('claude'))) {
      modelInput.value = 'qwen2.5:7b';
    }
  } else {
    cloudBox.classList.remove('hidden');
    ollamaBox.classList.add('hidden');
    if (provider === 'gemini') modelInput.value = 'gemini-2.5-flash';
    else if (provider === 'openai') modelInput.value = 'gpt-4o';
    else if (provider === 'anthropic') modelInput.value = 'claude-3-5-sonnet-latest';
    else if (provider === 'groq') modelInput.value = 'llama-3.3-70b-versatile';
    else if (provider === 'openrouter') modelInput.value = 'anthropic/claude-3.5-sonnet';
  }
}

async function checkOllamaStatus() {
  const badge = document.getElementById('ollamaRuntimeBadge');
  const installBtn = document.getElementById('installOllamaBtn');
  try {
    const res = await fetch('/api/ollama/status');
    const data = await res.json();
    if (data.running) {
      const count = Array.isArray(data.models) ? data.models.length : 0;
      badge.textContent = count > 0
        ? `✓ Ollama Running (${count} local model${count > 1 ? 's' : ''}: ${data.models.join(', ')})`
        : '✓ Ollama Running (Click Download on a model below)';
      badge.className = 'badge badge-emerald';
      if (installBtn) installBtn.style.display = 'none';
    } else if (data.binaryInstalled) {
      badge.textContent = 'Ollama Installed (Click Download on a model to start)';
      badge.className = 'badge badge-blue';
      if (installBtn) installBtn.style.display = 'none';
    } else {
      badge.textContent = 'Ollama Not Installed Yet (Smart Offline Assisted Mode Ready)';
      badge.className = 'badge badge-amber';
      if (installBtn) installBtn.style.display = 'inline-flex';
    }
  } catch {
    badge.textContent = 'Local Mode Ready';
  }
}

function selectAndUseLocalModel(modelName) {
  document.getElementById('setupAiProvider').value = 'ollama';
  document.getElementById('setupAiModel').value = modelName;
  showToast(`Selected local model: ${modelName}`);
}

async function pullOllamaModel(modelName) {
  document.getElementById('setupAiProvider').value = 'ollama';
  document.getElementById('setupAiModel').value = modelName;
  const res = await fetch('/api/ollama/pull', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: modelName })
  });
  const data = await res.json();
  if (data.ok) {
    showToast(`Started downloading ${modelName} in PowerShell!`);
  } else {
    showToast(`Could not launch Ollama download: ${data.error || 'Install Ollama first'}`);
  }
}

async function installOllamaRuntime() {
  const res = await fetch('/api/ollama/install', { method: 'POST' });
  const data = await res.json();
  if (data.ok) {
    showToast('Launched Ollama installer in PowerShell!');
  }
}

async function testAiConnection() {
  const provider = document.getElementById('setupAiProvider').value;
  const model = document.getElementById('setupAiModel').value;
  const apiKey = document.getElementById('setupApiKey').value;
  showLoading('Testing AI Connection...', `Contacting ${provider} (${model})...`);
  try {
    const res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider,
        model,
        apiKey,
        systemPrompt: 'Reply with a short confirmation.',
        userPrompt: 'Say: Connection successful!'
      })
    });
    const data = await res.json();
    hideLoading();
    if (data.ok) {
      showToast('✓ AI Connection verified successfully!');
    } else {
      alert('AI Connection Error:\n' + (data.error || 'Unknown error'));
    }
  } catch (err) {
    hideLoading();
    alert('Connection failed: ' + err.message);
  }
}

async function saveProfileAndFinishSetup() {
  const updatedProfile = {
    setupCompleted: true,
    aiProvider: document.getElementById('setupAiProvider').value,
    aiModel: document.getElementById('setupAiModel').value.trim() || 'qwen2.5:7b',
    apiKey: document.getElementById('setupApiKey').value.trim(),
    fullName: document.getElementById('profFullName').value.trim(),
    title: document.getElementById('profTitle').value.trim(),
    email: document.getElementById('profEmail').value.trim(),
    phone: document.getElementById('profPhone').value.trim(),
    location: document.getElementById('profLocation').value.trim(),
    nationality: document.getElementById('profNationality').value.trim(),
    linkedin: document.getElementById('profLinkedin').value.trim(),
    portfolio: document.getElementById('profPortfolio').value.trim(),
    languages: document.getElementById('profLanguages').value.trim()
  };

  const res = await fetch('/api/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updatedProfile)
  });
  const data = await res.json();
  if (data.ok) {
    state.profile = data.profile;
    state.memoryMd = data.memoryMd;
    syncUiFromState();
    closeSetupModal();
    showToast('Profile & AI configuration saved to Memory!');
  }
}

// ============================================================================
// PHOTO UPLOAD & MEMORY MANAGEMENT
// ============================================================================
function handlePhotoUpload(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    const rawDataUrl = e.target.result;
    // Resize & crop portrait photo cleanly via canvas so it fits DOCX and PDF nicely
    const resizedDataUrl = await normalizePortraitPhoto(rawDataUrl);
    state.photo = resizedDataUrl;
    updatePhotoPreviews();

    await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photo: resizedDataUrl })
    });
    if (state.activeAppId) {
      renderActiveApplicationSheets();
    }
    showToast('Personal portrait photo saved in Memory!');
  };
  reader.readAsDataURL(file);
}

function normalizePortraitPhoto(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const targetW = 360;
      const targetH = 460;
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');

      const srcRatio = img.width / img.height;
      const dstRatio = targetW / targetH;
      let sx = 0, sy = 0, sw = img.width, sh = img.height;
      if (srcRatio > dstRatio) {
        sw = img.height * dstRatio;
        sx = (img.width - sw) / 2;
      } else {
        sh = img.width / dstRatio;
        sy = (img.height - sh) * 0.2;
      }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

async function removeSavedPhoto() {
  state.photo = '';
  updatePhotoPreviews();
  await fetch('/api/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photo: '' })
  });
  showToast('Photo removed from Memory.');
}

async function toggleAutoSaveMemorySetting(enabled) {
  state.profile.autoSaveMemory = enabled;
  document.getElementById('memoryAutoLabel').textContent = enabled ? 'ON' : 'OFF';
  document.getElementById('autoSaveAlwaysToggle').checked = enabled;
  document.getElementById('memoryViewAutoSaveCheck').checked = enabled;
  if (enabled) {
    document.getElementById('saveToMemoryCheck').checked = true;
  }

  await fetch('/api/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ autoSaveMemory: enabled })
  });
  showToast(`Memory Auto-Save turned ${enabled ? 'ON' : 'OFF'}`);
}

async function saveRawMemoryMarkdown() {
  const raw = document.getElementById('rawMemoryTextarea').value;
  const res = await fetch('/api/memory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rawMarkdown: raw })
  });
  const data = await res.json();
  if (data.ok) {
    state.memoryMd = data.memoryMd;
    state.baseStory = data.baseStory;
    state.learnedFacts = data.learnedFacts;
    syncUiFromState(true);
    showToast('✓ Saved changes to data/memory.md & Home Career Story!');
  }
}

async function openDiskFolder(target) {
  await fetch('/api/open-folder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target })
  });
}

// ============================================================================
// COLOR PALETTE SELECTOR
// ============================================================================
function renderPaletteSelector() {
  const grid = document.getElementById('step2PaletteGrid');
  if (!grid) return;
  grid.innerHTML = '';

  Object.values(PALETTES).forEach(pal => {
    const selected = state.currentDraft.palette === pal.id;
    const div = document.createElement('div');
    div.className = 'palette-card' + (selected ? ' selected' : '');
    div.onclick = () => {
      state.currentDraft.palette = pal.id;
      renderPaletteSelector();
    };
    div.innerHTML = `
      <div class="palette-swatches">
        <div class="palette-swatch" style="background:${pal.primary};"></div>
        <div class="palette-swatch" style="background:${pal.secondary};"></div>
        <div class="palette-swatch" style="background:${pal.tint};"></div>
      </div>
      <div>
        <div class="palette-name">${escHtml(pal.name)}</div>
        <div class="palette-desc">${escHtml(pal.desc)}</div>
      </div>
    `;
    grid.appendChild(div);
  });
}

// ============================================================================
// STEP 1 -> STEP 2: JOB POSTING & ANTI-GENERIC GAP ANALYSIS
// ============================================================================
function detectCountryAndLangFromJob(jobText, countryOverride, langOverride) {
  let country = countryOverride !== 'AUTO' ? countryOverride : 'DE';
  const lower = jobText.toLowerCase();

  if (countryOverride === 'AUTO') {
    if (/\b(munich|münchen|berlin|hamburg|frankfurt|stuttgart|germany|deutschland|gmbh|ag\b|düsseldorf|cologne|köln|bavaria)\b/i.test(jobText)) {
      country = 'DE';
    } else if (/\b(zurich|zürich|geneva|basel|switzerland|schweiz|lausanne|bern)\b/i.test(jobText)) {
      country = 'CH';
    } else if (/\b(vienna|wien|austria|österreich|graz)\b/i.test(jobText)) {
      country = 'DE';
    } else if (/\b(amsterdam|rotterdam|eindhoven|netherlands|utrecht|stockholm|sweden|copenhagen|denmark|oslo|norway|helsinki)\b/i.test(jobText)) {
      country = 'NL';
    } else if (/\b(london|manchester|edinburgh|cambridge|united kingdom|\buk\b|england|bristol|dublin|ireland)\b/i.test(jobText)) {
      country = 'GB';
    } else if (/\b(paris|lyon|toulouse|france|madrid|barcelona|spain|milan|rome|italy|brussels|belgium)\b/i.test(jobText)) {
      country = 'FR';
    } else if (/\b(são paulo|sao paulo|rio de janeiro|curitiba|brasil|brazil|lisbon|lisboa|porto|portugal)\b/i.test(jobText)) {
      country = 'BR';
    } else if (/\b(toronto|vancouver|montreal|ottawa|canada|ontario)\b/i.test(jobText)) {
      country = 'CA';
    } else if (/\b(sydney|melbourne|brisbane|australia|auckland)\b/i.test(jobText)) {
      country = 'AU';
    } else if (/\b(tokyo|osaka|japan|singapore)\b/i.test(jobText)) {
      country = 'JP';
    } else if (/\b(new york|san francisco|california|texas|chicago|boston|seattle|united states|\busa\b|401\(k\)|equal opportunity employer)\b/i.test(jobText)) {
      country = 'US';
    } else {
      country = 'US';
    }
  }

  let lang = langOverride !== 'AUTO' ? langOverride : 'English';
  if (langOverride === 'AUTO') {
    if (/\b(wir suchen|aufgaben|anforderungen|dein profil|berufserfahrung)\b/i.test(lower)) {
      lang = 'German';
    } else if (/\b(requisitos|responsabilidades|vaga|empresa|experiência)\b/i.test(lower)) {
      lang = 'Portuguese';
    } else if (/\b(missions|profil recherché|compétences|entreprise)\b/i.test(lower)) {
      lang = 'French';
    } else {
      lang = 'English';
    }
  }

  return { country, lang };
}

async function analyzeJobAndFindGaps() {
  const baseStory = document.getElementById('baseStoryInput').value.trim();
  const jobPosting = document.getElementById('jobPostingInput').value.trim();

  if (!baseStory) {
    alert('Please paste your CV, write your career story in natural language, or attach a .PDF, .DOCX, or .MD file first.');
    return;
  }
  if (!jobPosting) {
    alert('Please paste the target Job Description text so JobMech can analyze it.');
    return;
  }

  const countryOverride = document.getElementById('countryOverrideSelect').value;
  const langOverride = document.getElementById('languageOverrideSelect').value;
  const heuristic = detectCountryAndLangFromJob(jobPosting, countryOverride, langOverride);

  showLoading(
    'Analyzing Job Requirements & Checking Memory...',
    'Detecting job location style, comparing with your story + memory.md, and preparing targeted anti-generic questions...'
  );

  let analysisResult = null;

  try {
    const sysPrompt = `You are an expert international executive recruiter and career strategist.
Analyze the Job Description and compare it against the Candidate's Base Story and Learned Memory Facts.
Return ONLY valid JSON (no markdown fences, no commentary) with this exact structure:
{
  "jobTitle": "Detected Job Title",
  "companyName": "Detected Company Name (or Target Employer)",
  "detectedCountryCode": "One of: DE, CH, US, GB, NL, FR, BR, CA, AU, JP",
  "documentLanguage": "Language the job ad is written in (e.g., English, German, Portuguese, French, Spanish)",
  "missingQuestions": [
    "Specific question 1 asking the candidate for real metrics, tools, or project context required by this job that is not yet detailed in their story",
    "Specific question 2...",
    "Specific question 3...",
    "Specific question 4..."
  ]
}`;

    const usrPrompt = `CANDIDATE PROFILE:
Name: ${state.profile.fullName}
Headline: ${state.profile.title}
Location: ${state.profile.location}
Languages: ${state.profile.languages}

CANDIDATE BASE CV / STORY:
${baseStory}

CANDIDATE MEMORY FACTS FROM PAST APPLICATIONS:
${state.learnedFacts || 'None yet'}

TARGET JOB DESCRIPTION:
${jobPosting}`;

    const aiResp = await callAiBackend(sysPrompt, usrPrompt);
    if (aiResp) {
      const parsed = tryParseJsonFromText(aiResp);
      if (parsed && Array.isArray(parsed.missingQuestions)) {
        analysisResult = parsed;
      }
    }
  } catch (err) {
    console.warn('AI analysis fallback:', err);
  }

  // Smart deterministic fallback if local model is not yet downloaded or offline
  if (!analysisResult) {
    analysisResult = buildSmartLocalGapAnalysis(baseStory, state.learnedFacts, jobPosting, heuristic);
  }

  hideLoading();

  const finalCountry = countryOverride !== 'AUTO'
    ? countryOverride
    : (COUNTRY_RULES[analysisResult.detectedCountryCode] ? analysisResult.detectedCountryCode : heuristic.country);
  const finalLang = langOverride !== 'AUTO'
    ? langOverride
    : (analysisResult.documentLanguage || heuristic.lang);

  const roleTitle = analysisResult.jobTitle || 'Target Role';
  const companyName = analysisResult.companyName || 'Target Company';

  state.currentDraft.jobPosting = jobPosting;
  state.currentDraft.detectedRole = roleTitle;
  state.currentDraft.detectedCompany = companyName;
  state.currentDraft.countryCode = finalCountry;
  state.currentDraft.docLanguage = finalLang;
  state.currentDraft.gapQuestions = analysisResult.missingQuestions || [];
  state.currentDraft.gapSkipped = state.currentDraft.gapQuestions.map(() => false);

  // Populate Step 2 UI
  document.getElementById('detectedAppNameInput').value = `${roleTitle} @ ${companyName}`;
  document.getElementById('step2CountrySelect').value = finalCountry;
  document.getElementById('step2LangSelect').value = finalLang;

  onStep2CountryChange();

  renderStep2GapQuestions(state.currentDraft.gapQuestions);
  const extraEl = document.getElementById('gapExtraNotesInput');
  if (extraEl) extraEl.value = '';

  // Pre-check memory save according to user's Auto-Save setting
  document.getElementById('saveToMemoryCheck').checked = state.profile.autoSaveMemory !== false;

  goToWorkflowStep(2);
}

function isNegativeOrEmptyGapAnswer(rawText) {
  const txt = String(rawText || '').trim();
  if (!txt) return true;

  const norm = txt.toLowerCase().replace(/[.!?,;:]+$/g, '').trim();
  if (!norm) return true;

  // Allow negative-lead sentences if followed by a constructive pivot ("No CATIA, but I used SolidWorks for 5 years")
  const hasConstructivePivot = /\b(?:but|however|instead|though|although|yet|currently|besides|mas|por[eé]m|contudo|entretanto|todavia)\b[\s,:]+(?:\S.{6,})/i.test(txt);
  if (hasConstructivePivot && txt.length >= 20) return false;

  const pureNegatives = new Set([
    'no', 'nope', 'nah', 'none', 'nothing', 'nil', 'n/a', 'na', 'never', 'skip', 'skipped',
    'not applicable', 'no experience', 'never used', 'never did', 'havent', "haven't", 'have not',
    'did not', "didn't", 'dont', "don't", 'do not',
    'não', 'nao', 'nunca', 'nada', 'nenhum', 'nenhuma', 'nunca fiz', 'nunca usei',
    'não usei', 'nao usei', 'não tenho', 'nao tenho', 'sem experiencia', 'sem experiência',
    'não trabalhei', 'nao trabalhei', 'nunca trabalhei', 'não possuo', 'nao possuo'
  ]);
  if (pureNegatives.has(norm)) return true;

  if (norm.length <= 110) {
    if (/^(?:no|nope|nah|none|never|n\/a|not\s+applicable|i\s+(?:have\s+not|haven'?t|never|don'?t|do\s+not|did\s+not|didn'?t)|não|nao|nunca|jamais|sem\s+experi[eê]ncia|nunca\s+(?:fiz|usei|trabalhei|apliquei)|não\s+(?:tenho|usei|fiz|possuo|trabalhei)|nao\s+(?:tenho|usei|fiz|possuo|trabalhei))\b/i.test(norm)) {
      return true;
    }
  }

  return false;
}

function renderStep2GapQuestions(questions) {
  const qList = document.getElementById('gapQuestionsList');
  if (!qList) return;
  qList.innerHTML = '';

  (questions || []).forEach((q, idx) => {
    const card = document.createElement('div');
    card.className = 'gap-q-card';
    card.id = `gapQCard_${idx}`;
    card.innerHTML = `
      <div class="gap-q-header">
        <div class="gap-q-title">
          <span class="gap-q-num">Q${idx + 1}</span>
          <span>${escHtml(q)}</span>
        </div>
        <button type="button" class="gap-skip-btn" id="gapSkipBtn_${idx}" onclick="toggleGapQuestionSkip(${idx})" title="Mark if you never used this tool / not applicable (won't save clutter to memory.md)">
          🚫 Haven't used / Skip
        </button>
      </div>
      <textarea id="gapAnswerInput_${idx}" class="gap-q-textarea" rows="2"
                placeholder="Write your real experience, metrics, or examples here (or click Skip above)..."
                oninput="onGapAnswerCardInput(${idx})"></textarea>
      <div class="gap-q-skip-note hidden" id="gapSkipNote_${idx}">
        Excluded from CV claims &amp; omitted from memory.md (no negative clutter saved).
      </div>
    `;
    qList.appendChild(card);
  });
}

function toggleGapQuestionSkip(idx) {
  state.currentDraft.gapSkipped = state.currentDraft.gapSkipped || [];
  const next = !state.currentDraft.gapSkipped[idx];
  state.currentDraft.gapSkipped[idx] = next;

  const card = document.getElementById(`gapQCard_${idx}`);
  const btn = document.getElementById(`gapSkipBtn_${idx}`);
  const ta = document.getElementById(`gapAnswerInput_${idx}`);
  const note = document.getElementById(`gapSkipNote_${idx}`);

  if (card) card.classList.toggle('is-skipped', next);
  if (btn) {
    btn.classList.toggle('active', next);
    btn.textContent = next ? '✓ Skipped (Never Used)' : "🚫 Haven't used / Skip";
  }
  if (ta) {
    ta.disabled = next;
    if (next) ta.placeholder = 'Marked as not applicable / never used.';
    else ta.placeholder = 'Write your real experience, metrics, or examples here (or click Skip above)...';
  }
  if (note) {
    note.classList.toggle('hidden', !next);
    if (next) {
      note.textContent = "Excluded from CV claims & omitted from memory.md (no negative clutter saved).";
    }
  }
}

function onGapAnswerCardInput(idx) {
  const ta = document.getElementById(`gapAnswerInput_${idx}`);
  const note = document.getElementById(`gapSkipNote_${idx}`);
  if (!ta || !note) return;

  const val = ta.value.trim();
  const isNeg = val.length > 0 && isNegativeOrEmptyGapAnswer(val);
  note.classList.toggle('hidden', !isNeg);
  if (isNeg) {
    note.textContent = "Detected 'No / Never used': won't be claimed on CV and won't clutter memory.md.";
  }
}

function collectStep2GapData() {
  const questions = state.currentDraft.gapQuestions || [];
  const skippedArr = state.currentDraft.gapSkipped || [];
  const extraEl = document.getElementById('gapExtraNotesInput');
  const extraRaw = extraEl ? extraEl.value.trim() : '';

  const positivePairs = [];
  const skippedQuestions = [];
  const logLines = [];

  questions.forEach((q, idx) => {
    const ta = document.getElementById(`gapAnswerInput_${idx}`);
    const ans = ta ? ta.value.trim() : '';
    const isSkipped = Boolean(skippedArr[idx]) || isNegativeOrEmptyGapAnswer(ans);

    if (isSkipped) {
      skippedQuestions.push(q);
      logLines.push(`Q${idx + 1}: ${q}\nA${idx + 1}: ${ans ? ans + ' [Skipped from Memory]' : '[Skipped / Not Applicable]'}`);
    } else {
      positivePairs.push({ question: q, answer: ans });
      logLines.push(`Q${idx + 1}: ${q}\nA${idx + 1}: ${ans}`);
    }
  });

  const hasPositiveExtra = !isNegativeOrEmptyGapAnswer(extraRaw);
  if (hasPositiveExtra) {
    logLines.push(`Additional Notes:\n${extraRaw}`);
  }

  // Contextual Markdown blocks saved to data/memory.md (question + verified answer together!)
  const memBlocks = positivePairs.map(p => `- **Context:** ${p.question}\n  **Answer:** ${p.answer}`);
  if (hasPositiveExtra) {
    memBlocks.push(`- **Additional Note:** ${extraRaw}`);
  }

  // Context prompt string for AI generation
  const promptParts = positivePairs.map((p, i) => `Q${i + 1}: ${p.question}\nCandidate Answer: ${p.answer}`);
  if (hasPositiveExtra) {
    promptParts.push(`Additional Candidate Context: ${extraRaw}`);
  }
  let promptContext = promptParts.join('\n\n');
  if (skippedQuestions.length > 0) {
    promptContext += `\n\nTOPICS / TOOLS CANDIDATE HAS NO EXPERIENCE WITH (DO NOT CLAIM ON CV OR COVER LETTER):\n- ${skippedQuestions.join('\n- ')}`;
  }

  const positiveOnlySummary = [
    ...positivePairs.map(p => p.answer),
    ...(hasPositiveExtra ? [extraRaw] : [])
  ].join('\n');

  return {
    positivePairs,
    skippedQuestions,
    extraNotes: hasPositiveExtra ? extraRaw : '',
    memoryFacts: memBlocks.join('\n'),
    promptContext,
    positiveOnlySummary,
    displayLog: logLines.join('\n\n')
  };
}

function buildSmartLocalGapAnalysis(baseStory, learnedFacts, jobPosting, heuristic) {
  const combinedKnown = (baseStory + '\n' + (learnedFacts || '')).toLowerCase();
  const lines = jobPosting.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // Extract Job Title & Company heuristically
  let jobTitle = lines[0] || 'Senior Specialist';
  if (jobTitle.length > 75) jobTitle = jobTitle.substring(0, 72) + '...';
  let companyName = 'Target Organization';
  const compMatch = jobPosting.match(/(?:at|join|company:|employer:|about)\s+([A-Z][A-Za-z0-9&\-\s]{2,35}?)(?:\s+in\b|\s+is\b|\.|,|\n)/);
  if (compMatch && compMatch[1]) {
    companyName = compMatch[1].trim();
  }

  // Extract key technical terms or requirements mentioned in the job ad
  const keywords = [];
  const techMatches = jobPosting.match(/\b(SolidWorks|AutoCAD|CATIA|ANSYS|SAP|Python|SQL|AWS|Docker|Kubernetes|React|TypeScript|ISO\s*\d+|Six Sigma|Lean|Agile|Scrum|FMEA|GD&T|PLC|MATLAB|Simulink|CI\/CD|KPIs|budget|cross-functional|German|English|stakeholder)\b/gi);
  if (techMatches) {
    [...new Set(techMatches.map(x => x.trim()))].forEach(kw => {
      if (!combinedKnown.includes(kw.toLowerCase())) {
        keywords.push(kw);
      }
    });
  }

  const questions = [];
  if (keywords.length > 0) {
    questions.push(`The job description specifically mentions ${keywords.slice(0, 4).join(', ')}. Have you worked with any of these tools/methods, and can you share a concrete project where you applied them?`);
  } else {
    questions.push(`Which specific tools, software, or methodologies mentioned in this job posting have you used most heavily in your recent work?`);
  }

  questions.push(`Can you share 1 or 2 real measurable results from your past roles (e.g., % cost reduction, time saved, revenue impact, defect reduction, or project scale) that directly relate to this role?`);
  questions.push(`What was the size and structure of the teams or international stakeholders you collaborated with in your most relevant project?`);
  questions.push(`Why does ${companyName} and this "${jobTitle}" role specifically appeal to you right now, and what is your availability or relocation/visa readiness for this location?`);

  return {
    jobTitle,
    companyName,
    detectedCountryCode: heuristic.country,
    documentLanguage: heuristic.lang,
    missingQuestions: questions
  };
}

function onStep2CountryChange() {
  const code = document.getElementById('step2CountrySelect').value;
  const lang = document.getElementById('step2LangSelect').value;
  const rule = COUNTRY_RULES[code] || COUNTRY_RULES.DE;
  state.currentDraft.countryCode = code;
  state.currentDraft.docLanguage = lang;

  document.getElementById('detectedCountryBadge').textContent = `${rule.flag} ${rule.styleName} (Text: ${lang})`;
  document.getElementById('detectedCultureExplanation').textContent = rule.cultureNote;

  const photoBadge = document.getElementById('step2PhotoRuleBadge');
  const photoDesc = document.getElementById('step2PhotoRuleDesc');
  const photoCheck = document.getElementById('step2IncludePhotoCheck');

  photoBadge.textContent = rule.photoBadge;
  photoDesc.textContent = rule.photoDesc;

  if (rule.photoPolicy === 'forbidden') {
    photoBadge.className = 'badge badge-amber';
    photoCheck.checked = false;
    state.currentDraft.includePhoto = false;
  } else if (rule.photoPolicy === 'expected') {
    photoBadge.className = 'badge badge-emerald';
    photoCheck.checked = true;
    state.currentDraft.includePhoto = true;
  } else {
    photoBadge.className = 'badge badge-blue';
    photoCheck.checked = Boolean(state.photo);
    state.currentDraft.includePhoto = Boolean(state.photo);
  }
}

// ============================================================================
// HUMANIZER ENGINE (ANTI-EM-DASH & ANTI-AI CLICHÉ SANITIZER)
// ============================================================================
const AI_CLICHE_REPLACEMENTS = [
  [/\bdelve(?:d|s|ing)?\s+into\b/gi, 'examine'],
  [/\bdelve(?:d|s|ing)?\b/gi, 'explore'],
  [/\btapestry\s+of\b/gi, 'range of'],
  [/\ba\s+testament\s+to\b/gi, 'proof of'],
  [/\btestament\s+to\b/gi, 'evidence of'],
  [/\bspearheaded\b/gi, 'led'],
  [/\bspearhead\b/gi, 'lead'],
  [/\bspearheading\b/gi, 'leading'],
  [/\borchestrated\b/gi, 'coordinated'],
  [/\borchestrate\b/gi, 'coordinate'],
  [/\bleveraged\b/gi, 'used'],
  [/\bleveraging\b/gi, 'using'],
  [/\bleverage\b/gi, 'use'],
  [/\butilized\b/gi, 'used'],
  [/\butilizing\b/gi, 'using'],
  [/\butilize\b/gi, 'use'],
  [/\bsynergy\b/gi, 'collaboration'],
  [/\bsynergies\b/gi, 'shared efficiencies'],
  [/\bbeacon\s+of\b/gi, 'leader in'],
  [/\bthrilled\s+to\s+apply\b/gi, 'writing to apply'],
  [/\bI\s+am\s+thrilled\s+to\b/gi, 'I am pleased to'],
  [/\bpassionate\s+about\b/gi, 'focused on'],
  [/\bdynamic\s+professional\b/gi, 'experienced professional'],
  [/\bfast-paced\s+environment\b/gi, 'demanding production environment'],
  [/\bproven\s+track\s+record\s+of\b/gi, 'consistent history of'],
  [/\bproven\s+track\s+record\b/gi, 'strong history'],
  [/\bseamlessly\b/gi, 'smoothly'],
  [/\bmeticulously\b/gi, 'carefully'],
  [/\bmeticulous\b/gi, 'thorough'],
  [/\bcutting-edge\b/gi, 'modern'],
  [/\bstate-of-the-art\b/gi, 'advanced'],
  [/\bgame-changer\b/gi, 'significant improvement'],
  [/\bgame-changing\b/gi, 'high-impact'],
  [/\bmoreover,\s*/gi, 'Additionally, '],
  [/\bfurthermore,\s*/gi, 'In addition, '],
  [/\bin\s+conclusion,\s*/gi, ''],
  [/\bit\s+is\s+worth\s+noting\s+that\s*/gi, ''],
  [/\bparamount\b/gi, 'essential'],
  [/\bfostered\b/gi, 'built'],
  [/\bfostering\b/gi, 'building'],
  [/\belevated\b/gi, 'improved'],
  [/\bnavigated\s+complex\b/gi, 'managed complex']
];

function humanizeString(str) {
  if (!str || typeof str !== 'string') return '';
  let out = str;

  // 1. Strictly remove all em-dashes (—) and spaced en-dashes ( – )
  // Replace " — " or "—" between clauses with ", "
  out = out.replace(/\s*\u2014\s*/g, ', ');
  out = out.replace(/\s+\u2013\s+/g, ', ');
  out = out.replace(/\s*--\s*/g, ', ');
  // If any remaining en-dash is inside a date/number range (e.g. 2020–2024), convert to standard hyphen "-"
  out = out.replace(/\u2013/g, '-');

  // Clean up accidental double punctuation like ", ," or "., "
  out = out.replace(/,\s*,/g, ',');
  out = out.replace(/\.\s*,/g, '.');

  // 2. Replace robotic AI clichés with grounded human vocabulary
  for (const [regex, replacement] of AI_CLICHE_REPLACEMENTS) {
    out = out.replace(regex, replacement);
  }

  // Clean up multiple spaces
  out = out.replace(/[ \t]{2,}/g, ' ').trim();
  return out;
}

function humanizeApplicationData(appObj) {
  if (!appObj) return appObj;
  if (appObj.cv) {
    appObj.cv.headline = humanizeString(appObj.cv.headline);
    appObj.cv.summary = humanizeString(appObj.cv.summary);
    appObj.cv.additionalInfo = humanizeString(appObj.cv.additionalInfo);
    if (Array.isArray(appObj.cv.experience)) {
      appObj.cv.experience.forEach(exp => {
        exp.role = humanizeString(exp.role);
        exp.company = humanizeString(exp.company);
        if (Array.isArray(exp.bullets)) {
          exp.bullets = exp.bullets.map(b => humanizeString(b));
        }
      });
    }
    if (Array.isArray(appObj.cv.education)) {
      appObj.cv.education.forEach(edu => {
        edu.degree = humanizeString(edu.degree);
        edu.institution = humanizeString(edu.institution);
        edu.details = humanizeString(edu.details);
      });
    }
  }
  if (appObj.coverLetter) {
    appObj.coverLetter.subjectLine = humanizeString(appObj.coverLetter.subjectLine);
    appObj.coverLetter.salutation = humanizeString(appObj.coverLetter.salutation);
    if (Array.isArray(appObj.coverLetter.paragraphs)) {
      appObj.coverLetter.paragraphs = appObj.coverLetter.paragraphs.map(p => humanizeString(p));
    }
  }
  return appObj;
}

// ============================================================================
// STEP 2 -> STEP 3: GENERATE TAILORED CV & COVER LETTER + SAVE TO MEMORY
// ============================================================================
async function generateTailoredDocuments() {
  const baseStory = document.getElementById('baseStoryInput').value.trim();
  const jobPosting = state.currentDraft.jobPosting || document.getElementById('jobPostingInput').value.trim();
  const gapData = collectStep2GapData();
  const appName = document.getElementById('detectedAppNameInput').value.trim() || 'Job Application';
  const countryCode = document.getElementById('step2CountrySelect').value;
  const docLanguage = document.getElementById('step2LangSelect').value;
  const includePhoto = document.getElementById('step2IncludePhotoCheck').checked;
  const shouldSaveMemory = document.getElementById('saveToMemoryCheck').checked;
  const paletteId = state.currentDraft.palette || 'navy';

  const rule = COUNTRY_RULES[countryCode] || COUNTRY_RULES.DE;

  showLoading(
    `Crafting ${rule.styleName} CV & Cover Letter in ${docLanguage}...`,
    'Integrating your career story, memory.md, and new details, then running the anti-AI Humanizer pass (0 em-dashes, 0 clichés)...'
  );

  let generated = null;

  try {
    const sysPrompt = `You are an elite international CV and Cover Letter writer and Humanizer.
Your task is to create a deeply tailored, 100% authentic, non-generic Curriculum Vitae (CV) and Cover Letter for a specific job posting.

CRITICAL CULTURAL & LANGUAGE RULES:
1. Target Job Country Style: ${rule.name} (${rule.styleName}).
   ${rule.cultureNote}
2. Document Text Language: Write ALL content in ${docLanguage} (even if the country is Germany/Switzerland/etc., write the text in ${docLanguage} while following ${rule.name}'s structural CV conventions).
3. STRICT ANTI-AI HUMANIZER RULES:
   - NEVER use em-dashes (—) or en-dashes (–) in sentences. Use standard commas, periods, or parentheses instead.
   - NEVER use AI clichés or buzzwords such as: "delve", "tapestry", "testament", "spearheaded", "orchestrated", "leveraged", "utilized", "synergy", "thrilled", "passionate about", "fast-paced environment", "proven track record", "seamlessly", "meticulous", "cutting-edge", "moreover", "furthermore".
   - Write in a natural, concrete, grounded human voice using real facts, tools, and metrics from the candidate's story and their answers to the gap questions. Do not invent fake companies.

Return ONLY valid JSON (no markdown fences) matching this exact schema:
{
  "cv": {
    "headline": "Tailored Professional Title for this Role",
    "summary": "3-4 sentence concrete, human-written executive profile tailored to the role and country style (zero em-dashes, zero clichés)",
    "experience": [
      {
        "role": "Job Title",
        "company": "Company Name",
        "location": "City, Country",
        "period": "MM/YYYY - MM/YYYY (or Present)",
        "bullets": [
          "Concrete achievement bullet 1 incorporating specific skills/metrics relevant to the job ad",
          "Concrete achievement bullet 2",
          "Concrete achievement bullet 3"
        ]
      }
    ],
    "education": [
      {
        "degree": "Degree & Major",
        "institution": "University / Institution",
        "period": "YYYY - YYYY",
        "details": "Relevant coursework, thesis, or honors"
      }
    ],
    "skills": ["Skill 1", "Skill 2", "Skill 3", "Skill 4", "Skill 5", "Skill 6", "Skill 7", "Skill 8"],
    "additionalInfo": "Certifications, relevant standards, or technical highlights"
  },
  "coverLetter": {
    "recipientBlock": "Hiring Team\\n[Company Name]\\n[Location]",
    "subjectLine": "Application for [Job Title]",
    "salutation": "Dear Hiring Team, (or Dear [Name],)",
    "paragraphs": [
      "Opening paragraph: direct, engaging human explanation of why you are applying for this specific role at this company and your core technical fit.",
      "Body paragraph 1: concrete story and metrics from your experience and gap answers that directly solve the key technical challenges in the job description.",
      "Body paragraph 2: how your collaboration style, international readiness, and domain knowledge fit their team.",
      "Closing paragraph: straightforward, polite call to action for an interview."
    ],
    "signOff": "Sincerely,"
  }
}`;

    const usrPrompt = `CANDIDATE PROFILE:
Full Name: ${state.profile.fullName || 'Candidate Name'}
Headline: ${state.profile.title}
Email: ${state.profile.email}
Phone: ${state.profile.phone}
Location: ${state.profile.location}
Nationality / Visa: ${state.profile.nationality}
Languages: ${state.profile.languages}
LinkedIn: ${state.profile.linkedin}

CANDIDATE BASE CV / STORY IN NATURAL LANGUAGE:
${baseStory}

PREVIOUSLY SAVED MEMORY FACTS (data/memory.md):
${state.learnedFacts || 'None'}

NEW DETAILS PROVIDED BY CANDIDATE FOR THIS SPECIFIC JOB:
${gapData.promptContext || 'No additional notes provided; rely on Base Story and Memory.'}

TARGET JOB DESCRIPTION:
${jobPosting}`;

    const aiReply = await callAiBackend(sysPrompt, usrPrompt);
    if (aiReply) {
      const parsed = tryParseJsonFromText(aiReply);
      if (parsed && parsed.cv && parsed.coverLetter) {
        generated = parsed;
      }
    }
  } catch (err) {
    console.warn('AI generation fallback triggered:', err);
  }

  // High-quality deterministic builder fallback if offline / no local model pulled yet
  if (!generated) {
    generated = buildSmartLocalTailoredDocuments(baseStory, state.learnedFacts, gapData, jobPosting, state.currentDraft);
  }

  // Pass through strict Humanizer Engine (strips all em-dashes and AI clichés)
  generated = humanizeApplicationData(generated);

  const newApp = {
    id: 'app_' + Date.now(),
    name: appName,
    role: state.currentDraft.detectedRole || appName,
    company: state.currentDraft.detectedCompany || '',
    countryCode,
    docLanguage,
    palette: paletteId,
    includePhoto: rule.photoPolicy === 'forbidden' ? false : includePhoto,
    createdAt: new Date().toISOString().split('T')[0],
    savedToMemory: shouldSaveMemory,
    baseStorySnapshot: baseStory,
    jobPosting,
    gapQuestions: state.currentDraft.gapQuestions,
    gapAnswers: gapData.displayLog,
    gapMemoryFacts: gapData.memoryFacts,
    cv: generated.cv,
    coverLetter: generated.coverLetter
  };

  // Save to Application History on disk
  const saveAppRes = await fetch('/api/applications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(newApp)
  });
  const saveAppData = await saveAppRes.json();
  if (saveAppData.ok) {
    state.applications = saveAppData.applications;
  }

  // If Save to Memory is checked (or Auto-Save is active), save baseStory + context-rich positive Q&A facts
  if (shouldSaveMemory) {
    await saveStoryAndFactsToMemory(baseStory, gapData.memoryFacts, appName);
  }

  hideLoading();
  openApplicationDashboard(newApp.id);
  const savedFactsMsg = gapData.memoryFacts
    ? '✓ Tailored CV & Cover Letter ready + Contextual Q&A facts saved to memory.md!'
    : '✓ Tailored CV & Cover Letter ready + Career Story synced to memory.md!';
  showToast(shouldSaveMemory ? savedFactsMsg : '✓ Tailored CV & Cover Letter generated!');
}

async function saveStoryAndFactsToMemory(baseStory, newFacts, jobLabel) {
  const res = await fetch('/api/memory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      baseStory,
      newFacts,
      jobLabel
    })
  });
  const data = await res.json();
  if (data.ok) {
    state.memoryMd = data.memoryMd;
    state.baseStory = data.baseStory;
    state.learnedFacts = data.learnedFacts;
    syncUiFromState(true);
  }
  return data;
}

function buildSmartLocalTailoredDocuments(baseStory, learnedFacts, gapDataOrStr, jobPosting, draft) {
  const p = state.profile;
  const role = draft.detectedRole || p.title || 'Senior Specialist';
  const company = draft.detectedCompany || 'Target Company';
  const positiveGapText = typeof gapDataOrStr === 'string'
    ? (isNegativeOrEmptyGapAnswer(gapDataOrStr) ? '' : gapDataOrStr)
    : ((gapDataOrStr && gapDataOrStr.positiveOnlySummary) || '');
  const excludedText = (typeof gapDataOrStr === 'object' && gapDataOrStr && Array.isArray(gapDataOrStr.skippedQuestions))
    ? gapDataOrStr.skippedQuestions.join(' ').toLowerCase()
    : '';

  // Parse paragraphs / sentences from the user's natural language story + constructive gap answers
  const fullNarrative = [baseStory, learnedFacts, positiveGapText].filter(Boolean).join('\n\n');
  const lines = fullNarrative.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 3);

  // Extract skills mentioned in story + job posting (never claim tools user explicitly skipped / doesn't have)
  const skillRegex = /\b(SolidWorks|AutoCAD|CATIA|ANSYS|FEA|CFD|CAD|CAM|GD&T|FMEA|ISO\s*9001|Six Sigma|Lean Manufacturing|SAP|ERP|Python|MATLAB|Simulink|C\+\+|JavaScript|TypeScript|React|Node\.js|SQL|AWS|Docker|Project Management|Agile|Scrum|Product Development|Root Cause Analysis|Prototyping|DFMA|CNC|Mechatronics|PLC|Supply Chain)\b/gi;
  const foundSkills = new Set();
  const m1 = fullNarrative.match(skillRegex) || [];
  const m2 = jobPosting.match(skillRegex) || [];
  m1.forEach(s => foundSkills.add(s));
  m2.forEach(s => {
    const low = s.toLowerCase();
    if (!excludedText.includes(low)) {
      foundSkills.add(s);
    }
  });
  if (foundSkills.size < 5) {
    ['Project Engineering', 'Technical Documentation', 'Cross-Functional Collaboration', 'Process Optimization', 'Quality Assurance', 'Systems Design'].forEach(s => foundSkills.add(s));
  }

  // Construct concrete bullets from the user's actual story sentences + gap answers
  const storySentences = fullNarrative
    .replace(/\r?\n/g, '. ')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.replace(/^[\-\•\*]\s*/, '').trim())
    .filter(s => s.length > 25 && s.length < 240);

  const expBullets1 = storySentences.slice(0, 4).length > 0
    ? storySentences.slice(0, 4)
    : [
        `Led end-to-end engineering and execution initiatives aligned with ${role} requirements, improving workflow reliability and delivery speed.`,
        `Collaborated across international technical teams and suppliers to validate specifications, resolve bottlenecks, and deliver measurable quality gains.`,
        `Applied analytical problem-solving and industry standards to reduce rework and streamline production readiness.`
      ];

  const expBullets2 = storySentences.slice(4, 7).length > 0
    ? storySentences.slice(4, 7)
    : [
        `Supported core design, testing, and documentation lifecycles while maintaining strict compliance with project milestones.`,
        `Partnered with senior engineers and operations leads to standardize technical procedures and reporting.`
      ];

  const extraAnswerHighlight = positiveGapText
    ? positiveGapText.split(/\r?\n/)[0].trim()
    : (storySentences[0] || `Experienced ${role} with strong technical execution and cross-functional delivery.`);

  return {
    cv: {
      headline: role,
      summary: `${p.title || role} with hands-on experience delivering technical projects, optimizing processes, and collaborating across international teams. ${extraAnswerHighlight} Committed to contributing immediate, practical value to ${company}.`,
      experience: [
        {
          role: p.title || role,
          company: 'Recent Professional Experience',
          location: p.location || 'International',
          period: '03/2021 - Present',
          bullets: expBullets1
        },
        {
          role: 'Project & Technical Specialist',
          company: 'Previous Career Experience',
          location: p.location || 'International',
          period: '06/2018 - 02/2021',
          bullets: expBullets2
        }
      ],
      education: [
        {
          degree: 'Bachelor of Science / Engineering & Technical Studies',
          institution: 'University Degree & Professional Training',
          period: '2014 - 2018',
          details: 'Focus on applied engineering, systems analysis, and project execution.'
        }
      ],
      skills: Array.from(foundSkills).slice(0, 12),
      additionalInfo: positiveGapText ? `Key Role Highlights: ${positiveGapText.replace(/\r?\n/g, ' ')}` : 'Available for international collaboration and relocation as required.'
    },
    coverLetter: {
      recipientBlock: `Hiring Team\n${company}`,
      subjectLine: `Application for ${role}`,
      salutation: `Dear Hiring Team at ${company},`,
      paragraphs: [
        `I am writing to apply for the ${role} position at ${company}. With a background grounded in practical engineering execution, technical problem-solving, and cross-functional teamwork, I was immediately drawn to your team's focus on high-standard engineering and operational excellence.`,
        `Throughout my work, I have focused on turning complex technical requirements into reliable, measurable results. ${expBullets1.slice(0, 2).join(' ')}`,
        positiveGapText
          ? `Specifically regarding the priorities outlined in your job description: ${positiveGapText}`
          : `Beyond technical execution, I work comfortably in international environments, communicating clearly across engineering, production, and management stakeholders to keep projects on schedule and within specification.`,
        `I would welcome the opportunity to discuss how my background and hands-on experience can support ${company}'s upcoming projects. Thank you for your time and consideration.`
      ],
      signOff: 'Sincerely,'
    }
  };
}

// ============================================================================
// STEP 3: APPLICATION MINI-DASHBOARD & HISTORY SIDEBAR
// ============================================================================
function renderHistorySidebar() {
  const listEl = document.getElementById('historyList');
  const countEl = document.getElementById('historyCountBadge');
  const query = (document.getElementById('historySearchInput').value || '').toLowerCase().trim();

  countEl.textContent = state.applications.length;
  listEl.innerHTML = '';

  const filtered = state.applications.filter(app => {
    if (!query) return true;
    return (
      (app.name || '').toLowerCase().includes(query) ||
      (app.company || '').toLowerCase().includes(query) ||
      (app.countryCode || '').toLowerCase().includes(query)
    );
  });

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div style="padding:18px 12px; text-align:center; color:var(--text-muted); font-size:12.5px;">
        No saved applications yet.<br/>Paste your story and a job posting to create your first tailored CV &amp; Cover Letter!
      </div>
    `;
    return;
  }

  filtered.forEach(app => {
    const rule = COUNTRY_RULES[app.countryCode] || COUNTRY_RULES.DE;
    const pal = PALETTES[app.palette] || PALETTES.navy;
    const isActive = state.activeAppId === app.id;

    const item = document.createElement('div');
    item.className = 'history-item' + (isActive ? ' active' : '');
    item.onclick = () => openApplicationDashboard(app.id);

    item.innerHTML = `
      <button class="history-del-btn" title="Delete application from history" onclick="deleteApplication(event, '${app.id}')">✕</button>
      <div class="history-item-title">${escHtml(app.name || app.role || 'Application')}</div>
      <div class="history-item-company">${escHtml(app.company || rule.styleName)}</div>
      <div class="history-item-meta">
        <span class="history-badge">
          <span>${rule.flag} ${rule.code} (${escHtml(app.docLanguage || 'EN')})</span>
        </span>
        <span style="display:inline-flex; align-items:center; gap:5px;">
          <span style="width:8px; height:8px; border-radius:50%; background:${pal.primary}; display:inline-block;"></span>
          <span>${escHtml(app.createdAt || '')}</span>
        </span>
      </div>
    `;
    listEl.appendChild(item);
  });
}

function openApplicationDashboard(appId) {
  const app = state.applications.find(a => a.id === appId);
  if (!app) return;

  state.activeAppId = app.id;
  state.inlineEditActive = false;
  closeDownloadDropdown();
  const cvEl = document.getElementById('cvSheet');
  const clEl = document.getElementById('clSheet');
  if (cvEl) cvEl.contentEditable = 'false';
  if (clEl) clEl.contentEditable = 'false';
  const editBtn = document.getElementById('toggleEditDocBtn');
  if (editBtn) {
    editBtn.textContent = '✏️ Edit Text Inline';
    editBtn.className = 'btn btn-sm';
  }

  renderHistorySidebar();
  goToWorkflowStep(3);

  const rule = COUNTRY_RULES[app.countryCode] || COUNTRY_RULES.DE;
  document.getElementById('dashAppTitle').textContent = app.name || 'Job Application';
  document.getElementById('dashCountryBadge').textContent = `${rule.flag} ${rule.styleName} (Text: ${app.docLanguage || 'English'})`;
  document.getElementById('dashAppMeta').textContent = `Created on ${app.createdAt || 'Today'} • Country Format: ${rule.name} • Palette: ${(PALETTES[app.palette] || PALETTES.navy).name}`;
  document.getElementById('dashPaletteSelect').value = app.palette || 'navy';

  const memCheck = document.getElementById('dashSaveMemoryCheck');
  const memLabel = document.getElementById('dashSaveMemoryLabel');
  memCheck.checked = Boolean(app.savedToMemory);
  memLabel.textContent = app.savedToMemory ? '✓ Saved in Memory (memory.md)' : 'Save this Q&A to Memory (memory.md)';

  document.getElementById('dashOriginalJobText').textContent = app.jobPosting || '';
  document.getElementById('dashGapAnswersText').textContent = app.gapAnswers || 'No additional gap notes were entered for this application.';

  renderActiveApplicationSheets();
}

async function onDashSaveMemoryToggle(checked) {
  const app = getActiveApp();
  if (!app) return;
  app.savedToMemory = checked;
  document.getElementById('dashSaveMemoryLabel').textContent = checked
    ? '✓ Saved in Memory (memory.md)'
    : 'Save this Q&A to Memory (memory.md)';

  await fetch('/api/applications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(app)
  });

  if (checked) {
    const baseStory = document.getElementById('baseStoryInput').value.trim() || app.baseStorySnapshot || state.baseStory;
    const factsToSave = (app.gapMemoryFacts !== undefined && app.gapMemoryFacts !== null)
      ? app.gapMemoryFacts
      : app.gapAnswers;
    await saveStoryAndFactsToMemory(baseStory, factsToSave, app.name);
    showToast('✓ Saved Career Story & contextual Q&A details into data/memory.md and Home page!');
  }
}

async function deleteApplication(event, appId) {
  event.stopPropagation();
  if (!confirm('Delete this application from your history?')) return;
  const res = await fetch('/api/applications/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: appId })
  });
  const data = await res.json();
  if (data.ok) {
    state.applications = data.applications;
    if (state.activeAppId === appId) {
      startNewApplication();
    } else {
      renderHistorySidebar();
    }
    showToast('Application removed from history.');
  }
}

function getActiveApp() {
  return state.applications.find(a => a.id === state.activeAppId) || null;
}

async function changeDashboardPalette(newPaletteId) {
  const app = getActiveApp();
  if (!app) return;
  app.palette = newPaletteId;
  renderActiveApplicationSheets();
  renderHistorySidebar();

  await fetch('/api/applications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(app)
  });
}

async function reRunHumanizerPass() {
  const app = getActiveApp();
  if (!app) return;
  humanizeApplicationData(app);
  renderActiveApplicationSheets();
  await fetch('/api/applications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(app)
  });
  showToast('✓ Humanizer pass verified: 0 Em-Dashes, 0 AI Clichés!');
}

function setSheetPreviewZoom(mode) {
  const sheetsContainer = document.getElementById('sheetsContainer');
  if (sheetsContainer) {
    sheetsContainer.setAttribute('data-zoom', mode);
  }
  const map = { fit: 'zoomBtnFit', '85': 'zoomBtn85', '100': 'zoomBtn100' };
  Object.keys(map).forEach(k => {
    const el = document.getElementById(map[k]);
    if (el) el.classList.toggle('active', k === mode);
  });
}

function setDocPreviewTab(tab) {
  const cvWrap = document.getElementById('cvSheetWrap');
  const clWrap = document.getElementById('clSheetWrap');
  const infoPanel = document.getElementById('dashJobInfoPanel');
  const sheetsContainer = document.getElementById('sheetsContainer');

  ['Both', 'Cv', 'Cl', 'Info'].forEach(t => {
    document.getElementById('tabBtn' + t).classList.remove('active');
  });

  if (tab === 'both') {
    document.getElementById('tabBtnBoth').classList.add('active');
    sheetsContainer.className = 'sheets-wrapper view-both';
    cvWrap.classList.remove('hidden');
    clWrap.classList.remove('hidden');
    infoPanel.classList.add('hidden');
  } else if (tab === 'cv') {
    document.getElementById('tabBtnCv').classList.add('active');
    sheetsContainer.className = 'sheets-wrapper view-single';
    cvWrap.classList.remove('hidden');
    clWrap.classList.add('hidden');
    infoPanel.classList.add('hidden');
  } else if (tab === 'cl') {
    document.getElementById('tabBtnCl').classList.add('active');
    sheetsContainer.className = 'sheets-wrapper view-single';
    cvWrap.classList.add('hidden');
    clWrap.classList.remove('hidden');
    infoPanel.classList.add('hidden');
  } else {
    document.getElementById('tabBtnInfo').classList.add('active');
    sheetsContainer.classList.add('hidden');
    infoPanel.classList.remove('hidden');
  }
}

function applyInlineDomEditsToMemory() {
  const app = getActiveApp();
  if (!app) return null;

  const cvSheet = document.getElementById('cvSheet');
  const clSheet = document.getElementById('clSheet');

  if (cvSheet && app.cv) {
    const headlineEl = cvSheet.querySelector('.cv-headline');
    if (headlineEl) app.cv.headline = headlineEl.innerText.trim();

    const summaryEl = cvSheet.querySelector('.cv-summary-text');
    if (summaryEl) app.cv.summary = summaryEl.innerText.trim();

    const sections = Array.from(cvSheet.querySelectorAll('.cv-section'));
    sections.forEach(sec => {
      const titleText = (sec.querySelector('.cv-section-title')?.textContent || '').toLowerCase();
      if (titleText.includes('experience')) {
        const items = Array.from(sec.querySelectorAll('.cv-exp-item'));
        if (items.length) {
          app.cv.experience = items.map((item, idx) => {
            const prev = (app.cv.experience && app.cv.experience[idx]) || {};
            const role = (item.querySelector('.cv-exp-role')?.innerText || '').trim();
            const company = (item.querySelector('.cv-exp-company')?.innerText || '').replace(/^[\s|\-—]+/, '').trim();
            const period = (item.querySelector('.cv-exp-period')?.innerText || '').trim();
            const bullets = Array.from(item.querySelectorAll('.cv-bullets li'))
              .map(li => li.innerText.trim())
              .filter(Boolean);
            return Object.assign({}, prev, { role, company, period, bullets });
          });
        }
      } else if (titleText.includes('education')) {
        const items = Array.from(sec.querySelectorAll('.cv-exp-item'));
        if (items.length) {
          app.cv.education = items.map((item, idx) => {
            const prev = (app.cv.education && app.cv.education[idx]) || {};
            const degree = (item.querySelector('.cv-exp-role')?.innerText || '').trim();
            const institution = (item.querySelector('.cv-exp-company')?.innerText || '').replace(/^[\s|\-—]+/, '').trim();
            const period = (item.querySelector('.cv-exp-period')?.innerText || '').trim();
            return Object.assign({}, prev, { degree, institution, period });
          });
        }
      } else if (sec.querySelector('.cv-skills-wrap')) {
        const skills = Array.from(sec.querySelectorAll('.cv-skill-tag'))
          .map(s => s.innerText.trim())
          .filter(Boolean);
        if (skills.length) app.cv.skills = skills;
      }
    });
  }

  if (clSheet && app.coverLetter) {
    const recEl = clSheet.querySelector('.cl-recipient');
    if (recEl) app.coverLetter.recipientBlock = recEl.innerText.trim();

    const subEl = clSheet.querySelector('.cl-subject');
    if (subEl) app.coverLetter.subjectLine = subEl.innerText.trim();

    const salEl = clSheet.querySelector('.cl-salutation');
    if (salEl) app.coverLetter.salutation = salEl.innerText.trim();

    const clBodyEl = clSheet.querySelector('.cl-body');
    if (clBodyEl) {
      const pEls = Array.from(clBodyEl.querySelectorAll('p'));
      let paras = pEls.map(el => el.innerText.trim()).filter(Boolean);
      if (!paras.length && clBodyEl.innerText.trim()) {
        paras = clBodyEl.innerText.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
      }
      if (paras.length) app.coverLetter.paragraphs = paras;
    }

    const signEl = clSheet.querySelector('.cl-signoff');
    if (signEl) app.coverLetter.signOff = signEl.innerText.trim();
  }

  humanizeApplicationData(app);
  return app;
}

async function persistAppEditsAsync(app) {
  if (!app) return;
  try {
    await fetch('/api/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(app)
    });
  } catch (err) {
    console.warn('Could not save inline edits to backend:', err);
  }
}

async function syncInlineEditsToApp(silent = false) {
  const app = applyInlineDomEditsToMemory();
  if (!app) return;
  await persistAppEditsAsync(app);
  if (!silent) {
    renderActiveApplicationSheets();
  }
}

async function toggleInlineDocumentEditing() {
  const cvEl = document.getElementById('cvSheet');
  const clEl = document.getElementById('clSheet');
  const btn = document.getElementById('toggleEditDocBtn');

  state.inlineEditActive = !state.inlineEditActive;
  cvEl.contentEditable = state.inlineEditActive ? 'true' : 'false';
  clEl.contentEditable = state.inlineEditActive ? 'true' : 'false';

  if (state.inlineEditActive) {
    btn.textContent = '💾 Finish Inline Editing';
    btn.className = 'btn btn-emerald btn-sm';
    showToast('Click anywhere on the CV or Cover Letter page to edit text directly!');
  } else {
    btn.textContent = '✏️ Edit Text Inline';
    btn.className = 'btn btn-sm';
    await syncInlineEditsToApp(false);
    showToast('✓ Inline edits saved to document & ready for PDF/DOCX export!');
  }
}

// ============================================================================
// RENDERING CV & COVER LETTER SHEETS (COUNTRY LAYOUT + PALETTE)
// ============================================================================
function renderActiveApplicationSheets() {
  const app = getActiveApp();
  if (!app) return;

  const pal = PALETTES[app.palette] || PALETTES.navy;
  const rule = COUNTRY_RULES[app.countryCode] || COUNTRY_RULES.DE;
  const p = state.profile;

  // Apply CSS custom properties for palette
  const root = document.documentElement;
  root.style.setProperty('--doc-primary', pal.primary);
  root.style.setProperty('--doc-secondary', pal.secondary);
  root.style.setProperty('--doc-tint', pal.tint);

  const cvSheet = document.getElementById('cvSheet');
  const clSheet = document.getElementById('clSheet');
  cvSheet.className = `a4-sheet cv-style-${rule.code}`;
  clSheet.className = `a4-sheet cv-style-${rule.code}`;

  const fullName = p.fullName || 'Pedro Almeida';
  const contactParts = [p.location, p.email, p.phone, p.linkedin, p.portfolio].filter(Boolean);
  const contactLine = contactParts.join('  •  ');

  const metaParts = [];
  if (rule.includeMeta) {
    if (p.nationality) metaParts.push(`Nationality / Permit: ${p.nationality}`);
    if (p.languages) metaParts.push(`Languages: ${p.languages}`);
  }
  const metaLine = metaParts.join('  |  ');

  const showPhoto = rule.photoPolicy !== 'forbidden' && app.includePhoto && state.photo && state.photo.startsWith('data:image');

  const cv = app.cv || {};
  const expHtml = (cv.experience || []).map(exp => `
    <div class="cv-exp-item">
      <div class="cv-exp-header">
        <div>
          <span class="cv-exp-role">${escHtml(exp.role || '')}</span>
          ${exp.company ? `<span class="cv-exp-company"> | ${escHtml(exp.company)}</span>` : ''}
          ${exp.location ? `<span style="font-size:12px; color:#6b7280;"> (${escHtml(exp.location)})</span>` : ''}
        </div>
        <div class="cv-exp-period">${escHtml(exp.period || '')}</div>
      </div>
      <ul class="cv-bullets">
        ${(exp.bullets || []).map(b => `<li>${escHtml(b)}</li>`).join('')}
      </ul>
    </div>
  `).join('');

  const eduHtml = (cv.education || []).map(edu => `
    <div class="cv-exp-item" style="margin-bottom:9px;">
      <div class="cv-exp-header">
        <div>
          <span class="cv-exp-role">${escHtml(edu.degree || '')}</span>
          ${edu.institution ? `<span class="cv-exp-company"> | ${escHtml(edu.institution)}</span>` : ''}
        </div>
        <div class="cv-exp-period">${escHtml(edu.period || '')}</div>
      </div>
      ${edu.details ? `<div style="font-size:12px; color:#374151; margin-top:2px;">${escHtml(edu.details)}</div>` : ''}
    </div>
  `).join('');

  const skillsHtml = (cv.skills || []).map(s => `<span class="cv-skill-tag">${escHtml(s)}</span>`).join('');

  const cityName = (p.location || 'Munich').split(',')[0].trim();
  const sigHtml = rule.includeSignature
    ? `<div class="cv-signature-line">
         <span>${escHtml(cityName)}, ${escHtml(app.createdAt || new Date().toISOString().split('T')[0])}</span>
         <span>${escHtml(fullName)}</span>
       </div>`
    : '';

  const profileSectionTitle = (rule.code === 'DE' || rule.code === 'CH')
    ? 'Executive Profile'
    : (rule.code === 'GB' || rule.code === 'AU' ? 'Personal Profile' : 'Professional Summary');

  cvSheet.innerHTML = `
    <div class="cv-header">
      <div style="flex:1;">
        <div class="cv-name">${escHtml(fullName)}</div>
        <div class="cv-headline">${escHtml(cv.headline || p.title || '')}</div>
        ${contactLine ? `<div class="cv-contact-line">${escHtml(contactLine)}</div>` : ''}
        ${metaLine ? `<div class="cv-meta-line">${escHtml(metaLine)}</div>` : ''}
      </div>
      ${showPhoto ? `<img class="cv-photo" src="${state.photo}" alt="Candidate Photo" />` : ''}
    </div>

    ${cv.summary ? `
      <div class="cv-section">
        <div class="cv-section-title">${profileSectionTitle}</div>
        <div class="cv-summary-text">${escHtml(cv.summary)}</div>
      </div>
    ` : ''}

    <div class="cv-section">
      <div class="cv-section-title">Professional Experience</div>
      ${expHtml}
    </div>

    <div class="cv-section">
      <div class="cv-section-title">Education &amp; Academic Qualifications</div>
      ${eduHtml}
    </div>

    <div class="cv-section">
      <div class="cv-section-title">Core Competencies &amp; Technical Skills</div>
      <div class="cv-skills-wrap">${skillsHtml}</div>
    </div>

    ${(p.languages || cv.additionalInfo) ? `
      <div class="cv-section">
        <div class="cv-section-title">Languages &amp; Additional Information</div>
        ${p.languages ? `<div style="font-size:12.2px; margin-bottom:4px;"><strong>Languages:</strong> ${escHtml(p.languages)}</div>` : ''}
        ${cv.additionalInfo ? `<div style="font-size:12.2px; color:#374151;">${escHtml(cv.additionalInfo)}</div>` : ''}
      </div>
    ` : ''}

    ${sigHtml}
  `;

  // Render Cover Letter Sheet
  const cl = app.coverLetter || {};
  const parasHtml = (cl.paragraphs || []).map(para => `<p>${escHtml(para)}</p>`).join('');
  const dateStr = `${cityName ? cityName + ', ' : ''}${app.createdAt || new Date().toISOString().split('T')[0]}`;

  clSheet.innerHTML = `
    <div class="cv-header" style="flex-direction:column; align-items:flex-start; gap:4px;">
      <div class="cv-name" style="font-size:24px;">${escHtml(fullName)}</div>
      <div class="cv-headline" style="font-size:14px;">${escHtml(cv.headline || p.title || '')}</div>
      ${contactLine ? `<div class="cv-contact-line">${escHtml(contactLine)}</div>` : ''}
    </div>

    <div class="cl-date">${escHtml(dateStr)}</div>
    <div class="cl-recipient">${escHtml(cl.recipientBlock || app.company || 'Hiring Team')}</div>
    <div class="cl-subject">${escHtml(cl.subjectLine || ('Application for ' + (app.role || 'Open Position')))}</div>
    <div class="cl-salutation">${escHtml(cl.salutation || 'Dear Hiring Team,')}</div>
    <div class="cl-body">${parasHtml}</div>
    <div class="cl-signoff">${escHtml(cl.signOff || 'Sincerely,')}</div>
    <div class="cl-sig-name">${escHtml(fullName)}</div>
  `;
}

// ============================================================================
// STEP 1: FILE ATTACHMENTS (.PDF, .DOCX, .MD, .TXT) & STORY MEMORY CONTROLS
// ============================================================================
function clearStoryInput() {
  const input = document.getElementById('baseStoryInput');
  if (input) {
    input.value = '';
    input.focus();
  }
  state.attachedStoryFiles = [];
  const chips = document.getElementById('attachedStoryChips');
  if (chips) chips.innerHTML = '';
  const fileInput = document.getElementById('storyFileInput');
  if (fileInput) fileInput.value = '';
}

async function saveCurrentStoryToMemoryNow() {
  const input = document.getElementById('baseStoryInput');
  const storyText = (input ? input.value : '').trim();
  if (!storyText) {
    alert('Please write, paste, or attach a file to Your CV / Career Story first before saving to Memory.');
    return;
  }

  try {
    const data = await saveStoryAndFactsToMemory(storyText, '', 'Home Career Story');
    if (data && data.ok) {
      showToast('✓ Saved to data/memory.md & Home Career Story!');
    } else {
      alert('Could not save to memory.md.');
    }
  } catch (err) {
    alert('Error saving to memory.md: ' + err.message);
  }
}

function handleStoryDragOver(event) {
  event.preventDefault();
  event.stopPropagation();
  const dz = document.getElementById('storyDropzone');
  if (dz) dz.classList.add('drag-over');
}

function handleStoryDragLeave(event) {
  event.preventDefault();
  event.stopPropagation();
  const dz = document.getElementById('storyDropzone');
  if (dz) dz.classList.remove('drag-over');
}

function handleStoryFileDrop(event) {
  event.preventDefault();
  event.stopPropagation();
  const dz = document.getElementById('storyDropzone');
  if (dz) dz.classList.remove('drag-over');
  if (event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files.length) {
    processStoryAttachments(event.dataTransfer.files);
  }
}

function handleStoryFilesSelected(event) {
  const files = event.target && event.target.files;
  if (files && files.length) {
    processStoryAttachments(files);
  }
  if (event.target) event.target.value = '';
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result || '');
      const commaIdx = res.indexOf(',');
      resolve(commaIdx >= 0 ? res.slice(commaIdx + 1) : res);
    };
    reader.onerror = () => reject(new Error('Failed to read file: ' + file.name));
    reader.readAsDataURL(file);
  });
}

function renderAttachedStoryChips() {
  const wrap = document.getElementById('attachedStoryChips');
  if (!wrap) return;
  wrap.innerHTML = '';

  const list = state.attachedStoryFiles || [];
  list.forEach(item => {
    const chip = document.createElement('span');
    chip.className = 'attach-chip';
    chip.innerHTML = `
      <span>📄 ${escHtml(item.name)} (${item.chars.toLocaleString()} chars)</span>
      <button type="button" title="Remove attached block" style="background:none;border:none;color:#fca5a5;cursor:pointer;font-weight:800;font-size:12px;padding:0 2px;">✕</button>
    `;
    chip.querySelector('button').onclick = () => removeAttachedStoryFile(item.id);
    wrap.appendChild(chip);
  });
}

function removeAttachedStoryFile(id) {
  const list = state.attachedStoryFiles || [];
  const idx = list.findIndex(x => x.id === id);
  if (idx < 0) return;

  const [removed] = list.splice(idx, 1);
  const input = document.getElementById('baseStoryInput');
  if (input && removed.blockText) {
    input.value = input.value
      .replace(removed.blockText, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  renderAttachedStoryChips();
  showToast(`Removed ${removed.name}`);
}

async function processStoryAttachments(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;

  const allowedExt = ['.pdf', '.docx', '.md', '.markdown', '.txt'];
  const validFiles = [];
  for (const f of files) {
    const lower = f.name.toLowerCase();
    if (!allowedExt.some(ext => lower.endsWith(ext))) {
      showToast(`Skipped ${f.name}: use .pdf, .docx, .md, or .txt`);
      continue;
    }
    if (f.size > 18 * 1024 * 1024) {
      showToast(`Skipped ${f.name}: file exceeds 18 MB limit.`);
      continue;
    }
    validFiles.push(f);
  }
  if (!validFiles.length) return;

  showLoading('Reading Attached Document(s)...', `Extracting text from ${validFiles.length} file(s)...`);
  const input = document.getElementById('baseStoryInput');
  state.attachedStoryFiles = state.attachedStoryFiles || [];
  let importedCount = 0;

  try {
    for (const file of validFiles) {
      let extracted = '';
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.md') || lower.endsWith('.markdown') || lower.endsWith('.txt')) {
        extracted = await file.text();
      } else {
        const b64 = await readFileAsBase64(file);
        const res = await fetch('/api/extract-text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: file.name, base64Data: b64 })
        });
        const data = await res.json();
        if (!data || !data.ok) {
          throw new Error((data && data.error) || `Could not extract text from ${file.name}`);
        }
        extracted = data.text || '';
      }

      extracted = extracted.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
      if (!extracted) {
        showToast(`Warning: No text detected in ${file.name}`);
        continue;
      }

      const blockText = `[Attached Document: ${file.name}]\n${extracted}`;
      const existing = input.value.trim();
      input.value = existing ? `${existing}\n\n${blockText}` : blockText;

      state.attachedStoryFiles.push({
        id: 'att_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        name: file.name,
        chars: extracted.length,
        blockText
      });
      importedCount++;
    }

    renderAttachedStoryChips();
    if (importedCount > 0) {
      showToast(`✓ Added text from ${importedCount} file(s) into Your Career Story!`);
    }
  } catch (err) {
    alert(err.message || 'Failed to read attached file.');
  } finally {
    hideLoading();
  }
}

async function shutdownJobMechApp() {
  if (!confirm('Quit JobMech completely? All your saved Memory and Applications are safely stored on disk.')) {
    return;
  }
  try {
    await fetch('/api/shutdown', { method: 'POST' });
  } catch (e) {
    // Expected once listener stops
  }
  document.body.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b1120;color:#e2e8f0;font-family:'Segoe UI',sans-serif;text-align:center;padding:32px;">
      <div style="background:#111827;border:1px solid #334155;border-radius:16px;padding:36px 44px;max-width:460px;">
        <div style="font-size:36px;margin-bottom:12px;">⚙️</div>
        <h2 style="font-size:20px;margin-bottom:8px;color:#fff;">JobMech Studio Closed</h2>
        <p style="font-size:13.5px;color:#94a3b8;line-height:1.5;">The background server has been stopped cleanly. You may now close this browser tab.</p>
      </div>
    </div>`;
  try { window.close(); } catch (e) {}
}

// ============================================================================
// EXPORT TO .PDF AND .DOCX (UNIFIED DROPDOWN + NATIVE SAVE-AS DIALOG)
// ============================================================================
window.addEventListener('click', (event) => {
  const wrap = document.getElementById('downloadDropdownWrap');
  if (wrap && !wrap.contains(event.target)) {
    closeDownloadDropdown();
  }
});

function toggleDownloadDropdown(event) {
  if (event) event.stopPropagation();
  const menu = document.getElementById('downloadDropdownMenu');
  if (!menu) return;
  menu.classList.toggle('hidden');
}

function closeDownloadDropdown() {
  const menu = document.getElementById('downloadDropdownMenu');
  if (menu) menu.classList.add('hidden');
}

function getBaseExportFileName(app, docType) {
  const p = state.profile;
  const rule = COUNTRY_RULES[app.countryCode] || COUNTRY_RULES.DE;
  const fullName = p.fullName || 'Candidate';
  const cleanRole = (app.role || 'Application').replace(/[^a-zA-Z0-9]+/g, '_');
  const cleanName = fullName.replace(/[^a-zA-Z0-9]+/g, '_');
  return `${cleanName}_${docType === 'cv' ? 'CV' : 'CoverLetter'}_${cleanRole}_${rule.code}`;
}

function buildExportPayload(app, docType, format) {
  const p = state.profile;
  const pal = PALETTES[app.palette] || PALETTES.navy;
  const rule = COUNTRY_RULES[app.countryCode] || COUNTRY_RULES.DE;
  const fullName = p.fullName || 'Candidate';
  const baseFileName = getBaseExportFileName(app, docType);

  const contactLine = [p.location, p.email, p.phone, p.linkedin, p.portfolio].filter(Boolean).join('  •  ');
  const metaParts = [];
  if (rule.includeMeta) {
    if (p.nationality) metaParts.push(`Nationality / Permit: ${p.nationality}`);
    if (p.languages) metaParts.push(`Languages: ${p.languages}`);
  }
  const cityName = (p.location || 'Munich').split(',')[0].trim();

  const sheetEl = document.getElementById(docType === 'cv' ? 'cvSheet' : 'clSheet');
  let sheetOuterHtml = '';
  if (sheetEl) {
    const clone = sheetEl.cloneNode(true);
    clone.removeAttribute('contenteditable');
    sheetOuterHtml = clone.outerHTML;
  }

  const includeDocPhoto = docType === 'cv' && rule.photoPolicy !== 'forbidden' && app.includePhoto && Boolean(state.photo);

  return {
    format,
    docType,
    fileName: `${baseFileName}.${format}`,
    html: sheetOuterHtml ? buildStandalonePrintHtml(sheetOuterHtml, pal, baseFileName) : '',
    primaryHex: pal.primary,
    secondaryHex: pal.secondary,
    tintHex: pal.tint,
    countryCode: rule.code,
    includePhoto: includeDocPhoto,
    photoDataUri: includeDocPhoto ? state.photo : '',
    fullName,
    headline: (app.cv && app.cv.headline) || p.title || '',
    contactLine,
    personalMetaLine: metaParts.join('  |  '),
    summary: (app.cv && app.cv.summary) || '',
    experience: (app.cv && app.cv.experience) || [],
    education: (app.cv && app.cv.education) || [],
    skills: (app.cv && app.cv.skills) || [],
    languagesLine: p.languages || '',
    additionalInfo: (app.cv && app.cv.additionalInfo) || '',
    signatureLine: rule.includeSignature ? `${cityName}, ${app.createdAt || ''}  -  ${fullName}` : '',
    dateLine: `${cityName ? cityName + ', ' : ''}${app.createdAt || ''}`,
    recipientBlock: (app.coverLetter && app.coverLetter.recipientBlock) || app.company || '',
    subjectLine: (app.coverLetter && app.coverLetter.subjectLine) || `Application for ${app.role}`,
    salutation: (app.coverLetter && app.coverLetter.salutation) || 'Dear Hiring Team,',
    bodyText: ((app.coverLetter && app.coverLetter.paragraphs) || []).join('\n\n'),
    signOff: (app.coverLetter && app.coverLetter.signOff) || 'Sincerely,'
  };
}

async function fetchFormattedDocumentBlob(payload, format) {
  if (format === 'docx') {
    const res = await fetch('/api/export/docx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('DOCX generation error');
    return await res.blob();
  }

  const res = await fetch('/api/export/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('PDF generation error');
  return await res.blob();
}

async function saveViaNativeBackendDialog(payload, format) {
  const res = await fetch('/api/export/save-native', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({}, payload, { format }))
  });
  return await res.json();
}

async function handleDropdownDownload(target, format) {
  closeDownloadDropdown();
  const app = getActiveApp();
  if (!app) return;

  // Synchronously absorb any inline edits without breaking Chromium user activation
  const hadInlineEdit = state.inlineEditActive;
  applyInlineDomEditsToMemory();

  if (target === 'cv' || target === 'coverLetter') {
    await exportSingleDocumentWithSaveDialog(app, target, format, hadInlineEdit);
    return;
  }

  // target === 'both': Save CV & Cover Letter together as two separate files in ONE Windows Save dialog
  const p = state.profile;
  const rule = COUNTRY_RULES[app.countryCode] || COUNTRY_RULES.DE;
  const cleanName = (p.fullName || 'Candidate').replace(/[^a-zA-Z0-9]+/g, '_');
  const cleanRole = (app.role || 'Application').replace(/[^a-zA-Z0-9]+/g, '_');
  const filePrefix = `${cleanName}_${cleanRole}_${rule.code}`;

  if (hadInlineEdit) {
    renderActiveApplicationSheets();
    const cvEl = document.getElementById('cvSheet');
    const clEl = document.getElementById('clSheet');
    if (cvEl) cvEl.contentEditable = 'true';
    if (clEl) clEl.contentEditable = 'true';
    await persistAppEditsAsync(app);
  }

  const cvPayload = buildExportPayload(app, 'cv', format);
  const clPayload = buildExportPayload(app, 'coverLetter', format);

  showLoading(
    `Choose Destination Folder (${format.toUpperCase()})...`,
    `Pick a folder & base name once — saves separate ..._CV.${format} and ..._CoverLetter.${format} files.`
  );

  try {
    const pickRes = await fetch('/api/pick-save-prefix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format, filePrefix })
    });
    const pickData = await pickRes.json();
    if (!pickData || !pickData.ok) {
      throw new Error((pickData && pickData.error) || 'Failed to open Windows folder dialog.');
    }
    if (pickData.cancelled) {
      hideLoading();
      return;
    }

    showLoading(
      `Generating & Saving Both Files (${format.toUpperCase()})...`,
      `Creating ${pickData.baseStem}_CV.${format} & ${pickData.baseStem}_CoverLetter.${format} in ${pickData.folderName || 'selected folder'}...`
    );

    const saveRes = await fetch('/api/export/save-pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        format,
        targetDir: pickData.targetDir,
        baseStem: pickData.baseStem,
        cvPayload,
        clPayload
      })
    });
    const saveData = await saveRes.json();
    hideLoading();
    if (saveData && saveData.ok) {
      showToast(`✓ Saved ${saveData.cvFileName || (pickData.baseStem + '_CV.' + format)} & ${saveData.clFileName || (pickData.baseStem + '_CoverLetter.' + format)} in ${pickData.folderName || saveData.folder}!`);
      return;
    }
    throw new Error((saveData && saveData.error) || 'Failed to save both files.');
  } catch (err) {
    hideLoading();
    alert(`Could not save both ${format.toUpperCase()} documents: ` + err.message);
  }
}

async function exportSingleDocumentWithSaveDialog(app, docType, format, hadInlineEdit) {
  const fileName = getBaseExportFileName(app, docType) + '.' + format;
  const pickerAccept = format === 'pdf'
    ? { 'application/pdf': ['.pdf'] }
    : { 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] };
  const pickerDesc = format === 'pdf'
    ? 'Formatted PDF Document'
    : 'Formatted Word Document (.DOCX)';

  let fileHandle = null;
  let useBackendDialog = false;

  // Must invoke showSaveFilePicker IMMEDIATELY while user gesture is active!
  if (typeof window.showSaveFilePicker === 'function') {
    try {
      fileHandle = await window.showSaveFilePicker({
        suggestedName: fileName,
        startIn: 'documents',
        types: [{ description: pickerDesc, accept: pickerAccept }]
      });
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      useBackendDialog = true;
    }
  } else {
    useBackendDialog = true;
  }

  const label = docType === 'cv' ? 'CV' : 'Cover Letter';
  showLoading(`Generating Formatted ${format.toUpperCase()}...`, `Preparing ${label} (${fileName})...`);

  try {
    if (hadInlineEdit) {
      renderActiveApplicationSheets();
      const cvEl = document.getElementById('cvSheet');
      const clEl = document.getElementById('clSheet');
      if (cvEl) cvEl.contentEditable = 'true';
      if (clEl) clEl.contentEditable = 'true';
      await persistAppEditsAsync(app);
    }

    const payload = buildExportPayload(app, docType, format);

    if (fileHandle) {
      const blob = await fetchFormattedDocumentBlob(payload, format);
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      hideLoading();
      showToast(`✓ Saved ${fileHandle.name || fileName}!`);
      return;
    }

    if (useBackendDialog) {
      const res = await saveViaNativeBackendDialog(payload, format);
      hideLoading();
      if (res && res.ok && !res.cancelled) {
        showToast(`✓ Saved to ${res.savedPath}!`);
      }
      return;
    }
  } catch (err) {
    hideLoading();
    alert(`Could not save ${fileName}: ` + err.message);
  }
}

async function exportDocument(docType, format) {
  await handleDropdownDownload(docType, format);
}

function buildStandalonePrintHtml(sheetOuterHtml, pal, title) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>${escHtml(title)}</title>
  <style>
    :root {
      --doc-primary: ${pal.primary};
      --doc-secondary: ${pal.secondary};
      --doc-tint: ${pal.tint};
    }
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    @page { size: A4; margin: 12mm 14mm; }
    body { background: #fff; color: #1f2937; font-family: 'Calibri', 'Segoe UI', Helvetica, Arial, sans-serif; }
    .a4-sheet { width: 100%; padding: 8px 4px; background: #fff; color: #1f2937; line-height: 1.45; }
    .cv-header { display: flex; justify-content: space-between; align-items: center; gap: 24px; padding-bottom: 14px; border-bottom: 2.5px solid var(--doc-primary); margin-bottom: 16px; }
    .cv-style-US .cv-header, .cv-style-CA .cv-header { flex-direction: column; text-align: center; gap: 6px; }
    .cv-name { font-size: 26px; font-weight: 800; color: var(--doc-primary); line-height: 1.15; }
    .cv-style-DE .cv-name, .cv-style-CH .cv-name { text-transform: uppercase; letter-spacing: 0.5px; }
    .cv-headline { font-size: 14.5px; font-weight: 700; color: var(--doc-secondary); margin-top: 3px; }
    .cv-contact-line { font-size: 11.5px; color: #374151; margin-top: 5px; }
    .cv-meta-line { font-size: 11px; color: #4b5563; margin-top: 3px; }
    .cv-photo { width: 98px; height: 126px; object-fit: cover; border-radius: 3px; border: 2px solid var(--doc-primary); }
    .cv-section { margin-top: 14px; }
    .cv-section-title { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: var(--doc-primary); border-bottom: 1.5px solid var(--doc-primary); padding-bottom: 3px; margin-bottom: 8px; }
    .cv-style-DE .cv-section-title, .cv-style-CH .cv-section-title { background: var(--doc-tint); padding: 4px 8px; border-left: 4px solid var(--doc-primary); border-bottom: none; }
    .cv-summary-text { font-size: 12px; color: #1f2937; text-align: justify; }
    .cv-exp-item { margin-bottom: 11px; page-break-inside: avoid; }
    .cv-exp-header { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
    .cv-exp-role { font-size: 13px; font-weight: 700; color: #111827; }
    .cv-exp-company { font-weight: 600; color: var(--doc-secondary); }
    .cv-exp-period { font-size: 11.5px; font-weight: 700; color: var(--doc-secondary); white-space: nowrap; }
    .cv-bullets { margin-top: 4px; padding-left: 18px; font-size: 11.8px; color: #1f2937; }
    .cv-bullets li { margin-bottom: 3px; }
    .cv-skills-wrap { display: flex; flex-wrap: wrap; gap: 6px; }
    .cv-skill-tag { background: var(--doc-tint); color: var(--doc-primary); border: 1px solid #cbd5e1; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
    .cv-signature-line { margin-top: 24px; font-size: 11.5px; color: #4b5563; font-style: italic; display: flex; justify-content: space-between; border-top: 1px dotted #cbd5e1; padding-top: 8px; }
    .cl-date { font-size: 12px; color: #4b5563; margin: 16px 0 12px; }
    .cv-style-DE .cl-date, .cv-style-CH .cl-date, .cv-style-FR .cl-date { text-align: right; }
    .cl-recipient { font-size: 12px; color: #1f2937; margin-bottom: 16px; white-space: pre-line; }
    .cl-subject { font-size: 13.5px; font-weight: 800; color: var(--doc-primary); margin-bottom: 14px; }
    .cl-salutation { font-size: 12.5px; font-weight: 700; color: #111827; margin-bottom: 11px; }
    .cl-body p { font-size: 12.2px; color: #1f2937; margin-bottom: 12px; text-align: justify; line-height: 1.52; }
    .cl-signoff { margin-top: 20px; font-size: 12.5px; color: #111827; }
    .cl-sig-name { margin-top: 8px; font-size: 14.5px; font-weight: 800; color: var(--doc-primary); }
  </style>
</head>
<body>
  ${sheetOuterHtml}
</body>
</html>`;
}

function triggerBrowserDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 500);
}

// ============================================================================
// AI HELPER & UI FEEDBACK
// ============================================================================
async function callAiBackend(systemPrompt, userPrompt) {
  const p = state.profile;
  const res = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: p.aiProvider || 'ollama',
      model: p.aiModel || 'qwen2.5:7b',
      apiKey: p.apiKey || '',
      endpoint: p.customEndpoint || 'http://127.0.0.1:11434',
      systemPrompt,
      userPrompt
    })
  });
  const data = await res.json();
  if (data && data.ok && data.reply) {
    return data.reply;
  }
  return null;
}

function tryParseJsonFromText(text) {
  if (!text) return null;
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function showLoading(title, subtitle) {
  document.getElementById('loadingTitle').textContent = title || 'Working...';
  document.getElementById('loadingSubtitle').textContent = subtitle || '';
  document.getElementById('loadingOverlay').classList.remove('hidden');
}

function hideLoading() {
  document.getElementById('loadingOverlay').classList.add('hidden');
}

function showToast(msg) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 4200);
}

function escHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function downloadMemoryMarkdownFile() {
  const mdText = document.getElementById('rawMemoryTextarea').value || state.memoryMd || '# JobMech Candidate Memory Bank\n';
  const blob = new Blob([mdText], { type: 'text/markdown;charset=utf-8' });
  triggerBrowserDownload(blob, 'memory.md');
  showToast('✓ Downloaded memory.md!');
}

// Pure-JS Uncompressed ZIP + OpenXML (.docx) generator fallback
function buildClientSideDocxBlob(d) {
  const xmlEsc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  const makeP = (txt, col, sz, bold, after = 80, align = 'left') =>
    `<w:p><w:pPr><w:spacing w:after="${after}"/><w:jc w:val="${align}"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>${bold ? '<w:b/>' : ''}<w:color w:val="${col}"/><w:sz w:val="${sz}"/></w:rPr><w:t xml:space="preserve">${xmlEsc(txt)}</w:t></w:r></w:p>`;
  const makeSec = (title, col) =>
    `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="3" w:color="${col}"/></w:pBdr><w:spacing w:before="180" w:after="80"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="${col}"/><w:sz w:val="22"/></w:rPr><w:t>${xmlEsc(title.toUpperCase())}</w:t></w:r></w:p>`;

  let body = '';
  if (d.docType === 'coverLetter') {
    body += makeP(d.fullName, d.primaryHex, 40, true, 40);
    if (d.headline) body += makeP(d.headline, d.secondaryHex, 24, true, 60);
    if (d.contactLine) body += makeP(d.contactLine, '333333', 19, false, 160);
    if (d.dateLine) body += makeP(d.dateLine, '444444', 20, false, 120, 'right');
    if (d.recipientBlock) d.recipientBlock.split(/\r?\n/).forEach(l => { if (l.trim()) body += makeP(l.trim(), '222222', 21, false, 40); });
    if (d.subjectLine) body += makeP(d.subjectLine, d.primaryHex, 23, true, 140);
    if (d.salutation) body += makeP(d.salutation, '111111', 21, true, 120);
    if (d.bodyText) d.bodyText.split(/\n+/).forEach(p => { if (p.trim()) body += makeP(p.trim(), '1F2937', 21, false, 140, 'both'); });
    if (d.signOff) body += makeP(d.signOff, '111111', 21, false, 80);
    body += makeP(d.fullName, d.primaryHex, 23, true, 40);
  } else {
    body += makeP(d.fullName, d.primaryHex, 44, true, 40);
    if (d.headline) body += makeP(d.headline, d.secondaryHex, 24, true, 60);
    if (d.contactLine) body += makeP(d.contactLine, '333333', 19, false, 40);
    if (d.personalMetaLine) body += makeP(d.personalMetaLine, '555555', 18, false, 120);
    if (d.summary) {
      body += makeSec('Executive Profile', d.primaryHex);
      body += makeP(d.summary, '222222', 21, false, 120, 'both');
    }
    if (Array.isArray(d.experience) && d.experience.length) {
      body += makeSec('Professional Experience', d.primaryHex);
      d.experience.forEach(e => {
        body += makeP(`${e.role || ''} | ${e.company || ''} (${e.period || ''})`, '111111', 21, true, 40);
        (e.bullets || []).forEach(b => { body += makeP('•  ' + b, '222222', 20, false, 45); });
      });
    }
    if (Array.isArray(d.education) && d.education.length) {
      body += makeSec('Education & Qualifications', d.primaryHex);
      d.education.forEach(ed => {
        body += makeP(`${ed.degree || ''} | ${ed.institution || ''} (${ed.period || ''})`, '111111', 21, true, 40);
        if (ed.details) body += makeP(ed.details, '333333', 20, false, 80);
      });
    }
    if (Array.isArray(d.skills) && d.skills.length) {
      body += makeSec('Core Competencies & Technical Skills', d.primaryHex);
      body += makeP(d.skills.join('  •  '), '222222', 20, false, 120);
    }
    if (d.signatureLine) body += makeP(d.signatureLine, '444444', 19, false, 40);
  }

  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="900" w:right="950" w:bottom="900" w:left="950"/></w:sectPr></w:body></w:document>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;

  return createStoredZipBlob([
    { name: '[Content_Types].xml', content: contentTypes },
    { name: '_rels/.rels', content: rels },
    { name: 'word/_rels/document.xml.rels', content: docRels },
    { name: 'word/document.xml', content: docXml }
  ]);
}

function createStoredZipBlob(files) {
  const enc = new TextEncoder();
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    crcTable[n] = c >>> 0;
  }
  const crc32 = (bytes) => {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };

  const localParts = [];
  const centralParts = [];
  let offset = 0;

  files.forEach(f => {
    const nameBytes = enc.encode(f.name);
    const dataBytes = enc.encode(f.content);
    const crc = crc32(dataBytes);

    const lh = new Uint8Array(30 + nameBytes.length);
    const lhv = new DataView(lh.buffer);
    lhv.setUint32(0, 0x04034b50, true);
    lhv.setUint16(4, 20, true);
    lhv.setUint32(14, crc, true);
    lhv.setUint32(18, dataBytes.length, true);
    lhv.setUint32(22, dataBytes.length, true);
    lhv.setUint16(26, nameBytes.length, true);
    lh.set(nameBytes, 30);

    const ch = new Uint8Array(46 + nameBytes.length);
    const chv = new DataView(ch.buffer);
    chv.setUint32(0, 0x02014b50, true);
    chv.setUint16(4, 20, true);
    chv.setUint16(6, 20, true);
    chv.setUint32(16, crc, true);
    chv.setUint32(20, dataBytes.length, true);
    chv.setUint32(24, dataBytes.length, true);
    chv.setUint16(28, nameBytes.length, true);
    chv.setUint32(42, offset, true);
    ch.set(nameBytes, 46);

    localParts.push(lh, dataBytes);
    centralParts.push(ch);
    offset += lh.length + dataBytes.length;
  });

  const centralSize = centralParts.reduce((s, p) => s + p.length, 0);
  const eocd = new Uint8Array(22);
  const eocdv = new DataView(eocd.buffer);
  eocdv.setUint32(0, 0x06054b50, true);
  eocdv.setUint16(8, files.length, true);
  eocdv.setUint16(10, files.length, true);
  eocdv.setUint32(12, centralSize, true);
  eocdv.setUint32(16, offset, true);

  return new Blob([...localParts, ...centralParts, eocd], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  });
}
