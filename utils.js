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
  serverTimestamp,
  query,           // ← ADD THIS
  where,           // ← ADD THIS
  orderBy,         // ← ADD THIS
  limit,           // ← ADD THIS
  writeBatch
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
    let docData = { ...data, createdAt: serverTimestamp() };

    // Parse @navn og @alle kun for Threads med content
    if (samling === "Threads" && data.content) {
      const mentionedUsers = [];
      const matches = data.content.match(/@(\w+)/g) || [];
      
      // Sjekk om brukeren er admin (for @alle)
      const userDoc = await getDoc(doc(db, "users", data.authorId));
      const isAdmin = userDoc.exists() && userDoc.data().admin === true;

      for (const mention of matches) {
        const username = mention.slice(1).toLowerCase();
        if (username === "alle" && isAdmin) {
          // Håndter @alle for administratorer
          const usersSnapshot = await getDocs(collection(db, "users"));
          usersSnapshot.forEach(doc => {
            if (doc.id !== data.authorId) { // Unngå å varsle opphavsperson
              mentionedUsers.push({ 
                uid: doc.id, 
                displayName: doc.data().displayName 
              });
            }
          });
        } else if (username !== "alle") {
          // Håndter vanlig @navn
          const usersSnapshot = await getDocs(collection(db, "users"));
          const matchingUser = usersSnapshot.docs.find(doc => 
            doc.data().displayName.toLowerCase() === username
          );
          if (matchingUser) {
            mentionedUsers.push({ 
              uid: matchingUser.id, 
              displayName: matchingUser.data().displayName 
            });
          }
        }
      }

      if (mentionedUsers.length > 0) {
        docData.mentions = mentionedUsers;
      }

      const docRef = await addDoc(collection(db, samling), docData);

      // Send notifikasjoner til nevnte brukere
      if (mentionedUsers.length > 0) {
        for (const mentionedUser of mentionedUsers) {
          await createNotification(mentionedUser.uid, "mention", {
            threadId: docRef.id,
            actorName: data.authorName || "Ukjent",
            content: data.content,
          });
        }
      }

      return docRef;
    }

    // Andre samlinger
    const docRef = await addDoc(collection(db, samling), docData);
    return docRef;
  } catch (error) {
    console.error("Feil ved lagring:", error);
    throw error;
  }
}
// ❌ Slett dokument fra samling
async function slettDokument(samling, id) {
    try {
        await deleteDoc(doc(db, samling, id));

    } catch (error) {
        console.error("Feil ved sletting:", error);
    }
}

export async function hentdokument(samling, id) {
    try {
        return await (doc(db, samling, id));
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

// Vilkår må bli endret senere

(function(){
  const toggle = document.getElementById('show-terms');
  const txt = document.getElementById('termsText');

  function toggleTerms(e){
    // prevent any default/propagation to avoid toggling the checkbox
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    if (!txt) return;
    txt.classList.toggle('hidden');
    if (!txt.classList.contains('hidden')) txt.scrollIntoView({behavior:'smooth', block:'center'});
  }

  toggle?.addEventListener('click', toggleTerms);
  // keyboard accessibility: Enter / Space
  toggle?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ' || e.code === 'Space') {
      toggleTerms(e);
    }
  });
})();

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

export async function updateUserPresence(userId, state) {
  const db = getFirestore();
  const presenceRef = doc(db, "presence", userId);

  try {
    await setDoc(presenceRef, { 
      state, 
      lastUpdated: Date.now(),
      school: await hentSkole(userId)
    }, { merge: true });
  } catch (error) {
    console.error("Error updating presence:", error);
    throw error;
  }
}
// Hjelpefunksjon for periodisk oppdatering (for Firestore)
export function startPresenceKeepAlive(userId) {
  if (!userId) return () => {};
  const interval = setInterval(async () => {
    try {
      await updateUserPresence(userId, "online");
    } catch (error) {
      console.error("Error keeping presence alive:", error);
    }
  }, 30000); // Oppdater hvert 30. sekund
  return () => clearInterval(interval); // Returner funksjon for å stoppe intervallet
}

export function overvåkOnlineBrukere(callback) {
  const db = getFirestore();
  const presenceRef = collection(db, "presence");

  try {
    onSnapshot(presenceRef, (snapshot) => {
      const onlineBySchool = {};

      snapshot.forEach(doc => {
        const user = doc.data();
        if (user.state === "online" && user.lastUpdated > Date.now() - 60000) {
          const school = user.school || "Ukjent";
          onlineBySchool[school] = (onlineBySchool[school] || 0) + 1;
        }
      });

      callback(onlineBySchool, null);
    }, (error) => {
      callback({}, error);
    });
  } catch (error) {
    callback({}, error);
  }
}

function overvåkTrendingHashtags(callback) {
  const threadsRef = collection(db, "Threads");
  return onSnapshot(threadsRef, (snapshot) => {
    const hashtagUpvotes = {}; // Ny: Mapper hashtag til total upvotes

    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const upvotesCount = data.upvotes?.length || 0; // Antall upvotes på denne tråden
      if (Array.isArray(data.hashtags)) {
        data.hashtags.forEach(tag => {
          const normalized = tag.trim().toLowerCase(); // Normaliser (lowercase, trim)
          if (normalized) {
            // Legg til upvotes for denne tråden til hashtaggen
            hashtagUpvotes[normalized] = (hashtagUpvotes[normalized] || 0) + upvotesCount;
          }
        });
      }
    });

    // Sortér etter total upvotes (mest først), ta topp 5
    const sorted = Object.entries(hashtagUpvotes)
      .sort((a, b) => b[1] - a[1]) // Høyest total upvotes først
      .slice(0, 5); // Topp 5 hashtags

    callback(sorted); // Returnerer f.eks. [["#matte", 150], ["#eksamen", 120]] – tag og total upvotes
  });
}

// ============================================
// NOTIFICATION FUNCTIONS
// ============================================
export async function createNotification(userId, type, data) {
  const db = getFirestore();
  try {
    // type can be: "reply", "like", "upvote", "mention"
    const docRef = await addDoc(collection(db, "Notifications"), {
      userId: userId,
      type: type,
      threadId: data.threadId,
      actorName: data.actorName,
      content: data.content,
      read: false,
      createdAt: new Date()
    });
    return docRef;
  } catch (error) {
    console.error("Error creating notification:", error);
    throw error;
  }
}

// Mark notification as read
async function markNotificationRead(notificationId) {
  const db = getFirestore();
  const notificationRef = doc(db, "Notifications", notificationId);
  await updateDoc(notificationRef, { read: true });
}

// Mark all notifications as read for a user
async function markAllNotificationsRead(userId) {
  const db = getFirestore();
  const q = query(
    collection(db, "Notifications"),
    where("userId", "==", userId),
    where("read", "==", false)
  );
  
  const snapshot = await getDocs(q);
  const batch = writeBatch(db);
  
  snapshot.docs.forEach(docSnap => {
    batch.update(docSnap.ref, { read: true });
  });
  
  await batch.commit();
}

export async function getadmin(uid){
  const docRef = doc(db, "users", uid);  // 👈 reference to that one user
  const snap = await getDoc(docRef);

  if (snap.exists()) {
    return snap.data().admin; // e.g. "Grenland VGS"
  } else {
    return false
  }
}


// Listen to notifications for a user
function overvåkNotifications(userId, callback) {
  const db = getFirestore();
  const q = query(
    collection(db, "Notifications"),
    where("userId", "==", userId),
    orderBy("createdAt", "desc"),
    limit(50)
  );
  
  return onSnapshot(q, (snapshot) => {
    const notifications = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));
    callback(notifications);
  });
}

export async function upvoteThread(threadId, userId){
  const threadRef = doc(db, "Threads", threadId);

  threadRef.upvote.append(userId)
}

// ============================================
// VOTE TOGGLE FUNCTION
// ============================================

export async function toggleVote(threadId, userId, voteType) {
  const db = getFirestore();
  const threadRef = doc(db, "Threads", threadId);
  
  try {
    const threadDoc = await getDoc(threadRef);
    if (!threadDoc.exists()) return;
    
    const data = threadDoc.data();
    let upvotes = data.upvotes || [];
    let downvotes = data.downvotes || [];
    
    if (voteType === 'upvote') {
      // Check if already upvoted
      if (upvotes.includes(userId)) {
        // Remove upvote
        upvotes = upvotes.filter(id => id !== userId);
      } else {
        // Add upvote and remove downvote if exists
        upvotes.push(userId);
        downvotes = downvotes.filter(id => id !== userId);
      }
    } else if (voteType === 'downvote') {
      // Check if already downvoted
      if (downvotes.includes(userId)) {
        // Remove downvote
        downvotes = downvotes.filter(id => id !== userId);
      } else {
        // Add downvote and remove upvote if exists
        downvotes.push(userId);
        upvotes = upvotes.filter(id => id !== userId);
      }
    }
    
    await updateDoc(threadRef, {
      upvotes: upvotes,
      downvotes: downvotes
    });
    
  } catch (error) {
    console.error("Error toggling vote:", error);
    throw error;
  }
}

export async function isBanned(userId) {
  const bans = await hentDokumenter("bans");
  return bans.some(ban => ban.userId === userId);
}

export async function votePoll(threadId, userId, optionIndex) {
  try {
    const threadRef = doc(db, "Threads", threadId);
    const threadSnap = await getDoc(threadRef);

    if (!threadSnap.exists()) {
      throw new Error("Thread not found");
    }

    const threadData = threadSnap.data();
    if (!threadData.poll || !threadData.poll.isPoll) {
      throw new Error("No poll found for this thread");
    }

    if (threadData.poll.votedBy.includes(userId)) {
      throw new Error("User has already voted");
    }

    // Create a new options array with the user's vote
    const updatedOptions = threadData.poll.options.map((option, index) => {
      if (index === optionIndex) {
        return {
          ...option,
          votes: [...(option.votes || []), userId]
        };
      }
      return option;
    });

    // Update the poll with the new vote and add user to votedBy
    await updateDoc(threadRef, {
      "poll.options": updatedOptions,
      "poll.votedBy": [...threadData.poll.votedBy, userId]
    });
  } catch (error) {
    console.error("Error in votePoll:", error);
    throw error;
  }
}
async function getUserProfileData(userId) {
  try {
    const threads = await hentDokumenter("Threads");
    const userThreads = threads.filter(thread => thread.authorId === userId && !thread.parentId);
    const totalThreads = userThreads.length;
    const totalUpvotes = userThreads.reduce((sum, thread) => sum + (thread.upvotes?.length || 0), 0);
    return {
      threads: userThreads,
      totalThreads,
      totalUpvotes
    };
  } catch (error) {
    console.error("Error in getUserProfileData:", error);
    throw error;
  }
}

// utils.js - Add this async function
export async function getUserByUsername(displayName) {
  try {
    const users = await hentDokumenter("users");

    // Slugify displayName for comparison (e.g., "John Doe" → "john-doe")
    const slugifiedInput = displayName.toLowerCase().replace(/\s+/g, '-');
    const user = users.find((u, index) => {
      const storedDisplayName = (u.displayName || '').toLowerCase().replace(/\s+/g, '-');
      return storedDisplayName === slugifiedInput;
    });

    if (!user) {
      console.error(`No user found for displayName: ${displayName}`);
      throw new Error("User not found");
    }

    // Use document ID as uid if not present in data
    const userId = user.uid || user.id || users.findIndex((u, i) => u === user); // Fallback to index if no ID

    const profileData = await getUserProfileData(userId);
    return {
      id: userId,
      username: user.displayName || "Anonym",
      school: user.school || "Ukjent",
      threads: profileData.threads,
      totalThreads: profileData.totalThreads,
      totalUpvotes: profileData.totalUpvotes
    };
  } catch (error) {
    console.error("Error in getUserByUsername:", error);
    throw error;
  }
}

export {
  markNotificationRead,
  markAllNotificationsRead,
  overvåkNotifications,
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
  overvåkTrendingHashtags
};

