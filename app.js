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


// ============================================
// post thread functionality
// ============================================

document.getElementById("post-thread").addEventListener("submit", async (e) => {
  e.preventDefault(); // 🚀 stop page reload

  const content = e.target.querySelector("textarea").value;
  
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
      hashtags: hashtags
    })
    .then(() => {
      e.target.reset();
      alert("Tråd postet!");
    });
  });
});



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

function visTråderLive(selectedSchool = "Alle skoler") {
  const container = document.getElementById("Threads");

  let currentUser = null;
  overvåkBruker(user => currentUser = user);

  visDokumenterLive("Threads", (docs) => {
    // defensiv: forventer en array
    if (!Array.isArray(docs)) return;

    // tøm container sikkert
    container.innerHTML = "";

    // filter etter skole
    let filteredDocs = docs;
    if (selectedSchool !== "Alle skoler") {
      filteredDocs = docs.filter(thread => thread && thread.school === selectedSchool);
    }

    // sortere (behandler mulig Firestore Timestamp)
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

    const fragment = document.createDocumentFragment();

    filteredDocs.forEach((data) => {
      // defensiv fallback for data
      data = data || {};
      const postEl = document.createElement("div");
      postEl.classList.add("thread-card");

      // --- Header ---
      const header = document.createElement("div");
      header.classList.add("thread-header");

      const avatar = document.createElement("div");
      avatar.classList.add("user-avatar");
      // getInitials antas sikker: wrap i String og fallback
      avatar.textContent = String(getInitials(data.authorName || "Anonym"));

      const userInfo = document.createElement("div");
      userInfo.classList.add("thread-user-info");

      const username = document.createElement("div");
      username.classList.add("thread-username");
      username.textContent = String(data.authorName || "Anonym");

      const meta = document.createElement("div");
      meta.classList.add("thread-meta");
      // timeAgo antas å returnere streng - gjøres defensivt
      try {
        meta.appendChild(document.createTextNode(String(timeAgo(data.createdAt))));
      } catch (err) {
        meta.appendChild(document.createTextNode(""));
      }

      const schoolBadge = document.createElement("span");
      schoolBadge.classList.add("thread-school-badge");
      schoolBadge.textContent = String(data.school || "");

      // legg til meta/ badge (mellomrom for lesbarhet)
      meta.appendChild(document.createTextNode(" "));
      meta.appendChild(schoolBadge);

      userInfo.appendChild(username);
      userInfo.appendChild(meta);

      header.appendChild(avatar);
      header.appendChild(userInfo);

      // --- Content (sikkert, bruker textContent) ---
      const contentEl = document.createElement("div");
      contentEl.classList.add("thread-content");
      contentEl.textContent = String(data.content || "");

      // --- Actions ---
      const actions = document.createElement("div");
      actions.classList.add("thread-actions");

      // Like-knapp
      const likeBtn = document.createElement("button");
      likeBtn.classList.add("action-btn", "like");

      const userLiked = currentUser && Array.isArray(data.likes) && data.likes.includes(currentUser.uid);
      const likeEmoji = document.createElement("span");
      likeEmoji.textContent = userLiked ? "❤️" : "🤍";

      const likeCount = document.createElement("span");
      likeCount.textContent = String((Array.isArray(data.likes) ? data.likes.length : 0));

      likeBtn.appendChild(likeEmoji);
      likeBtn.appendChild(likeCount);

      likeBtn.addEventListener("click", () => {
        if (!currentUser) {
          alert("Du må være logget inn for å like!");
          return;
        }
        // toggleLike bør være en allerede definert funksjon
        toggleLike(data.id, currentUser.uid);
      });

      // Comment-knapp
      const commentBtn = document.createElement("button");
      commentBtn.classList.add("action-btn", "comment");

      const commentEmoji = document.createElement("span");
      commentEmoji.textContent = "💬";

      const commentCount = document.createElement("span");
      commentCount.textContent = String((Array.isArray(data.comments) ? data.comments.length : 0));

      commentBtn.appendChild(commentEmoji);
      commentBtn.appendChild(commentCount);

      actions.appendChild(likeBtn);
      actions.appendChild(commentBtn);

      // --- Beste måte å bygge elementet på ---
      postEl.appendChild(header);
      postEl.appendChild(contentEl);
      postEl.appendChild(actions);

      fragment.appendChild(postEl);
    });

    container.appendChild(fragment);
  });
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
  visTråderLive()
})

document.getElementById("nylig").addEventListener("click", () => {
  sortThreadsBy = "recent"

  const recent = document.getElementById("nylig")
  recent.classList.add("active")

  const popular = document.getElementById("popular")
  popular.classList.remove("active")
  visTråderLive()
})

document.getElementById("schoolFilter").addEventListener("change", (e) => {
  visTråderLive(e.target.value);
});

visTråderLive()
