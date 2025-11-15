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
  let teacher = document.getElementById("teacher").value;

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
      // Update stats numbers
      document.getElementById("totalStudentResponses").textContent = data.totalResponses;
      document.getElementById("avgSessionRating").textContent = (data.avgRating || 0).toFixed(1);

      // Create charts
      createRatingDistributionChart(data.feedbacks);
      createRatingTrendChart(data.feedbacks);
      
      // Show feedback comments
      displayFeedbackComments(data.feedbacks);

      // Small analytics summary
      document.getElementById("analyticsSummary").innerHTML =
        `<div style="text-align:center;margin-bottom:8px;">
           <strong>Session:</strong> ${sessionId} &nbsp; • &nbsp;
           <strong>Responses:</strong> ${data.totalResponses} &nbsp; • &nbsp;
           <strong>Avg:</strong> ${(data.avgRating||0).toFixed(1)}
         </div>`;

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
function displayFeedbackComments(feedbacks) {
  const commentsContainer = document.getElementById('feedbackComments');
  const comments = feedbacks.filter(fb => fb.comment && fb.comment.trim() !== '');
  
  if (comments.length === 0) {
    commentsContainer.innerHTML = '<p style="text-align:center;color:#666;padding:20px;">No comments yet</p>';
    return;
  }

  // Show a few and allow download for full
  let html = '<h4 style="color:#667eea;margin-bottom:15px;">Student Comments (sample):</h4>';
  comments.slice(0, 8).forEach((fb, i) => {
    const time = new Date(fb.createdAt).toLocaleTimeString();
    html += `
      <div class="comment-item" style="padding:8px;border-bottom:1px solid #eee;">
        <div style="font-weight:600;">${'⭐'.repeat(fb.rating)}</div>
        <div style="margin-top:6px;">"${fb.comment}"</div>
        <div style="color:#888;font-size:12px;margin-top:6px;">${time}</div>
      </div>
    `;
  });
  commentsContainer.innerHTML = html;
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

  const list = data.sessions || [];
  if (list.length === 0) {
    box.innerHTML = `<p style="color:#666">No sessions yet.</p>`;
    return;
  }

  // Ensure sessions sorted latest first
  list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  let html = `<h3 style="color:#667eea;margin-bottom:10px;"></h3>`;
  let lastDate = "";

  list.forEach(s => {
    const date = new Date(s.createdAt);
    const dateStr = date.toLocaleDateString();
    const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    // Group by date
    if (dateStr !== lastDate) {
      html += `<h4 style="margin-top:20px;margin-bottom:8px;color:#555;">📅 ${dateStr}</h4>`;
      lastDate = dateStr;
    }

    html += `
      <div style="padding:12px;background:#f7f9ff;border-left:5px solid #667eea;border-radius:8px;margin-bottom:10px;">
        <div style="font-weight:bold;font-size:15px;">
          ${s.className || ""} ${s.section || ""} — ${s.subject}
        </div>
        <div style="margin-top:2px;">📝 Topic: ${s.topic}</div>
        <div style="margin-top:2px;">⏰ Time: ${timeStr}</div>
        <div style="margin-top:5px; display:flex; gap:10px; align-items:center;">
  <code>${s.sessionId}</code>

  <button style="padding:6px 10px;border-radius:5px;"
          onclick="quickAnalytics('${s.sessionId}')">
    View Analytics
  </button>

  <button style="padding:6px 10px;border-radius:5px;background:#0A84FF;color:white;border:none;"
          onclick="downloadReport('${s.sessionId}')">
    Download Report
  </button>
</div>
      </div>
    `;
  });

  box.innerHTML = html;
}

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
    localStorage.setItem("teacherUser", JSON.stringify(res.user));
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

function summarizeComments(comments, maxKeywords = 6) {
  if (!comments || comments.length === 0) {
    return { summaryOneLine: "No comments to summarize.", topKeywords: [], sampleComments: [] };
  }

  const stopwords = new Set([
    "the","and","is","in","to","of","a","i","was","for","with","that","this","it","on","are","as","we","be","have","has","but","so","not","at","by"
  ]);

  const freq = {};
  const sentences = [];

  comments.forEach(c => {
    const s = (c || "").trim();
    if (!s) return;
    sentences.push(s);
    s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).forEach(w => {
      if (!w || w.length < 3) return;
      if (stopwords.has(w)) return;
      freq[w] = (freq[w] || 0) + 1;
    });
  });

  const keywords = Object.keys(freq).sort((a,b) => freq[b]-freq[a]).slice(0, maxKeywords);

  let best = { score: -1, sentence: sentences[0] || "" };
  sentences.forEach(s => {
    const sLower = s.toLowerCase();
    let score = 0;
    keywords.forEach(k => { if (sLower.includes(k)) score += freq[k]; });
    if (score > best.score) best = { score, sentence: s };
  });

  const summaryOneLine = `Summary: "${(best.sentence || "").slice(0,120)}${(best.sentence && best.sentence.length>120 ? "..." : "")}"`;
  const sampleComments = comments.slice(0, 8);

  return { summaryOneLine, topKeywords: keywords, sampleComments };
}

async function captureCanvasAsImage(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  try {
    return canvas.toDataURL("image/jpeg", 1.0);
  } catch (e) {
    const c = await html2canvas(canvas, {
      backgroundColor: "#ffffff" // FIX black background
    });
    return c.toDataURL("image/jpeg", 1.0);
  }
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

    const res = await fetch(`${BASE_URL}/api/analytics/${encodeURIComponent(sessionId)}`);
    const data = await res.json();
    if (!data || data.totalResponses === undefined) {
      return alert("Failed to load analytics for that session.");
    }

    const ratingImg = await captureCanvasAsImage("ratingChart");
    const trendImg = await captureCanvasAsImage("trendChart");
    const comments = (data.feedbacks || []).map(f => f.comment || "").filter(Boolean);
    const summary = summarizeComments(comments);
    const logoData = await loadLogoDataURL();

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const margin = 36;
    let y = margin;

    if (logoData) {
      const imgProps = pdf.getImageProperties(logoData);
      const imgW = 72;
      const imgH = (imgProps.height * imgW) / imgProps.width;
      pdf.addImage(logoData, "JPEG", margin, y, imgW, imgH);
      pdf.setFontSize(14);
      pdf.text("Bangalore Institute of Technology", margin + imgW + 12, y + 18);
      pdf.setFontSize(10);
      pdf.text("Real-Time Classroom Feedback Report", margin + imgW + 12, y + 34);
      y += Math.max(imgH, 48) + 8;
    } else {
      pdf.setFontSize(16);
      pdf.text("Bangalore Institute of Technology", pageWidth / 2, y + 8, { align: "center" });
      pdf.setFontSize(12);
      pdf.text("Real-Time Classroom Feedback Report", pageWidth / 2, y + 28, { align: "center" });
      y += 48;
    }

    pdf.setDrawColor(200);
    pdf.setLineWidth(0.5);
    pdf.line(margin, y, pageWidth - margin, y);
    y += 12;

    pdf.setFontSize(11);
    pdf.setFont("helvetica", "bold");
    pdf.text(`Session: ${sessionId}`, margin, y);
    pdf.setFont("helvetica", "normal");

    // read feedbackDetails if present
    const className = data.className || "N/A";
const section   = data.section || "N/A";
const subject   = data.subject || "N/A";
const teacher   = data.teacher || "N/A";
const topic     = data.topic || "N/A";

// Add metadata to PDF
pdf.setFont("helvetica", "normal");
pdf.setFontSize(11);

pdf.text(`Class: ${className} (${section})`, margin, y);
pdf.text(`Teacher: ${teacher}`, margin + 250, y);
y += 14;
pdf.text(`Subject: ${subject}`, margin, y);
pdf.text(`Topic: ${topic}`, margin + 250, y);
y += 20;

    
    pdf.setFont("helvetica", "bold");
    pdf.text(`Total responses: ${data.totalResponses}`, margin, y);
    pdf.text(`Average rating: ${data.avgRating ? data.avgRating.toFixed(1) : "N/A"}`, margin + 200, y);
    y += 18;

    const availableWidth = pageWidth - margin * 2;
    const halfWidth = (availableWidth - 12) / 2;

    if (ratingImg) {
      pdf.addImage(ratingImg, "jpeg", margin, y, halfWidth, halfWidth * 0.7);
    } else {
      pdf.rect(margin, y, halfWidth, halfWidth * 0.7);
      pdf.text("Rating distribution chart unavailable", margin + 6, y + 20);
    }

    if (trendImg) {
      pdf.addImage(trendImg, "jpeg", margin + halfWidth + 12, y, halfWidth, halfWidth * 0.7);
    } else {
      pdf.rect(margin + halfWidth + 12, y, halfWidth, halfWidth * 0.7);
      pdf.text("Trend chart unavailable", margin + halfWidth + 20, y + 20);
    }

    y += halfWidth * 0.7 + 12;

    pdf.setFont("helvetica", "bold");
    pdf.text("Summary of comments:", margin, y);
    pdf.setFont("helvetica", "normal");
    const summaryLines = pdf.splitTextToSize(summary.summaryOneLine, pageWidth - margin * 2);
    y += 14;
    pdf.text(summaryLines, margin, y);
    y += summaryLines.length * 12 + 8;


    if (summary.sampleComments && summary.sampleComments.length) {
      pdf.setFont("helvetica", "bold");
      pdf.text("Sample comments:", margin, y);
      y += 14;
      pdf.setFont("helvetica", "normal");
      const maxComments = summary.sampleComments.length;
      for (let i = 0; i < maxComments; i++) {
        const c = `• ${summary.sampleComments[i]}`;
        const wrapped = pdf.splitTextToSize(c, pageWidth - margin * 2);
        if (y + wrapped.length * 12 > pdf.internal.pageSize.getHeight() - 80) {
          pdf.addPage();
          y = margin;
        }
        pdf.text(wrapped, margin, y);
        y += wrapped.length * 12 + 6;
      }
    }

    if (comments.length > summary.sampleComments.length) {
      if (y + 40 > pdf.internal.pageSize.getHeight() - 80) {
        pdf.addPage();
        y = margin;
      }
      pdf.setFont("helvetica", "bold");
      pdf.text("All comments (first 100 shown):", margin, y);
      y += 16;
      pdf.setFont("helvetica", "normal");
      const limit = Math.min(comments.length, 100);
      for (let i = 0; i < limit; i++) {
        const c = `${i+1}. ${comments[i]}`;
        const wrapped = pdf.splitTextToSize(c, pageWidth - margin * 2);
        if (y + wrapped.length * 12 > pdf.internal.pageSize.getHeight() - 80) {
          pdf.addPage();
          y = margin;
        }
        pdf.text(wrapped, margin, y);
        y += wrapped.length * 12 + 6;
      }
    }

    const bottomY = pdf.internal.pageSize.getHeight() - 60;
    pdf.setDrawColor(200);
    pdf.line(margin, bottomY - 12, pageWidth - margin, bottomY - 12);
    pdf.setFontSize(10);
    pdf.text("Generated by Real-Time Classroom Feedback System", margin, bottomY);
    pdf.text("Signature: ______________________", pageWidth - margin - 200, bottomY);

    pdf.save(`${sessionId}_feedback_report.pdf`);
  } catch (err) {
    console.error("PDF generation error:", err);
    alert("Failed to generate PDF. See console for details.");
  }
}

async function downloadReport(sessionId) {
  switchTab('analytics');                      // show charts on screen
  document.getElementById("analyticsSessionId").value = sessionId;
  
  await loadAnalytics();                       // draw charts
  await new Promise(r => setTimeout(r, 800));  // wait for canvas render
  
  generatePDFReport();                         // capture + export
}