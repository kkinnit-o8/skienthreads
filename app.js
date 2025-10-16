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
  isBanned,
  votePoll,
  startPresenceKeepAlive,
  getUserByUsername,
  monitorEmailVerification
} from "./utils.js";

let sortThreadsBy = "recent";
let schoolFilter = "Alle skoler";
let currentHashtag = null;
let currentUser = null;
let visibleThreadLimit = 10;
let admin = false;
let notificationUnsubscribe = null;
let lastPostTime = 0;

// ============================================
// POST THREAD FUNCTIONALITY
// ============================================

document.getElementById("post-thread").addEventListener("submit", async (e) => {
  e.preventDefault();
  const content = e.target.querySelector("textarea").value;
  const pollToggle = document.getElementById("poll-toggle");
  await post(content, e.target);
});

async function post(content, formElement, parentId = null) {
  if (!currentUser) {
    showToast({
      type: "error",
      title: "Logg inn påkrevd",
      message: "Du må være logget inn for å poste!",
      duration: 3000
    });
    return;
  }
  if (!content.trim()) {
    showToast({
      type: "error",
      title: "Tom tråd",
      message: "Tråden kan ikke være tom!",
      duration: 3000
    });
    return;
  }

  if (content.length > 1000) {
  showToast({
    type: "error",
    title: "For langt innhold",
    message: "Tråder og kommentarer kan ikke overstige 1000 tegn!",
    duration: 3000
  });
  return;
}

  const now = Date.now();
  if (now - lastPostTime < 10000) {
    showToast({
      type: "error",
      title: "Rate limit",
      message: "Du kan bare poste én gang hvert 10. sekund!",
      duration: 3000
    });
    return;
  }

  const school = await hentSkole(currentUser.uid);
  const hashtags = [...content.matchAll(/#(\w+)/g)].map(match => match[1].toLowerCase());

  let pollData = null;
  const pollToggle = document.getElementById("poll-toggle");
  if (pollToggle?.checked) {
    const question = document.getElementById("poll-question")?.value.trim();

    if (question.length > 300) {
      showToast({
        type: "error",
        title: "For langt spørsmål",
        message: "Spørsmålet i pollen kan ikke overstige 300 tegn!",
        duration: 3000
      });
      return;
}

    const optionInputs = document.querySelectorAll(".poll-option input");
const options = Array.from(optionInputs)
  .map(input => {
    const text = input.value.trim();
    if (text.length > 200) {
      showToast({
        type: "error",
        title: "For langt alternativ",
        message: "Hvert alternativ kan maks være 200 tegn!",
        duration: 3000
      });
      throw new Error("Poll option too long");
    }
    return { text, votes: [] };
  })
  .filter(opt => opt.text);

    if (!question) {
      showToast({
        type: "error",
        title: "Spørsmål påkrevd",
        message: "Pollspørsmål må fylles ut!",
        duration: 3000
      });
      return;
    }
    if (options.length < 2 || options.length > 5) {
      showToast({
        type: "error",
        title: "Ugyldig antall valg",
        message: "Avstemningen trenger 2–5 ikke-tomme valgmuligheter!",
        duration: 3000
      });
      return;
    }
    pollData = { isPoll: true, question, options, votedBy: [] };
  }

  try {
    const threadData = {
      content,
      authorId: currentUser.uid,
      authorName: currentUser.displayName || "Anonym",
      createdAt: new Date(),
      school,
      upvotes: [],
      downvotes: [],
      hashtags,
      parentId,
      poll: pollData
    };
    const docRef = await leggTilDokument("Threads", threadData);
    lastPostTime = now;

    if (parentId) {
      const parentThread = currentThreadsData.find(t => t.id === parentId);
      if (parentThread && parentThread.authorId !== currentUser.uid) {
        await createNotification(parentThread.authorId, "reply", {
          threadId: parentId,
          actorName: currentUser.displayName || "Anonym",
          content
        });
      }
    }

    if (formElement) {
      formElement.reset();
      const pollForm = document.getElementById("poll-form");
      if (pollForm) {
        pollForm.classList.add("hidden");
        document.getElementById("poll-question").value = "";
        document.getElementById("poll-question").removeAttribute("required");
        const pollOptionsContainer = document.getElementById("poll-options");
        pollOptionsContainer.innerHTML = `
          <div class="poll-option"><input type="text" placeholder="Option 1"></div>
          <div class="poll-option"><input type="text" placeholder="Option 2"></div>
        `;
        pollOptionsContainer.querySelectorAll("input").forEach(input => input.removeAttribute("required"));
        pollToggle.checked = false;
      }
    }

    showToast({
      type: "success",
      title: "Suksess",
      message: "Tråden ble postet!",
      duration: 3000
    });
  } catch (error) {
    console.error("Error posting thread:", error);
    showToast({
      type: "error",
      title: "Feil ved posting",
      message: `Feil: ${error.message}`,
      duration: 5000
    });
  }
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
// VOTING FUNCTIONALITY
// ============================================

async function upvoteThread(threadId) {
  if (!currentUser) {
    showToast({
      type: "error",
      title: "Logg inn påkrevd",
      message: "Du må være logget inn for å stemme!",
      duration: 3000
    });
    const threadEl = document.querySelector(`[data-id="${threadId}"]`);
if (threadEl) {
  threadEl.scrollIntoView({ behavior: "smooth", block: "center" });
}
    return;
  }

  const thread = currentThreadsData.find(t => t.id === threadId);
  if (!thread) return;

  const wasUpvoted = thread.upvotes?.includes(currentUser.uid);

  try {
    await toggleVote(threadId, currentUser.uid, "upvote");
    if (!wasUpvoted && thread.authorId !== currentUser.uid) {
      await createNotification(thread.authorId, "upvote", {
        threadId: thread.parentId || threadId,
        actorName: currentUser.displayName || "Anonym",
        content: thread.content
      });
    }
  } catch (error) {
    console.error("Error upvoting:", error);
    showToast({
      type: "error",
      title: "Feil ved stemming",
      message: `Kunne ikke upvote: ${error.message}`,
      duration: 5000
    });
  }
}

async function downvoteThread(threadId) {
  if (!currentUser) {
    showToast({
      type: "error",
      title: "Logg inn påkrevd",
      message: "Du må være logget inn for å stemme!",
      duration: 3000
    });
    const threadEl = document.querySelector(`[data-id="${threadId}"]`);
if (threadEl) {
  threadEl.scrollIntoView({ behavior: "smooth", block: "center" });
}
    return;
  }

  try {
    await toggleVote(threadId, currentUser.uid, "downvote");
  } catch (error) {
    console.error("Error downvoting:", error);
    showToast({
      type: "error",
      title: "Feil ved stemming",
      message: `Kunne ikke downvote: ${error.message}`,
      duration: 5000
    });
  }
}

async function voteOnPoll(threadId, userId, optionIndex) {
  if (!userId) {
    showToast({
      type: "error",
      title: "Logg inn påkrevd",
      message: "Du må være logget inn for å stemme!",
      duration: 3000
    });
    return;
  }
  try {
    await votePoll(threadId, userId, optionIndex);
    showToast({
      type: "success",
      title: "Stemme registrert",
      message: "Din stemme ble registrert!",
      duration: 3000
    });

    // Find the thread element and update its content
    const threadEl = document.querySelector(`[data-id="${threadId}"]`);
    if (threadEl) {
      const threadData = currentThreadsData.find(t => t.id === threadId);
      if (threadData) {
        const commentCount = currentThreadsData.filter(d => d.parentId === threadId).length;
        updateThreadContent(threadEl, threadData, currentUser, commentCount);
        threadEl.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  } catch (error) {
    console.error("Error voting on poll:", error);
    showToast({
      type: "error",
      title: "Feil ved avstemning",
      message: `Feil: ${error.message}`,
      duration: 5000
    });
  }
}

// ============================================
// THREAD DISPLAY & SORTING
// ============================================

let currentThreadsData = [];

function visTråderLive() {
  const container = document.getElementById("Threads");
  container.innerHTML = "";
  visDokumenterLive("Threads", (docs) => {
    if (!Array.isArray(docs)) {
      console.error("Invalid data from visDokumenterLive:", docs);
      return;
    }
    currentThreadsData = docs;
    applySorting(schoolFilter, currentUser, container);
  });
}

function applySorting(selectedSchool, user, container) {
  const activeUser = user || currentUser;
  let baseFiltered = currentThreadsData.filter(thread => thread && !thread.parentId);
  if (selectedSchool !== "Alle skoler") {
    baseFiltered = baseFiltered.filter(thread => thread?.school === selectedSchool);
  }

const sortFn = (a, b) => {
  if (sortThreadsBy === "recent") {
    const aMillis = a?.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt).getTime();
    const bMillis = b?.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt).getTime();
    return bMillis - aMillis;
  } else if (sortThreadsBy === "popular") {
    const aNetVotes = (a.upvotes?.length || 0) - (a.downvotes?.length || 0);
    const bNetVotes = (b.upvotes?.length || 0) - (b.downvotes?.length || 0);
    const aPollVotes = a.poll?.votedBy?.length || 0;
    const bPollVotes = b.poll?.votedBy?.length || 0;
    const aComments = currentThreadsData.filter(d => d.parentId === a.id).length;
    const bComments = currentThreadsData.filter(d => d.parentId === b.id).length;
    const aPollDiff = aPollVotes > aNetVotes ? aPollVotes - aNetVotes : 0;
    const bPollDiff = bPollVotes > bNetVotes ? bPollVotes - bNetVotes : 0;
    const aScore = aNetVotes + aPollVotes + aComments + aPollDiff;
    const bScore = bNetVotes + bPollVotes + bComments + bPollDiff;
    return bScore - aScore;
  } else if (sortThreadsBy === "hot") {
    const now = Date.now();
    const aMillis = a?.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt).getTime();
    const bMillis = b?.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt).getTime();
    const aAgeHours = (now - aMillis) / (1000 * 60 * 60);
    const bAgeHours = (now - bMillis) / (1000 * 60 * 60);
    const aNetVotes = (a.upvotes?.length || 0) - (a.downvotes?.length || 0);
    const bNetVotes = (b.upvotes?.length || 0) - (b.downvotes?.length || 0);
    const aPollVotes = a.poll?.votedBy?.length || 0;
    const bPollVotes = b.poll?.votedBy?.length || 0;
    const aComments = currentThreadsData.filter(d => d.parentId === a.id).length;
    const bComments = currentThreadsData.filter(d => d.parentId === b.id).length;
    const aPollDiff = aPollVotes > aNetVotes ? aPollVotes - aNetVotes : 0;
    const bPollDiff = bPollVotes > bNetVotes ? bPollVotes - bNetVotes : 0;
    const aScore = aNetVotes + aPollVotes + aComments + aPollDiff;
    const bScore = bNetVotes + bPollVotes + bComments + bPollDiff;
    const aHotScore = aScore / (aAgeHours + 2);
    const bHotScore = bScore / (bAgeHours + 2);
    return bHotScore - aHotScore;
  }
  return 0;
};

  let filteredDocs = currentHashtag
    ? [
        ...baseFiltered.filter(t => t.hashtags?.includes(currentHashtag)).sort(sortFn),
        ...baseFiltered.filter(t => !t.hashtags?.includes(currentHashtag)).sort(sortFn)
      ]
    : baseFiltered.sort(sortFn);

  const existingThreads = new Map();
  container.querySelectorAll(".thread-card").forEach(threadEl => {
    const threadId = threadEl.dataset.id;
    if (threadId) existingThreads.set(threadId, threadEl);
  });

  // Keep track of threads to retain
  const threadsToShow = new Set(filteredDocs.slice(0, visibleThreadLimit).map(d => d.id));

  // Update or add threads within visible limit
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
      const postEl = getThread(data, activeUser, container, commentCount);
      if (index >= container.children.length) {
        container.appendChild(postEl);
      } else {
        container.insertBefore(postEl, container.children[index]);
      }
    }
  });

  // Only remove threads that are no longer in the visible set
  existingThreads.forEach((threadEl, threadId) => {
    if (!threadsToShow.has(threadId)) {
      threadEl.remove();
    }
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
  // Helper to render content and poll
  function renderContentAndPoll(contentEl, data, activeUser, isTruncated = true) {
    contentEl.innerHTML = "";
    const textDiv = document.createElement("div");
    textDiv.classList.add("thread-text");
    const fullText = data.content || "";
    let displayText = fullText;
    if (isTruncated && fullText.length > 200) {
      displayText = fullText.substring(0, 200) + "...";
      textDiv.classList.add("truncated");
      const seeMore = document.createElement("span");
      seeMore.classList.add("see-more");
      seeMore.textContent = "Se mer...";
      seeMore.addEventListener("click", () => {
        renderContentAndPoll(contentEl, data, activeUser, false); // Re-render full text and poll
      });
      textDiv.appendChild(document.createTextNode(displayText));
      textDiv.appendChild(seeMore);
    } else {
      textDiv.textContent = displayText;
    }
    contentEl.appendChild(textDiv);

    // Render poll
    if (data.poll?.question && Array.isArray(data.poll.options)) {
      const pollDiv = document.createElement("div");
      pollDiv.classList.add("poll-container");
      pollDiv.style.marginBottom = "16px";
      pollDiv.style.padding = "12px";
      pollDiv.style.border = "1px solid var(--border)";
      pollDiv.style.borderRadius = "8px";
      pollDiv.style.background = "var(--background)";

      const question = document.createElement("div");
      question.textContent = data.poll.question;
      question.style.fontWeight = "600";
      question.style.marginBottom = "8px";

      const optionsList = document.createElement("div");
      optionsList.classList.add("poll-options");
      optionsList.style.display = "flex";
      optionsList.style.flexDirection = "column";
      optionsList.style.gap = "8px";

      const totalVotes = data.poll.options.reduce((sum, opt) => sum + (opt.votes?.length || 0), 0);
      const hasVoted = activeUser && data.poll.votedBy?.includes(activeUser.uid) || false;

      data.poll.options.forEach((option, index) => {
        const optDiv = document.createElement("div");
        optDiv.style.position = "relative";
        optDiv.style.padding = "8px";
        optDiv.style.borderRadius = "6px";
        optDiv.style.background = hasVoted ? "var(--surface)" : "transparent";
        optDiv.style.cursor = hasVoted ? "default" : "pointer";
        optDiv.style.transition = "background 0.2s";

        if (hasVoted) {
          const percent = totalVotes > 0 ? Math.round((option.votes?.length || 0) / totalVotes * 100) : 0;
          const bar = document.createElement("div");
          bar.style.height = "4px";
          bar.style.background = `linear-gradient(to right, var(--success) ${percent}%, var(--border) ${percent}%)`;
          bar.style.borderRadius = "2px";
          bar.style.marginBottom = "4px";
          const text = document.createElement("div");
          text.innerHTML = `<strong>${option.text || `Option ${index + 1}`}</strong> (${option.votes?.length || 0} votes - ${percent}%)`;
          optDiv.appendChild(bar);
          optDiv.appendChild(text);
        } else {
          optDiv.textContent = option.text || `Option ${index + 1}`;
          optDiv.style.border = "1px solid var(--border)";
          optDiv.style.display = "flex";
          optDiv.style.alignItems = "center";
          optDiv.style.justifyContent = "center";
          if (activeUser) {
            optDiv.addEventListener("click", async () => {
              await voteOnPoll(data.id, activeUser.uid, index);
            });
          }
        }
        optionsList.appendChild(optDiv);
      });

      pollDiv.appendChild(question);
      pollDiv.appendChild(optionsList);
      contentEl.appendChild(pollDiv);
    }
  }

  // Update vote UI
  const upvotes = data.upvotes?.length || 0;
  const downvotes = data.downvotes?.length || 0;
  const score = upvotes - downvotes;

  const voteDiv = threadEl.querySelector(".vote");
  if (voteDiv) {
    const upvoteImg = voteDiv.querySelector('img[alt="Upvote"]');
    const downvoteImg = voteDiv.querySelector('img[alt="Downvote"]');
    const userUpvoted = activeUser && data.upvotes?.includes(activeUser.uid);
    const userDownvoted = activeUser && data.downvotes?.includes(activeUser.uid);

    if (upvoteImg) upvoteImg.style.opacity = userUpvoted ? "1" : "0.5";
    if (downvoteImg) downvoteImg.style.opacity = userDownvoted ? "1" : "0.5";

    let scoreDisplay = voteDiv.querySelector(".vote-score");
    if (!scoreDisplay) {
      scoreDisplay = document.createElement("span");
      scoreDisplay.classList.add("vote-score");
      voteDiv.insertBefore(scoreDisplay, downvoteImg?.nextSibling || null);
    }
    scoreDisplay.textContent = score > 0 ? `+${score}` : score.toString();
    scoreDisplay.style.color = score > 0 ? "#2ecc71" : score < 0 ? "#e74c3c" : "#95a5a6";
  }

  // Update content and poll
  const contentEl = threadEl.querySelector(".thread-content");
  if (contentEl) {
    renderContentAndPoll(contentEl, data, activeUser, true);
  }

  // Update comment count
  const commentBtn = threadEl.querySelector(".action-btn.comment");
  if (commentBtn) commentBtn.textContent = `💬 ${commentCount || 0}`;

  threadEl._threadData = data;
}

// ============================================
// CREATE THREAD ELEMENT
// ============================================

function getThread(data, activeUser, container, commentCount) {
  const postEl = document.createElement("div");
  postEl.classList.add("thread-card");
  postEl.dataset.id = data.id;
  postEl._threadData = data;

  const header = document.createElement("div");
  header.classList.add("thread-header");

  const avatar = document.createElement("div");
  avatar.classList.add("user-avatar");
  avatar.textContent = getInitials(data.authorName || "A");
  avatar.style.cursor = "pointer";

  const userInfo = document.createElement("div");
  userInfo.classList.add("thread-user-info");

  const username = document.createElement("div");
  username.classList.add("thread-username");
  username.textContent = data.authorName || "Anonym";
  username.style.cursor = "pointer";

  // In getThread and createCommentCard, change to:
   username.addEventListener('click', (e) => {
     e.preventDefault();
     navigateToProfile(data.authorName);  // Or data.username if separate field
   });
   avatar.addEventListener('click', (e) => {
     e.preventDefault();
     navigateToProfile(data.authorName);  // Or data.username if separate field
   });

  const meta = document.createElement("div");
  meta.classList.add("thread-meta");
  meta.textContent = timeAgo(data.createdAt);

  const schoolBadge = document.createElement("span");
  schoolBadge.classList.add("thread-school-badge");
  schoolBadge.textContent = data.school || "";
  meta.appendChild(document.createTextNode(" "));
  meta.appendChild(schoolBadge);

  userInfo.appendChild(username);
  userInfo.appendChild(meta);
  header.appendChild(avatar);
  header.appendChild(userInfo);

  const contentEl = document.createElement("div");
contentEl.classList.add("thread-content");
const maxLength = 200; // Adjust as needed
if (data.content.length > maxLength) {
  contentEl.classList.add("truncated");
  const shortContent = data.content.substring(0, maxLength) + "...";
  contentEl.textContent = shortContent;
  const seeMore = document.createElement("span");
  seeMore.classList.add("see-more");
  seeMore.textContent = "Se mer...";
  seeMore.addEventListener("click", () => {
    contentEl.classList.remove("truncated");
    contentEl.textContent = data.content;
    seeMore.remove();
  });
  contentEl.appendChild(seeMore);
} else {
  contentEl.textContent = data.content || "";
}

  if (data.poll?.question && Array.isArray(data.poll.options)) {
    const pollDiv = document.createElement("div");
    pollDiv.classList.add("poll-container");
    pollDiv.style.marginBottom = "16px";
    pollDiv.style.padding = "12px";
    pollDiv.style.border = "1px solid var(--border)";
    pollDiv.style.borderRadius = "8px";
    pollDiv.style.background = "var(--background)";

    const question = document.createElement("div");
    question.textContent = data.poll.question;
    question.style.fontWeight = "600";
    question.style.marginBottom = "8px";

    const optionsList = document.createElement("div");
    optionsList.classList.add("poll-options");
    optionsList.style.display = "flex";
    optionsList.style.flexDirection = "column";
    optionsList.style.gap = "8px";

    const totalVotes = data.poll.options.reduce((sum, opt) => sum + (opt.votes?.length || 0), 0);
    const hasVoted = activeUser && data.poll.votedBy?.includes(activeUser.uid) || false;

    data.poll.options.forEach((option, index) => {
      const optDiv = document.createElement("div");
      optDiv.style.position = "relative";
      optDiv.style.padding = "8px";
      optDiv.style.borderRadius = "6px";
      optDiv.style.background = hasVoted ? "var(--surface)" : "transparent";
      optDiv.style.cursor = hasVoted ? "default" : "pointer";
      optDiv.style.transition = "background 0.2s";

      if (hasVoted) {
        const percent = totalVotes > 0 ? Math.round((option.votes?.length || 0) / totalVotes * 100) : 0;
        const bar = document.createElement("div");
        bar.style.height = "4px";
        bar.style.background = `linear-gradient(to right, var(--success) ${percent}%, var(--border) ${percent}%)`;
        bar.style.borderRadius = "2px";
        bar.style.marginBottom = "4px";
        const text = document.createElement("div");
        text.innerHTML = `<strong>${option.text || `Option ${index + 1}`}</strong> (${option.votes?.length || 0} votes - ${percent}%)`;
        optDiv.appendChild(bar);
        optDiv.appendChild(text);
      } else {
        optDiv.textContent = option.text || `Option ${index + 1}`;
        optDiv.style.border = "1px solid var(--border)";
        optDiv.style.display = "flex";
        optDiv.style.alignItems = "center";
        optDiv.style.justifyContent = "center";
        if (activeUser) {
          optDiv.addEventListener("click", async () => {
            await voteOnPoll(data.id, activeUser.uid, index);
            optDiv.style.background = "var(--success)";
            setTimeout(() => (optDiv.style.background = "var(--surface)"), 300);
          });
        }
      }
      optionsList.appendChild(optDiv);
    });

    pollDiv.appendChild(question);
    pollDiv.appendChild(optionsList);
    contentEl.appendChild(pollDiv);
  }

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

  const scoreDisplay = document.createElement("span");
  scoreDisplay.classList.add("vote-score");
  scoreDisplay.textContent = score > 0 ? `+${score}` : score.toString();
  scoreDisplay.style.fontWeight = "bold";
  scoreDisplay.style.margin = "0 8px";
  scoreDisplay.style.color = score > 0 ? "#2ecc71" : score < 0 ? "#e74c3c" : "#95a5a6";

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

  upvote.addEventListener("click", () => upvoteThread(data.id));
  downvote.addEventListener("click", () => downvoteThread(data.id));

  const commentBtn = document.createElement("button");
  commentBtn.classList.add("action-btn", "comment");
  commentBtn.textContent = `💬 ${commentCount || 0}`;
  commentBtn.addEventListener("click", () => {
    if (!currentUser) {
      showToast({
        type: "error",
        title: "Logg inn påkrevd",
        message: "Du må være logget inn for å kommentere!",
        duration: 3000
      });
      return;
    }
    toggleCommentSection(data.id, currentUser, postEl);
  });

  if (admin || (activeUser && data.authorId === activeUser.uid)) {
    const deleteBtn = document.createElement("button");
    deleteBtn.classList.add("action-btn", "delete");
    deleteBtn.textContent = "🗑️";
    deleteBtn.addEventListener("click", async () => {
      if (confirm("Er du sikker på at du vil slette denne tråden?")) {
        try {
          await slettDokument("Threads", data.id);
          showToast({
            type: "success",
            title: "Suksess",
            message: "Tråden ble slettet!",
            duration: 3000
          });
          postEl.remove();
        } catch (error) {
          console.error("Deletion failed:", error);
          showToast({
            type: "error",
            title: "Feil",
            message: `Kunne ikke slette: ${error.message}`,
            duration: 5000
          });
        }
      }
    });
    actions.appendChild(deleteBtn);
  }

  if (currentUser && !admin && data.authorId !== currentUser.uid) {
    const reportBtn = document.createElement("button");
    reportBtn.classList.add("action-btn", "report");
    reportBtn.textContent = "🚨 Report";
    reportBtn.addEventListener("click", async () => {
      if (confirm("Er du sikker på at du vil rapportere denne tråden?")) {
        try {
          await leggTilDokument("reports", {
            threadId: data.id,
            reporterId: currentUser.uid,
            reporterName: currentUser.displayName || "Anonym",
            createdAt: new Date(),
            status: "pending"
          });
          showToast({
            type: "success",
            title: "Rapportert",
            message: "Tråden ble rapportert!",
            duration: 3000
          });
        } catch (error) {
          console.error("Error reporting:", error);
          showToast({
            type: "error",
            title: "Feil",
            message: `Kunne ikke rapportere: ${error.message}`,
            duration: 5000
          });
        }
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

function toggleCommentSection(threadId, user, container, isNested = false) {
  const targetEl = isNested ? container : container.closest(".thread-card") || container;
  let existing = targetEl.querySelector(".comments-section");
  if (existing) {
    if (existing.cleanup) existing.cleanup();
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
  commentsSection.cleanup = cleanup;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const content = textarea.value.trim();
    if (!content) return;
    await post(content, null, threadId);
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
    commentsList.querySelectorAll(".comment-card").forEach(commentEl => {
      const commentId = commentEl.dataset.id;
      if (commentId) existingComments.set(commentId, commentEl);
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

    existingComments.forEach(commentEl => commentEl.remove());
  };

  visDokumenterLive("Threads", updateComments);
  commentsList._isActive = true;
  return () => (commentsList._isActive = false);
}

function updateCommentContent(commentEl, comment) {
  const upvotes = comment.upvotes?.length || 0;
  const downvotes = comment.downvotes?.length || 0;
  const score = upvotes - downvotes;

  const voteDiv = commentEl.querySelector(".vote");
  if (voteDiv) {
    const upvoteImg = voteDiv.querySelector('img[alt="Upvote"]');
    const downvoteImg = voteDiv.querySelector('img[alt="Downvote"]');
    const userUpvoted = currentUser && comment.upvotes?.includes(currentUser.uid);
    const userDownvoted = currentUser && comment.downvotes?.includes(currentUser.uid);

    if (upvoteImg) upvoteImg.style.opacity = userUpvoted ? "1" : "0.5";
    if (downvoteImg) downvoteImg.style.opacity = userDownvoted ? "1" : "0.5";

    let scoreDisplay = voteDiv.querySelector(".vote-score");
    if (scoreDisplay) {
      scoreDisplay.textContent = score > 0 ? `+${score}` : score.toString();
      scoreDisplay.style.color = score > 0 ? "#2ecc71" : score < 0 ? "#e74c3c" : "#95a5a6";
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
  scoreDisplay.style.color = score > 0 ? "#2ecc71" : score < 0 ? "#e74c3c" : "#95a5a6";

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

  upvote.addEventListener("click", () => upvoteThread(comment.id));
  downvote.addEventListener("click", () => downvoteThread(comment.id));

  const replyBtn = document.createElement("button");
  replyBtn.classList.add("action-btn", "small");
  replyBtn.textContent = "💬 Svar";
  replyBtn.addEventListener("click", () => {
    if (!currentUser) {
      showToast({
        type: "error",
        title: "Logg inn påkrevd",
        message: "Du må være logget inn for å svare!",
        duration: 3000
      });
      return;
    }
    toggleCommentSection(comment.id, currentUser, card, true);
  });

  actions.appendChild(vote);
  actions.appendChild(replyBtn);

  if (admin || (user && comment.authorId === user.uid)) {
    const deleteBtn = document.createElement("button");
    deleteBtn.classList.add("action-btn", "delete", "small");
    deleteBtn.textContent = "🗑️";
    deleteBtn.addEventListener("click", async () => {
      if (confirm("Er du sikker på at du vil slette denne kommentaren?")) {
        try {
          await slettDokument("Threads", comment.id);
          showToast({
            type: "success",
            title: "Suksess",
            message: "Kommentaren ble slettet!",
            duration: 3000
          });
          card.remove();
        } catch (error) {
          console.error("Comment deletion failed:", error);
          showToast({
            type: "error",
            title: "Feil",
            message: `Kunne ikke slette: ${error.message}`,
            duration: 5000
          });
        }
      }
    });
    actions.appendChild(deleteBtn);
  }

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

// New function to show Verify Email screen
function showVerifyEmailScreen(email) {
  document.getElementById("register-screen").classList.add("hidden");
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("main-page").classList.add("hidden");
  document.getElementById("main-content").classList.add("hidden");
  document.getElementById("footer").classList.add("hidden");
  document.getElementById("profilePage")?.classList.add("hidden");

  let verifyScreen = document.getElementById("verify-email-screen");
  if (!verifyScreen) {
    verifyScreen = document.createElement("div");
    verifyScreen.id = "verify-email-screen";
    verifyScreen.className = "auth-screen";
    verifyScreen.innerHTML = `
      <div class="auth-container">
        <h2>Sjekk e-posten din</h2>
        <p>Vi har sendt en bekreftelses-e-post til <strong>${email}</strong>.</p>
        <p>Klikk på lenken i e-posten for å bekrefte kontoen din.</p>
        <p>Hvis du ikke ser e-posten, sjekk søppelpostmappen eller <a href="#" id="resend-verification">send på nytt</a>.</p>
        <p>Når du har bekreftet, blir du automatisk logget inn.</p>
        <button id="back-to-login" class="btn btn-secondary">Tilbake til innlogging</button>
      </div>
    `;
    document.body.appendChild(verifyScreen);
  } else {
    verifyScreen.classList.remove("hidden");
    verifyScreen.querySelector("strong").textContent = email;
  }

  document.getElementById("back-to-login").addEventListener("click", () => {
    verifyScreen.classList.add("hidden");
    showLogin();
  });

  document.getElementById("resend-verification").addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      const auth = await import("https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js");
      const user = auth.getAuth().currentUser;
      if (user) {
        await auth.sendEmailVerification(user);
        showToast({
          type: "success",
          title: "E-post sendt",
          message: "Bekreftelses-e-post sendt på nytt!",
          duration: 3000
        });
      }
    } catch (error) {
      console.error("Error resending verification email:", error);
      showToast({
        type: "error",
        title: "Feil",
        message: `Kunne ikke sende e-post: ${error.message}`,
        duration: 5000
      });
    }
  });
}

// Updated register-form handler
document.getElementById("register-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("regEmail").value;
  const pass = document.getElementById("regPass").value;
  const name = document.getElementById("regName").value;
  const school = document.getElementById("regSchool").value;

  try {
    const user = await registrerBruker(email, pass, name, school);
    showToast({
      type: "success",
      title: "Registrering vellykket",
      message: "Sjekk e-posten din for å bekrefte kontoen!",
      duration: 3000
    });
    showVerifyEmailScreen(email);

    // Monitor email verification
    monitorEmailVerification(user, (updatedUser) => {
      currentUser = updatedUser;
      showMainPage();
      showToast({
        type: "success",
        title: "E-post bekreftet",
        message: "Du er nå logget inn!",
        duration: 3000
      });
      sjekk();
    });
  } catch (error) {
    console.error("Registration failed:", error);
    showToast({
      type: "error",
      title: "Registreringsfeil",
      message: `Feil: ${error.message}`,
      duration: 5000
    });
  }
});

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("loginEmail").value;
  const pass = document.getElementById("loginPass").value;

  try {
    await loggInn(email, pass);
    showToast({
      type: "success",
      title: "Innlogging vellykket",
      message: "Du er nå logget inn!",
      duration: 3000
    });
    showMainPage();
    sjekk();
  } catch (error) {
    console.error("Login failed:", error);
    showToast({
      type: "error",
      title: "Innloggingsfeil",
      message: `Feil: ${error.message}`,
      duration: 5000
    });
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
  document.getElementById("footer").classList.add("hidden");
}

function showLogin() {
  document.getElementById("register-screen").classList.add("hidden");
  document.getElementById("login-screen").classList.remove("hidden");
  document.getElementById("main-page").classList.add("hidden");
  document.getElementById("main-content").classList.add("hidden");
  document.getElementById("footer").classList.add("hidden");
}

function showMainPage() {
  document.getElementById("register-screen").classList.add("hidden");
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("main-page").classList.remove("hidden");
  document.getElementById("main-content").classList.remove("hidden");
  document.getElementById("footer").classList.remove("hidden");
}

document.getElementById("go-to-login").addEventListener("click", showLogin);
document.getElementById("go-to-register").addEventListener("click", showRegister);



// ============================================
// USER PRESENCE & STATS
// ============================================

function updateUserUI(user) {
  const initialsEls = document.querySelectorAll(".initials");
  initialsEls.forEach(el => {
    el.textContent = user ? getInitials(user.displayName || "Bruker") : "";
  });
}

function updateOnlineUsers() {
  const schoolContainer = document.getElementById("online-counter");
  overvåkOnlineBrukere((onlineBySchool, error) => { // Eller overvåkOnlineBrukereFirestore for Firestore
    if (error) {
      console.error("Online users listener error:", error);
      schoolContainer.innerHTML = "<div>Feil ved lasting av online brukere</div>";
      showToast({
        type: "error",
        title: "Feil",
        message: "Kunne ikke laste online brukere",
        duration: 3000
      });
      return;
    }
    schoolContainer.innerHTML = "";
    if (Object.keys(onlineBySchool).length === 0) {
      schoolContainer.innerHTML = "<div>Ingen brukere online</div>";
      return;
    }
    Object.keys(onlineBySchool)
      .sort()
      .forEach(school => {
        const schoolInfo = document.createElement("div");
        schoolInfo.classList.add("school-info");
        schoolInfo.innerHTML = `
          <span class="school-name">${school}</span>
          <span class="school-count">${onlineBySchool[school]} online</span>
        `;
        schoolContainer.appendChild(schoolInfo);
      });
  });
}

if (window._presenceListenerAdded) {
  window.removeEventListener("beforeunload", window._presenceListenerAdded);
  window._presenceListenerAdded = null;
}

function updateTrendingHashtags() {
  const trendingContainer = document.getElementById("popular-hashtags");
  overvåkTrendingHashtags((trending) => {
    trendingContainer.innerHTML = "";
    trending.slice(0, 4).forEach(([tag, count]) => {
      const item = document.createElement("div");
      item.classList.add("trending-item");
      item.innerHTML = `
        <div class="trending-topic" style="${tag === currentHashtag ? 'color: #007bff; font-weight: bold;' : ''}">#${tag}</div>
        <div class="trending-count">${count} upvotes</div>
      `;
      item.querySelector(".trending-topic").addEventListener("click", () => {
        currentHashtag = currentHashtag === tag ? null : tag;
        document.querySelectorAll(".trending-topic").forEach(t => {
          const tTag = t.textContent.substring(1);
          t.style.color = tTag === currentHashtag ? "#007bff" : "";
          t.style.fontWeight = tTag === currentHashtag ? "bold" : "";
        });
        applySorting(schoolFilter, currentUser, document.getElementById("Threads"));
      });
      trendingContainer.appendChild(item);
    });
  });
}

// ============================================
// FEED CONTROLS
// ============================================

document.getElementById("popular").addEventListener("click", () => {
  sortThreadsBy = "popular";
  document.getElementById("nylig").classList.remove("active");
  document.getElementById("popular").classList.add("active");
  document.getElementById("hot").classList.remove("active");
  applySorting(schoolFilter, currentUser, document.getElementById("Threads"));
});

document.getElementById("nylig").addEventListener("click", () => {
  sortThreadsBy = "recent";
  document.getElementById("nylig").classList.add("active");
  document.getElementById("popular").classList.remove("active");
  document.getElementById("hot").classList.remove("active");
  applySorting(schoolFilter, currentUser, document.getElementById("Threads"));
});

document.getElementById("hot").addEventListener("click", () => {
  sortThreadsBy = "hot";
  document.getElementById("nylig").classList.remove("active");
  document.getElementById("popular").classList.remove("active");
  document.getElementById("hot").classList.add("active");
  applySorting(schoolFilter, currentUser, document.getElementById("Threads"));
});

document.getElementById("schoolFilter").addEventListener("change", (e) => {
  schoolFilter = e.target.value;
  applySorting(schoolFilter, currentUser, document.getElementById("Threads"));
});

// ============================================
// NOTIFICATION SYSTEM
// ============================================

document.getElementById("notificationBtn")?.addEventListener("click", (e) => {
  e.stopPropagation();
  document.getElementById("notificationPanel").classList.toggle("hidden");
});

document.addEventListener("click", (e) => {
  const panel = document.getElementById("notificationPanel");
  const btn = document.getElementById("notificationBtn");
  if (panel && btn && !panel.contains(e.target) && !btn.contains(e.target)) {
    panel.classList.add("hidden");
  }
});

document.getElementById("markAllRead")?.addEventListener("click", async () => {
  if (currentUser) {
    try {
      await markAllNotificationsRead(currentUser.uid);
      showToast({
        type: "success",
        title: "Suksess",
        message: "Alle varsler merket som lest!",
        duration: 3000
      });
    } catch (error) {
      console.error("Error marking notifications read:", error);
      showToast({
        type: "error",
        title: "Feil",
        message: `Kunne ikke merke som lest: ${error.message}`,
        duration: 5000
      });
    }
  }
});

function displayNotifications(notifications) {
  const list = document.getElementById("notificationList");
  list.innerHTML = notifications.length === 0 ? '<div class="notification-empty">Ingen varsler enda</div>' : "";

  notifications.forEach(notif => {
    const item = document.createElement("div");
    item.classList.add("notification-item");
    if (!notif.read) item.classList.add("unread");

    const iconText = notif.type === "reply" ? "💬" : notif.type === "upvote" ? "⬆️" : "📢";
    const message =
      notif.type === "reply"
        ? `<strong>${notif.actorName}</strong> svarte på tråden din`
        : notif.type === "upvote"
        ? `<strong>${notif.actorName}</strong> upvotet innlegget ditt`
        : `<strong>${notif.actorName}</strong> nevnte deg`;

    item.innerHTML = `
      <div class="notification-icon">${iconText}</div>
      <div class="notification-content">
        <div class="notification-text">${message}</div>
        ${notif.content ? `<div class="notification-text" style="color: #666; font-size: 0.85rem;">${notif.content.substring(0, 60)}${notif.content.length > 60 ? "..." : ""}</div>` : ""}
        <div class="notification-time">${timeAgo(notif.createdAt)}</div>
      </div>
    `;
    item.addEventListener("click", async () => {
      if (!notif.read) {
        await markNotificationRead(notif.id);
      }
      document.getElementById("notificationPanel").classList.add("hidden");
      const threadCard = document.querySelector(`[data-id="${notif.threadId}"]`);
      if (threadCard) {
        threadCard.scrollIntoView({ behavior: "smooth", block: "center" });
        threadCard.style.animation = "highlight 2s ease";
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
  const existingPanel = document.querySelector(".adminpanel");
  if (existingPanel) existingPanel.remove();

  const overlay = document.createElement("div");
  overlay.classList.add("overlay");

  const panel = document.createElement("div");
  panel.classList.add("adminpanel");
  panel.innerHTML = `
    <h2>Admin Panel</h2>
    <div class="admin-controls">
      <button id="refresh-users">Oppdater brukere</button>
      <button id="view-users">Vis brukere</button>
      <button id="view-reports">Vis rapporter</button>
      <button id="logout-users">Logg ut alle brukere</button>
    </div>
    <div class="listdiv"></div>
  `;

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  overlay.addEventListener("click", (event) => {
    if (!panel.contains(event.target)) overlay.remove();
  });

  panel.addEventListener("click", (event) => event.stopPropagation());

  document.getElementById("view-users").addEventListener("click", async () => {
    const listdiv = panel.querySelector(".listdiv");
    listdiv.innerHTML = "";
    try {
      const users = await hentDokumenter("users");
      users.forEach(user => {
        const temp = document.createElement("div");
        temp.classList.add("user-entry");
        temp.textContent = user.email || JSON.stringify(user);
        listdiv.appendChild(temp);
      });
    } catch (error) {
      console.error("Error fetching users:", error);
      listdiv.innerHTML = "<div>Feil ved lasting av brukere</div>";
    }
  });

  document.getElementById("view-reports").addEventListener("click", async () => {
    const listdiv = panel.querySelector(".listdiv");
    listdiv.innerHTML = "";
    try {
      const reports = await hentDokumenter("reports");
      reports.forEach(report => {
        const thread = currentThreadsData.find(t => t.id === report.threadId);
        const entry = document.createElement("div");
        entry.classList.add("report-entry");
        entry.style.border = "1px solid #ccc";
        entry.style.padding = "10px";
        entry.style.marginBottom = "10px";
        entry.style.borderRadius = "5px";

        if (!thread) {
          entry.textContent = `Thread not found: ${report.threadId}`;
          listdiv.appendChild(entry);
          return;
        }

        entry.innerHTML = `
          <h4>Reported Thread by ${thread.authorName}</h4>
          <p><strong>Content:</strong> ${thread.content}</p>
          <p><strong>School:</strong> ${thread.school}</p>
          <p><strong>Created:</strong> ${timeAgo(thread.createdAt)}</p>
          <p><strong>Reported by:</strong> ${report.reporterName} (${report.reporterId})</p>
          <p><strong>Report time:</strong> ${timeAgo(report.createdAt)}</p>
          <p><strong>Status:</strong> ${report.status || "pending"}</p>
          <div style="margin-top: 10px;">
            <button class="delete-post-btn" style="margin-right: 5px;">Delete Post</button>
            <button class="ban-user-btn" style="margin-right: 5px; background-color: #e74c3c; color: white;">Ban User</button>
            <button class="ignore-report-btn">Ignore Report</button>
          </div>
        `;

        entry.querySelector(".delete-post-btn").addEventListener("click", async () => {
          if (confirm("Delete this post?")) {
            try {
              await slettDokument("Threads", report.threadId);
              await slettDokument("reports", report.id);
              entry.remove();
              showToast({
                type: "success",
                title: "Suksess",
                message: "Tråden og rapporten ble slettet!",
                duration: 3000
              });
            } catch (error) {
              console.error("Error deleting post/report:", error);
              showToast({
                type: "error",
                title: "Feil",
                message: `Kunne ikke slette: ${error.message}`,
                duration: 5000
              });
            }
          }
        });

        entry.querySelector(".ban-user-btn").addEventListener("click", async () => {
          if (confirm("Ban this user?")) {
            try {
              await leggTilDokument("bans", {
                userId: thread.authorId,
                reason: "Reported thread",
                bannedAt: new Date()
              });
              await slettDokument("reports", report.id);
              entry.remove();
              showToast({
                type: "success",
                title: "Suksess",
                message: "Brukeren ble bannet!",
                duration: 3000
              });
            } catch (error) {
              console.error("Error banning user:", error);
              showToast({
                type: "error",
                title: "Feil",
                message: `Kunne ikke banne: ${error.message}`,
                duration: 5000
              });
            }
          }
        });

        entry.querySelector(".ignore-report-btn").addEventListener("click", async () => {
          if (confirm("Ignore this report?")) {
            try {
              await slettDokument("reports", report.id);
              entry.remove();
              showToast({
                type: "success",
                title: "Suksess",
                message: "Rapporten ble ignorert!",
                duration: 3000
              });
            } catch (error) {
              console.error("Error ignoring report:", error);
              showToast({
                type: "error",
                title: "Feil",
                message: `Kunne ikke ignorere: ${error.message}`,
                duration: 5000
              });
            }
          }
        });

        listdiv.appendChild(entry);
      });
    } catch (error) {
      console.error("Error fetching reports:", error);
      listdiv.innerHTML = "<div>Feil ved lasting av rapporter</div>";
    }
  });

  document.getElementById("logout-users").addEventListener("click", () => {
    showToast({
      type: "info",
      title: "Ikke implementert",
      message: "Utloggingsfunksjon for alle brukere er ikke implementert.",
      duration: 3000
    });
  });
}

function enableAdminFeatures() {
  document.getElementById("logo").textContent = "SkienThreads admin";
  const navbar = document.getElementById("navbar");
  if (!document.getElementById("adminBtn")) {
    const adminBtn = document.createElement("button");
    adminBtn.id = "adminBtn";
    adminBtn.textContent = "adminpanel";
    adminBtn.classList.add("tab-btn");
    adminBtn.style.color = "blue";
    adminBtn.addEventListener("click", showAdminPanel);
    navbar.appendChild(adminBtn);
  }
}

function disableAdminFeatures() {
  document.getElementById("logo").textContent = "SkienThreads";
  const adminBtn = document.getElementById("adminBtn");
  if (adminBtn) adminBtn.remove();
}

// ============================================
// TOAST
// ============================================

function initToastContainer() {
  if (!document.querySelector(".toast-container")) {
    const container = document.createElement("div");
    container.className = "toast-container";
    document.body.appendChild(container);
  }
}

function showToast(options) {
  initToastContainer();
  const defaults = {
    type: "info",
    title: "",
    message: "",
    duration: 3000,
    closable: true,
    showProgress: true
  };
  const config = { ...defaults, ...options };

  const toast = document.createElement("div");
  toast.className = `toast ${config.type}`;
  const icons = { success: "✓", error: "✕", warning: "⚠", info: "ℹ" };
  toast.innerHTML = `
    <div class="toast-icon">${icons[config.type]}</div>
    <div class="toast-content">
      ${config.title ? `<div class="toast-title">${config.title}</div>` : ""}
      ${config.message ? `<div class="toast-message">${config.message}</div>` : ""}
    </div>
    ${config.closable ? '<button class="toast-close">×</button>' : ""}
    ${config.showProgress ? '<div class="toast-progress"></div>' : ""}
  `;
  const container = document.querySelector(".toast-container");
  container.appendChild(toast);

  if (config.closable) {
    toast.querySelector(".toast-close").addEventListener("click", () => removeToast(toast));
  }
  if (config.duration > 0) {
    setTimeout(() => removeToast(toast), config.duration);
  }
}

function removeToast(toast) {
  toast.classList.add("removing");
  setTimeout(() => toast.parentElement?.removeChild(toast), 300);
}

// ============================================
// AUTH STATE MONITORING
// ============================================

function updateNavForAuth(user) {
  const navActions = document.querySelector('.nav-actions');
  let profileBtn = navActions?.querySelector('.profile-btn');
  let loginBtn = navActions?.querySelector('.login-btn');

  if (user) {
    if (!profileBtn) {
      profileBtn = document.createElement('button');
      profileBtn.className = 'profile-btn initials';
      navActions.appendChild(profileBtn);
    }
    if (loginBtn) loginBtn.remove();
    profileBtn.textContent = getInitials(user.displayName || "Bruker");
    profileBtn.setAttribute('aria-haspopup', 'true');
    profileBtn.setAttribute('aria-expanded', 'false');
  } else {
    if (!loginBtn) {
      loginBtn = document.createElement('button');
      loginBtn.className = 'btn btn-primary login-btn';
      loginBtn.textContent = 'Logg inn';
      loginBtn.onclick = showLogin;
      navActions.appendChild(loginBtn);
    }
    if (profileBtn) profileBtn.remove();
  }

  // Sync mobile nav if it exists
  if (window.syncMobileNav) {
    window.syncMobileNav(user);
  }
}

// Profile dropdown menu

// Profile dropdown menu - use event delegation for dynamically created buttons
(async function(){
  const menu = document.getElementById('profileMenu');

  function openMenu(){
    if (!menu) return;
    menu.classList.remove('hidden');
    const profileBtns = document.querySelectorAll('.profile-btn');
    profileBtns.forEach(btn => btn.setAttribute('aria-expanded','true'));
    menu.querySelector('.profile-menu-item')?.focus();
  }
  
  function closeMenu(){
    if (!menu) return;
    menu.classList.add('hidden');
    const profileBtns = document.querySelectorAll('.profile-btn');
    profileBtns.forEach(btn => btn.setAttribute('aria-expanded','false'));
  }

  // Use event delegation for profile button clicks
  document.addEventListener('click', (e) => {
    const clickedProfile = e.target.closest('.profile-btn');
    if (clickedProfile) {
      e.stopPropagation();
      if (!menu) {
        // Fallback when no dropdown exists
        if (confirm('Vil du logge ut?')) {
          loggUt().catch(err => console.error('Logout failed:', err));
          showLogin();
        }
        return;
      }
      // Toggle menu
      if (menu.classList.contains('hidden')) openMenu(); 
      else closeMenu();
    }
  });

  // Close when clicking outside
  document.addEventListener('click', (e) => {
    if (!menu) return;
    if (!menu.classList.contains('hidden') && 
        !e.target.closest('.profile-btn') && 
        !menu.contains(e.target)) {
      closeMenu();
    }
  });

  // Keyboard support
  document.addEventListener('keydown', (e) => {
    if (!menu) return;
    if (e.key === 'Escape') closeMenu();
    if ((e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') && 
        document.activeElement?.classList.contains('profile-btn')) {
      e.preventDefault();
      openMenu();
    }
  });
})();

function updateUIForAuth(user) {
  const postThreadForm = document.getElementById("post-thread");
  if (postThreadForm) postThreadForm.style.display = user ? "" : "none";
  const notifBtn = document.getElementById("notificationBtn");
  if (notifBtn) notifBtn.style.display = user ? "" : "none";
}

if (!window._presenceListenerAdded) {
  window.addEventListener("beforeunload", () => {
    if (currentUser?.uid) updateUserPresence(currentUser.uid, "offline");
  });
  window._presenceListenerAdded = true;
}

// app.js - Updated sjekk() function
async function sjekk() {
  // ALWAYS check ban FIRST, even for existing sessions
  if (currentUser?.uid) {
    try {
      console.log(`Checking ban for UID: ${currentUser.uid}`);
      const banned = await isBanned(currentUser.uid);
      console.log(`Ban status: ${banned}`);
      if (banned) {
        document.body.innerHTML = `
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; text-align: center; background: #f8f9fa; font-family: Arial, sans-serif;">
            <h1 style="color: #dc3545; font-size: 3rem; margin: 0;">Du er bannet!</h1>
            <p style="color: #6c757d; font-size: 1.2rem; margin: 10px 0;">Kontakt <a href="mailto:skienthreads@hotmail.com" style="color: #007bff;">skienthreads@hotmail.com</a> for spørsmål.</p>
          </div>
        `;
        return; // STOP EVERYTHING - no UI, no listeners
      }
    } catch (error) {
      console.error("Ban check failed:", error);
      // Fallback: Assume not banned if check fails
    }
  }

  // Proceed with normal auth monitoring
  overvåkBruker(async (user) => {
    currentUser = user;
    updateNavForAuth(user);
    updateUIForAuth(user);
    updateUserUI(user);

    let presenceInterval = null;
    if (!user) {
      admin = false;
      disableAdminFeatures();
      if (notificationUnsubscribe) {
        notificationUnsubscribe();
        notificationUnsubscribe = null;
      }
      if (presenceInterval) presenceInterval();
      visTråderLive();
      updateOnlineUsers();
      updateTrendingHashtags();
      return;
    }

    // RE-CHECK BAN after auth change (redundancy)
    try {
      const banned = await isBanned(user.uid);
      if (banned) {
        document.body.innerHTML = `
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; text-align: center; background: #f8f9fa; font-family: Arial, sans-serif;">
            <h1 style="color: #dc3545; font-size: 3rem; margin: 0;">Du er bannet!</h1>
            <p style="color: #6c757d; font-size: 1.2rem; margin: 10px 0;">Kontakt <a href="mailto:skienthreads@hotmail.com" style="color: #007bff;">skienthreads@hotmail.com</a> for spørsmål.</p>
          </div>
        `;
        return;
      }
    } catch (error) {
      console.error("Ban re-check failed:", error);
    }

    if (user.emailVerified) {
      showMainPage();
      await updateUserPresence(user.uid, "online");
      presenceInterval = startPresenceKeepAlive(user.uid);
      const isAdmin = await getadmin(user.uid);
      admin = isAdmin === true;
      if (admin) {
        enableAdminFeatures();
      } else {
        disableAdminFeatures();
      }
      visTråderLive();
      updateOnlineUsers();
      updateTrendingHashtags();

      if (notificationUnsubscribe) notificationUnsubscribe();
      notificationUnsubscribe = overvåkNotifications(user.uid, (notifications) => {
        displayNotifications(notifications);
        updateNotificationBadge(notifications);
      });
    } else {
      showToast({
        type: "warning",
        title: "E-postbekreftelse nødvendig",
        message: "Vennligst bekreft e-posten din før du fortsetter.",
        duration: 5000
      });
      admin = false;
      disableAdminFeatures();
    }
  });
}

// Håndter @name-støtte (autofullføring og klikkbare lenker)
function setupMentionSupport() {
  // Autofullføring
  const contentInput = document.getElementById("thread-content");
  const suggestionBox = document.createElement("div");
  suggestionBox.className = "suggestion-box";
  contentInput.parentNode.appendChild(suggestionBox);

  contentInput.addEventListener("input", async (e) => {
    const text = e.target.value;
    suggestionBox.innerHTML = "";
    if (text.includes("@")) {
      const lastWord = text.split(" ").pop();
      if (lastWord.startsWith("@") && lastWord.length > 1) {
        const queryText = lastWord.slice(1).toLowerCase();
        const users = await hentDokumenter("users");
        const matchingUsers = users
          .filter(user => user.displayName.toLowerCase().startsWith(queryText))
          .slice(0, 5);
        matchingUsers.forEach(user => {
          const suggestion = document.createElement("div");
          suggestion.textContent = `@${user.displayName}`;
          suggestion.className = "suggestion-item";
          suggestion.addEventListener("click", () => {
            const words = text.split(" ");
            words[words.length - 1] = `@${user.displayName}`;
            contentInput.value = words.join(" ") + " ";
            suggestionBox.innerHTML = "";
            contentInput.focus();
          });
          suggestionBox.appendChild(suggestion);
        });
      }
    }
  });

  // Klikkbare lenker i tråder
  const getThreadOriginal = window.getThread; // Forutsetter at getThread finnes
  window.getThread = function(data, index, user) {
    const postEl = getThreadOriginal(data, index, user);
    let content = data.content || "";
    if (data.mentions && data.mentions.length) {
      data.mentions.forEach(mention => {
        const regex = new RegExp(`@${mention.displayName}\\b`, "gi");
        content = content.replace(regex, `<a href="#" class="mention-link" data-uid="${mention.uid}">@${mention.displayName}</a>`);
      });
      postEl.querySelector(".post-content").innerHTML = content;
      postEl.querySelectorAll(".mention-link").forEach(link => {
        link.addEventListener("click", (e) => {
          e.preventDefault();
          const userId = link.dataset.uid;
          showToast({
            type: "info",
            title: "Profil",
            message: `Navigering til brukerprofil for UID: ${userId} (ikke implementert ennå)`,
            duration: 3000
          });
        });
      });
    }
    return postEl;
  };
}

// ============================================
// INITIALIZE
// ============================================

window.addEventListener("DOMContentLoaded", () => {
    initRouter();
  sjekk();
  showMainPage();
  setupMentionSupport();

  // *** ADD THESE NEW CALLS: ***
  initMobileSidebar();
  initCompactInfoRow();
  updateCompactInfo();

  // *** ADD THIS EVENT DELEGATION FOR LOGOUT BUTTON: ***
  document.addEventListener('click', async (e) => {
    if (e.target.id === 'log' || e.target.closest('#log')) {
      e.preventDefault();
      if (!confirm('Vil du logge ut?')) return;
      try {
        await loggUt();
        showToast({ 
          type: 'success', 
          title: 'Logget ut', 
          message: 'Du er nå logget ut.', 
          duration: 2000 
        });
        showLogin();
      } catch (err) {
        console.error('Logout failed:', err);
        showToast({ 
          type: 'error', 
          title: 'Feil', 
          message: 'Kunne ikke logge ut.' 
        });
      }
    }
  });

  const pollToggle = document.getElementById("poll-toggle");
  if (pollToggle) {
    pollToggle.addEventListener("change", (e) => {
      const pollForm = document.getElementById("poll-form");
      const pollQuestion = document.getElementById("poll-question");
      const pollOptions = document.querySelectorAll("#poll-options input");
      pollForm.classList.toggle("hidden", !e.target.checked);
      if (e.target.checked) {
        pollQuestion.setAttribute("required", "");
        pollOptions.forEach(input => input.setAttribute("required", ""));
      } else {
        pollQuestion.removeAttribute("required");
        pollOptions.forEach(input => input.removeAttribute("required"));
        pollQuestion.value = "";
        document.getElementById("poll-options").innerHTML = `
          <div class="poll-option"><input type="text" placeholder="Option 1"></div>
          <div class="poll-option"><input type="text" placeholder="Option 2"></div>
        `;
      }
    });
  }

// Update these existing functions to also update compact info:
const originalUpdateTrendingHashtags = updateTrendingHashtags;
updateTrendingHashtags = function() {
  originalUpdateTrendingHashtags();
  if (typeof updateCompactInfo === 'function') {
    updateCompactInfo();
  }
};

const originalUpdateOnlineUsers = updateOnlineUsers;
updateOnlineUsers = function() {
  originalUpdateOnlineUsers();
  if (typeof updateCompactInfo === 'function') {
    updateCompactInfo();
  }
};

  const addOptionBtn = document.getElementById("add-option");
  if (addOptionBtn) {
    addOptionBtn.addEventListener("click", () => {
      const container = document.getElementById("poll-options");
      if (container.children.length >= 5) {
        showToast({
          type: "error",
          title: "Maksimum antall valg",
          message: "Maksimalt 5 valgmuligheter tillatt i avstemningen!",
          duration: 3000
        });
        return;
      }
      const div = document.createElement("div");
      div.className = "poll-option";
      div.innerHTML = `
        <input type="text" placeholder="Option ${container.children.length + 1}" required>
        <button type="button" class="remove-option btn btn-secondary" style="margin-left: 8px;">Remove</button>
      `;
      container.appendChild(div);
      div.querySelector(".remove-option").addEventListener("click", () => {
        if (container.children.length <= 2) {
          showToast({
            type: "error",
            title: "Minimum antall valg",
            message: "Avstemningen må ha minst 2 valgmuligheter!",
            duration: 3000
          });
          return;
        }
        div.remove();
      });
    });
  }
});

// app.js - Add these globals and functions

let currentRoute = window.location.pathname;  // Track current path

// Simple router function
function initRouter() {
  function handleRoute() {
    const path = window.location.pathname;
    if (path.startsWith('/@')) {  // e.g., /@username
      const username = path.substring(2);  // Remove '/@'
      if (username) {
        showProfilePage(username);
      } else {
        showFeed();  // Fallback to feed
      }
    } else {
      showFeed();  // Default to main feed
    }
  }

  // Listen for URL changes
  window.addEventListener('popstate', handleRoute);
  handleRoute();  // Initial load
}

// Navigate to profile URL without reload
function navigateToProfile(username) {
  const url = `/@${username}`;
  history.pushState({ route: 'profile' }, '', url);
  showProfilePage(username);
}

// Show full profile page
async function showProfilePage(displayName) {
  try {
    console.log(`Rendering profile page for displayName: ${displayName}`);
    const userData = await getUserByUsername(displayName);
    currentRoute = `/@${displayName.toLowerCase().replace(/\s+/g, '')}`;

    // Hide main content, show profile
    document.getElementById('main-content').classList.add('hidden');
    const profileContainer = document.getElementById('profilePage') || createProfilePage();
    profileContainer.classList.remove('hidden');

    // Render profile header with avatar beside username
    const headerEl = profileContainer.querySelector('.profile-header');
    headerEl.innerHTML = `
      <div class="profile-header-inner">
        <div class="user-avatar initials">${getInitials(userData.username || "Anonym")}</div>
        <h1>@${userData.username}</h1>
      </div>
      <div class="profile-stats">
        <div>Total Threads: ${userData.totalThreads}</div>
        <div>Total Upvotes: ${userData.totalUpvotes}</div>
        <div>School: ${userData.school}</div>
      </div>
      <button id="backToFeed" class="btn btn-primary">← Back to Feed</button>
    `;

    // Render threads list using getThread
    const threadsContainer = profileContainer.querySelector('.profile-threads');
    threadsContainer.innerHTML = userData.totalThreads === 0 ? "<p>Ingen tråder ennå</p>" : '';
    userData.threads
      .sort((a, b) => {
        const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt).getTime();
        const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt).getTime();
        return bTime - aTime;
      })
      .forEach(thread => {
        const commentCount = currentThreadsData.filter(d => d.parentId === thread.id).length;
        const threadEl = getThread(thread, currentUser, threadsContainer, commentCount);
        threadsContainer.appendChild(threadEl);
      });

    // Back button
    document.getElementById('backToFeed').addEventListener('click', showFeed);
    // Scroll to the username (profile-header-inner)
    const scrollto = document.documentElement.scrollTop > 0 ? document.documentElement : document.body;
    scrollto.scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast({ type: 'success', title: 'Profile Loaded', message: `Viewing @${userData.username}'s profile`, duration: 2000 });
    document.title = `@${userData.username} - SkienThreads`;
  } catch (error) {
    console.error(`Failed to load profile for ${displayName}:`, error);
    showToast({ type: 'error', title: 'Not Found', message: `User @${displayName} not found`, duration: 3000 });
    showFeed();
  }
}

// Hide profile, show feed
function showFeed() {
  currentRoute = '/';
  history.pushState({ route: 'feed' }, '', '/');
  document.getElementById('profilePage')?.classList.add('hidden');
  document.getElementById('main-content').classList.remove('hidden');
  applySorting(schoolFilter, currentUser, document.getElementById('Threads'));  // Refresh feed
}

// Create profile page DOM (call once)
function createProfilePage() {
  const profileDiv = document.createElement('div');
  profileDiv.id = 'profilePage';
  profileDiv.classList.add('profile-page', 'hidden');
  profileDiv.innerHTML = `
    <div class="profile-header"></div>
    <div class="profile-threads"></div>
  `;
  document.body.insertBefore(profileDiv, document.getElementById('main-content'));
  return profileDiv;
}
const logo = document.getElementById("logo");
logo.style.cursor = "pointer";
logo.addEventListener("click", () => {
  if (currentRoute !== '/') {
    showFeed();
  }
});

// ============================================
// MOBILE OPTIMIZATION - ADD TO app.js
// Add these functions and event listeners
// ============================================

// Create mobile sidebar drawer (call this in DOMContentLoaded)
function initMobileSidebar() {
  // Create drawer overlay
  const overlay = document.createElement('div');
  overlay.className = 'drawer-overlay';
  overlay.id = 'drawerOverlay';
  document.body.appendChild(overlay);

  // Create mobile sidebar drawer
  const drawer = document.createElement('div');
  drawer.className = 'mobile-sidebar-drawer';
  drawer.id = 'mobileSidebar';
  drawer.innerHTML = `
    <button class="drawer-close" id="closeDrawer">×</button>
    <h3 style="margin-bottom: 16px; color: var(--text-primary);">Meny</h3>
    
    <!-- School Filter in Drawer -->
    <div style="margin-bottom: 20px;">
      <label style="font-weight: 600; margin-bottom: 8px; display: block; font-size: 14px;">Filtrer etter skole</label>
      <select class="school-selector" id="mobileSchoolFilter" style="width: 100%;">
        <option>Alle skoler</option>
        <option>Skien VGS</option>
        <option>Skogmo VGS</option>
        <option>Hjalmar VGS</option>
      </select>
    </div>

    <!-- Trending in Drawer -->
    <div class="sidebar-card" style="margin-bottom: 20px;">
      <h3 class="sidebar-title">Populært nå</h3>
      <div id="drawerTrending"></div>
    </div>

    <!-- Schools in Drawer -->
    <div class="sidebar-card">
      <h3 class="sidebar-title">Aktive skoler</h3>
      <div id="drawerSchools"></div>
    </div>
  `;
  document.body.appendChild(drawer);

  // *** CREATE MOBILE PROFILE MENU ***
  const mobileProfileMenu = document.createElement('div');
  mobileProfileMenu.id = 'mobileProfileMenu';
  mobileProfileMenu.className = 'profile-menu mobile-profile-menu hidden';
  mobileProfileMenu.setAttribute('role', 'menu');
  mobileProfileMenu.innerHTML = `
    <button class="profile-menu-item" role="menuitem" data-action="profile" disabled><s>Min profil (kommer senere)</s></button>
    <button class="profile-menu-item" role="menuitem" data-action="settings" disabled><s>Innstillinger (kommer senere)</s></button>
    <div class="profile-menu-sep" aria-hidden="true"></div>
    <button class="profile-menu-item" id="mobileLogout" role="menuitem">Logg ut</button>
  `;
  document.body.appendChild(mobileProfileMenu);

  // Hamburger button (add to navbar)
  const hamburger = document.createElement('button');
  hamburger.className = 'hamburger-btn';
  hamburger.id = 'hamburgerBtn';
  hamburger.innerHTML = '☰';
  hamburger.setAttribute('aria-label', 'Åpne meny');
  
  const navbar = document.querySelector('.nav-container');
  
  // Create mobile control row wrapper for hamburger + nav-actions
  const controlRow = document.createElement('div');
  controlRow.className = 'mobile-control-row';
  
  // Clone nav-actions for mobile (keep original for desktop)
  const navActions = navbar.querySelector('.nav-actions');
  const navActionsClone = navActions.cloneNode(true);
  
  controlRow.appendChild(hamburger);
  controlRow.appendChild(navActionsClone);
  
  // Insert control row after logo
  const logo = navbar.querySelector('.logo');
  logo.after(controlRow);
  
  // Store the sync function globally so it can be called from updateNavForAuth
  window.syncMobileNav = syncMobileNavActions(navActions, navActionsClone);

  // Event listeners
  document.getElementById("hamburgerBtn").addEventListener('click', openDrawer);
  document.getElementById("drawerOverlay").addEventListener('click', closeDrawer);
  document.getElementById('closeDrawer').addEventListener('click', closeDrawer);

  // Sync mobile school filter with main filter
  document.getElementById('mobileSchoolFilter').addEventListener('change', (e) => {
    document.getElementById('schoolFilter').value = e.target.value;
    schoolFilter = e.target.value;
    applySorting(schoolFilter, currentUser, document.getElementById('Threads'));
    closeDrawer();
  });

  // Make drawer hashtags clickable
  setupDrawerHashtagListeners();
}

function syncMobileNavActions(original, clone) {
  // Function to update both original and clone
  function updateBothNavs(user) {
    updateSingleNav(original, user, false); // desktop
    updateSingleNav(clone, user, true);     // mobile
  }

  // Function to update a single nav
  function updateSingleNav(nav, user, isMobile) {
    let profileBtn = nav.querySelector('.profile-btn');
    let loginBtn = nav.querySelector('.login-btn');
    let notifBtn = nav.querySelector('#notificationBtn');

    if (user) {
      // User is logged in - show profile button
      if (loginBtn) loginBtn.remove();
      
      if (!profileBtn) {
        profileBtn = document.createElement('button');
        profileBtn.className = 'profile-btn initials';
        profileBtn.setAttribute('aria-haspopup', 'true');
        profileBtn.setAttribute('aria-expanded', 'false');
        nav.appendChild(profileBtn);
      }
      
      profileBtn.textContent = getInitials(user.displayName || "Bruker");
      
      // *** ADD MOBILE-SPECIFIC CLICK HANDLER ***
      if (isMobile) {
        profileBtn.onclick = (e) => {
          e.stopPropagation();
          toggleMobileProfileMenu(profileBtn);
        };
      }
      
      // *** FIX NOTIFICATION BUTTON FOR MOBILE ***
      if (notifBtn) {
        notifBtn.style.display = '';
        
        // If this is the mobile notification button, sync it with desktop
        if (isMobile) {
          // Remove any existing click handlers
          const newNotifBtn = notifBtn.cloneNode(true);
          notifBtn.parentNode.replaceChild(newNotifBtn, notifBtn);
          notifBtn = newNotifBtn;
          
          // Add click handler that toggles the notification panel
          notifBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const panel = document.getElementById('notificationPanel');
            if (panel) {
              panel.classList.toggle('hidden');
            }
          });
          
          // Sync badge with desktop notification button
          const desktopNotifBtn = original.querySelector('#notificationBtn');
          const desktopBadge = desktopNotifBtn?.querySelector('.notification-badge');
          const mobileBadge = notifBtn.querySelector('.notification-badge');
          
          if (desktopBadge && mobileBadge) {
            // Create observer to sync badge
            const observer = new MutationObserver(() => {
              mobileBadge.textContent = desktopBadge.textContent;
              if (desktopBadge.classList.contains('hidden')) {
                mobileBadge.classList.add('hidden');
              } else {
                mobileBadge.classList.remove('hidden');
              }
            });
            
            observer.observe(desktopBadge, {
              childList: true,
              characterData: true,
              subtree: true,
              attributes: true,
              attributeFilter: ['class']
            });
          }
        }
      }
      
    } else {
      // User is logged out - show login button
      if (profileBtn) profileBtn.remove();
      
      if (!loginBtn) {
        loginBtn = document.createElement('button');
        loginBtn.className = 'btn btn-primary login-btn';
        loginBtn.textContent = 'Logg inn';
        loginBtn.onclick = showLogin;
        nav.appendChild(loginBtn);
      }

      // Hide notification button
      if (notifBtn) notifBtn.style.display = 'none';
    }
  }

  // Initial sync
  updateBothNavs(currentUser);

  // Return update function so it can be called when user changes
  return updateBothNavs;
}

// Toggle mobile profile menu
function toggleMobileProfileMenu(button) {
  const menu = document.getElementById('mobileProfileMenu');
  if (!menu) return;
  
  if (menu.classList.contains('hidden')) {
    // Position menu below the button
    const rect = button.getBoundingClientRect();
    menu.style.top = `${rect.bottom + 8}px`;
    menu.style.right = `${window.innerWidth - rect.right}px`;
    menu.classList.remove('hidden');
    button.setAttribute('aria-expanded', 'true');
  } else {
    menu.classList.add('hidden');
    button.setAttribute('aria-expanded', 'false');
  }
}

// Close mobile profile menu when clicking outside
document.addEventListener('click', (e) => {
  const menu = document.getElementById('mobileProfileMenu');
  if (!menu) return;
  
  const mobileProfileBtn = document.querySelector('.mobile-control-row .profile-btn');
  if (!menu.classList.contains('hidden') && 
      !menu.contains(e.target) && 
      e.target !== mobileProfileBtn) {
    menu.classList.add('hidden');
    if (mobileProfileBtn) {
      mobileProfileBtn.setAttribute('aria-expanded', 'false');
    }
  }
});

// Mobile logout button handler
document.addEventListener('click', async (e) => {
  if (e.target.id === 'mobileLogout') {
    e.preventDefault();
    if (!confirm('Vil du logge ut?')) return;
    try {
      await loggUt();
      showToast({ 
        type: 'success', 
        title: 'Logget ut', 
        message: 'Du er nå logget ut.', 
        duration: 2000 
      });
      document.getElementById('mobileProfileMenu')?.classList.add('hidden');
      showLogin();
    } catch (err) {
      console.error('Logout failed:', err);
      showToast({ 
        type: 'error', 
        title: 'Feil', 
        message: 'Kunne ikke logge ut.' 
      });
    }
  }
});

function setupDrawerHashtagListeners() {
  const drawerTrending = document.getElementById('drawerTrending');
  if (!drawerTrending) return;

  // Use event delegation for dynamically added hashtags
  drawerTrending.addEventListener('click', (e) => {
    const trendingTopic = e.target.closest('.trending-topic');
    if (!trendingTopic) return;

    // Extract hashtag from text (remove #)
    const hashtagText = trendingTopic.textContent.trim();
    const tag = hashtagText.startsWith('#') ? hashtagText.substring(1) : hashtagText;

    // Toggle hashtag filter
    currentHashtag = currentHashtag === tag ? null : tag;

    // Update UI to show selected state
    updateDrawerHashtagHighlight(tag);

    // Apply filter
    applySorting(schoolFilter, currentUser, document.getElementById('Threads'));

    // Update compact info row
    updateCompactInfo();

    // Close drawer after selection
    closeDrawer();
  });
}

function updateDrawerHashtagHighlight(selectedTag) {
  const drawerTrending = document.getElementById('drawerTrending');
  if (!drawerTrending) return;

  drawerTrending.querySelectorAll('.trending-topic').forEach(topic => {
    const topicText = topic.textContent.trim();
    const tag = topicText.startsWith('#') ? topicText.substring(1) : topicText;
    
    if (tag === selectedTag && currentHashtag === selectedTag) {
      topic.style.color = '#007bff';
      topic.style.fontWeight = 'bold';
    } else {
      topic.style.color = '';
      topic.style.fontWeight = '';
    }
  });
}

function openDrawer() {
  const drawer = document.getElementById('mobileSidebar');
  const overlay = document.getElementById('drawerOverlay');
  
  drawer.classList.add('open');
  overlay.classList.add('visible');
  document.body.style.overflow = 'hidden'; // Prevent background scrolling
  
  // Update drawer content
  updateDrawerContent();
}

function closeDrawer() {
  const drawer = document.getElementById('mobileSidebar');
  const overlay = document.getElementById('drawerOverlay');
  
  drawer.classList.remove('open');
  overlay.classList.remove('visible');
  document.body.style.overflow = ''; // Restore scrolling
}

function updateDrawerContent() {
  // Update trending in drawer - copy content and preserve functionality
  const drawerTrending = document.getElementById('drawerTrending');
  const mainTrending = document.getElementById('popular-hashtags');
  if (mainTrending && drawerTrending) {
    drawerTrending.innerHTML = '';
    const trendingItems = mainTrending.querySelectorAll('.trending-item');
    trendingItems.forEach(item => {
      const clonedItem = item.cloneNode(true);
      drawerTrending.appendChild(clonedItem);
    });
    
    // Update highlighting based on current selection
    if (currentHashtag) {
      updateDrawerHashtagHighlight(currentHashtag);
    }
  }

  // Update schools in drawer
  const drawerSchools = document.getElementById('drawerSchools');
  const mainSchools = document.getElementById('online-counter');
  if (mainSchools && drawerSchools) {
    drawerSchools.innerHTML = '';
    const schoolItems = mainSchools.querySelectorAll('.school-info');
    schoolItems.forEach(item => {
      const clonedItem = item.cloneNode(true);
      drawerSchools.appendChild(clonedItem);
    });
  }
}

// Create compact info row for mobile (call this in DOMContentLoaded)
function initCompactInfoRow() {
  const compactRow = document.createElement('div');
  compactRow.className = 'compact-info-row';
  compactRow.id = 'compactInfoRow';
  compactRow.innerHTML = `
    <div class="compact-section">
      <div class="compact-title">🔥 Trending</div>
      <div class="compact-hashtags" id="compactHashtags"></div>
    </div>
    <div class="compact-section">
      <div class="compact-title">👥 Online nå</div>
      <div class="compact-schools" id="compactSchools"></div>
    </div>
  `;
  
  const feedSection = document.querySelector('.feed-section');
  feedSection.insertBefore(compactRow, feedSection.firstChild);
}

function updateCompactInfo() {
  // Update compact hashtags
  const compactHashtags = document.getElementById('compactHashtags');
  if (compactHashtags) {
    overvåkTrendingHashtags((trending) => {
      compactHashtags.innerHTML = '';
      trending.slice(0, 3).forEach(([tag, count]) => {
        const hashtagEl = document.createElement('div');
        hashtagEl.className = 'compact-hashtag';
        hashtagEl.textContent = `#${tag}`;
        hashtagEl.style.backgroundColor = tag === currentHashtag ? 'var(--primary-color)' : '';
        hashtagEl.style.color = tag === currentHashtag ? 'white' : '';
        hashtagEl.addEventListener('click', () => {
          currentHashtag = currentHashtag === tag ? null : tag;
          applySorting(schoolFilter, currentUser, document.getElementById('Threads'));
          updateCompactInfo(); // Refresh highlighting
          
          // Also update main sidebar hashtag highlighting
          document.querySelectorAll('.trending-topic').forEach(t => {
            const tTag = t.textContent.substring(1);
            t.style.color = tTag === currentHashtag ? '#007bff' : '';
            t.style.fontWeight = tTag === currentHashtag ? 'bold' : '';
          });
        });
        compactHashtags.appendChild(hashtagEl);
      });
    });
  }

  // Update compact schools
  const compactSchools = document.getElementById('compactSchools');
  if (compactSchools) {
    overvåkOnlineBrukere((onlineBySchool, error) => {
      if (error) return;
      compactSchools.innerHTML = '';
      
      const schools = ['Skien VGS', 'Skogmo VGS', 'Hjalmar VGS'];
      schools.forEach(school => {
        const count = onlineBySchool[school] || 0;
        const schoolEl = document.createElement('div');
        schoolEl.className = 'compact-school';
        schoolEl.innerHTML = `
          <span class="compact-school-name">${school.replace(' VGS', '')}</span>
          <span class="compact-school-count">${count}</span>
        `;
        compactSchools.appendChild(schoolEl);
      });
    });
  }
}