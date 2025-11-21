const BASE_URL = window.location.origin;
// If user opens /student path, redirect to index.html but keep all parameters
if (window.location.pathname === "/student") {
    const params = window.location.search;
    window.location.replace(`${BASE_URL}/index.html${params}`);
}

// Switch Tabs
function switchTab(tabName, btnEl = null) {
  document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".tab-button").forEach(b => b.classList.remove("active"));

  // show pane
  const pane = document.getElementById(tabName);
  if (pane) pane.classList.add("active");

  // highlight the matching button (works for programmatic calls too)
  if (btnEl) {
    btnEl.classList.add("active");
  } else {
    const btn = Array.from(document.querySelectorAll(".tab-button"))
      .find(b => (b.getAttribute("onclick") || "").includes(`'${tabName}'`));
    if (btn) btn.classList.add("active");
  }
}

// Start Feedback Session (manual start)
async function startSession() {
  const subject = document.getElementById("subject").value;
  let teacher = "";
const storedUser = JSON.parse(localStorage.getItem("teacherUser") || "{}");
teacher = storedUser.name || "Unknown";

  if (!teacher) {
    const storedUser = JSON.parse(localStorage.getItem("teacherUser") || "{}");
    teacher = storedUser.name || teacher;
  }
  const topic = document.getElementById("topic").value;
  const className = document.getElementById("className") 
    ? document.getElementById("className").value.trim() 
    : "Unknown";
  const section = document.getElementById("section")
    ? document.getElementById("section").value.trim()
    : "N/A";

  if (subject === "" || teacher === "" || topic === "") {
    alert("Please fill all fields!");
    return;
  }

  try {
    // Uses auth route if logged in, public route otherwise
    const data = await startSessionAuthAware({
      subject,
      teacher,
      topic,
      className,
      section
    });

    if (data.success) {
      const sessionId = data.sessionId;
      const qrContainer = document.getElementById("qrDisplay");
      qrContainer.innerHTML = "";

      // Generate QR for students with class + subject
      new QRCode(qrContainer, {
        text: `${BASE_URL}/student?sessionId=${sessionId}&class=${encodeURIComponent(className)}&section=${encodeURIComponent(section)}&subject=${encodeURIComponent(subject)}&teacher=${encodeURIComponent(teacher)}&topic=${encodeURIComponent(topic)}`,
        width: 200,
        height: 200,
      });

      // Auto-fill analytics box
      const analyticsBox = document.getElementById("analyticsSessionId");
      if (analyticsBox) analyticsBox.value = sessionId;

      alert(`✅ Session started for ${className} (${subject}) — QR is ready for students to scan.`);
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
  // event handler context
  if (window.event && window.event.currentTarget) window.event.currentTarget.classList.add('selected');
}

function showFeedbackForm() {
  const sessionId = document.getElementById("sessionInput").value.trim();
  if (!sessionId) {
    alert("Please enter session ID!");
    return;
  }

  // Show feedback form
  document.getElementById("feedbackSection").style.display = "block";

  // Read class/subject/teacher from URL
  const url = new URL(window.location.href);
  const className = url.searchParams.get("class");
  const section = url.searchParams.get("section");
  const subject = url.searchParams.get("subject");
  const teacherName = url.searchParams.get("teacher");
  const topic = url.searchParams.get("topic");

  // Update details display
  const detailsDiv = document.getElementById("feedbackDetails");
  if (detailsDiv && (className || section || subject || teacherName)) {
    detailsDiv.innerHTML = `
      <div style="
        background: #f4f6ff;
        border: 2px solid #667eea;
        border-radius: 12px;
        padding: 10px 20px;
        margin-bottom: 15px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        font-weight: 600;
        color: #333;
        text-align: center;">
        👨‍🏫 Teacher: ${teacherName || "N/A"} <br>
        🏫 Class: ${className || "N/A"} ${section ? "(" + section + ")" : ""}<br>
        📘 Subject: ${subject || "N/A"}<br>
        📝 Topic: ${topic || "N/A"}
      </div>
    `;
  }
}

async function submitFeedback() {
  const sessionId = document.getElementById("sessionInput").value.trim();
  if (localStorage.getItem("feedback_submitted_" + sessionId)) {
    alert("You have already submitted feedback using this device.");
    return;
  }
  
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
      localStorage.setItem("feedback_submitted_" + sessionId, "true");
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
    const res = await fetch(`${BASE_URL}/api/analytics/${encodeURIComponent(sessionId)}`);
    const data = await res.json();

    if (data.totalResponses !== undefined) {

      /* -----------------------------------------
         1) UPDATE TOTAL SESSIONS FOR THIS CLASS (NEW)
      ------------------------------------------ */
      const token = getToken();
      if (token) {
        const sRes = await fetch(`${BASE_URL}/api/teacher/sessions`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const sData = await sRes.json();
        if (sData.success) {
          // Count sessions for this specific class
          const className = data.className;
          const section = data.section;
          const sessionsForThisClass = sData.sessions.filter(s => 
            s.className === className && s.section === section
          ).length;
          
          document.getElementById("totalSessions").textContent = sessionsForThisClass;
        }
      }
      /* ----------------------------------------- */

      // Update stats numbers (only for current session)
      document.getElementById("totalStudentResponses").textContent = data.totalResponses;
      document.getElementById("avgSessionRating").textContent = (data.avgRating || 0).toFixed(1);

      // Create charts (only for current session)
      createRatingDistributionChart(data.feedbacks);
      createRatingTrendChart(data.feedbacks);
      
      // Show feedback comments (only for current session)
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
  
  if (ratingChart) {
    ratingChart.destroy();
  }

  const ratingCounts = {1:0, 2:0, 3:0, 4:0, 5:0};
  feedbacks.forEach(fb => {
    ratingCounts[fb.rating] = (ratingCounts[fb.rating] || 0) + 1;
  });

  ratingChart = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: ['😵 Very Confused', '😕 Somewhat Confused', '🙂 Partially Clear', '😊 Well Understood', '😍 Perfectly Clear'],
      datasets: [{
        data: [ratingCounts[1], ratingCounts[2], ratingCounts[3], ratingCounts[4], ratingCounts[5]],
        backgroundColor: ['#ff6b6b','#ffa8a8','#ffe066','#51cf66','#2b8a3e'],
        borderWidth: 2,
        borderColor: '#fff'
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom' },
        title: {
          display: true,
          text: 'Rating Distribution',
          font: { size: 16 }
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

  const sortedFeedbacks = [...feedbacks].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const ratingsOverTime = sortedFeedbacks.map(fb => fb.rating);
  const timeLabels = sortedFeedbacks.map((fb, index) => `Resp ${index+1}`);

  trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: timeLabels,
      datasets: [{
        label: 'Rating Trend',
        data: ratingsOverTime,
        borderColor: '#667eea',
        backgroundColor: 'rgba(102,126,234,0.1)',
        borderWidth: 3,
        fill: true,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: { beginAtZero: false, min: 1, max: 5, ticks: { stepSize: 1 } }
      },
      plugins: {
        title: { display: true, text: 'Rating Trend Over Time', font: { size: 16 } }
      }
    }
  });
}

// Display Feedback Comments
// Display Feedback Comments
async function displayFeedbackComments(feedbacks) {
  const commentsContainer = document.getElementById('feedbackComments');
  const comments = feedbacks
    .map(fb => fb.comment)
    .filter(c => c && c.trim().length > 0);

  if (comments.length === 0) {
    commentsContainer.innerHTML =
      '<p style="text-align:center;color:#666;padding:20px;">No comments yet</p>';
    return;
  }

  // Show loading indicator
  commentsContainer.innerHTML = `
    <div style="text-align:center;padding:20px;color:#667eea;">
      <div>🤖 AI is analyzing ${comments.length} student comments...</div>
      <div style="font-size:12px;color:#666;margin-top:8px;">This may take a few seconds</div>
    </div>
  `;

  // Load analysis asynchronously
  const summary = await summarizeComments(comments);

  let html = `
    <h4 style="color:#667eea;margin-bottom:10px;">
      Summary of Student Feedback
      ${summary.isAI ? '<span style="font-size:12px;color:#51cf66;">(AI Powered)</span>' : '<span style="font-size:12px;color:#ff6b6b;">(Rule-Based Fallback)</span>'}
    </h4>
    <div style="background:#f0f4ff;padding:15px;border-radius:8px;margin-bottom:20px;border-left:4px solid #667eea;">
      ${formatSummary(summary.summaryOneLine)}
    </div>

    <h4 style="color:#667eea;margin-bottom:10px;">Student Comments (sample):</h4>
  `;

  summary.sampleComments.forEach((c, i) => {
    html += `
      <div style="padding:8px;border-bottom:1px solid #eee;">
        "${c}"
      </div>
    `;
  });

  commentsContainer.innerHTML = html;
}

// Helper function to format the summary
function formatSummary(summary) {
  return summary
    .split('. ')
    .map(sentence => sentence.trim())
    .filter(sentence => sentence.length > 0)
    .map(sentence => `• ${sentence}`)
    .join('<br>');
}
// ===== Teacher Auth (minimal) =====
function getToken() { return localStorage.getItem("authToken"); }
function setToken(t) { localStorage.setItem("authToken", t); }

function logoutTeacher() {
  localStorage.removeItem("authToken");
  alert("Logged out");
  updateTeacherUI();
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

// Start session (auth-aware).
async function startSessionAuthAware(payload) {
  const token = getToken();
  if (!token) {
    const res = await fetch(`${BASE_URL}/api/session/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.json();
  } else {
    const res = await fetch(`${BASE_URL}/api/session/start-auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    return res.json();
  }
}

// (Optional) Show teacher's sessions so they don't copy IDs manually
// (Optional) Show teacher's sessions so they don't copy IDs manually
let allSessions = []; // Store sessions globally for filtering

async function loadMySessions() {
  const box = document.getElementById("mySessions");
  if (!box) return;

  const token = getToken();
  if (!token) {
    box.innerHTML = `<p style="color:#666">Login to see your sessions.</p>`;
    return;
  }

  const res = await fetch(`${BASE_URL}/api/teacher/sessions`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  const data = await res.json();
  if (!data.success) {
    box.innerHTML = `<p style="color:#c00">Failed to load sessions.</p>`;
    return;
  }

  allSessions = data.sessions || [];
  if (allSessions.length === 0) {
    box.innerHTML = `<p style="color:#666">No sessions yet.</p>`;
    return;
  }

  // Populate filter dropdowns
  populateFilters(allSessions);
  
  // Display filtered sessions
  displayFilteredSessions(allSessions);
}

function populateFilters(sessions) {
  const classFilter = document.getElementById('classFilter');
  const subjectFilter = document.getElementById('subjectFilter');
  
  if (!classFilter || !subjectFilter) return;
  
  // Get unique classes and subjects
  const classes = [...new Set(sessions.map(s => s.className).filter(Boolean))];
  const subjects = [...new Set(sessions.map(s => s.subject).filter(Boolean))];
  
  // Populate class filter
  classFilter.innerHTML = '<option value="">All Classes</option>';
  classes.forEach(className => {
    const opt = document.createElement('option');
    opt.value = className;
    opt.textContent = className;
    classFilter.appendChild(opt);
  });
  
  // Populate subject filter
  subjectFilter.innerHTML = '<option value="">All Subjects</option>';
  subjects.forEach(subject => {
    const opt = document.createElement('option');
    opt.value = subject;
    opt.textContent = subject;
    subjectFilter.appendChild(opt);
  });
}

function displayFilteredSessions(sessions) {
  const box = document.getElementById("mySessions");
  const searchTerm = document.getElementById('sessionSearch')?.value.toLowerCase() || '';
  const classFilter = document.getElementById('classFilter')?.value || '';
  const subjectFilter = document.getElementById('subjectFilter')?.value || '';
  const dateFilter = document.getElementById('dateFilter')?.value || '';
  
  // Filter sessions
  let filteredSessions = sessions.filter(session => {
    const matchesSearch = !searchTerm || 
      (session.className && session.className.toLowerCase().includes(searchTerm)) ||
      (session.subject && session.subject.toLowerCase().includes(searchTerm)) ||
      (session.topic && session.topic.toLowerCase().includes(searchTerm)) ||
      (session.sessionId && session.sessionId.toLowerCase().includes(searchTerm));
    
    const matchesClass = !classFilter || session.className === classFilter;
    const matchesSubject = !subjectFilter || session.subject === subjectFilter;
    // NEW: Date filtering
    const matchesDate = !dateFilter || new Date(session.createdAt).toISOString().split('T')[0] === dateFilter;
    
    return matchesSearch && matchesClass && matchesSubject && matchesDate;
  });
  
  // Ensure sessions sorted latest first
  filteredSessions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  if (filteredSessions.length === 0) {
    box.innerHTML = `<p style="color:#666; text-align: center; padding: 20px;">No sessions match your filters</p>`;
    return;
  }

  let html = `<div style="color: #666; font-size: 14px; margin-bottom: 10px;">Showing ${filteredSessions.length} of ${allSessions.length} sessions</div>`;
  let lastDate = "";

  filteredSessions.forEach(s => {
    const date = new Date(s.createdAt);
    const dateStr = date.toLocaleDateString();
    const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    // Group by date
    if (dateStr !== lastDate) {
      html += `<h4 style="margin-top:20px;margin-bottom:8px;color:#555; padding: 5px 10px; background: #f0f4ff; border-radius: 6px;">📅 ${dateStr}</h4>`;
      lastDate = dateStr;
    }

    html += `
      <div style="padding:12px;background:#f7f9ff;border-left:5px solid #667eea;border-radius:8px;margin-bottom:10px;">
        <div style="font-weight:bold;font-size:15px;">
          ${s.className || ""} ${s.section || ""} — ${s.subject}
        </div>
        <div style="margin-top:2px;">📝 Topic: ${s.topic}</div>
        <div style="margin-top:2px;">⏰ Time: ${timeStr}</div>
        <div style="margin-top:5px; display:flex; gap:10px; align-items:center; flex-wrap: wrap;">
          <code style="background: #e9ecef; padding: 4px 8px; border-radius: 4px;">${s.sessionId}</code>
          <button style="padding:6px 10px;border-radius:5px; background: #667eea; color: white; border: none; cursor: pointer;"
                  onclick="quickAnalytics('${s.sessionId}')">
            View Analytics
          </button>
          <button style="padding:6px 10px;border-radius:5px;background:#0A84FF;color:white;border:none; cursor: pointer;"
                  onclick="downloadReport('${s.sessionId}')">
            Download Report
          </button>
        </div>
      </div>
    `;
  });

  box.innerHTML = html;
}

function clearFilters() {
  document.getElementById('sessionSearch').value = '';
  document.getElementById('classFilter').value = '';
  document.getElementById('subjectFilter').value = '';
  document.getElementById('dateFilter').value = ''; // NEW
  if (typeof displayFilteredSessions === 'function') {
    displayFilteredSessions(allSessions);
  }
}

// Add event listeners for real-time filtering
document.addEventListener('DOMContentLoaded', function() {
  setTimeout(() => {
    const searchInput = document.getElementById('sessionSearch');
    const classFilter = document.getElementById('classFilter');
    const subjectFilter = document.getElementById('subjectFilter');
    
    if (searchInput) {
      searchInput.addEventListener('input', () => displayFilteredSessions(allSessions));
    }
    if (classFilter) {
      classFilter.addEventListener('change', () => displayFilteredSessions(allSessions));
    }
    if (subjectFilter) {
      subjectFilter.addEventListener('change', () => displayFilteredSessions(allSessions));
    }
    const dateFilterInput = document.getElementById("dateFilter");
if (dateFilterInput) {
  dateFilterInput.addEventListener('change', () => displayFilteredSessions(allSessions));
}
  }, 1000);
});

async function quickAnalytics(sessionId) {
  const el = document.getElementById("analyticsSessionId");
  if (el) el.value = sessionId;
  switchTab('analytics');
  await loadAnalytics();
}

async function doSignup() {
  const name = document.getElementById('authName')?.value.trim();
  const email = document.getElementById('authEmail')?.value.trim();
  const password = document.getElementById('authPass')?.value;

  if (!name || !email || !password) return alert("Fill name, email, and password");
  const res = await signupTeacher(name, email, password);

  if (res.success) {
    setToken(res.token);
    localStorage.setItem("teacherUser", JSON.stringify(res.user));
    alert("Signup successful!");
    updateTeacherUI();
  } else {
    alert(res.message || "Signup failed");
  }
}

async function doLogin() {
  const email = document.getElementById('authEmail')?.value.trim();
  const password = document.getElementById('authPass')?.value;

  if (!email || !password) return alert("Fill email and password");

  const res = await loginTeacher(email, password);

  if (res.success) {
    setToken(res.token);

    // FIX: save teacher details properly
    localStorage.setItem("teacherUser", JSON.stringify({
      name: res.user.name,
      email: res.user.email
    }));

    alert("Login successful!");
    updateTeacherUI();
  } else {
    alert(res.message || "Login failed");
  }
}

// Try to load sessions on page load if logged in
window.addEventListener("load", () => {
  loadSavedClasses();
  loadMySessions();
});

function updateTeacherUI() {
  const token = getToken();
  const authSection = document.getElementById("teacherAuthSection");
  const dashboard = document.getElementById("teacherDashboard");

  if (token) {
    authSection.style.display = "none";
    dashboard.style.display = "block";
    setTimeout(() => { autofillTeacherName(); }, 50);
    loadMySessions();
  } else {
    authSection.style.display = "block";
    dashboard.style.display = "none";
  }
}

function logoutTeacher() {
  localStorage.removeItem("authToken");
  alert("Logged out successfully!");
  updateTeacherUI();
}

window.onload = function () {
  updateTeacherUI();

  const url = new URL(window.location.href);
  const sessionId = url.searchParams.get('sessionId');
  const className = url.searchParams.get('class');
  const section = url.searchParams.get('section');
  const subject = url.searchParams.get('subject');
  let teacherName = url.searchParams.get('teacher') || "N/A";
  const topic = url.searchParams.get("topic");

  const isStudentLink = url.pathname.includes('student') || url.searchParams.has('sessionId');

  if (isStudentLink) {
    const teacherBtn = document.querySelector("button[onclick=\"switchTab('teacher')\"]");
    if (teacherBtn) teacherBtn.style.display = "none";
    const analyticsBtn = document.querySelector("button[onclick=\"switchTab('analytics')\"]");
    if (analyticsBtn) analyticsBtn.style.display = "none";
    const teacherTab = document.getElementById("teacher");
    if (teacherTab) teacherTab.style.display = "none";
    const analyticsTab = document.getElementById("analytics");
    if (analyticsTab) analyticsTab.style.display = "none";
  }

  if (isStudentLink && sessionId) {
    document.getElementById("sessionInput").value = sessionId;
    switchTab('student');
    showFeedbackForm();

    const detailsDiv = document.getElementById("feedbackDetails");
    if (detailsDiv) {
      detailsDiv.innerHTML = `
  <div style="
    background: #f4f6ff;
    border: 2px solid #667eea;
    border-radius: 12px;
    padding: 10px 20px;
    margin-bottom: 15px;
    box-shadow: 0 2px 5px rgba(0,0,0,0.1);
    font-weight: 600;
    color: #333;
    text-align: center;">
    👨‍🏫 Teacher: ${teacherName || "N/A"} <br>
    🏫 Class: ${className || "N/A"} ${section ? "(" + section + ")" : ""}<br>
    📘 Subject: ${subject || "N/A"} <br>
    📝 Topic: ${topic || "N/A"}
  </div>
`;
    }
  }

  setTimeout(() => autofillTeacherName(), 100);
};

// ====================
// CLASS TEMPLATE SYSTEM
// ====================
function saveClassTemplate() {
  const className = document.getElementById("className").value.trim();
  const subject = document.getElementById("subject").value.trim();
  const teacher = document.getElementById("teacher").value.trim();

  if (!className || !subject || !teacher) {
    alert("Please fill Class, Subject, and Teacher before saving!");
    return;
  }

  const saved = JSON.parse(localStorage.getItem("savedClasses") || "[]");

  if (saved.some(c => c.className === className && c.subject === subject)) {
    alert("This class and subject combination already exists!");
    return;
  }

  saved.push({ className, subject, teacher });
  localStorage.setItem("savedClasses", JSON.stringify(saved));
  loadSavedClasses();
  alert("✅ Class saved!");
}

function loadSavedClasses() {
  const dropdown = document.getElementById("savedClasses");
  if (!dropdown) return;

  const saved = JSON.parse(localStorage.getItem("savedClasses") || "[]");
  dropdown.innerHTML = `<option value="">Select Saved Class</option>`;

  saved.forEach(c => {
    const opt = document.createElement("option");
    opt.value = JSON.stringify(c);
    opt.textContent = `${c.className} - ${c.subject}`;
    dropdown.appendChild(opt);
  });
}

function selectSavedClass() {
  const dropdown = document.getElementById("savedClasses");
  const selected = dropdown.value;
  if (!selected) return;

  const storedUser = JSON.parse(localStorage.getItem("teacherUser") || "{}");
  if (storedUser.name) {
    document.getElementById("teacher").value = storedUser.name;
  }
}

// ====================
// QUICK SESSION START
// ====================
async function startQuickSession() {
  const dropdown = document.getElementById("savedClasses");
  const selected = dropdown.value;
  if (!selected) return alert("Please select a saved class first!");

  const { className, subject, teacher } = JSON.parse(selected);

  const now = new Date();
  const datePart = now.toISOString().split("T")[0];
  const timePart = now.toTimeString().split(" ")[0].slice(0, 5).replace(":", "-");

  const sessionId = `${className}_${subject}_${datePart}_${timePart}`.toLowerCase().replace(/\s+/g, "_");

  try {
    const data = await startSessionAuthAware({
      subject,
      teacher,
      topic: "Auto",
      sessionId
    });

    if (data.success) {
      const qrContainer = document.getElementById("qrDisplay");
      qrContainer.innerHTML = "";

      new QRCode(qrContainer, {
        text: `${BASE_URL}/student?sessionId=${encodeURIComponent(sessionId)}&class=${encodeURIComponent(className)}&subject=${encodeURIComponent(subject)}&teacher=${encodeURIComponent(teacher)}&topic=${encodeURIComponent("Auto")}`,
        width: 200,
        height: 200
      });

      const analyticsBox = document.getElementById("analyticsSessionId");
      if (analyticsBox) analyticsBox.value = sessionId;

      setTimeout(() => {
        switchTab("analytics");
        loadAnalytics();
      }, 1000);

      alert(`✅ Session started for ${className} (${subject})`);
    } else {
      alert("Failed to start session.");
    }
  } catch (err) {
    console.error("Error starting quick session:", err);
    alert("Error connecting to server.");
  }
}

// Auto-load saved classes when page loads
window.addEventListener("load", () => {
  loadSavedClasses();
});

function autofillTeacherName() {
  const storedUser = JSON.parse(localStorage.getItem("teacherUser") || "{}");
  const input = document.getElementById("teacher");
  if (input && storedUser.name) {
    input.value = storedUser.name;
  }
}

/* ===========================
   PDF REPORT (Professional)
   =========================== */

const LOGO_BASE64 = ""; // optional base64 string
const LOGO_PATH = "logo.jpeg"; // recommended to put logo.jpg at project root

async function summarizeComments(comments) {
  if (!comments || comments.length === 0) {
    return {
      summaryOneLine: "No comments to summarize.",
      sampleComments: []
    };
  }

  try {
    console.log(`🤖 AI analyzing ${comments.length} comments...`);
    
    const res = await fetch(`${BASE_URL}/api/summarize-comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comments })
    });

    const data = await res.json();
    
    if (data.success) {
      return {
        summaryOneLine: data.summary,
        sampleComments: comments.slice(0, 8),
        totalComments: data.totalComments,
        isAI: !data.isFallback
      };
    } else {
      throw new Error("AI summarization failed");
    }
  } catch (err) {
    console.error("AI summarization error:", err);
    console.log("Falling back to rule-based summarization...");
    
    // Fallback to rule-based summarization
    return fallbackSummarizeComments(comments);
  }
}

// Keep your original function as fallback
function fallbackSummarizeComments(comments) {
  if (!comments || comments.length === 0) {
    return {
      summaryOneLine: "No comments to summarize.",
      sampleComments: []
    };
  }

  const text = comments.join(" ").toLowerCase();

  let issues = [];
  let positives = [];

  if (/not understand|confus|difficult|hard|unclear/.test(text)) {
    issues.push("many students found the explanation unclear");
  }

  if (/fast|quick|speed/.test(text)) {
    issues.push("some students felt the class was too fast");
  }

  if (/slow|boring/.test(text)) {
    issues.push("a few students felt the session was slow or less engaging");
  }

  if (/example|examples|real world/.test(text)) {
    issues.push("students requested more examples");
  }

  if (/good|clear|well explained|helpful|awesome|great/.test(text)) {
    positives.push("students appreciated the teaching quality");
  }

  let summary = "";

  if (positives.length) summary += positives.join(", ") + ". ";
  if (issues.length) summary += "However, " + issues.join(", ") + ".";

  if (!summary.trim()) {
    summary = "Students gave mixed comments without a clear pattern.";
  }

  return {
    summaryOneLine: summary,
    sampleComments: comments.slice(0, 8)
  };
}

async function captureCanvasAsImage(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  // --- Force white background on Chart.js canvas ---
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  const temp = document.createElement("canvas");
  temp.width = w;
  temp.height = h;
  const tctx = temp.getContext("2d");

  // Fill with white
  tctx.fillStyle = "#ffffff";
  tctx.fillRect(0, 0, w, h);

  // Draw original chart on top
  tctx.drawImage(canvas, 0, 0);

  // Export as normal image
  return temp.toDataURL("image/jpeg", 1.0);
}
async function loadLogoDataURL() {
  if (LOGO_BASE64 && LOGO_BASE64.length > 100) {
    if (LOGO_BASE64.startsWith("data:")) return LOGO_BASE64;
    return "data:image/jpeg;base64," + LOGO_BASE64;
  }
  try {
    const resp = await fetch(LOGO_PATH);
    if (!resp.ok) throw new Error("logo not found");
    const blob = await resp.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn("Logo load failed:", e);
    return null;
  }
}

async function generatePDFReport() {
  try {
    const sessionId = document.getElementById("analyticsSessionId").value.trim();
    if (!sessionId) return alert("Enter session ID first and click View Analytics.");

    // Fetch analytics data
    const res = await fetch(`${BASE_URL}/api/analytics/${encodeURIComponent(sessionId)}`);
    const data = await res.json();
    if (!data || data.totalResponses === undefined) {
      return alert("Failed to load analytics for that session.");
    }

    // Capture charts as images
    const ratingImg = await captureCanvasAsImage("ratingChart");

    // Comments analysis - FIX: Ensure we get proper string summary
    const comments = (data.feedbacks || []).map(f => f.comment || "").filter(Boolean);
    let summary;
    try {
      summary = await summarizeComments(comments);
      // Ensure summary is a proper object with string properties
      if (!summary || typeof summary.summaryOneLine !== 'string') {
        summary = {
          summaryOneLine: generateFallbackSummary(comments),
          sampleComments: comments.slice(0, 3)
        };
      }
    } catch (error) {
      console.log("Summary generation failed, using fallback:", error);
      summary = {
        summaryOneLine: generateFallbackSummary(comments),
        sampleComments: comments.slice(0, 3)
      };
    }

    // Enhanced impact analysis
    const impactAnalysis = analyzeImpact(data.feedbacks, data.avgRating, data.totalResponses);
    const teachingEffectiveness = calculateTeachingEffectiveness(data.avgRating, data.totalResponses, impactAnalysis);

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "pt",
      format: "a4",
      compress: true
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 36;
    const lineHeight = 12;
    let y = margin;

    // =============== PAGE 1: EXECUTIVE SUMMARY ===============
    
    // Header
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(18);
    pdf.text("FEEDBACK IMPACT REPORT", pageWidth / 2, y, { align: "center" });
    y += 25;

    // Session Info
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text(`Session: ${sessionId}`, margin, y);
    pdf.text(`Date: ${new Date().toLocaleDateString()}`, pageWidth - margin, y, { align: "right" });
    y += 20;

    // Impact Score
    const scoreBoxW = 100;
    const scoreBoxH = 80;
    const scoreX = pageWidth / 2 - scoreBoxW / 2;
    
    pdf.setFillColor(248, 249, 255);
    pdf.roundedRect(scoreX, y, scoreBoxW, scoreBoxH, 8, 8, "F");
    pdf.setDrawColor(67, 97, 238);
    pdf.setLineWidth(2);
    pdf.roundedRect(scoreX, y, scoreBoxW, scoreBoxH, 8, 8, "S");

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(28);
    pdf.setTextColor(67, 97, 238);
    pdf.text(`${teachingEffectiveness.score}%`, pageWidth / 2, y + 35, { align: "center" });

    pdf.setFontSize(11);
    pdf.setTextColor(100, 100, 100);
    pdf.text("TEACHING IMPACT", pageWidth / 2, y + 55, { align: "center" });
    
    pdf.setFontSize(9);
    pdf.text(teachingEffectiveness.level.toUpperCase(), pageWidth / 2, y + 68, { align: "center" });

    y += scoreBoxH + 25;

    // Quick Stats
    const stats = [
      { label: "Responses", value: String(data.totalResponses) }, // FIX: Ensure string
      { label: "Avg Rating", value: data.avgRating ? data.avgRating.toFixed(1) + "/5" : "N/A" },
      { label: "Understanding", value: impactAnalysis.understandingLevel }
    ];

    const statW = (pageWidth - margin * 2) / 3;
    let statX = margin;

    stats.forEach(stat => {
      pdf.setFillColor(245, 247, 250);
      pdf.roundedRect(statX, y, statW - 10, 40, 5, 5, "F");
      
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(16);
      pdf.setTextColor(0, 0, 0);
      pdf.text(String(stat.value), statX + (statW - 10) / 2, y + 20, { align: "center" }); // FIX: Ensure string
      
      pdf.setFontSize(8);
      pdf.setTextColor(100, 100, 100);
      pdf.text(stat.label, statX + (statW - 10) / 2, y + 32, { align: "center" });
      
      statX += statW;
    });

    y += 60;

    // Rating Chart
    if (ratingImg) {
      const chartW = pageWidth - margin * 2;
      const chartH = 120;
      pdf.addImage(ratingImg, "JPEG", margin, y, chartW, chartH);
      y += chartH + 20;
    }

    // Key Insights
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(14);
    pdf.text("KEY INSIGHTS", margin, y);
    y += 20;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    
    const insights = [
      `📊 ${impactAnalysis.positivePercentage}% of students responded positively`,
      `🎯 ${teachingEffectiveness.strengths.length} key strengths identified`,
      `🔄 ${teachingEffectiveness.improvements.length} areas for improvement`,
      `💡 Main themes: ${impactAnalysis.topThemes.join(", ")}`
    ];

    insights.forEach(insight => {
      pdf.text(insight, margin + 10, y);
      y += 15;
    });

    y += 10;

    // Student Feedback Summary - FIX: Handle string conversion properly
    let summaryText = "";
    try {
      // Ensure we have a valid string
      if (summary && summary.summaryOneLine) {
        summaryText = String(summary.summaryOneLine);
      } else {
        summaryText = generateFallbackSummary(comments);
      }
    } catch (error) {
      summaryText = generateFallbackSummary(comments);
    }

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.text("STUDENT FEEDBACK SUMMARY", margin, y);
    y += 16;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    const summaryLines = pdf.splitTextToSize(summaryText, pageWidth - margin * 2);
    pdf.text(summaryLines, margin, y);
    y += summaryLines.length * lineHeight + 10;

    // =============== PAGE 2: ACTION PLAN ===============
    pdf.addPage();
    y = margin;

    // Teaching Strengths
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(16);
    pdf.text("WHAT'S WORKING WELL", margin, y);
    y += 25;

    if (teachingEffectiveness.strengths.length > 0) {
      teachingEffectiveness.strengths.forEach((strength, index) => {
        pdf.setFillColor(240, 249, 235);
        pdf.rect(margin, y, pageWidth - margin * 2, 25, "F");
        
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(11);
        pdf.setTextColor(56, 158, 13);
        pdf.text(`✓ ${strength.title}`, margin + 10, y + 16);
        
        y += 30;
      });
    } else {
      pdf.setFont("helvetica", "italic");
      pdf.setFontSize(10);
      pdf.setTextColor(150, 150, 150);
      pdf.text("No specific strengths identified in this session", margin, y);
      y += 20;
    }

    y += 15;

    // Areas for Improvement
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(16);
    pdf.setTextColor(0, 0, 0);
    pdf.text("AREAS TO IMPROVE", margin, y);
    y += 25;

    if (teachingEffectiveness.improvements.length > 0) {
      teachingEffectiveness.improvements.forEach((improvement, index) => {
        pdf.setFillColor(255, 245, 245);
        pdf.rect(margin, y, pageWidth - margin * 2, 30, "F");
        
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(11);
        pdf.setTextColor(219, 56, 43);
        pdf.text(`↻ ${improvement.area}`, margin + 10, y + 12);
        
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9);
        pdf.setTextColor(80, 80, 80);
        const actionLines = pdf.splitTextToSize(improvement.action, pageWidth - margin * 2 - 20);
        pdf.text(actionLines, margin + 10, y + 22);
        
        y += 35 + (actionLines.length - 1) * lineHeight;
      });
    } else {
      pdf.setFont("helvetica", "italic");
      pdf.setFontSize(10);
      pdf.setTextColor(150, 150, 150);
      pdf.text("No major improvement areas identified", margin, y);
      y += 20;
    }

    y += 20;

    // Quick Action Plan
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(14);
    pdf.setTextColor(0, 0, 0);
    pdf.text("QUICK ACTION PLAN", margin, y);
    y += 20;

    const quickActions = generateQuickActions(teachingEffectiveness, impactAnalysis);
    quickActions.forEach((action, index) => {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.setTextColor(67, 97, 238);
      pdf.text(`${index + 1}.`, margin, y);
      
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(0, 0, 0);
      pdf.text(String(action), margin + 15, y); // FIX: Ensure string
      
      y += 15;
    });

    y += 10;

    // Sample Comments (if space permits) - FIX: Handle string conversion
    if (y < pageHeight - 100) {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(12);
      pdf.text("SAMPLE STUDENT COMMENTS", margin, y);
      y += 16;

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      
      const sampleComments = (summary.sampleComments || comments).slice(0, 3);
      sampleComments.forEach((comment, index) => {
        if (comment && y < pageHeight - 50) {
          // FIX: Ensure comment is a string and clean it
          let cleanComment = String(comment || "").replace(/[^\w\s.,!?]/g, '').trim();
          if (cleanComment) {
            const commentLines = pdf.splitTextToSize(`"${cleanComment}"`, pageWidth - margin * 2 - 10);
            pdf.text(commentLines, margin, y);
            y += commentLines.length * lineHeight + 8;
            
            // Add separator if not last comment
            if (index < sampleComments.length - 1 && y < pageHeight - 30) {
              pdf.setDrawColor(220, 220, 220);
              pdf.line(margin, y, pageWidth - margin, y);
              y += 12;
            }
          }
        }
      });
    }

    // =============== FOOTERS ===============
    const pageCount = pdf.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      pdf.setPage(i);
      const footY = pdf.internal.pageSize.getHeight() - 20;
      
      pdf.setFontSize(8);
      pdf.setTextColor(120, 120, 120);
      pdf.text(`Page ${i} of ${pageCount}`, pageWidth / 2, footY, { align: "center" });
      pdf.text("Generated by Classroom Feedback System", pageWidth - margin, footY, { align: "right" });
    }

    // Save
    pdf.save(`${sessionId}_Teacher_Report.pdf`);

  } catch (err) {
    console.error("PDF generation error:", err);
    alert("Failed to generate PDF. See console for details.");
  }
}

// ===== ADDITIONAL HELPER FUNCTIONS =====
function generateFallbackSummary(comments) {
  const total = comments.length;
  if (total === 0) return "No student comments available for analysis.";
  
  const text = comments.join(" ").toLowerCase();
  
  if (text.includes('confus') || text.includes('not understand')) {
    return "Students expressed some confusion with certain concepts and requested clearer explanations.";
  } else if (text.includes('example') || text.includes('demonstrate')) {
    return "Students suggested adding more practical examples to improve understanding.";
  } else if (text.includes('fast') || text.includes('slow')) {
    return "Feedback indicates pacing adjustments could enhance the learning experience.";
  } else {
    return `Received ${total} student comments with mixed feedback. Review individual comments for specific insights.`;
  }
}

// Rest of your helper functions remain the same...
function analyzeImpact(feedbacks, avgRating, totalResponses) {
  const comments = feedbacks.map(f => f.comment || "").filter(Boolean);
  const ratings = feedbacks.map(f => f.rating);
  
  // Calculate understanding levels
  const understandingLevels = {
    excellent: ratings.filter(r => r >= 4).length,
    good: ratings.filter(r => r === 3).length,
    needs_improvement: ratings.filter(r => r <= 2).length
  };

  // Analyze comment themes
  const allText = comments.join(" ").toLowerCase();
  const themes = {
    clarity: (allText.match(/clear|understand|well explained/g) || []).length,
    examples: (allText.match(/example|demonstrate|show how/g) || []).length,
    pace: (allText.match(/fast|slow|pace|speed/g) || []).length,
    engagement: (allText.match(/interesting|engaging|boring|enjoyed/g) || []).length
  };

  // Calculate percentages
  const positivePercentage = Math.round((understandingLevels.excellent + understandingLevels.good) / totalResponses * 100);
  
  // Get top themes
  const topThemes = Object.entries(themes)
    .filter(([_, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([theme]) => theme);

  return {
    understandingLevel: getUnderstandingLevel(avgRating),
    positivePercentage,
    topThemes,
    understandingLevels
  };
}

function calculateTeachingEffectiveness(avgRating, totalResponses, impactAnalysis) {
  const baseScore = (avgRating / 5) * 70;
  const participationScore = Math.min((totalResponses / 30) * 30, 30);
  
  const totalScore = Math.round(baseScore + participationScore);
  
  return {
    score: totalScore,
    level: getEffectivenessLevel(totalScore),
    strengths: identifyStrengths(impactAnalysis),
    improvements: identifyImprovements(impactAnalysis)
  };
}

function getUnderstandingLevel(avgRating) {
  if (avgRating >= 4) return "Excellent";
  if (avgRating >= 3) return "Good";
  if (avgRating >= 2) return "Moderate";
  return "Needs Attention";
}

function getEffectivenessLevel(score) {
  if (score >= 85) return "Outstanding";
  if (score >= 70) return "Effective";
  if (score >= 55) return "Developing";
  return "Needs Improvement";
}

function identifyStrengths(impactAnalysis) {
  const strengths = [];
  
  if (impactAnalysis.understandingLevel === "Excellent" || impactAnalysis.understandingLevel === "Good") {
    strengths.push({
      title: "Strong Concept Delivery",
      description: "Students demonstrated good understanding"
    });
  }
  
  if (impactAnalysis.positivePercentage >= 70) {
    strengths.push({
      title: "Positive Engagement",
      description: "High percentage of positive responses"
    });
  }
  
  return strengths;
}

function identifyImprovements(impactAnalysis) {
  const improvements = [];
  
  if (impactAnalysis.themeAnalysis?.pace > 0) {
    improvements.push({
      area: "Pacing",
      action: "Adjust teaching pace based on student feedback"
    });
  }
  
  if (impactAnalysis.themeAnalysis?.examples > 0) {
    improvements.push({
      area: "Examples",
      action: "Add more practical examples and demonstrations"
    });
  }
  
  if (impactAnalysis.understandingLevels?.needs_improvement > 0) {
    improvements.push({
      area: "Concept Clarity",
      action: "Reinforce challenging topics identified by students"
    });
  }
  
  return improvements;
}

function generateQuickActions(teachingEffectiveness, impactAnalysis) {
  const actions = [];
  
  if (teachingEffectiveness.improvements.length > 0) {
    actions.push(`Focus on: ${teachingEffectiveness.improvements[0].area.toLowerCase()}`);
  }
  
  if (impactAnalysis.topThemes.includes('examples')) {
    actions.push("Prepare 2-3 additional practical examples");
  }
  
  if (teachingEffectiveness.score < 70) {
    actions.push("Review key concepts in next session");
  } else {
    actions.push("Continue current effective teaching methods");
  }
  
  actions.push("Acknowledge student feedback in next class");
  
  return actions.slice(0, 3);
}

// ===== HELPER FUNCTION FOR RECOMMENDATIONS =====
function generateRecommendations(summary, avgRating) {
  const recommendations = [];
  const summaryLower = summary.toLowerCase();
  
  // Teaching pace recommendations
  if (summaryLower.includes('fast') || summaryLower.includes('speed') || summaryLower.includes('pace')) {
    recommendations.push("Consider pausing more frequently for student questions and comprehension checks");
    recommendations.push("Break down complex topics into smaller, digestible segments");
  }
  
  // Clarity recommendations
  if (summaryLower.includes('unclear') || summaryLower.includes('confus') || summaryLower.includes('not understand')) {
    recommendations.push("Use more visual aids and real-world examples to explain abstract concepts");
    recommendations.push("Provide step-by-step breakdowns for complex problems or procedures");
  }
  
  // Examples recommendations
  if (summaryLower.includes('example') || summaryLower.includes('instance')) {
    recommendations.push("Incorporate more practical, hands-on examples in your teaching");
    recommendations.push("Use case studies that relate to real-world applications");
  }
  
  // General recommendations based on rating
  if (avgRating < 3) {
    recommendations.push("Consider implementing interactive activities to increase engagement");
    recommendations.push("Schedule a follow-up session to address confusing topics");
  } else if (avgRating >= 4) {
    recommendations.push("Continue the current teaching approach - students are responding well");
    recommendations.push("Consider sharing your successful teaching strategies with colleagues");
  }
  
  // Always include these general recommendations
  recommendations.push("Review key concepts in the next class based on student feedback");
  recommendations.push("Encourage more student participation and questions during sessions");
  
  return recommendations.slice(0, 5); // Return top 5 recommendations
}

async function downloadReport(sessionId) {
  switchTab('analytics');                      // show charts on screen
  document.getElementById("analyticsSessionId").value = sessionId;
  
  await loadAnalytics();                       // draw charts
  await new Promise(r => setTimeout(r, 800));  // wait for canvas render
  
  generatePDFReport();                         // capture + export
}

function togglePassword() {
  const pass = document.getElementById("authPass");
  const open = document.getElementById("eyeOpen");
  const closed = document.getElementById("eyeClosed");

  if (pass.type === "password") {
    pass.type = "text";
    open.style.display = "none";
    closed.style.display = "block";
  } else {
    pass.type = "password";
    open.style.display = "block";
    closed.style.display = "none";
  }
}