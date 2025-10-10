import {
  registrerBruker,
  loggInn,
  loggUt,
  overvåkBruker,
  leggTilDokument,
  visDokumenterLive,
  hentDokumenter,
  hentSkole,
  toggleVote,
  updateUserPresence,
  overvåkOnlineBrukere,
  overvåkTrendingHashtags,
  createNotification,
  markNotificationRead,
  markAllNotificationsRead,
  overvåkNotifications,
  slettDokument,
  getadmin,
  isBanned
} from "./utils.js";


let sortThreadsBy = "recent";
let schoolfilter = "Alle skoler"
let currentHashtag = null;
let currentUser = null;
let visibleThreadLimit = 10;
let admin = false;


// ============================================
// POST THREAD FUNCTIONALITY
// ============================================

document.getElementById("post-thread").addEventListener("submit", async (e) => {
  e.preventDefault();

  const content = e.target.querySelector("textarea").value;
  post(content);
  e.target.reset();
});

function post(content, parentId = null){
  overvåkBruker(async (user) => {
    if (!user) {
      alert("Du må være logget inn for å poste!");
      return;
    }
    if (!content.trim()) {
      alert("Tråden kan ikke være tom!");
      return;
    }

    const school = await hentSkole(user.uid);
    const hashtags = [...content.matchAll(/#(\w+)/g)].map(match => match[1]);
    
    const docRef = await leggTilDokument("Threads", {
      content: content,
      authorId: user.uid,
      authorName: user.displayName || "Anonym",
      createdAt: new Date(),
      school: school,
      upvotes: [],
      downvotes: [],
      hashtags: hashtags,
      parentId: parentId
    });
    
    if (parentId) {
      const parentThread = currentThreadsData.find(t => t.id === parentId);
      
      if (parentThread && parentThread.authorId !== user.uid) {
        await createNotification(parentThread.authorId, "reply", {
          threadId: parentId,
          actorName: user.displayName || "Anonym",
          content: content
        });
      }
    }
    
    alert("Postet!");
  });
}


// ============================================
// UTILITY FUNCTIONS
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


// ============================================
// UPVOTE/DOWNVOTE FUNCTIONALITY
// ============================================

function upvoteThread(threadId) {
  overvåkBruker(async (user) => {
    if (!user) {
      alert("Du må være logget inn for å stemme!");
      return;
    }

    const thread = currentThreadsData.find(t => t.id === threadId);
    if (!thread) return;

    const wasUpvoted = thread.upvotes?.includes(user.uid);

    await toggleVote(threadId, user.uid, 'upvote');

    if (!wasUpvoted && thread.authorId !== user.uid) {
      await createNotification(thread.authorId, "upvote", {
        threadId: thread.parentId || threadId,
        actorName: user.displayName || "Anonym",
        content: thread.content
      });
    }
  });
}

function downvoteThread(threadId) {
  overvåkBruker(async (user) => {
    if (!user) {
      alert("Du må være logget inn for å stemme!");
      return;
    }

    await toggleVote(threadId, user.uid, 'downvote');
  });
}


// ============================================
// THREAD DISPLAY & SORTING
// ============================================

let currentThreadsData = [];

function visTråderLive() {
  const container = document.getElementById("Threads");

  visDokumenterLive("Threads", (docs) => {
    if (!Array.isArray(docs)) return;

    currentThreadsData = docs;
    applySorting(schoolfilter, currentUser, container);
  });
}

function applySorting(selectedSchool, user, container) {
  const activeUser = user || currentUser;
  
  let baseFiltered = currentThreadsData.filter(thread => thread && !thread.parentId);
  if (selectedSchool !== "Alle skoler") {
    baseFiltered = baseFiltered.filter(thread => thread && thread.school === selectedSchool);
  }

  const sortFn = (a, b) => {
    if (sortThreadsBy === "recent") {
      const aMillis = a?.createdAt?.toMillis ? a.createdAt.toMillis() : (new Date(a.createdAt)).getTime();
      const bMillis = b?.createdAt?.toMillis ? b.createdAt.toMillis() : (new Date(b.createdAt)).getTime();
      return bMillis - aMillis;
    } else if (sortThreadsBy === "popular") {
      const aScore = (a.upvotes?.length || 0) - (a.downvotes?.length || 0);
      const bScore = (b.upvotes?.length || 0) - (b.downvotes?.length || 0);
      return bScore - aScore;
    }
    return 0;
  };

  let filteredDocs;
  if (currentHashtag) {
    const withTag = baseFiltered.filter(t => t.hashtags?.includes(currentHashtag));
    const withoutTag = baseFiltered.filter(t => !t.hashtags?.includes(currentHashtag));
    withTag.sort(sortFn);
    withoutTag.sort(sortFn);
    filteredDocs = [...withTag, ...withoutTag];
  } else {
    filteredDocs = baseFiltered;
    filteredDocs.sort(sortFn);
  }

  const existingThreads = new Map();
  container.querySelectorAll('.thread-card').forEach(threadEl => {
    const threadId = threadEl.dataset.id;
    if (threadId) {
      existingThreads.set(threadId, threadEl);
    }
  });

  filteredDocs.slice(0, visibleThreadLimit).forEach((data, index) => {
    const commentCount = currentThreadsData.filter(d => d.parentId === data.id).length;
    const existingThread = existingThreads.get(data.id);
    
    if (existingThread) {
      updateThreadContent(existingThread, data, activeUser, commentCount);
      existingThreads.delete(data.id);
      
      const currentIndex = Array.from(container.children).indexOf(existingThread);
      if (currentIndex !== index) {
        if (index >= container.children.length) {
          container.appendChild(existingThread);
        } else {
          container.insertBefore(existingThread, container.children[index]);
        }
      }
    } else {
      let postEl = getThread(data, activeUser, container, commentCount);
      if (index >= container.children.length) {
        container.appendChild(postEl);
      } else {
        container.insertBefore(postEl, container.children[index]);
      }
    }
  });

  existingThreads.forEach((threadEl) => {
    threadEl.remove();
  });

  const oldButton = container.querySelector(".load-more-btn");
  if (oldButton) oldButton.remove();

  if (filteredDocs.length > visibleThreadLimit) {
    const loadMore = document.createElement("button");
    loadMore.classList.add("tab-btn", "load-more-btn");
    loadMore.textContent = "Last inn flere tråder";
    loadMore.style.display = "block";
    loadMore.style.margin = "20px auto";

    container.appendChild(loadMore);

    loadMore.addEventListener("click", () => {
      visibleThreadLimit += 10;
      applySorting(selectedSchool, activeUser, container);
    });
  }
}

function updateThreadContent(threadEl, data, activeUser, commentCount) {
  const upvotes = data.upvotes?.length || 0;
  const downvotes = data.downvotes?.length || 0;
  const score = upvotes - downvotes;

  const voteDiv = threadEl.querySelector('.vote');
  if (voteDiv) {
    const upvoteImg = voteDiv.querySelector('img[alt="Upvote"]');
    const downvoteImg = voteDiv.querySelector('img[alt="Downvote"]');
    
    const userUpvoted = activeUser && data.upvotes?.includes(activeUser.uid);
    const userDownvoted = activeUser && data.downvotes?.includes(activeUser.uid);

    if (upvoteImg) {
      upvoteImg.style.opacity = userUpvoted ? "1" : "0.5";
    }
    if (downvoteImg) {
      downvoteImg.style.opacity = userDownvoted ? "1" : "0.5";
    }

    let scoreDisplay = voteDiv.querySelector('.vote-score');
    if (!scoreDisplay) {
      scoreDisplay = document.createElement('span');
      scoreDisplay.classList.add('vote-score');
      voteDiv.insertBefore(scoreDisplay, downvoteImg);
    }
    scoreDisplay.textContent = score > 0 ? `+${score}` : score.toString();
    scoreDisplay.style.color = score > 0 ? '#2ecc71' : score < 0 ? '#e74c3c' : '#95a5a6';
  }

  const commentBtn = threadEl.querySelector('.action-btn.comment');
  if (commentBtn) {
    commentBtn.textContent = `💬 ${commentCount || 0}`;
  }

  threadEl._threadData = data;
}


// ============================================
// CREATE THREAD ELEMENT
// ============================================

function getThread(data, activeUser, container, commentcount) {
  const postEl = document.createElement("div");
  postEl.classList.add("thread-card");
  postEl.dataset.id = data.id;
  postEl._threadData = data;

  const header = document.createElement("div");
  header.classList.add("thread-header");

  const avatar = document.createElement("div");
  avatar.classList.add("user-avatar");
  avatar.textContent = String(getInitials(data.authorName || "A"));

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

  const contentEl = document.createElement("div");
  contentEl.classList.add("thread-content");
  contentEl.textContent = String(data.content || "");

  const actions = document.createElement("div");
  actions.classList.add("thread-actions");

  const vote = document.createElement("div");
  vote.classList.add("vote");

  const upvote = document.createElement("img");
  upvote.src = "imgs/upvote.png";
  upvote.alt = "Upvote";
  upvote.style.cursor = "pointer";
  upvote.style.width = "24px";
  upvote.style.height = "24px";

  const upvotes = data.upvotes?.length || 0;
  const downvotes = data.downvotes?.length || 0;
  const score = upvotes - downvotes;

  const userUpvoted = activeUser && data.upvotes?.includes(activeUser.uid);
  const userDownvoted = activeUser && data.downvotes?.includes(activeUser.uid);

  upvote.style.opacity = userUpvoted ? "1" : "0.5";

  // toggle both downvote and upvote button with adding .active if they are pressed

  const scoreDisplay = document.createElement("span");
  scoreDisplay.classList.add("vote-score");
  scoreDisplay.textContent = score > 0 ? `+${score}` : score.toString();
  scoreDisplay.style.fontWeight = "bold";
  scoreDisplay.style.margin = "0 8px";
  scoreDisplay.style.color = score > 0 ? '#2ecc71' : score < 0 ? '#e74c3c' : '#95a5a6';

  const downvote = document.createElement("img");
  downvote.src = "imgs/downvote.png";
  downvote.alt = "Downvote";
  downvote.style.cursor = "pointer";
  downvote.style.width = "24px";
  downvote.style.height = "24px";
  downvote.style.opacity = userDownvoted ? "1" : "0.5";

  vote.appendChild(upvote);
  vote.appendChild(scoreDisplay);
  vote.appendChild(downvote);

  upvote.addEventListener("click", () => {
    if (!currentUser) return alert("Du må være logget inn for å stemme!");
    upvoteThread(data.id);
  });

  downvote.addEventListener("click", () => {
    if (!currentUser) return alert("Du må være logget inn for å stemme!");
    downvoteThread(data.id);
  });

  const commentBtn = document.createElement("button");
  commentBtn.classList.add("action-btn", "comment");
  commentBtn.textContent = `💬 ${commentcount || 0}`;

  commentBtn.addEventListener("click", () => {
    if (!currentUser) return alert("Du må være logget inn for å kommentere!");
    togglecommentsection(data.id, currentUser, postEl);
  });

  if (admin) {
    const deleteBtn = document.createElement("button");
    deleteBtn.classList.add("action-btn", "delete");
    deleteBtn.textContent = "🗑️";

    deleteBtn.addEventListener("click", () => {
      if (confirm("Er du sikker på at du vil slette denne tråden?")) {
        slettDokument("Threads", data.id);
      }
    });

    actions.appendChild(deleteBtn);
  }

  if (currentUser && !admin) {
    const reportBtn = document.createElement("button");
    reportBtn.classList.add("action-btn", "report");
    reportBtn.textContent = "🚨 Report";

    reportBtn.addEventListener("click", async () => {
      if (confirm("Er du sikker på at du vil rapportere denne tråden?")) {
        await leggTilDokument("reports", {
          threadId: data.id,
          reporterId: currentUser.uid,
          reporterName: currentUser.displayName || "Anonym",
          createdAt: new Date(),
          status: "pending"
        });
        alert("Rapportert!");
      }
    });

    actions.appendChild(reportBtn);
  }

  actions.appendChild(vote);
  actions.appendChild(commentBtn);

  postEl.appendChild(header);
  postEl.appendChild(contentEl);
  postEl.appendChild(actions);

  return postEl;
}


// ============================================
// COMMENTS FUNCTIONALITY
// ============================================

function togglecommentsection(threadId, user, container, isNested = false) {
  const targetEl = isNested ? container : container.closest('.thread-card') || container;
  
  let existing = targetEl.querySelector(".comments-section");
  if (existing) {
    if (existing.cleanup) {
      existing.cleanup();
    }
    existing.remove();
    return;
  }

  const commentsSection = document.createElement("div");
  commentsSection.classList.add("comments-section");

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

  const commentsList = document.createElement("div");
  commentsList.classList.add("comments-list");

  commentsSection.appendChild(form);
  commentsSection.appendChild(commentsList);
  targetEl.appendChild(commentsSection);

  const cleanup = visKommentarerLive(threadId, commentsList, user, isNested);
  
  if (cleanup) {
    commentsSection.cleanup = cleanup;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const content = textarea.value.trim();
    if (!content) return;

    await post(content, threadId);
    textarea.value = "";
  });
}

function visKommentarerLive(parentId, commentsList, user, isNested = false) {
  const updateComments = (docs) => {
    const comments = docs.filter(d => d.parentId === parentId);

    comments.sort((a, b) => {
      const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt).getTime();
      const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt).getTime();
      return bTime - aTime;
    });

    const existingComments = new Map();
    commentsList.querySelectorAll('.comment-card').forEach(commentEl => {
      const commentId = commentEl.dataset.id;
      if (commentId) {
        existingComments.set(commentId, commentEl);
      }
    });

    comments.forEach((comment, index) => {
      const existingComment = existingComments.get(comment.id);
      
      if (existingComment) {
        updateCommentContent(existingComment, comment);
        existingComments.delete(comment.id);
        
        const currentIndex = Array.from(commentsList.children).indexOf(existingComment);
        if (currentIndex !== index) {
          if (index >= commentsList.children.length) {
            commentsList.appendChild(existingComment);
          } else {
            commentsList.insertBefore(existingComment, commentsList.children[index]);
          }
        }
      } else {
        const card = createCommentCard(comment, isNested, user);
        if (index >= commentsList.children.length) {
          commentsList.appendChild(card);
        } else {
          commentsList.insertBefore(card, commentsList.children[index]);
        }
      }
    });

    existingComments.forEach((commentEl) => {
      commentEl.remove();
    });
  };

  visDokumenterLive("Threads", updateComments);
  commentsList._isActive = true;
  
  return () => {
    commentsList._isActive = false;
  };
}

function updateCommentContent(commentEl, comment) {
  const upvotes = comment.upvotes?.length || 0;
  const downvotes = comment.downvotes?.length || 0;
  const score = upvotes - downvotes;

  const voteDiv = commentEl.querySelector('.vote');
  if (voteDiv) {
    const upvoteImg = voteDiv.querySelector('img[alt="Upvote"]');
    const downvoteImg = voteDiv.querySelector('img[alt="Downvote"]');
    
    const userUpvoted = currentUser && comment.upvotes?.includes(currentUser.uid);
    const userDownvoted = currentUser && comment.downvotes?.includes(currentUser.uid);

    if (upvoteImg) upvoteImg.style.opacity = userUpvoted ? "1" : "0.5";
    if (downvoteImg) downvoteImg.style.opacity = userDownvoted ? "1" : "0.5";

    let scoreDisplay = voteDiv.querySelector('.vote-score');
    if (scoreDisplay) {
      scoreDisplay.textContent = score > 0 ? `+${score}` : score.toString();
      scoreDisplay.style.color = score > 0 ? '#2ecc71' : score < 0 ? '#e74c3c' : '#95a5a6';
    }
  }
}

function createCommentCard(comment, isNested, user) {
  const card = document.createElement("div");
  card.classList.add("comment-card");
  card.dataset.id = comment.id;
  if (isNested) card.classList.add("nested-comment");

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

  const content = document.createElement("div");
  content.classList.add("comment-content");
  content.textContent = comment.content;

  const actions = document.createElement("div");
  actions.classList.add("comment-actions");

  const vote = document.createElement("div");
  vote.classList.add("vote", "small");

  const upvote = document.createElement("img");
  upvote.src = "imgs/upvote.png";
  upvote.alt = "Upvote";
  upvote.style.cursor = "pointer";
  upvote.style.width = "18px";
  upvote.style.height = "18px";

  const upvotes = comment.upvotes?.length || 0;
  const downvotes = comment.downvotes?.length || 0;
  const score = upvotes - downvotes;

  const userUpvoted = currentUser && comment.upvotes?.includes(currentUser.uid);
  const userDownvoted = currentUser && comment.downvotes?.includes(currentUser.uid);

  upvote.style.opacity = userUpvoted ? "1" : "0.5";

  const scoreDisplay = document.createElement("span");
  scoreDisplay.classList.add("vote-score");
  scoreDisplay.textContent = score > 0 ? `+${score}` : score.toString();
  scoreDisplay.style.fontSize = "0.85rem";
  scoreDisplay.style.margin = "0 6px";
  scoreDisplay.style.color = score > 0 ? '#2ecc71' : score < 0 ? '#e74c3c' : '#95a5a6';

  const downvote = document.createElement("img");
  downvote.src = "imgs/downvote.png";
  downvote.alt = "Downvote";
  downvote.style.cursor = "pointer";
  downvote.style.width = "18px";
  downvote.style.height = "18px";
  downvote.style.opacity = userDownvoted ? "1" : "0.5";

  vote.appendChild(upvote);
  vote.appendChild(scoreDisplay);
  vote.appendChild(downvote);

  upvote.addEventListener("click", () => {
    if (!currentUser) return alert("Du må være logget inn for å stemme!");
    upvoteThread(comment.id);
  });

  downvote.addEventListener("click", () => {
    if (!currentUser) return alert("Du må være logget inn for å stemme!");
    downvoteThread(comment.id);
  });

  const replyBtn = document.createElement("button");
  replyBtn.classList.add("action-btn", "small");
  replyBtn.textContent = "💬 Svar";

  replyBtn.addEventListener("click", () => {
    if (!currentUser) return alert("Du må være logget inn for å svare!");
    togglecommentsection(comment.id, currentUser, card, true);
  });

  actions.appendChild(vote);
  actions.appendChild(replyBtn);

  card.appendChild(header);
  card.appendChild(content);
  card.appendChild(actions);

  if (!isNested) {
    const nestedCommentsList = document.createElement("div");
    nestedCommentsList.classList.add("nested-comments-list");
    card.appendChild(nestedCommentsList);
    visKommentarerLive(comment.id, nestedCommentsList, user, true);
  }

  return card;
}


// ============================================
// AUTH FORMS
// ============================================

document.getElementById("register-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.getElementById("regEmail").value;
  const pass = document.getElementById("regPass").value;
  const name = document.getElementById("regName").value;
  const school = document.getElementById("regSchool").value;

  try {
    await registrerBruker(email, pass, name, school);
    alert("Bruker opprettet, sjekk skole-eposten din!");
  } catch (err) {
    alert("Feil: " + err.message);
  }
});

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.getElementById("loginEmail").value;
  const pass = document.getElementById("loginPass").value;
  
  try {
    await loggInn(email, pass);
    alert("Logget inn!");
    showMainPage();
  } catch (err) {
    alert("Feil: " + err.message);
  }
});


// ============================================
// SCREEN NAVIGATION
// ============================================

function showRegister() {
  document.getElementById("register-screen").classList.remove("hidden");
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("main-page").classList.add("hidden");
  document.getElementById("main-content").classList.add("hidden");
}

function showLogin() {
  document.getElementById("register-screen").classList.add("hidden");
  document.getElementById("login-screen").classList.remove("hidden");
  document.getElementById("main-page").classList.add("hidden");
  document.getElementById("main-content").classList.add("hidden");
}

function showMainPage() {
  document.getElementById("register-screen").classList.add("hidden");
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("main-page").classList.remove("hidden");
  document.getElementById("main-content").classList.remove("hidden");
}

document.getElementById("go-to-login").addEventListener("click", showLogin);
document.getElementById("go-to-register").addEventListener("click", showRegister);

document.querySelector(".profile-btn").addEventListener("click", () => {
  const confirmLogout = confirm("Vil du logge ut?");
  if (confirmLogout) {
    loggUt();
    showLogin();
  }
});


// ============================================
// USER PRESENCE & STATS
// ============================================

overvåkBruker(async (user) => {
  if (user) {
    let displayName = user.displayName || "Bruker";
    let initals_els = document.querySelectorAll(".initials");
    initals_els.forEach(el => el.textContent = displayName.split(" ").map(n => n[0]).join("").toUpperCase());
  }
});

const schoolContainer = document.getElementById("online-counter");

overvåkOnlineBrukere((onlineBySchool) => {
  const oldInfos = schoolContainer.querySelectorAll(".school-info");
  oldInfos.forEach(el => el.remove());

  const sortedSchools = Object.keys(onlineBySchool).sort();

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

const trendingContainer = document.getElementById("popular-hashtags");

overvåkTrendingHashtags((trending) => {
  const oldItems = trendingContainer.querySelectorAll(".trending-item");
  oldItems.forEach(el => el.remove());

  trending.sort((a,b) => a[1]>b[1])
  trending = trending.slice(0,4)

  trending.forEach(([tag, count]) => {
    const item = document.createElement("div");
    item.classList.add("trending-item");

    const topic = document.createElement("div");
    topic.classList.add("trending-topic");
    topic.textContent = `#${tag}`;
    if (tag === currentHashtag) {
      topic.style.color = '#007bff';
      topic.style.fontWeight = 'bold';
    }
    topic.addEventListener("click", () => {
      const newHashtag = currentHashtag === tag ? null : tag;
      currentHashtag = newHashtag;
      document.querySelectorAll(".trending-topic").forEach(t => {
        const tTag = t.textContent.substring(1);
        if (tTag === currentHashtag) {
          t.style.color = '#007bff';
          t.style.fontWeight = 'bold';
        } else {
          t.style.color = '';
          t.style.fontWeight = '';
        }
      });
      applySorting(schoolfilter, currentUser, document.getElementById("Threads"));
    });

    const countEl = document.createElement("div");
    countEl.classList.add("trending-count");
    countEl.textContent = `${count} tråder`;

    item.appendChild(topic);
    item.appendChild(countEl);
    trendingContainer.appendChild(item);
  });
});



// ============================================
// FEED CONTROLS
// ============================================

document.getElementById("popular").addEventListener("click", () => {
  sortThreadsBy = "popular";
  document.getElementById("nylig").classList.remove("active");
  document.getElementById("popular").classList.add("active");
  applySorting(schoolfilter, currentUser, document.getElementById("Threads"));
});

document.getElementById("nylig").addEventListener("click", () => {
  sortThreadsBy = "recent";
  document.getElementById("nylig").classList.add("active");
  document.getElementById("popular").classList.remove("active");
  applySorting(schoolfilter, currentUser, document.getElementById("Threads"));
});

document.getElementById("schoolFilter").addEventListener("change", (e) => {
  schoolfilter = e.target.value;
  applySorting(schoolfilter, currentUser, document.getElementById("Threads"));
});


// ============================================
// NOTIFICATION SYSTEM
// ============================================

let notificationUnsubscribe = null;

document.getElementById("notificationBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  const panel = document.getElementById("notificationPanel");
  panel.classList.toggle("hidden");
});

document.addEventListener("click", (e) => {
  const panel = document.getElementById("notificationPanel");
  const btn = document.getElementById("notificationBtn");
  
  if (!panel.contains(e.target) && !btn.contains(e.target)) {
    panel.classList.add("hidden");
  }
});

document.getElementById("markAllRead").addEventListener("click", async () => {
  if (currentUser) {
    await markAllNotificationsRead(currentUser.uid);
  }
});

overvåkBruker(async (user) => {
  if (user && user.emailVerified) {
    if (notificationUnsubscribe) {
      notificationUnsubscribe();
    }
    
    notificationUnsubscribe = overvåkNotifications(user.uid, (notifications) => {
      displayNotifications(notifications);
      updateNotificationBadge(notifications);
    });
  } else {
    if (notificationUnsubscribe) {
      notificationUnsubscribe();
      notificationUnsubscribe = null;
    }
  }
});

function displayNotifications(notifications) {
  const list = document.getElementById("notificationList");
  
  if (notifications.length === 0) {
    list.innerHTML = '<div class="notification-empty">Ingen varsler enda</div>';
    return;
  }
  
  list.innerHTML = "";
  
  notifications.forEach(notif => {
    const item = document.createElement("div");
    item.classList.add("notification-item");
    if (!notif.read) {
      item.classList.add("unread");
    }
    
    const icon = document.createElement("div");
    icon.classList.add("notification-icon");
    
    let iconText = "💬";
    let message = "";
    
    if (notif.type === "reply") {
      iconText = "💬";
      message = `<strong>${notif.actorName}</strong> svarte på tråden din`;
    } else if (notif.type === "upvote") {
      iconText = "⬆️";
      message = `<strong>${notif.actorName}</strong> upvotet innlegget ditt`;
    } else if (notif.type === "mention") {
      iconText = "📢";
      message = `<strong>${notif.actorName}</strong> nevnte deg`;
    }
    
    icon.textContent = iconText;
    
    const content = document.createElement("div");
    content.classList.add("notification-content");
    
    const text = document.createElement("div");
    text.classList.add("notification-text");
    text.innerHTML = message;
    
    const time = document.createElement("div");
    time.classList.add("notification-time");
    time.textContent = timeAgo(notif.createdAt);
    
    content.appendChild(text);
    if (notif.content) {
      const preview = document.createElement("div");
      preview.classList.add("notification-text");
      preview.style.color = "#666";
      preview.style.fontSize = "0.85rem";
      preview.textContent = notif.content.substring(0, 60) + (notif.content.length > 60 ? "..." : "");
      content.appendChild(preview);
    }
    content.appendChild(time);
    
    item.appendChild(icon);
    item.appendChild(content);
    
    item.addEventListener("click", async () => {
      if (!notif.read) {
        await markNotificationRead(notif.id);
      }
      document.getElementById("notificationPanel").classList.add("hidden");
      
      const threadCard = document.querySelector(`[data-id="${notif.threadId}"]`);
      if (threadCard) {
        threadCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        threadCard.style.animation = 'highlight 2s ease';
      }
    });
    
    list.appendChild(item);
  });
}

function updateNotificationBadge(notifications) {
  const badge = document.getElementById("notificationBadge");
  const unreadCount = notifications.filter(n => !n.read).length;
  
  if (unreadCount > 0) {
    badge.textContent = unreadCount > 99 ? "99+" : unreadCount;
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }
}


// ============================================
// ADMIN PANEL
// ============================================

function showAdminPanel() {
  let existingPanel = document.querySelector(".adminpanel");
  if (existingPanel) existingPanel.remove();

  const overlay = document.createElement("div");
  overlay.classList.add("overlay");

  const panelHTML = `
    <h2>Admin Panel</h2>
    <div class="admin-controls">
      <button id="refresh-users">Oppdater brukere</button>
      <button id="view-users">Vis brukere</button>
      <button id="view-reports">Vis rapporter</button>
      <button id="logout-users">Logg ut alle brukere</button>
    </div>
  `;

  const el = document.createElement("div");
  el.classList.add("adminpanel");
  el.innerHTML = panelHTML;

  const listdiv = document.createElement("div");
  listdiv.classList.add("listdiv");

  el.appendChild(listdiv);
  overlay.appendChild(el);
  document.body.appendChild(overlay);

  overlay.addEventListener("click", (event) => {
    if (!el.contains(event.target)) {
      overlay.remove();
    }
  });

  el.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  document.getElementById("view-users").addEventListener("click", async () => {
    const users = await hentDokumenter("users");

    listdiv.innerHTML = "";

    users.forEach((user) => {
      const temp = document.createElement("div");
      temp.classList.add("user-entry");
      temp.textContent = user.email || JSON.stringify(user);
      temp.classList.add("temp");
      listdiv.appendChild(temp);
    });
  });

  document.getElementById("view-reports").addEventListener("click", async () => {
    const reports = await hentDokumenter("reports");

    listdiv.innerHTML = "";

    reports.forEach((report) => {
      const thread = currentThreadsData.find(t => t.id === report.threadId);
      if (!thread) {
        const temp = document.createElement("div");
        temp.classList.add("report-entry");
        temp.textContent = `Thread not found: ${report.threadId}`;
        listdiv.appendChild(temp);
        return;
      }

      const entry = document.createElement("div");
      entry.classList.add("report-entry");
      entry.style.border = "1px solid #ccc";
      entry.style.padding = "10px";
      entry.style.marginBottom = "10px";
      entry.style.borderRadius = "5px";

      const threadContent = document.createElement("div");
      threadContent.classList.add("reported-thread-content");
      threadContent.innerHTML = `
        <h4>Reported Thread by ${thread.authorName}</h4>
        <p><strong>Content:</strong> ${thread.content}</p>
        <p><strong>School:</strong> ${thread.school}</p>
        <p><strong>Created:</strong> ${timeAgo(thread.createdAt)}</p>
      `;

      const reporterInfo = document.createElement("div");
      reporterInfo.innerHTML = `
        <p><strong>Reported by:</strong> ${report.reporterName} (${report.reporterId})</p>
        <p><strong>Report time:</strong> ${timeAgo(report.createdAt)}</p>
        <p><strong>Status:</strong> ${report.status || "pending"}</p>
      `;

      const actionsDiv = document.createElement("div");
      actionsDiv.style.marginTop = "10px";

      const deleteBtn = document.createElement("button");
      deleteBtn.textContent = "Delete Post";
      deleteBtn.style.marginRight = "5px";
      deleteBtn.addEventListener("click", async () => {
        if (confirm("Delete this post?")) {
          await slettDokument("Threads", report.threadId);
          await slettDokument("reports", report.id);
          entry.remove();
        }
      });

      const banBtn = document.createElement("button");
      banBtn.textContent = "Ban User";
      banBtn.style.backgroundColor = "#e74c3c";
      banBtn.style.color = "white";
      banBtn.addEventListener("click", async () => {
        if (confirm("Ban this user?")) {
          await leggTilDokument("bans", {
            userId: thread.authorId,
            reason: "Reported thread",
            bannedAt: new Date()
          });
          await slettDokument("reports", report.id);
          entry.remove();
        }
      });

      actionsDiv.appendChild(deleteBtn);
      actionsDiv.appendChild(banBtn);

      entry.appendChild(threadContent);
      entry.appendChild(reporterInfo);
      entry.appendChild(actionsDiv);
      listdiv.appendChild(entry);
    });
  });

  document.getElementById("logout-users").addEventListener("click", () => {
    console.log("Logger ut alle brukere...");
  });
}

function enableAdminFeatures() {
  const title = document.getElementById("logo");
  title.textContent = "SkienThreads admin";

  const navbar = document.getElementById("navbar");
  
  const adminBtn = document.createElement("button");
  adminBtn.textContent = "adminpanel";
  adminBtn.classList.add("tab-btn");
  adminBtn.style.color = "blue";

  adminBtn.addEventListener("click", () => showAdminPanel());

  navbar.appendChild(adminBtn);
}


// ============================================
// AUTH STATE MONITORING
// ============================================

window.addEventListener("DOMContentLoaded", () => {
  showMainPage();
});

// 2. Replace profile icon with "Logg inn" button if not logged in
function updateNavForAuth(user) {
  const navActions = document.querySelector(".nav-actions");
  let profileBtn = navActions.querySelector(".profile-btn");
  let loginBtn = navActions.querySelector(".login-btn");

  if (user) {
    // Show profile button, hide login button
    if (!profileBtn) {
      profileBtn = document.createElement("button");
      profileBtn.className = "profile-btn initials";
      navActions.appendChild(profileBtn);
    }
    if (loginBtn) loginBtn.remove();
    profileBtn.textContent = getInitials(user.displayName || "Bruker");
    profileBtn.onclick = () => {
      if (confirm("Vil du logge ut?")) {
        loggUt();
        showLogin();
      }
    };
  } else {
    // Show login button, hide profile button
    if (!loginBtn) {
      loginBtn = document.createElement("button");
      loginBtn.className = "btn btn-primary login-btn";
      loginBtn.textContent = "Logg inn";
      loginBtn.onclick = showLogin;
      navActions.appendChild(loginBtn);
    }
    if (profileBtn) profileBtn.remove();
  }
}

// 3. Hide features that require login
function updateUIForAuth(user) {
  // Hide post thread box if not logged in
  const postThreadForm = document.getElementById("post-thread");
  if (postThreadForm) {
    postThreadForm.style.display = user ? "" : "none";
  }
  // Hide notification bell if not logged in
  const notifBtn = document.getElementById("notificationBtn");
  if (notifBtn) notifBtn.style.display = user ? "" : "none";
}

// ...existing code...

// Add this once on page load (e.g., in DOMContentLoaded) to handle offline only once
if (!window._presenceListenerAdded) {
  window.addEventListener("beforeunload", () => {
    if (currentUser?.uid) {
      updateUserPresence(currentUser.uid, "offline");
    }
  });
  window._presenceListenerAdded = true;
}

overvåkBruker(async (user) => {
  currentUser = user;
  updateNavForAuth(user);
  updateUIForAuth(user);

  if (!user) {
    // Guest: Allow browsing, show login prompt if desired
    return;
  }

  try {
    const banned = await isBanned(user.uid);
    if (banned) {
      document.body.innerHTML = "<h1>You're banned, buddy!</h1>";
      return;  // Stop here
    }

    if (user.emailVerified) {
      showMainPage();
      await updateUserPresence(user.uid, "online");

      const isAdmin = await getadmin(user.uid);
      if (isAdmin === true) {
        enableAdminFeatures();
        admin = true;
      }
    } else {
      // Email not verified: Handle as needed (e.g., show verification prompt)
      alert("Please verify your email before continuing.");
      showLogin();  // Or redirect appropriately
    }
  } catch (error) {
    console.error("Auth check failed:", error);
    // Fallback: Treat as guest or show error UI
  }
});




// ============================================
// INITIALIZE
// ============================================

visTråderLive();