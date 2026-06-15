const express = require("express");
const cors = require("cors");
require("dotenv").config();
const connectDB = require("./src/config/db");

const app = express();

// Establish the connection to MongoDB Compass / local instance
connectDB();

// Global Express Middleware
app.use(cors());
app.use(express.json()); // Parses incoming request payloads with JSON

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`PWS Server is actively executing on port ${PORT}`);
});
