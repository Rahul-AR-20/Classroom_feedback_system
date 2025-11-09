const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const cors = require("cors");
const bodyParser = require("body-parser");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.options('*', cors()); // ✅ Handles preflight requests
app.use(bodyParser.json());
app.use(express.static(__dirname));

// MongoDB Connection
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ Connected to MongoDB Atlas"))
  .catch((err) => console.error("❌ MongoDB Atlas connection error:", err));

// Schemas
const sessionSchema = new mongoose.Schema({
  sessionId: String,
  subject: String,
  teacher: String,
  topic: String,
  createdAt: { type: Date, default: Date.now },
});

const feedbackSchema = new mongoose.Schema({
  sessionId: String,
  rating: Number,
  comment: String,
  createdAt: { type: Date, default: Date.now },
});

const Session = mongoose.model("Session", sessionSchema);
const Feedback = mongoose.model("Feedback", feedbackSchema);

// Routes
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ✅ Create new feedback session
app.post("/api/session/start", async (req, res) => {
  try {
    const { subject, teacher, topic } = req.body;
    const sessionId = uuidv4();

    const newSession = new Session({ sessionId, subject, teacher, topic });
    await newSession.save();

    res.json({ success: true, sessionId });
  } catch (err) {
    console.error("Error creating session:", err);
    res.status(500).json({ success: false });
  }
});

// ✅ Submit feedback
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

// ✅ Analytics route
app.get("/api/analytics/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const feedbacks = await Feedback.find({ sessionId });

    const totalResponses = feedbacks.length;
    const avgRating =
      totalResponses === 0
        ? 0
        : feedbacks.reduce((acc, f) => acc + f.rating, 0) / totalResponses;

    res.json({ totalResponses, avgRating, feedbacks });
    } catch (err) {
    console.error("Error fetching analytics:", err.message || err);
    res.status(500).json({ success: false, message: "Error fetching analytics" });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});