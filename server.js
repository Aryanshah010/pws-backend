const express = require("express");
const cors = require("cors");
const catalogRoutes = require("./src/routes/catalogRoute");
require("dotenv").config();

const connectDB = require("./src/config/db");
const authRoutes = require("./src/routes/authRoute");
const orderRoutes = require("./src/routes/orderRoutes");
const settingsRoutes = require("./src/routes/settingsRoute");
const { connect } = require("./src/utils/realtime");
const { channelStatus } = require("./src/services/notificationService");

const app = express();

connectDB();

app.use(cors());
app.use(express.json({ limit: "8mb" }));

app.use("/api/auth", authRoutes);
app.use("/api/products", catalogRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/settings", settingsRoutes);
app.get("/api/events", connect);

app.get("/", (req, res) => {
  res.send("API is running");
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: "Endpoint not found" });
});

app.use((error, req, res, next) => {
  console.error(`${req.method} ${req.originalUrl} failed:`, error);
  res.status(error.status || 500).json({
    success: false,
    message: error.message || "Something went wrong. Please try again.",
  });
});

const PORT = process.env.PORT || 5050;
app.listen(PORT, () => {
  const channels = channelStatus();
  console.log(`PWS Server is running on port ${PORT}`);
  console.log(`  SMS: ${channels.sms}  |  WhatsApp: ${channels.whatsapp}`);
});
