/* =====================================================
   FOLIO — app.js
   Firebase auth · Theme · Shared utilities
   ===================================================== */

/* ---- FIREBASE CONFIG ---- */
const firebaseConfig = {
  apiKey: "AIzaSyAXUptUUcOkkjxhPW0X4mrOWivWLC-URrQ",
  authDomain: "ice-cube-97847.firebaseapp.com",
  projectId: "ice-cube-97847",
  storageBucket: "ice-cube-97847.firebasestorage.app",
  messagingSenderId: "354070873862",
  appId: "1:354070873862:web:7e8e7104e1a370c3e14087",
  measurementId: "G-6CW6TGGJN7"
};

/* ---- INIT ---- */
let firebaseApp, auth, analytics, currentUser = null;

function initFirebase() {
  try {
    firebaseApp = firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    if (firebase.analytics) analytics = firebase.analytics();
    auth.onAuthStateChanged(onAuthStateChange);
  } catch (e) {
    console.warn('Firebase init error:', e);
  }
}

function onAuthStateChange(user) {
  currentUser = user;
  document.dispatchEvent(new CustomEvent('folio:auth', { detail: { user } }));
}

/* ---- SIGN IN / OUT ---- */
function signInWithGoogle() {
  if (!auth) return showToast('Auth not ready, please wait…');
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return auth.signInWithPopup(provider)
    .then(result => {
      showToast('Welcome, ' + result.user.displayName.split(' ')[0] + '! 👋');
      return result.user;
    })
    .catch(err => {
      if (err.code === 'auth/popup-blocked') {
        showToast('Popup blocked — please allow popups for this site');
      } else if (err.code !== 'auth/popup-closed-by-user') {
        showToast('Sign-in failed: ' + err.message);
      }
    });
}

function signOut() {
  if (!auth) return;
  auth.signOut().then(() => showToast('Signed out'));
}

/* ---- THEME ---- */
function getTheme() {
  return localStorage.getItem('folio_theme') ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}
function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('folio_theme', theme);
  const btn = document.querySelector('.theme-toggle');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}
function toggleTheme() {
  setTheme(getTheme() === 'dark' ? 'light' : 'dark');
}
function initTheme() { setTheme(getTheme()); }

/* ---- TOAST ---- */
let toastTimer;
function showToast(msg, duration = 2400) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), duration);
}

/* ---- DOCUMENT STORAGE ---- */
const FOLIO_DOCS_KEY = 'folio_docs';
const FOLIO_CURRENT_KEY = 'folio_current_id';

function getAllDocs() {
  try { return JSON.parse(localStorage.getItem(FOLIO_DOCS_KEY) || '{}'); }
  catch { return {}; }
}
function getDoc(id) {
  return getAllDocs()[id] || null;
}
function saveDoc(id, data) {
  const docs = getAllDocs();
  docs[id] = { ...data, id, updated: new Date().toISOString() };
  localStorage.setItem(FOLIO_DOCS_KEY, JSON.stringify(docs));
}
function deleteDoc(id) {
  const docs = getAllDocs();
  delete docs[id];
  localStorage.setItem(FOLIO_DOCS_KEY, JSON.stringify(docs));
}
function createNewDoc() {
  const id = 'doc_' + Date.now();
  const doc = { id, title: '', html: '', created: new Date().toISOString(), updated: new Date().toISOString() };
  saveDoc(id, doc);
  return id;
}
function getCurrentDocId() { return localStorage.getItem(FOLIO_CURRENT_KEY) || null; }
function setCurrentDocId(id) { localStorage.setItem(FOLIO_CURRENT_KEY, id); }

/* ---- LOGO SVG (shared) ---- */
function logoSVG(size = 28) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path class="logo-page" d="M8 34 C8 34 8 7 20 7 C20 7 20 34 20 34 Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" fill="none"/>
    <path class="logo-page" d="M32 34 C32 34 32 7 20 7 C20 7 20 34 20 34 Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" fill="none"/>
    <path class="logo-spine" d="M8 34 L32 34" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <path class="logo-line logo-line-1" d="M23 14 L29 14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
    <path class="logo-line logo-line-2" d="M23 19 L29 19" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
    <path class="logo-line logo-line-3" d="M23 24 L29 24" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
  </svg>`;
}

/* ---- LOGO COMPONENT ---- */
function renderLogo(size = 28, textSize = 17) {
  return `<span class="folio-logo-wrap">
    <span class="folio-logo-mark" style="color:var(--accent);display:inline-flex;width:${size}px;height:${size}px">${logoSVG(size)}</span>
    <span class="folio-logo-text" style="font-size:${textSize}px">Folio</span>
  </span>`;
}

/* ---- RELATIVE TIME ---- */
function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/* ---- TEXT PREVIEW ---- */
function htmlToText(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || '';
}

/* ---- WORD COUNT ---- */
function wordCount(text) {
  return text.trim() === '' ? 0 : text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

/* ---- INIT ON LOAD ---- */
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initFirebase();
  // Animate logos
  document.querySelectorAll('.folio-logo-mark').forEach(el => {
    setTimeout(() => el.closest('.folio-logo-wrap') && el.classList.add('logo-animate'), 100);
  });
});
