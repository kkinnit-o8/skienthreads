import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  onSnapshot,
  updateDoc,
  setDoc,
  getDoc,
  arrayUnion,
  arrayRemove,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";


const firebaseConfig = {
  apiKey: "AIzaSyChnXyJRD7tAbIAzJMZjwrCD-2nLrTJpfU",
  authDomain: "skienthreads.firebaseapp.com",
  projectId: "skienthreads",
  storageBucket: "skienthreads.firebasestorage.app",
  messagingSenderId: "1040488551947",
  appId: "1:1040488551947:web:eb703640127dffdae2990e",
  measurementId: "G-GB18TTLPZQ"
};

// 🔄 Initialiser Firebase og Firestore
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// 📥 Hent alle dokumenter fra valgt samling
async function hentDokumenter(samling) {
    try {
        const snapshot = await getDocs(collection(db, samling));
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error("Feil ved henting:", error);
        return [];
    }
}

// ➕ Legg til nytt dokument i valgt samling
async function leggTilDokument(samling, data) {
    try {
        await addDoc(collection(db, samling), data);
        console.log("Dokument lagt til.");
    } catch (error) {
        console.error("Feil ved lagring:", error);
    }
}
// ❌ Slett dokument fra samling
async function slettDokument(samling, id) {
    try {
        await deleteDoc(doc(db, samling, id));
        console.log("Dokument slettet.");
    } catch (error) {
        console.error("Feil ved sletting:", error);
    }
}

// 🔁 Vis alle dokumenter og oppdater automatisk ved endringer
function visDokumenterLive(samling, visningsfunksjon) {
    onSnapshot(collection(db, samling), (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        visningsfunksjon(data);
    });
}

async function oppdaterDokument(samling, id, data) {
    const docRef = doc(db, samling, id);
    await updateDoc(docRef, data);
  }



// 📌 Register new user with school email
async function registrerBruker(email, password, displayName, school, schoolDomain="@skole.telemarkfylke.no") {
  if (!email.toLowerCase().endsWith(schoolDomain)) {
    throw new Error("Må bruke skole-epost: " + schoolDomain);
  }

  const userCred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(userCred.user, { displayName });
  await sendEmailVerification(userCred.user);

  await setDoc(doc(db, "users", userCred.user.uid), {
    email: userCred.user.email,
    displayName: displayName,
    school: school,
    createdAt: new Date(),
    state: "offline",                 // "online" | "offline"
    lastChanged: serverTimestamp(), // keep track of last update,
    admin: false
  });

  return userCred.user;
}

// 📌 Log in
async function loggInn(email, password) {
  const userCred = await signInWithEmailAndPassword(auth, email, password);
  let user = userCred.user

  if (!user.emailVerified) {
    throw new Error("Epost ikke verifisert. Sjekk innboksen!");
  }
  return user;
}

// 📌 Log out
async function loggUt() {
  return signOut(auth);
}

// 📌 Watch auth state
function overvåkBruker(callback) {
  onAuthStateChanged(auth, callback);
}

async function hentSkole(uid) {
  const docRef = doc(db, "users", uid);  // 👈 reference to that one user
  const snap = await getDoc(docRef);

  if (snap.exists()) {
    return snap.data().school; // e.g. "Grenland VGS"
  } else {
    return "Alle skoler"; // fallback if no doc found
  }
}

async function toggleLike(threadId, userId) {
  const threadRef = doc(db, "Threads", threadId);
  const threadSnap = await getDoc(threadRef);

  if (!threadSnap.exists()) return;

  const data = threadSnap.data();
  if (data.likes && data.likes.includes(userId)) {
    // User already liked → remove like
    await updateDoc(threadRef, {
      likes: arrayRemove(userId)
    });
  } else {
    // Add like
    await updateDoc(threadRef, {
      likes: arrayUnion(userId)
    });
  }
}

async function updateUserPresence(uid, state) {
  const userRef = doc(db, "users", uid);

  await updateDoc(userRef, {
    state: state,                 // "online" | "offline"
    lastChanged: serverTimestamp() // keep track of last update
  });
}

function overvåkOnlineBrukere(callback) {
  const usersRef = collection(db, "users");
  return onSnapshot(usersRef, (snapshot) => {
    const onlineBySchool = {};

    snapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.state === "online" && data.school) {
        if (!onlineBySchool[data.school]) onlineBySchool[data.school] = 0;
        onlineBySchool[data.school]++;
      }
    });

    callback(onlineBySchool);
  });
}

function overvåkTrendingHashtags(callback) {
  const threadsRef = collection(db, "Threads");
  return onSnapshot(threadsRef, (snapshot) => {
    const hashtagCounts = {};

    snapshot.docs.forEach(doc => {
      const data = doc.data();
      if (Array.isArray(data.hashtags)) {
        data.hashtags.forEach(tag => {
          const normalized = tag.trim();
          if (normalized) {
            if (!hashtagCounts[normalized]) hashtagCounts[normalized] = 0;
            hashtagCounts[normalized]++;
          }
        });
      }
    });

    // Sort by most used
    const sorted = Object.entries(hashtagCounts)
      .sort((a, b) => b[1] - a[1]) // most popular first
      .slice(0, 5); // top 5

    callback(sorted); // e.g. [["MatteEksamen", 23], ["Høstferie", 19]]
  });
}



  

export {
  hentDokumenter,
  leggTilDokument,
  slettDokument,
  visDokumenterLive,
  oppdaterDokument,
  registrerBruker,
  loggInn,
  loggUt,
  overvåkBruker,
  hentSkole,
  toggleLike,
  updateUserPresence,
  overvåkOnlineBrukere,
  overvåkTrendingHashtags
};

