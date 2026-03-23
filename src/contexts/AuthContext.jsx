import { createContext, useContext, useState, useEffect } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import { migrateLocalToFirestore, ensureUserDoc, updatePresence } from '../lib/firestore';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }

    let heartbeatId = null;

    const startHeartbeat = (uid) => {
      updatePresence(uid);
      clearInterval(heartbeatId);
      heartbeatId = setInterval(() => updatePresence(uid), 60_000);
    };

    const onVisible = () => {
      const uid = auth.currentUser?.uid;
      if (uid) updatePresence(uid);
    };
    document.addEventListener('visibilitychange', onVisible);

    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setLoading(false);
      if (u) {
        ensureUserDoc(u);
        migrateLocalToFirestore(u.uid);
        startHeartbeat(u.uid);
      } else {
        clearInterval(heartbeatId);
      }
    });

    return () => {
      unsub();
      clearInterval(heartbeatId);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const signInWithGoogle = () => signInWithPopup(auth, googleProvider);

  const signInWithEmail = (email, password) =>
    signInWithEmailAndPassword(auth, email, password);

  const signUpWithEmail = async (name, email, password) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
    // Force refresh so displayName is available immediately
    setUser({ ...cred.user, displayName: name });
    return cred;
  };

  const signOut = () => firebaseSignOut(auth);

  const getIdToken = () => auth?.currentUser?.getIdToken() ?? Promise.resolve(null);

  return (
    <AuthContext.Provider
      value={{ user, loading, signInWithGoogle, signInWithEmail, signUpWithEmail, signOut, getIdToken }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
