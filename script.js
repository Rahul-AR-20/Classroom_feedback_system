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
    const res = await fetch("https://classroom-feedback-system.onrender.com/api/session/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, teacher, topic }),
    });

    const data = await res.json();
    
    if (data.success) {
      const sessionId = data.sessionId;
      const qrContainer = document.getElementById("qrDisplay");
      qrContainer.innerHTML = "";

      new QRCode(qrContainer, {
        text: `https://classroom-feedback-system.onrender.com?sessionId=${sessionId}`,
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
    const res = await fetch("https://classroom-feedback-system.onrender.com/api/feedback/submit", {
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
    const res = await fetch(`https://classroom-feedback-system.onrender.com/api/analytics/${sessionId}`);
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

// Create Rating Trend Chart (Line Chart)
function createRatingTrendChart(feedbacks) {
  const ctx = document.getElementById('trendChart').getContext('2d');
  
  // Sort feedbacks by time
  const sortedFeedbacks = [...feedbacks].sort((a, b) => 
    new Date(a.createdAt) - new Date(b.createdAt)
  );

  // Prepare data for trend
  const ratingsOverTime = sortedFeedbacks.map(fb => fb.rating);
  const timeLabels = sortedFeedbacks.map((fb, index) => `Response ${index + 1}`);

  new Chart(ctx, {
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
          ticks: {
            stepSize: 1
          }
        }
      },
      plugins: {
        title: {
          display: true,
          text: 'Rating Trend Over Time',
          font: {
            size: 16
          }
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