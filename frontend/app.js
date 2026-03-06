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

let selectedFiles = [];

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
    if (docs.length === 0) {
      docList.innerHTML = '<li class="has-text-muted">No documents yet. Upload PDF, TXT, or MD above.</li>';
    } else {
      docList.innerHTML = docs.map(d => `<li>${escapeHtml(d)}</li>`).join('');
    }
  } catch {
    docList.innerHTML = '<li class="has-text-danger">Could not load list.</li>';
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
    answerEl.querySelector('.content').textContent = data.answer || '';
  } catch (e) {
    answerEl.querySelector('.content').textContent = `Error: ${e.message}`;
  } finally {
    askBtn.disabled = false;
    askBtn.classList.remove('loading');
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

loadDocuments();
