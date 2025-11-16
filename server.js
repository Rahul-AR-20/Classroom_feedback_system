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

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
