import {
  registrerBruker,
  loggInn,
  loggUt,
  overvåkBruker,
  leggTilDokument,
  visDokumenterLive,
  hentDokumenter,
  hentSkole,
  toggleLike,
  updateUserPresence,
  overvåkOnlineBrukere,
  overvåkTrendingHashtags
} from "./utils.js";


let sortThreadsBy = "recent"; // or "popular"
let schoolfilter = "Alle skoler"


// ============================================
// post thread functionality
// ============================================

document.getElementById("post-thread").addEventListener("submit", async (e) => {
  e.preventDefault(); // 🚀 stop page reload

  const content = e.target.querySelector("textarea").value;
  post(content)
  e.target.reset();
});


function post(content, parentId = null){
    overvåkBruker(async (user) => { // make this callback async
    if (!user) {
      alert("Du må være logget inn for å poste!");
      return;
    }
    if (!content.trim()) {
      alert("Tråden kan ikke være tom!");
      return;
    }

    const school = await hentSkole(user.uid); // ✅ await the async function
    console.log(school);
    const hashtags = [...content.matchAll(/#(\w+)/g)].map(match => match[1]);
    leggTilDokument("Threads", {
      content: content,
      authorId: user.uid,
      authorName: user.displayName || "Anonym",
      createdAt: new Date(),
      school: school,
      likes: [],
      hashtags: hashtags,
      parentId: parentId
    })
    .then(() => {
      alert("postet!");
    });
  });
}


// ============================================
// show threads live
// ============================================

function timeAgo(timestamp) {
  const now = new Date();
  const postDate = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const diffMs = now - postDate;

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (years > 0) return years + (years === 1 ? " år siden" : " år siden");
  if (months > 0) return months + (months === 1 ? " måned siden" : " måneder siden");
  if (days > 0) return days + (days === 1 ? " dag siden" : " dager siden");
  if (hours > 0) return hours + (hours === 1 ? " time siden" : " timer siden");
  if (minutes > 0) return minutes + (minutes === 1 ? " minutt siden" : " minutter siden");
  return "Nå nettopp";
}

function getInitials(name) {
  if (!name) return "";
  return name
    .split(" ")
    .map(word => word[0])
    .join("")
    .toUpperCase();
}

function like(threadid){
  overvåkBruker((user) => {
    toggleLike(threadid, user.uid)
  })

}

let currentThreadsData = []; // Store current threads data
let isManualSort = false; // Flag to track if we're manually sorting

function visTråderLive(selectedSchool = "Alle skoler") {
  const container = document.getElementById("Threads");
  console.log("🔄 visTråderLive called with:", { selectedSchool, sortThreadsBy });

  let currentUser = null;
  overvåkBruker(user => currentUser = user);

  visDokumenterLive("Threads", (docs) => {
    console.log("📊 Data received:", docs.length, "docs");
    
    if (!Array.isArray(docs)) return;

    currentThreadsData = docs; // Store the data

    // If this is a manual sort trigger, don't recreate everything
    if (isManualSort) {
      isManualSort = false;
      applySorting(selectedSchool, currentUser, container);
      return;
    }

    // Normal live update - filter and display
    applySorting(selectedSchool, currentUser, container);
  });
}

function applySorting(selectedSchool, currentUser, container) {
  // filter etter skole
  let filteredDocs = currentThreadsData;
  if (selectedSchool !== "Alle skoler") {
    filteredDocs = currentThreadsData.filter(thread => thread && thread.school === selectedSchool);
  }
  filteredDocs = filteredDocs.filter(thread => thread && !thread.parentId)

  // sortere
  filteredDocs.sort((a, b) => {
    if (sortThreadsBy === "recent") {
      const aMillis = a?.createdAt?.toMillis ? a.createdAt.toMillis() : (new Date(a.createdAt)).getTime();
      const bMillis = b?.createdAt?.toMillis ? b.createdAt.toMillis() : (new Date(b.createdAt)).getTime();
      return bMillis - aMillis;
    } else if (sortThreadsBy === "popular") {
      return (b.likes?.length || 0) - (a.likes?.length || 0);
    }
    return 0;
  });

  // Get existing threads
  const existingThreads = new Map();
  container.querySelectorAll('.thread-card').forEach(threadEl => {
    const threadId = threadEl.dataset.id;
    if (threadId) {
      existingThreads.set(threadId, threadEl);
    }
  });

  // Check if we actually need to reorder (only for manual sorts)
  if (isManualSort) {
    isManualSort = false;
    
    // Remove and re-add threads in correct order without clearing container
    filteredDocs.forEach((data) => {
      const existingThread = existingThreads.get(data.id);
      if (existingThread) {
        // Move to correct position
        existingThread.remove();
        container.appendChild(existingThread);
      }
    });
  } else {
    // For live updates, only update the changed threads
    filteredDocs.forEach((data) => {
      const commentCount = currentThreadsData.filter(d => d.parentId === data.id).length;
      const existingThread = existingThreads.get(data.id);
      
      if (existingThread) {
        // Just update content, don't move
        updateThreadContent(existingThread, data, currentUser, commentCount);
      } else {
        // Create new thread at the end
        let postEl = getThread(data, currentUser, container, commentCount);
        container.appendChild(postEl);
      }
    });

    // Remove deleted threads
    existingThreads.forEach((threadEl, threadId) => {
      if (!filteredDocs.find(doc => doc.id === threadId)) {
        threadEl.remove();
      }
    });
  }
}

// Helper function to update thread content without recreating the element
function updateThreadContent(threadEl, data, currentUser, commentCount) {
  // Update likes count
  const likeBtn = threadEl.querySelector('.action-btn.like');
  const userLiked = currentUser && Array.isArray(data.likes) && data.likes.includes(currentUser.uid);
  likeBtn.textContent = userLiked ? `❤️ ${data.likes.length}` : `🤍 ${data.likes.length}`;

  // Update comment count
  const commentBtn = threadEl.querySelector('.action-btn.comment');
  commentBtn.textContent = `💬 ${commentCount || 0}`;
}

function togglecommentsection(threadId, user, container, isNested = false) {
  // For nested comments (replies to comments), use the container directly
  // For main thread comments, find the thread card
  const targetEl = isNested ? container : container.closest('.thread-card') || container;
  
  // If already open, remove it
  let existing = targetEl.querySelector(".comments-section");
  if (existing) {
    // If there's a cleanup function, call it
    if (existing.cleanup) {
      existing.cleanup();
    }
    existing.remove();
    return;
  }

  // Create comments section
  const commentsSection = document.createElement("div");
  commentsSection.classList.add("comments-section");

  // --- Form ---
  const form = document.createElement("form");
  form.classList.add("comment-form");

  const inputContainer = document.createElement("div");
  inputContainer.classList.add("comment-input-container");

  const avatar = document.createElement("div");
  avatar.classList.add("user-avatar", "small");
  avatar.textContent = getInitials(user.displayName || "Bruker");

  const textarea = document.createElement("textarea");
  textarea.classList.add("comment-input");
  textarea.placeholder = "Skriv en kommentar...";
  textarea.required = true;

  inputContainer.appendChild(avatar);
  inputContainer.appendChild(textarea);

  const formActions = document.createElement("div");
  formActions.classList.add("comment-actions");

  const submitBtn = document.createElement("button");
  submitBtn.classList.add("btn", "btn-primary", "btn-small");
  submitBtn.type = "submit";
  submitBtn.textContent = "Kommenter";

  formActions.appendChild(submitBtn);
  form.appendChild(inputContainer);
  form.appendChild(formActions);

  // --- Comments list ---
  const commentsList = document.createElement("div");
  commentsList.classList.add("comments-list");

  // Append everything
  commentsSection.appendChild(form);
  commentsSection.appendChild(commentsList);
  
  // For nested comments, append to the specific comment card
  // For main thread comments, append to the thread card
  targetEl.appendChild(commentsSection);

  // --- Load existing comments and get cleanup function ---
  const cleanup = visKommentarerLive(threadId, commentsList, user, isNested);
  
  // Store cleanup function on the comments section
  if (cleanup) {
    commentsSection.cleanup = cleanup;
  }

  // --- Handle new comment submission ---
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const content = textarea.value.trim();
    if (!content) return;

    await post(content, threadId);
    textarea.value = "";
  });
}

function visKommentarerLive(parentId, commentsList, user, isNested = false) {
  let currentUser = null;
  overvåkBruker(user => currentUser = user);

  const updateComments = (docs) => {
    // Filter to only comments for this specific parent (thread or comment)
    const comments = docs.filter(d => d.parentId === parentId);

    // Sort newest first
    comments.sort((a, b) => {
      const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt).getTime();
      const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt).getTime();
      return bTime - aTime;
    });

    // Clear current list
    commentsList.innerHTML = "";

    comments.forEach(comment => {
      const card = document.createElement("div");
      card.classList.add("comment-card");
      if (isNested) card.classList.add("nested-comment");

      // --- Header ---
      const header = document.createElement("div");
      header.classList.add("comment-header");

      const avatar = document.createElement("div");
      avatar.classList.add("user-avatar", "small");
      avatar.textContent = getInitials(comment.authorName || "Anonym");

      const userInfo = document.createElement("div");
      userInfo.classList.add("comment-user-info");

      const username = document.createElement("div");
      username.classList.add("comment-username");
      username.textContent = comment.authorName || "Anonym";

      const meta = document.createElement("div");
      meta.classList.add("comment-meta");
      meta.textContent = `${timeAgo(comment.createdAt)} `;

      const badge = document.createElement("span");
      badge.classList.add("comment-school-badge");
      badge.textContent = comment.school || "";

      meta.appendChild(badge);
      userInfo.appendChild(username);
      userInfo.appendChild(meta);
      header.appendChild(avatar);
      header.appendChild(userInfo);

      // --- Content ---
      const content = document.createElement("div");
      content.classList.add("comment-content");
      content.textContent = comment.content;

      // --- Actions ---
      const actions = document.createElement("div");
      actions.classList.add("comment-actions");

      const likeBtn = document.createElement("button");
      likeBtn.classList.add("action-btn", "small");

      const userLiked = currentUser && comment.likes?.includes(currentUser.uid);
      const heart = document.createElement("span");
      heart.textContent = userLiked ? "❤️" : "🤍";

      const likeCount = document.createElement("span");
      likeCount.textContent = ` ${comment.likes?.length || 0}`;

      likeBtn.appendChild(heart);
      likeBtn.appendChild(likeCount);

      likeBtn.addEventListener("click", () => {
        if (!currentUser) return alert("Du må være logget inn for å like!");
        toggleLike(comment.id, currentUser.uid);
      });

      // Reply button for nested comments
      const replyBtn = document.createElement("button");
      replyBtn.classList.add("action-btn", "small");
      replyBtn.textContent = "💬 Svar";

      replyBtn.addEventListener("click", () => {
        if (!currentUser) return alert("Du må være logget inn for å svare!");
        togglecommentsection(comment.id, currentUser, card, true); // true = isNested
      });

      actions.appendChild(likeBtn);
      actions.appendChild(replyBtn);

      // --- Put everything together ---
      card.appendChild(header);
      card.appendChild(content);
      card.appendChild(actions);
      commentsList.appendChild(card);

      // Recursively load nested comments for this comment
      if (!isNested) {
        const nestedCommentsList = document.createElement("div");
        nestedCommentsList.classList.add("nested-comments-list");
        card.appendChild(nestedCommentsList);
        visKommentarerLive(comment.id, nestedCommentsList, user, true);
      }
    });
  };

  // Set up live listener - we'll track it manually since no unsubscribe is returned
  visDokumenterLive("Threads", updateComments);
  
  // Since visDokumenterLive doesn't return unsubscribe, we'll use a different approach
  // We'll store a flag to indicate this comments section is active
  commentsList._isActive = true;
  
  // Return a cleanup function that we can call
  return () => {
    commentsList._isActive = false;
  };
}




function getThread(data, currentUser, container, commentcount) {
  const postEl = document.createElement("div");
  postEl.classList.add("thread-card");
  postEl.dataset.id = data.id;

  // Store the thread data on the element for later updates
  postEl._threadData = data;

  // Header
  const header = document.createElement("div");
  header.classList.add("thread-header");

  const avatar = document.createElement("div");
  avatar.classList.add("user-avatar");
  avatar.textContent = String(getInitials(data.authorName || "Anonym"));

  const userInfo = document.createElement("div");
  userInfo.classList.add("thread-user-info");

  const username = document.createElement("div");
  username.classList.add("thread-username");
  username.textContent = String(data.authorName || "Anonym");

  const meta = document.createElement("div");
  meta.classList.add("thread-meta");
  meta.textContent = String(timeAgo(data.createdAt));

  const schoolBadge = document.createElement("span");
  schoolBadge.classList.add("thread-school-badge");
  schoolBadge.textContent = String(data.school || "");

  meta.appendChild(document.createTextNode(" "));
  meta.appendChild(schoolBadge);
  userInfo.appendChild(username);
  userInfo.appendChild(meta);
  header.appendChild(avatar);
  header.appendChild(userInfo);

  // Content
  const contentEl = document.createElement("div");
  contentEl.classList.add("thread-content");
  contentEl.textContent = String(data.content || "");

  // Actions
  const actions = document.createElement("div");
  actions.classList.add("thread-actions");

  const likeBtn = document.createElement("button");
  likeBtn.classList.add("action-btn", "like");

  const userLiked = currentUser && Array.isArray(data.likes) && data.likes.includes(currentUser.uid);
  likeBtn.textContent = userLiked ? `❤️ ${data.likes.length}` : `🤍 ${data.likes.length}`;

  likeBtn.addEventListener("click", () => {
    if (!currentUser) return alert("Du må være logget inn for å like!");
    toggleLike(data.id, currentUser.uid);
  });

  const commentBtn = document.createElement("button");
  commentBtn.classList.add("action-btn", "comment");
  commentBtn.textContent = `💬 ${commentcount || 0}`;

  commentBtn.addEventListener("click", () => {
    if (!currentUser) return alert("Du må være logget inn for å kommentere!");
    togglecommentsection(data.id, currentUser, postEl);
  });

  actions.appendChild(likeBtn);
  actions.appendChild(commentBtn);

  postEl.appendChild(header);
  postEl.appendChild(contentEl);
  postEl.appendChild(actions);
  return postEl;
}







// ============================================
// REGISTER FORM HANDLER
// ============================================

document.getElementById("register-form").addEventListener("submit", async (e) => {
  e.preventDefault(); // 🚀 stop page reload

  const email = document.getElementById("regEmail").value;
  const pass = document.getElementById("regPass").value;
  const name = document.getElementById("regName").value;
  const school = document.getElementById("regSchool").value;

  try {
    await registrerBruker(email, pass, name, school);
    alert("Bruker opprettet, sjekk skole-eposten din!");
  } catch (err) {
    alert("Feil: " + err.message);
    console.error(err);
  }
});

// ============================================
// LOGIN FORM HANDLER
// ============================================
document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault(); // 🚀 stop page reload

  const email = document.getElementById("loginEmail").value;
  const pass = document.getElementById("loginPass").value;
  
  try {
    const user = await loggInn(email, pass);
    alert("Logget inn!");
    // After successful login, show main page
    showMainPage();
  } catch (err) {
    alert("Feil: " + err.message);
  }
});

// ============================================
// AUTH STATE MONITORING
// React to authentication changes
// ============================================
overvåkBruker(async (user) => {
  if (user) {
    console.log("Innlogget:", user.email, "Verifisert:", user.emailVerified);
    
    // If user is logged in and verified, show main page
    if (user.emailVerified) {
      showMainPage();
      await updateUserPresence(user.uid, "online");
      window.addEventListener("beforeunload", () => {
        updateUserPresence(user.uid, "offline");
      });
    } else {
      // User logged in but not verified, keep on auth screen
      console.log("Vennligst verifiser eposten din");
    }
  } else {
    console.log("Ikke logget inn");
    showLogin();
    
  }
});

// ============================================
// SCREEN NAVIGATION FUNCTIONS
// ============================================

// Show register screen
function showRegister() {
  document.getElementById("register-screen").classList.remove("hidden");
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("main-page").classList.add("hidden");
  document.getElementById("main-content").classList.add("hidden");
}

// Show login screen
function showLogin() {
  document.getElementById("register-screen").classList.add("hidden");
  document.getElementById("login-screen").classList.remove("hidden");
  document.getElementById("main-page").classList.add("hidden");
  document.getElementById("main-content").classList.add("hidden");
}

// Show main threads page
function showMainPage() {
  document.getElementById("register-screen").classList.add("hidden");
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("main-page").classList.remove("hidden");
  document.getElementById("main-content").classList.remove("hidden");
}

// ============================================
// TOGGLE BETWEEN LOGIN/REGISTER
// ============================================
document.getElementById("go-to-login").addEventListener("click", showLogin);
document.getElementById("go-to-register").addEventListener("click", showRegister);

// ============================================
// LOGOUT FUNCTIONALITY
// Add this when user clicks profile button or logout
// ============================================
// Example: Add logout to profile button (you can customize this)
document.querySelector(".profile-btn").addEventListener("click", () => {
  const confirmLogout = confirm("Vil du logge ut?");
  if (confirmLogout) {
    loggUt();
    showLogin();
  }
});

// ============================================ show name in profile ============================================ //
overvåkBruker( async (user) => {
  if (user) {
    let displayName = user.displayName || "Bruker";
    //document.getElementById("profileName").textContent = displayName;
    let initals_els = document.querySelectorAll(".initials");
    initals_els.forEach(el => el.textContent = displayName.split(" ").map(n => n[0]).join("").toUpperCase());
    }
});


//show online people from each school
const schoolContainer = document.getElementById("online-counter"); // your card container

overvåkOnlineBrukere((onlineBySchool) => {
  // Remove old school info elements
  const oldInfos = schoolContainer.querySelectorAll(".school-info");
  oldInfos.forEach(el => el.remove());

  // Sort schools alphabetically
  const sortedSchools = Object.keys(onlineBySchool).sort();

  // Create new elements for each school
  sortedSchools.forEach(school => {
    const schoolInfo = document.createElement("div");
    schoolInfo.classList.add("school-info");

    const schoolName = document.createElement("span");
    schoolName.classList.add("school-name");
    schoolName.textContent = school;

    const schoolCount = document.createElement("span");
    schoolCount.classList.add("school-count");
    schoolCount.textContent = `${onlineBySchool[school]} online`;

    schoolInfo.appendChild(schoolName);
    schoolInfo.appendChild(schoolCount);
    schoolContainer.appendChild(schoolInfo);
  });
});

//hashtag sidebar:

const trendingContainer = document.getElementById("popular-hashtags"); // second card (Populært nå)

overvåkTrendingHashtags((trending) => {
  // Remove old topics
  const oldItems = trendingContainer.querySelectorAll(".trending-item");
  oldItems.forEach(el => el.remove());

  trending.forEach(([tag, count]) => {
    const item = document.createElement("div");
    item.classList.add("trending-item");

    const topic = document.createElement("div");
    topic.classList.add("trending-topic");
    topic.textContent = `#${tag}`;

    const countEl = document.createElement("div");
    countEl.classList.add("trending-count");
    countEl.textContent = `${count} tråder`;

    item.appendChild(topic);
    item.appendChild(countEl);
    trendingContainer.appendChild(item);
  });
});

// ==========================================
// switch between recent and popular search

document.getElementById("popular").addEventListener("click", () => {
  sortThreadsBy = "popular"
  const recent = document.getElementById("nylig")
  recent.classList.remove("active")
  const popular = document.getElementById("popular")
  popular.classList.add("active")
  
  // Trigger manual sort without recreating everything
  isManualSort = true;
  applySorting(schoolfilter, null, document.getElementById("Threads"));
})

document.getElementById("nylig").addEventListener("click", () => {
  sortThreadsBy = "recent"
  const recent = document.getElementById("nylig")
  recent.classList.add("active")
  const popular = document.getElementById("popular")
  popular.classList.remove("active")
  
  // Trigger manual sort without recreating everything
  isManualSort = true;
  applySorting(schoolfilter, null, document.getElementById("Threads"));
})

document.getElementById("schoolFilter").addEventListener("change", (e) => {
  schoolfilter = e.target.value
  isManualSort = true;
  applySorting(schoolfilter, null, document.getElementById("Threads"));
});

visTråderLive()
