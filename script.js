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
    const trendImg  = await captureCanvasAsImage("trendChart");

    // Comments + AI summary
    const comments = (data.feedbacks || []).map(f => f.comment || "").filter(Boolean);
    const summary = await summarizeComments(comments); // { summaryOneLine, sampleComments, isAI, ... }

    // Logo
    const logoData = await loadLogoDataURL();

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "pt",
      format: "a4",
      compress: true
    });

    const pageWidth  = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin     = 36;
    const lineHeight = 12;
    let y = margin;

    // =============== HEADER (BIT + LOGO) ===============
    if (logoData) {
      try {
        const imgProps = pdf.getImageProperties(logoData);
        const logoW = 60;
        const logoH = (imgProps.height * logoW) / imgProps.width;
        pdf.addImage(logoData, "JPEG", margin, y, logoW, logoH);

        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(16);
        pdf.text("BANGALORE INSTITUTE OF TECHNOLOGY", margin + logoW + 15, y + 16);

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(10);
        pdf.text("K.R. Road, V.V. Puram, Bengaluru - 560004", margin + logoW + 15, y + 32);
        pdf.text("Department of Information Science & Engineering", margin + logoW + 15, y + 46);

        pdf.setFontSize(11);
        pdf.setFont("helvetica", "bold");
        pdf.text("STUDENT FEEDBACK — IMPACT ANALYSIS REPORT", margin + logoW + 15, y + 64);

        y += Math.max(logoH, 74);
      } catch (e) {
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(16);
        pdf.text("BANGALORE INSTITUTE OF TECHNOLOGY", pageWidth / 2, y + 16, { align: "center" });

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(10);
        pdf.text("K.R. Road, V.V. Puram, Bengaluru - 560004", pageWidth / 2, y + 34, { align: "center" });
        pdf.text("Department of Information Science & Engineering", pageWidth / 2, y + 48, { align: "center" });

        pdf.setFontSize(11);
        pdf.setFont("helvetica", "bold");
        pdf.text("STUDENT FEEDBACK — IMPACT ANALYSIS REPORT", pageWidth / 2, y + 66, { align: "center" });

        y += 80;
      }
    } else {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(16);
      pdf.text("BANGALORE INSTITUTE OF TECHNOLOGY", pageWidth / 2, y + 16, { align: "center" });

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.text("K.R. Road, V.V. Puram, Bengaluru - 560004", pageWidth / 2, y + 34, { align: "center" });
      pdf.text("Department of Information Science & Engineering", pageWidth / 2, y + 48, { align: "center" });

      pdf.setFontSize(11);
      pdf.setFont("helvetica", "bold");
      pdf.text("STUDENT FEEDBACK — IMPACT ANALYSIS REPORT", pageWidth / 2, y + 66, { align: "center" });

      y += 80;
    }

    pdf.setLineWidth(0.7);
    pdf.setDrawColor(200, 200, 200);
    pdf.line(margin, y, pageWidth - margin, y);
    y += 18;

    // =============== EXECUTIVE SUMMARY ===============
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(14);
    pdf.text("Executive Summary", margin, y);
    y += 16;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);

    const execLines = [
      `Purpose: To measure student understanding & collect actionable feedback for teaching improvement.`,
      `Session: ${data.subject || "N/A"} — ${data.topic || "N/A"} (${data.className || "N/A"} ${data.section ? "(" + data.section + ")" : ""})`,
      `Teacher: ${data.teacher || "N/A"} | Session ID: ${sessionId} | Date: ${new Date().toLocaleDateString()}`,
      `Responses: ${data.totalResponses} | Average Rating: ${data.avgRating ? data.avgRating.toFixed(1) + "/5" : "N/A"}`,
      `Sentiment: ${summary.summaryOneLine ? (summary.summaryOneLine.split(".")[0] + ".") : "Summary not available."}`
    ];

    execLines.forEach(line => {
      const wrapped = pdf.splitTextToSize(line, pageWidth - margin * 2);
      pdf.text(wrapped, margin, y);
      y += wrapped.length * lineHeight;
    });

    y += 8;

    // =============== SESSION OVERVIEW TABLE ===============
    const tableX = margin;
    const tableW = pageWidth - margin * 2;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.text("Session Overview", tableX, y);
    y += 14;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);

    const overview = [
      { k: "Session ID",      v: sessionId },
      { k: "Subject",         v: data.subject || "N/A" },
      { k: "Topic",           v: data.topic || "N/A" },
      { k: "Class / Section", v: `${data.className || "N/A"} ${data.section ? "-" + data.section : ""}`.trim() },
      { k: "Teacher",         v: data.teacher || "N/A" },
      { k: "Responses",       v: String(data.totalResponses) }
    ];

    const col1W = 120;
    const col2W = tableW - col1W;

    overview.forEach(row => {
      pdf.setFillColor(248, 249, 252);
      pdf.rect(tableX, y - 10, col1W, 18, "F");
      pdf.setFillColor(255, 255, 255);
      pdf.rect(tableX + col1W, y - 10, col2W, 18, "F");

      pdf.setFont("helvetica", "bold");
      pdf.text(row.k, tableX + 6, y + 4);
      pdf.setFont("helvetica", "normal");
      const vwrap = pdf.splitTextToSize(row.v, col2W - 12);
      pdf.text(vwrap, tableX + col1W + 6, y + 4);

      y += 20;
    });

    y += 8;

    // =============== KEY STATS CARDS ===============
    const cardW = (pageWidth - margin * 2 - 20) / 3;
    const cardH = 48;

    const totalResponses = data.totalResponses || 0;
    const avgRating      = data.avgRating ? parseFloat(data.avgRating) : 0;
    const engagement     = Math.min(100, Math.round((totalResponses / Math.max(1, 30)) * 100));

    const statCards = [
      { title: "Total Responses",   value: String(totalResponses) },
      { title: "Average Rating",    value: avgRating ? avgRating.toFixed(1) + " / 5" : "N/A" },
      { title: "Engagement (est.)", value: `${engagement}%` }
    ];

    let sx = margin;
    statCards.forEach(card => {
      pdf.setFillColor(245, 247, 250);
      pdf.roundedRect(sx, y, cardW, cardH, 4, 4, "F");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      pdf.text(card.title, sx + 8, y + 16);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(14);
      pdf.text(card.value, sx + 8, y + 36);
      sx += cardW + 10;
    });

    y += cardH + 18;

    // =============== VISUAL ANALYTICS (GRAPHS) ===============
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.text("Visual Analytics", margin, y);
    y += 14;

    const chartW = (pageWidth - margin * 2 - 20) / 2;
    const chartH = chartW * 0.6;

    if (ratingImg) {
      pdf.addImage(ratingImg, "JPEG", margin, y, chartW, chartH);
    } else {
      pdf.setFillColor(250, 250, 250);
      pdf.rect(margin, y, chartW, chartH, "F");
      pdf.setFontSize(10);
      pdf.setTextColor(130, 130, 130);
      pdf.text("Rating Distribution Unavailable", margin + 10, y + chartH / 2);
      pdf.setTextColor(0, 0, 0);
    }

    if (trendImg) {
      pdf.addImage(trendImg, "JPEG", margin + chartW + 20, y, chartW, chartH);
    } else {
      pdf.setFillColor(250, 250, 250);
      pdf.rect(margin + chartW + 20, y, chartW, chartH, "F");
      pdf.setFontSize(10);
      pdf.setTextColor(130, 130, 130);
      pdf.text("Trend Chart Unavailable", margin + chartW + 30, y + chartH / 2);
      pdf.setTextColor(0, 0, 0);
    }

    y += chartH + 18;

    // =============== AI INSIGHTS + RECOMMENDATIONS ===============
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.text("AI-Powered Insights", margin, y);
    y += 14;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);

    const insightLines = pdf.splitTextToSize(
      summary.summaryOneLine || "No insights available.",
      pageWidth - margin * 2
    );
    pdf.text(insightLines, margin, y);
    y += insightLines.length * lineHeight + 10;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.text("Actionable Recommendations", margin, y);
    y += 14;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);

    const recommendations = generateRecommendations(
      summary.summaryOneLine || "",
      data.avgRating || 0
    );

    recommendations.forEach(rec => {
      const wrap = pdf.splitTextToSize("• " + rec, pageWidth - margin * 2);
      pdf.text(wrap, margin, y);
      y += wrap.length * lineHeight + 6;
    });

    // =============== PAGE 2 ===============
    pdf.addPage();
    y = margin;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.text("Impact Assessment", margin, y);
    y += 16;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);

    const positives = [
      "Increased conceptual clarity for core topics identified by above-average ratings.",
      "Engagement indicators show active student participation for majority of attendees.",
      "Where examples were provided, students reported better comprehension."
    ];

    const improvements = [
      "Certain subtopics showed lower understanding; targeted revision is recommended.",
      "Some students requested slower pace and additional worked examples.",
      "Short practice questions and summary notes can further reinforce learning."
    ];

    pdf.setFont("helvetica", "bold");
    pdf.text("Positive Impact", margin, y);
    y += 12;

    pdf.setFont("helvetica", "normal");
    positives.forEach(p => {
      const wrap = pdf.splitTextToSize("• " + p, pageWidth - margin * 2);
      pdf.text(wrap, margin, y);
      y += wrap.length * lineHeight + 6;
    });

    y += 6;
    pdf.setFont("helvetica", "bold");
    pdf.text("Areas for Improvement", margin, y);
    y += 12;

    pdf.setFont("helvetica", "normal");
    improvements.forEach(p => {
      const wrap = pdf.splitTextToSize("• " + p, pageWidth - margin * 2);
      pdf.text(wrap, margin, y);
      y += wrap.length * lineHeight + 6;
    });

    y += 8;

    // =============== REPRESENTATIVE COMMENTS ===============
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.text("Representative Student Comments (sample)", margin, y);
    y += 16;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);

    const sampleComments = (summary.sampleComments || comments).slice(0, 8);

    const stripEmojis = (s) => {
      try {
        return s
          .replace(/[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "")
          .replace(/\s+/g, " ")
          .trim();
      } catch (e) {
        return s;
      }
    };

    sampleComments.forEach((c, idx) => {
      if (!c) return;

      let text = String(c).trim();
      text = stripEmojis(text);
      if (text.length > 300) text = text.slice(0, 300) + "...";

      const wrapped = pdf.splitTextToSize(`"${text}"`, pageWidth - margin * 2 - 10);

      if (idx % 2 === 0) {
        pdf.setFillColor(250, 250, 250);
        pdf.rect(
          margin,
          y - 6,
          pageWidth - margin * 2,
          wrapped.length * lineHeight + 10,
          "F"
        );
      }

      pdf.setTextColor(30, 30, 30);
      pdf.text(wrapped, margin + 6, y + 4);
      y += wrapped.length * lineHeight + 14;

      if (y > pageHeight - 90) {
        pdf.addPage();
        y = margin;
      }
    });

    // =============== FINAL SUMMARY ===============
    const conclusion =
      "Conclusion: The feedback shows a generally positive reception with clear areas for refinement. Implementing the recommended actions is expected to improve conceptual clarity, engagement levels, and overall learning outcomes in future sessions.";

    const conclWrapped = pdf.splitTextToSize(conclusion, pageWidth - margin * 2);

    pdf.setFont("helvetica", "bold");
    pdf.text("Final Summary", margin, y);
    y += 14;

    pdf.setFont("helvetica", "normal");
    pdf.text(conclWrapped, margin, y);
    y += conclWrapped.length * lineHeight + 10;

    // =============== FOOTER ON EACH PAGE ===============
    const pageCount = pdf.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      pdf.setPage(i);
      const footY = pdf.internal.pageSize.getHeight() - 30;
      pdf.setLineWidth(0.5);
      pdf.setDrawColor(200, 200, 200);
      pdf.line(margin, footY - 10, pageWidth - margin, footY - 10);
      pdf.setFontSize(8);
      pdf.setTextColor(120, 120, 120);
      pdf.text("Confidential - Academic Use Only", margin, footY);
      pdf.text(
        "Generated by Real-Time Classroom Feedback System",
        pageWidth - margin,
        footY,
        { align: "right" }
      );
      pdf.text(`Page ${i} of ${pageCount}`, pageWidth / 2, footY + 9, {
        align: "center"
      });
    }

    // Save
    pdf.save(`${sessionId}_BIT_Impact_Report.pdf`);
  } catch (err) {
    console.error("PDF generation error:", err);
    alert("Failed to generate PDF. See console for details.");
  }
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