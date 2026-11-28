// js/firebase.js — Firebase Auth (Google 登入) 與 Cloud Firestore 同步模組
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyAFqz_hXdIZ7Br9N6u78Zq3AKUXGB62zbY",
  authDomain: "bitebudget-ad3d8.firebaseapp.com",
  projectId: "bitebudget-ad3d8",
  storageBucket: "bitebudget-ad3d8.firebasestorage.app",
  messagingSenderId: "454702710527",
  appId: "1:454702710527:web:e998a997b36027b97fd6ca"
};

const configured =
  Boolean(firebaseConfig.apiKey) &&
  !firebaseConfig.apiKey.startsWith('YOUR_') &&
  Boolean(firebaseConfig.projectId) &&
  !firebaseConfig.projectId.startsWith('YOUR_');

let auth = null;
let db = null;
let googleProvider = null;

if (configured) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  googleProvider = new GoogleAuthProvider();
  googleProvider.setCustomParameters({ prompt: 'select_account' });
}

export function isFirebaseConfigured() {
  return configured;
}

export function initAuthListener(callback) {
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}

export async function loginWithGoogle() {
  if (!auth || !googleProvider) {
    throw new Error('FIREBASE_NOT_CONFIGURED');
  }
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function logoutUser() {
  if (!auth) return;
  await signOut(auth);
}

// 讀取使用者的每日目標與所有歷史紀錄（供當日與 Phase 4 圖表使用）
export async function loadUserCloudData(uid) {
  if (!db) return null;

  const userRef = doc(db, 'users', uid);
  const userSnap = await getDoc(userRef);
  const goals = userSnap.exists() ? userSnap.data().goals || null : null;

  const daysRef = collection(db, 'users', uid, 'days');
  const daysSnap = await getDocs(daysRef);
  const logsByDate = {};

  daysSnap.forEach((docSnap) => {
    const data = docSnap.data();
    if (Array.isArray(data.logs)) {
      logsByDate[docSnap.id] = data.logs;
    }
  });

  return { goals, logsByDate };
}

// 儲存使用者每日預算與營養目標
export async function saveUserGoalsCloud(uid, userProfile, goals) {
  if (!db) return;
  const userRef = doc(db, 'users', uid);
  await setDoc(
    userRef,
    {
      displayName: userProfile?.displayName || '',
      email: userProfile?.email || '',
      goals,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

// 儲存指定日期的飲食紀錄陣列
export async function saveDayLogsCloud(uid, dateKey, logs) {
  if (!db) return;
  const dayRef = doc(db, 'users', uid, 'days', dateKey);
  await setDoc(dayRef, {
    date: dateKey,
    logs,
    updatedAt: serverTimestamp(),
  });
}