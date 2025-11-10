const BASE_URL = window.location.origin;

// Switch Tabs
function switchTab(tabName) {
  document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".tab-button").forEach(b => b.classList.remove("active"));
  document.getElementById(tabName).classList.add("active");
  event.target.classList.add("active");
}

// Start Feedback Session
async function startSession() {
  const subject = document.getElementById("subject").value;
  const teacher = document.getElementById("teacher").value;
  const topic = document.getElementById("topic").value;

  if (subject === "" || teacher === "" || topic === "") {
    alert("Please fill all fields!");
    return;
  }

  try {
    // 🔹 Uses auth route if logged in, public route otherwise
    const data = await startSessionAuthAware({ subject, teacher, topic });
    
    if (data.success) {
      const sessionId = data.sessionId;
      const qrContainer = document.getElementById("qrDisplay");
      qrContainer.innerHTML = "";

      // ✅ changed to /student?sessionId=... so students go directly to feedback form
      new QRCode(qrContainer, {
        text: `${BASE_URL}/student?sessionId=${sessionId}`,
        width: 200,
        height: 200,
      });

      alert("Session started! Session ID: " + sessionId);
    } else {
      alert("Failed to start session!");
    }
  } catch (err) {
    console.error("Error:", err);
    alert("Error connecting to server.");
  }
}

// Student Feedback Functions
let currentRating = 0;

function setRating(rating) {
  currentRating = rating;
  document.querySelectorAll('.rating-option').forEach(option => {
    option.classList.remove('selected');
  });
  event.currentTarget.classList.add('selected');
}

function showFeedbackForm() {
  const sessionId = document.getElementById("sessionInput").value.trim();
  if (!sessionId) {
    alert("Please enter session ID!");
    return;
  }
  document.getElementById("feedbackSection").style.display = "block";
}

async function submitFeedback() {
  const sessionId = document.getElementById("sessionInput").value.trim();
  const comment = document.getElementById("comment").value;

  if (!sessionId) {
    alert("Please enter session ID!");
    return;
  }

  if (currentRating === 0) {
    alert("Please select a rating!");
    return;
  }

  try {
    // ✅ changed to BASE_URL
    const res = await fetch(`${BASE_URL}/api/feedback/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        sessionId: sessionId, 
        rating: currentRating, 
        comment: comment 
      }),
    });

    const data = await res.json();
    if (data.success) {
      document.getElementById("feedbackSection").style.display = "none";
      document.getElementById("thankYou").style.display = "block";
    } else {
      alert("Failed to submit feedback!");
    }
  } catch (err) {
    console.error("Error:", err);
    alert("Error connecting to server.");
  }
}

// Analytics Functions with Charts
let ratingChart = null;

async function loadAnalytics() {
  const sessionId = document.getElementById("analyticsSessionId").value.trim();
  
  if (!sessionId) {
    alert("Please enter session ID!");
    return;
  }

  try {
    // ✅ changed to BASE_URL
    const res = await fetch(`${BASE_URL}/api/analytics/${sessionId}`);
    const data = await res.json();

    if (data.totalResponses !== undefined) {
      // Update stats numbers
      document.getElementById("totalStudentResponses").textContent = data.totalResponses;
      document.getElementById("avgSessionRating").textContent = data.avgRating.toFixed(1);

      // Create charts
      createRatingDistributionChart(data.feedbacks);
      createRatingTrendChart(data.feedbacks);
      
      // Show feedback comments
      displayFeedbackComments(data.feedbacks);
      
    } else {
      alert("No data found for this session ID!");
    }

  } catch (err) {
    console.error("Error:", err);
    alert("Error loading analytics.");
  }
}

// Create Rating Distribution Chart (Pie Chart)
function createRatingDistributionChart(feedbacks) {
  const ctx = document.getElementById('ratingChart').getContext('2d');
  
  // Destroy previous chart if exists
  if (ratingChart) {
    ratingChart.destroy();
  }

  // Count ratings
  const ratingCounts = {1:0, 2:0, 3:0, 4:0, 5:0};
  feedbacks.forEach(fb => {
    ratingCounts[fb.rating]++;
  });

  ratingChart = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: ['😵 Very Confused', '😕 Somewhat Confused', '🙂 Partially Clear', '😊 Well Understood', '😍 Perfectly Clear'],
      datasets: [{
        data: [ratingCounts[1], ratingCounts[2], ratingCounts[3], ratingCounts[4], ratingCounts[5]],
        backgroundColor: [
          '#ff6b6b',
          '#ffa8a8',
          '#ffe066',
          '#51cf66',
          '#2b8a3e'
        ],
        borderWidth: 2,
        borderColor: '#fff'
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'bottom',
        },
        title: {
          display: true,
          text: 'Rating Distribution',
          font: {
            size: 16
          }
        }
      }
    }
  });
}

let trendChart = null;

function createRatingTrendChart(feedbacks) {
  const ctx = document.getElementById('trendChart').getContext('2d');

  if (trendChart) {
    trendChart.destroy();
  }

  const sortedFeedbacks = [...feedbacks].sort((a, b) => 
    new Date(a.createdAt) - new Date(b.createdAt)
  );

  const ratingsOverTime = sortedFeedbacks.map(fb => fb.rating);
  const timeLabels = sortedFeedbacks.map((fb, index) => `Response ${index + 1}`);

  trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: timeLabels,
      datasets: [{
        label: 'Rating Trend',
        data: ratingsOverTime,
        borderColor: '#667eea',
        backgroundColor: 'rgba(102, 126, 234, 0.1)',
        borderWidth: 3,
        fill: true,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: {
          beginAtZero: false,
          min: 1,
          max: 5,
          ticks: { stepSize: 1 }
        }
      },
      plugins: {
        title: {
          display: true,
          text: 'Rating Trend Over Time',
          font: { size: 16 }
        }
      }
    }
  });
}

// Display Feedback Comments
function displayFeedbackComments(feedbacks) {
  const commentsContainer = document.getElementById('feedbackComments');
  const comments = feedbacks.filter(fb => fb.comment && fb.comment.trim() !== '');
  
  if (comments.length === 0) {
    commentsContainer.innerHTML = '<p style="text-align:center;color:#666;padding:20px;">No comments yet</p>';
    return;
  }

  let html = '<h4 style="color:#667eea;margin-bottom:15px;">Student Comments:</h4>';
  comments.forEach(fb => {
    const time = new Date(fb.createdAt).toLocaleTimeString();
    html += `
      <div class="comment-item">
        <div class="comment-rating">Rating: ${'⭐'.repeat(fb.rating)}</div>
        <div class="comment-text">"${fb.comment}"</div>
        <div class="comment-time">${time}</div>
      </div>
    `;
  });
  
  commentsContainer.innerHTML = html;
}

// ===== Teacher Auth (minimal, non-breaking) =====
function getToken() {
  return localStorage.getItem("authToken");
}
function setToken(t) {
  localStorage.setItem("authToken", t);
}
function logoutTeacher() {
  localStorage.removeItem("authToken");
  alert("Logged out");
  // optional: refresh teacher sessions UI
  if (typeof loadMySessions === "function") loadMySessions();
}

// Sign up a teacher
async function signupTeacher(name, email, password) {
  const res = await fetch(`${BASE_URL}/api/teacher/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password })
  });
  return res.json();
}

// Login a teacher
async function loginTeacher(email, password) {
  const res = await fetch(`${BASE_URL}/api/teacher/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (data.success && data.token) setToken(data.token);
  return data;
}

// Start session (auth-aware). Falls back to your existing public route if not logged in.
async function startSessionAuthAware(payload) {
  const token = getToken();
  if (!token) {
    // public route (your original one) — keeps everything working
    const res = await fetch(`${BASE_URL}/api/session/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.json();
  } else {
    // auth-protected route (requires server to have /api/session/start-auth)
    const res = await fetch(`${BASE_URL}/api/session/start-auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    return res.json();
  }
}

// (Optional) Show teacher's sessions so they don't copy IDs manually
async function loadMySessions() {
  const box = document.getElementById("mySessions");
  if (!box) return; // not placed in the HTML -> skip
  const token = getToken();
  if (!token) {
    box.innerHTML = `<p style="color:#666">Login to see your sessions.</p>`;
    return;
  }

  const res = await fetch(`${BASE_URL}/api/teacher/sessions`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  const data = await res.json();
  if (!data.success) {
    box.innerHTML = `<p style="color:#c00">Failed to load your sessions.</p>`;
    return;
  }

  const list = data.sessions || [];
  if (list.length === 0) {
    box.innerHTML = `<p style="color:#666">No sessions yet.</p>`;
    return;
  }

  let html = `<h4>Your Recent Sessions</h4><ul style="list-style:none;padding-left:0">`;
  list.forEach(s => {
    html += `
      <li style="margin:8px 0">
        <strong>${s.subject}</strong> – ${s.topic}
        <code style="margin-left:6px">${s.sessionId}</code>
        <button style="margin-left:8px" onclick="quickAnalytics('${s.sessionId}')">View Analytics</button>
      </li>`;
  });
  html += `</ul>`;
  box.innerHTML = html;
}

async function quickAnalytics(sessionId) {
  const el = document.getElementById("analyticsSessionId");
  if (el) el.value = sessionId;
  switchTab('analytics');
  await loadAnalytics();
}

// Minimal UI handlers (call from buttons)
async function doSignup() {
  const name = document.getElementById('authName')?.value.trim();
  const email = document.getElementById('authEmail')?.value.trim();
  const password = document.getElementById('authPass')?.value;
  if (!name || !email || !password) return alert("Fill name, email, password");
  const res = await signupTeacher(name, email, password);
  alert(res.success ? "Signup successful! You are logged in." : (res.message || "Signup failed"));
  if (res.success) loadMySessions();
}

async function doLogin() {
  const email = document.getElementById('authEmail')?.value.trim();
  const password = document.getElementById('authPass')?.value;
  if (!email || !password) return alert("Fill email and password");
  const res = await loginTeacher(email, password);
  alert(res.success ? "Logged in!" : (res.message || "Login failed"));
  if (res.success) loadMySessions();
}

// Try to load sessions on page load if logged in
window.addEventListener('load', () => {
  loadMySessions();
});

// Auto-load feedback form if sessionId in URL
window.onload = function() {
  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get('sessionId');
  if (sessionId) {
    document.getElementById("sessionInput").value = sessionId;
    switchTab('student');
    showFeedbackForm();
  }
};
