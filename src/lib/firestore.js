import {
  collection,
  addDoc,
  query,
  orderBy,
  getDocs,
  doc,
  getDoc,
  setDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import { loadHistory } from './storage';

function sessionsRef(uid) {
  return collection(db, 'users', uid, 'sessions');
}

export async function loadFirestoreHistory(uid) {
  try {
    const q = query(sessionsRef(uid), orderBy('date', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data());
  } catch {
    return [];
  }
}

export async function saveFirestoreSession(uid, sessionData) {
  try {
    await addDoc(sessionsRef(uid), sessionData);
  } catch {
    // silently fail — localStorage fallback still works
  }
}

export async function loadUsageDoc(uid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'usage', 'daily'));
    if (!snap.exists()) return null;
    const data = snap.data();
    const today = new Date().toISOString().slice(0, 10);
    return {
      count:  data.date === today ? (data.count || 0) : 0,
      isPro:  data.isPro || false,
      date:   data.date,
    };
  } catch {
    return null;
  }
}

export async function ensureUserDoc(user) {
  if (!db || !user) return;
  try {
    const ref = doc(db, 'users', user.uid);
    const snap = await getDoc(ref);
    const now = new Date().toISOString();
    if (!snap.exists()) {
      await setDoc(ref, {
        email: user.email ?? null,
        displayName: user.displayName ?? null,
        createdAt: now,
        lastActive: now,
      });
    } else {
      const updates = { lastActive: now };
      if (!snap.data().createdAt) updates.createdAt = now;
      await setDoc(ref, updates, { merge: true });
    }
  } catch (e) {
    console.error('[ensureUserDoc] failed:', e.code, e.message);
  }
}

export async function updatePresence(uid) {
  if (!db || !uid) return;
  try {
    await setDoc(doc(db, 'users', uid), { lastSeen: new Date().toISOString() }, { merge: true });
  } catch {
    // fire-and-forget — ignore errors
  }
}

export async function checkIsAdmin(uid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() && snap.data()?.isAdmin === true;
  } catch {
    return false;
  }
}

export async function migrateLocalToFirestore(uid) {
  const flag = `migrated_${uid}`;
  if (localStorage.getItem(flag)) return;

  const local = loadHistory();
  if (local.length === 0) {
    localStorage.setItem(flag, '1');
    return;
  }

  try {
    const ref = sessionsRef(uid);
    await Promise.all(local.map((session) => addDoc(ref, session)));
    localStorage.setItem(flag, '1');
  } catch {
    // retry next sign-in
  }
}
