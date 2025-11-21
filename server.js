const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const cors = require("cors");
const bodyParser = require("body-parser");
const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname));

// MongoDB Connection
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ Connected to MongoDB Atlas"))
  .catch((err) => console.error("❌ MongoDB Atlas connection error:", err));

// ====== ADDED: Teacher model & auth ======
const teacherSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String, // hashed
});
const Teacher = mongoose.model("Teacher", teacherSchema);

// helper: auth middleware
function auth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.replace("Bearer ", "");
    if (!token) return res.status(401).json({ success: false, message: "No token" });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.teacherId = payload.id;
    next();
  } catch (e) {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
}

// ====== update session schema to include className + section ======
const sessionSchema = new mongoose.Schema({
  sessionId: String,        // short code
  subject: String,
  teacher: String,          // teacher display name
  topic: String,
  createdAt: { type: Date, default: Date.now },
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "Teacher", default: null },

  // NEW fields
  className: { type: String, default: "" },
  section: { type: String, default: "" },
});

const feedbackSchema = new mongoose.Schema({
  sessionId: String,
  rating: Number,
  comment: String,
  createdAt: { type: Date, default: Date.now },
});

const Session = mongoose.model("Session", sessionSchema);
const Feedback = mongoose.model("Feedback", feedbackSchema);

// ====== ADDED: short, friendly session IDs (6 chars A–Z0–9) ======
function generateSessionId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no confusing 0/O/1/I
  let id = "";
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

// Pages
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ADDED: route to serve same page for student deep-link
app.get("/student", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ====== AUTH ROUTES (ADDED) ======
app.post("/api/teacher/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const exists = await Teacher.findOne({ email });
    if (exists) return res.status(400).json({ success: false, message: "Email already registered" });
    const hashed = await bcrypt.hash(password, 10);
    const t = await Teacher.create({ name, email, password: hashed });
    const token = jwt.sign({ id: t._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({
  success: true,
  token,
  user: { id: t._id, name: t.name, email: t.email }
});
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ success: false, message: "Signup failed" });
  }
});

app.post("/api/teacher/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const t = await Teacher.findOne({ email });
    if (!t) return res.status(400).json({ success: false, message: "Invalid credentials" });
    const ok = await bcrypt.compare(password, t.password);
    if (!ok) return res.status(400).json({ success: false, message: "Invalid credentials" });
    const token = jwt.sign({ id: t._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({
  success: true,
  token,
  user: { id: t._id, name: t.name, email: t.email }
});  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ success: false, message: "Login failed" });
  }
});

// ====== ORIGINAL ROUTES (unchanged) ======

// NOTE: this keeps using UUID; front-end can continue to use it if desired.
// Create new feedback session (public, kept for backward compatibility)
app.post("/api/session/start", async (req, res) => {
  try {
    const { subject, teacher, topic, className = "", section = "" } = req.body;
    const sessionId = uuidv4();
    const newSession = new Session({ sessionId, subject, teacher, topic, className, section });
    await newSession.save();
    res.json({ success: true, sessionId });
  } catch (err) {
    console.error("Error creating session:", err);
    res.status(500).json({ success: false });
  }
});

// Auth-protected start (uses short sessionId + ties to teacher)
app.post("/api/session/start-auth", auth, async (req, res) => {
  try {
    const { subject, teacher, topic, className = "", section = "" } = req.body;
    const sessionId = generateSessionId();
    const newSession = new Session({
      sessionId,
      subject,
      teacher,
      topic,
      className,
      section,
      teacherId: req.teacherId,
    });
    await newSession.save();
    res.json({ success: true, sessionId });
  } catch (err) {
    console.error("Error creating session (auth):", err);
    res.status(500).json({ success: false });
  }
});

// Submit feedback (unchanged)
app.post("/api/feedback/submit", async (req, res) => {
  try {
    const { sessionId, rating, comment } = req.body;
    const feedback = new Feedback({ sessionId, rating, comment });
    await feedback.save();
    res.json({ success: true });
  } catch (err) {
    console.error("Error saving feedback:", err);
    res.status(500).json({ success: false });
  }
});

// Analytics route — FULL DETAILS + NO SUMMARY AUTO-GENERATION
app.get("/api/analytics/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Fetch session details (class, subject, teacher, topic, section)
    const session = await Session.findOne({ sessionId });

    if (!session) {
      return res.json({ success: false, message: "Session not found" });
    }

    // Fetch all feedbacks for this session
    const feedbacks = await Feedback.find({ sessionId });

    const totalResponses = feedbacks.length;
    const avgRating =
      totalResponses === 0
        ? 0
        : feedbacks.reduce((acc, f) => acc + f.rating, 0) / totalResponses;

    // Return EVERYTHING needed for the PDF
    res.json({
      success: true,
      sessionId,
      className: session.className || "",
      section: session.section || "",
      subject: session.subject || "",
      teacher: session.teacher || "",
      topic: session.topic || "",
      totalResponses,
      avgRating,
      feedbacks
    });

  } catch (err) {
    console.error("Error fetching analytics:", err);
    res.status(500).json({ success: false });
  }
});

// ADDED: list sessions for the logged-in teacher (no need to copy IDs)
app.get("/api/teacher/sessions", auth, async (req, res) => {
  try {
    const sessions = await Session.find({ teacherId: req.teacherId }).sort({ createdAt: -1 });
    res.json({ success: true, sessions });
  } catch (err) {
    console.error("List sessions error:", err);
    res.status(500).json({ success: false });
  }
});

// ADDED: quick analytics for teacher's latest session
app.get("/api/teacher/analytics/latest", auth, async (req, res) => {
  try {
    const latest = await Session.findOne({ teacherId: req.teacherId }).sort({ createdAt: -1 });
    if (!latest) return res.json({ success: true, latest: null });
    const feedbacks = await Feedback.find({ sessionId: latest.sessionId });
    const totalResponses = feedbacks.length;
    const avgRating =
      totalResponses === 0
        ? 0
        : feedbacks.reduce((acc, f) => acc + f.rating, 0) / totalResponses;
    res.json({ success: true, latest: { session: latest, totalResponses, avgRating, feedbacks } });
  } catch (err) {
    console.error("Latest analytics error:", err);
    res.status(500).json({ success: false });
  }
});

// Add this near the top with other requires

// ===== FREE AI SUMMARIZATION WITH HUGGING FACE =====
// --- Fetch Polyfill for Node (Render uses Node 16) ---
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

// ===== AI SUMMARIZATION USING HUGGINGFACE =====
app.post("/api/summarize-comments", async (req, res) => {
  // Create a timeout promise for Node.js compatibility
  const timeout = (ms) => new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Request timeout')), ms);
  });

  try {
    const { comments } = req.body;

    if (!comments || comments.length === 0) {
      return res.json({ success: true, summary: "No comments available." });
    }

    const commentText = comments.slice(0, 50).join(". ");
    
    // Validate token
    if (!process.env.HUGGING_FACE_TOKEN || !process.env.HUGGING_FACE_TOKEN.startsWith('hf_')) {
      console.log("Invalid or missing Hugging Face token");
      const fallback = fallbackSummarizeComments(comments);
      return res.json({
        success: true,
        summary: fallback.summaryOneLine,
        isFallback: true
      });
    }

    console.log(`🤖 AI summarization requested for ${comments.length} comments`);

    // Use a simpler, more reliable model
    const modelUrl = "https://api-inference.huggingface.co/models/facebook/bart-large-cnn";
    
    try {
      // Race between fetch and timeout (Node.js compatible)
      const fetchPromise = fetch(modelUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.HUGGING_FACE_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          inputs: commentText,
          parameters: {
            max_length: 80,  // Reduced for better performance
            min_length: 20,
            do_sample: false
          }
        })
      });

      const response = await Promise.race([fetchPromise, timeout(15000)]);

      console.log(`HF API Response Status: ${response.status}`);

      if (response.status === 503) {
        // Model is loading
        console.log("Model is loading, using fallback");
        const fallback = fallbackSummarizeComments(comments);
        return res.json({
          success: true,
          summary: fallback.summaryOneLine,
          isFallback: true,
          note: "AI model is loading, used rule-based analysis"
        });
      }

      if (!response.ok) {
        console.log(`HF API Error: ${response.status} ${response.statusText}`);
        const fallback = fallbackSummarizeComments(comments);
        return res.json({
          success: true,
          summary: fallback.summaryOneLine,
          isFallback: true,
          note: `AI service unavailable (${response.status})`
        });
      }

      const result = await response.json();
      console.log("HF API Result:", JSON.stringify(result).substring(0, 200));

      const summary = result[0]?.summary_text;

      if (!summary) {
        console.log("No summary in response");
        const fallback = fallbackSummarizeComments(comments);
        return res.json({
          success: true,
          summary: fallback.summaryOneLine,
          isFallback: true,
          note: "AI returned empty summary"
        });
      }

      console.log("✅ AI summarization successful");
      return res.json({
        success: true,
        summary: summary,
        isFallback: false
      });

    } catch (fetchError) {
      console.error("Fetch error:", fetchError.name, fetchError.message);
      
      if (fetchError.message === 'Request timeout') {
        console.log("Request timeout, using fallback");
        const fallback = fallbackSummarizeComments(comments);
        return res.json({
          success: true,
          summary: fallback.summaryOneLine,
          isFallback: true,
          note: "AI request timeout"
        });
      }

      throw fetchError; // Re-throw to be caught by outer catch
    }

  } catch (err) {
    console.error("AI Summarization overall error:", err.message);
    const fallback = fallbackSummarizeComments(req.body.comments || []);
    return res.json({
      success: true,
      summary: fallback.summaryOneLine,
      isFallback: true,
      note: "AI service error"
    });
  }
});


// Enhanced keyword-based fallback (KEEP THIS - it's your original working code)
// Enhanced keyword-based fallback
function fallbackSummarizeComments(comments) {
  if (!comments || comments.length === 0) {
    return {
      summaryOneLine: "No comments to summarize.",
      sampleComments: []
    };
  }

  try {
    const text = comments.join(" ").toLowerCase();
    const totalComments = comments.length;
    
    // Enhanced keyword analysis
    const understandingIssues = (text.match(/not understand|confus|difficult|hard|unclear|don't get|didn't get/g) || []).length;
    const paceIssues = (text.match(/fast|slow|pace|speed|rushed|too quick/g) || []).length;
    const exampleRequests = (text.match(/example|instance|case|demonstrat|show how/g) || []).length;
    const clarityPositive = (text.match(/clear|well explained|good|understand|helpful|great|excellent/g) || []).length;
    const visualIssues = (text.match(/diagram|graph|chart|visual|picture|see|show/g) || []).length;

    let issues = [];
    let positives = [];

    // Positive feedback
    if (clarityPositive > totalComments * 0.3) {
      positives.push(`Most students (${Math.round(clarityPositive/totalComments*100)}%) found the session clear and helpful`);
    }

    // Issues
    if (understandingIssues > totalComments * 0.2) {
      issues.push(`Some students (${Math.round(understandingIssues/totalComments*100)}%) found concepts difficult to understand`);
    }
    
    if (paceIssues > 0) {
      issues.push(`Teaching pace needs adjustment based on feedback`);
    }
    
    if (exampleRequests > 0) {
      issues.push(`Students requested more practical examples`);
    }
    
    if (visualIssues > 0) {
      issues.push(`Visual aids could be enhanced for better understanding`);
    }

    let summary = "";
    
    if (positives.length > 0) {
      summary += positives.join(". ") + ". ";
    }
    
    if (issues.length > 0) {
      summary += "Areas for improvement: " + issues.join("; ") + ".";
    }

    if (!summary.trim()) {
      summary = `Received ${totalComments} comments with mixed feedback. Consider reviewing specific student suggestions for detailed insights.`;
    }

    return {
      summaryOneLine: summary,
      sampleComments: comments.slice(0, 6) // Show fewer samples for fallback
    };
  } catch (error) {
    console.error("Fallback summarization error:", error);
    return {
      summaryOneLine: `Analysis completed for ${comments.length} student comments. Review individual feedback for specific insights.`,
      sampleComments: comments.slice(0, 4)
    };
  }
}

// NO enhanceSummaryWithKeywords FUNCTION - DELETED

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
