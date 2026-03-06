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
    selectedFiles = [];
    fileInput.value = '';
    fileName.textContent = 'No file chosen';
    uploadBtn.disabled = true;
    loadDocuments();
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

    // Update session stats
    sessionQuestions += 1;
    // Prefer server-side estimate but fall back to local heuristic if missing
    sessionEstimatedTokens += estimatedTokens;
    renderStats();
  } catch (e) {
    answerEl.querySelector('.content').textContent = `Error: ${e.message}`;
  } finally {
    askBtn.disabled = false;
    askBtn.classList.remove('loading');
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

loadDocuments();
