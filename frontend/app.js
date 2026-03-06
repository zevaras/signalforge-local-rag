const API_BASE = '/api';

const fileInput = document.getElementById('fileInput');
const fileName = document.getElementById('fileName');
const uploadBtn = document.getElementById('uploadBtn');
const uploadSuccess = document.getElementById('uploadSuccess');
const uploadError = document.getElementById('uploadError');
const docList = document.getElementById('docList');
const refreshDocs = document.getElementById('refreshDocs');
const chatMessages = document.getElementById('chatMessages');
const questionInput = document.getElementById('questionInput');
const askBtn = document.getElementById('askBtn');
const askError = document.getElementById('askError');

// Viewer modal
const viewerModal = document.getElementById('viewerModal');
const viewerBackdrop = document.getElementById('viewerBackdrop');
const viewerCloseBtn = document.getElementById('viewerCloseBtn');
const viewerTitle = document.getElementById('viewerTitle');
const viewerSubtitle = document.getElementById('viewerSubtitle');
const viewerExcerpt = document.getElementById('viewerExcerpt');
const viewerFrame = document.getElementById('viewerFrame');
const viewerOpenNewTab = document.getElementById('viewerOpenNewTab');
const viewerDocHint = document.getElementById('viewerDocHint');

// Stats widgets
const statDocuments = document.getElementById('statDocuments');
const statQuestions = document.getElementById('statQuestions');
const statTokens = document.getElementById('statTokens');
const statAvgTokens = document.getElementById('statAvgTokens');
const statLastTokens = document.getElementById('statLastTokens');
const statModelName = document.getElementById('statModelName');
const statModelStatus = document.getElementById('statModelStatus');
const statModelMeta = document.getElementById('statModelMeta');

let selectedFiles = [];
let documentsCount = 0;
let sessionQuestions = 0;
let sessionEstimatedTokens = 0;
let lastQuestionTokens = 0;
let lastAnswerTokens = 0;
let modelName = '';
let modelStatus = 'Unknown';
let modelMeta = '';

fileInput.addEventListener('change', () => {
  selectedFiles = Array.from(fileInput.files || []);
  if (selectedFiles.length === 0) {
    fileName.textContent = 'No file chosen';
    uploadBtn.disabled = true;
  } else {
    fileName.textContent = selectedFiles.length === 1
      ? selectedFiles[0].name
      : `${selectedFiles.length} files selected`;
    uploadBtn.disabled = false;
  }
  hide(uploadSuccess);
  hide(uploadError);
});

uploadBtn.addEventListener('click', async () => {
  if (selectedFiles.length === 0) return;
  hide(uploadSuccess);
  hide(uploadError);
  uploadBtn.classList.add('loading');
  const formData = new FormData();
  selectedFiles.forEach(f => formData.append('files', f));
  try {
    const res = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      body: formData,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || res.statusText);
    uploadSuccess.classList.remove('is-hidden');
    uploadSuccess.textContent = `Uploaded: ${(data.uploaded || []).join(', ')}`;
    if (data.processing_time_ms != null) {
      uploadSuccess.textContent += ` (${data.processed_count || data.uploaded?.length || 0} processed in ${(data.processing_time_ms / 1000).toFixed(2)}s)`;
    }
    selectedFiles = [];
    fileInput.value = '';
    fileName.textContent = 'No file chosen';
    uploadBtn.disabled = true;
    loadDocuments();
    fetchDashboard();
  } catch (e) {
    uploadError.textContent = e.message || 'Upload failed';
    uploadError.classList.remove('is-hidden');
  } finally {
    uploadBtn.classList.remove('loading');
  }
});

refreshDocs.addEventListener('click', loadDocuments);

function hide(el) {
  if (el) el.classList.add('is-hidden');
}

async function loadDocuments() {
  docList.innerHTML = '<li class="has-text-muted">Loading…</li>';
  try {
    const res = await fetch(`${API_BASE}/documents`);
    const data = await res.json();
    const docs = data.documents || [];
    documentsCount = docs.length;
    if (docs.length === 0) {
      docList.innerHTML = '<li class="has-text-muted">No documents yet. Upload PDF, TXT, or MD above.</li>';
    } else {
      docList.innerHTML = docs.map(d => `<li>${escapeHtml(d)}</li>`).join('');
    }
    renderStats();
  } catch {
    docList.innerHTML = '<li class="has-text-danger">Could not load list.</li>';
  }
}

function estimateTokens(question, answer) {
  const q = question || '';
  const a = answer || '';
  const totalChars = q.length + a.length;
  // Fallback heuristic similar to backend: ~4 chars per token.
  return Math.max(1, Math.round(totalChars / 4));
}

function renderStats() {
  if (statDocuments) statDocuments.textContent = String(documentsCount);
  if (statQuestions) statQuestions.textContent = String(sessionQuestions);
  if (statTokens) statTokens.textContent = String(sessionEstimatedTokens);
  const avg = sessionQuestions > 0 ? Math.round(sessionEstimatedTokens / sessionQuestions) : 0;
  if (statAvgTokens) statAvgTokens.textContent = String(avg);
  if (statLastTokens) {
    statLastTokens.textContent = `${lastQuestionTokens} / ${lastAnswerTokens}`;
  }
  if (statModelName && modelName) {
    statModelName.textContent = modelName;
  }
  if (statModelStatus) {
    // Reset status pill classes
    statModelStatus.classList.remove('status-on', 'status-off', 'status-unknown');
    let label = modelStatus || 'Unknown';
    const normalized = (modelStatus || '').toLowerCase();
    if (normalized === 'ok' || normalized === 'ready' || normalized === 'online') {
      statModelStatus.classList.add('status-on');
      label = 'Online';
    } else if (normalized === 'error' || normalized === 'failed' || normalized === 'offline') {
      statModelStatus.classList.add('status-off');
      label = 'Offline';
    } else {
      statModelStatus.classList.add('status-unknown');
    }
    statModelStatus.textContent = label;
  }
  if (statModelMeta) {
    statModelMeta.textContent = modelMeta || 'Waiting for first answer…';
  }
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function escapeAttr(s) {
  return String(s || '').replace(/"/g, '&quot;');
}

function formatCitationLabel(c) {
  const src = c.source || 'Unknown';
  const page = typeof c.page === 'number' ? ` • p.${c.page + 1}` : '';
  return `${src}${page}`;
}

function openViewer(citation) {
  if (!viewerModal) return;
  const source = citation?.source || 'Unknown';
  const page = typeof citation?.page === 'number' ? citation.page : null;
  const excerpt = citation?.excerpt || '';

  viewerTitle.textContent = source;
  viewerSubtitle.textContent = page != null ? `Page ${page + 1}` : '—';

  const safeExcerpt = escapeHtml(excerpt);
  // Highlight the excerpt itself (best effort): mark first ~160 chars
  const hl = safeExcerpt.length > 0
    ? `<mark>${safeExcerpt.slice(0, Math.min(160, safeExcerpt.length))}</mark>${safeExcerpt.slice(Math.min(160, safeExcerpt.length))}`
    : '—';
  viewerExcerpt.innerHTML = hl;

  const docUrlBase = `${API_BASE}/document/${encodeURIComponent(source)}`;
  const isPdf = source.toLowerCase().endsWith('.pdf');
  let frameUrl = docUrlBase;

  if (isPdf) {
    // Use PDF.js official viewer with search + page so we get real in-PDF highlights.
    const origin = window.location.origin || '';
    const fileParam = encodeURIComponent(`${origin}${docUrlBase}`);
    // Use a short search term from the excerpt to highlight inside PDF.
    const searchTerm = encodeURIComponent((excerpt || '').slice(0, 80));
    const pageParam = page != null ? `&page=${page + 1}` : '';
    const searchParam = searchTerm ? `#search=${searchTerm}` : '';
    frameUrl = `https://mozilla.github.io/pdf.js/web/viewer.html?file=${fileParam}${pageParam}${searchParam}`;
  }

  viewerFrame.src = frameUrl;
  viewerOpenNewTab.href = frameUrl;
  if (isPdf) {
    viewerDocHint.textContent = page != null
      ? `PDF.js viewer – page ${page + 1} with highlighted text`
      : 'PDF.js viewer – searchable PDF';
  } else {
    viewerDocHint.textContent = 'Document preview';
  }

  viewerModal.classList.add('is-active');
  viewerModal.setAttribute('aria-hidden', 'false');
}

function closeViewer() {
  if (!viewerModal) return;
  viewerModal.classList.remove('is-active');
  viewerModal.setAttribute('aria-hidden', 'true');
  if (viewerFrame) viewerFrame.src = 'about:blank';
}

if (viewerBackdrop) viewerBackdrop.addEventListener('click', closeViewer);
if (viewerCloseBtn) viewerCloseBtn.addEventListener('click', closeViewer);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeViewer();
});

function appendMessage(role, text) {
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  const meta = role === 'user' ? 'You' : 'Assistant';
  div.innerHTML = `<span class="meta">${escapeHtml(meta)}</span>${escapeHtml(text).replace(/\n/g, '<br>')}`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

askBtn.addEventListener('click', submitQuestion);
questionInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    submitQuestion();
  }
});

async function submitQuestion() {
  const q = (questionInput.value || '').trim();
  if (!q) return;
  hide(askError);
  appendMessage('user', q);
  questionInput.value = '';
  askBtn.disabled = true;
  askBtn.classList.add('loading');
  const answerEl = document.createElement('div');
  answerEl.className = 'msg assistant';
  answerEl.innerHTML = '<span class="meta">Assistant</span><span class="content">Thinking…</span>';
  chatMessages.appendChild(answerEl);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  try {
    const res = await fetch(`${API_BASE}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || res.statusText);
    const answer = data.answer || '';
    const questionChars = typeof data.question_chars === 'number' ? data.question_chars : q.length;
    const answerChars = typeof data.answer_chars === 'number' ? data.answer_chars : answer.length;
    const estimatedTokens = typeof data.estimated_total_tokens === 'number'
      ? data.estimated_total_tokens
      : estimateTokens(q, answer);

    // Per-answer token details (fallback to heuristic if missing).
    lastQuestionTokens = typeof data.question_tokens === 'number'
      ? data.question_tokens
      : estimateTokens(q, '');
    lastAnswerTokens = typeof data.answer_tokens === 'number'
      ? data.answer_tokens
      : estimateTokens('', answer);

    // Model metadata
    modelName = data.model_name || modelName || 'Unknown';
    modelStatus = data.status || 'ok';
    if (data.model_base_url || data.model_timeout) {
      const base = data.model_base_url ? `${data.model_base_url}` : '';
      const timeout = typeof data.model_timeout === 'number' ? `${data.model_timeout}s timeout` : '';
      modelMeta = [base, timeout].filter(Boolean).join(' · ');
    }

    answerEl.querySelector('.content').textContent = answer;

    // Render citations (clickable chips)
    const citations = Array.isArray(data.citations) ? data.citations : [];
    if (citations.length > 0) {
      const citeWrap = document.createElement('div');
      citeWrap.className = 'citations';
      citations.slice(0, 8).forEach((c, idx) => {
        const chip = document.createElement('span');
        chip.className = 'cite-chip';
        chip.textContent = formatCitationLabel(c);
        chip.title = c.excerpt || '';
        chip.addEventListener('click', () => openViewer(c));
        citeWrap.appendChild(chip);
      });
      answerEl.appendChild(citeWrap);
    }

    // Update session stats
    sessionQuestions += 1;
    // Prefer server-side estimate but fall back to local heuristic if missing
    sessionEstimatedTokens += estimatedTokens;
    renderStats();
    fetchDashboard();
  } catch (e) {
    answerEl.querySelector('.content').textContent = `Error: ${e.message}`;
    fetchDashboard();
  } finally {
    askBtn.disabled = false;
    askBtn.classList.remove('loading');
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

function renderDashboard(data) {
  if (!data) return;
  const cap = data.capacity || {};
  const upload = data.upload || {};
  const model = data.model || {};
  const el = (id) => document.getElementById(id);
  if (el('dashMaxFiles')) el('dashMaxFiles').textContent = String(cap.max_upload_files ?? '—');
  if (el('dashMaxSize')) el('dashMaxSize').textContent = cap.max_upload_file_size_mb != null ? `${cap.max_upload_file_size_mb} MB` : '—';
  if (el('dashConcurrent')) el('dashConcurrent').textContent = String(cap.max_concurrent_upload_tasks ?? '—');
  if (el('dashUploadCount')) el('dashUploadCount').textContent = upload.last_batch_count != null ? String(upload.last_batch_count) : '—';
  if (el('dashUploadTime')) {
    const ms = upload.last_batch_duration_ms;
    el('dashUploadTime').textContent = ms != null ? (ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`) : '—';
  }
  if (el('dashSuccessErrors')) {
    const s = model.success_count ?? 0;
    const e = model.error_count ?? 0;
    el('dashSuccessErrors').textContent = `${s} / ${e}`;
  }
  if (el('dashLastLatency')) {
    const ms = model.last_latency_ms;
    el('dashLastLatency').textContent = ms != null ? `${Math.round(ms)}ms` : '—';
  }
  if (el('dashAvgLatency')) {
    const ms = model.avg_latency_ms;
    el('dashAvgLatency').textContent = ms != null ? `${Math.round(ms)}ms` : '—';
  }
  const hint = document.getElementById('uploadCapacityHint');
  if (hint && cap.max_upload_files != null && cap.max_upload_file_size_mb != null) {
    hint.textContent = `Up to ${cap.max_upload_files} files, ${cap.max_upload_file_size_mb} MB each. ${cap.max_concurrent_upload_tasks ?? 1} processed at a time.`;
  }
}

async function fetchDashboard() {
  try {
    const res = await fetch(`${API_BASE}/dashboard`);
    const data = await res.json().catch(() => null);
    if (data) renderDashboard(data);
  } catch (_) {}
}

loadDocuments();
fetchDashboard();
