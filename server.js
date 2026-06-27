const express = require("express");
const cors = require("cors");
const catalogRoutes = require("./src/routes/catalogRoute");
require("dotenv").config();

const connectDB = require("./src/config/db");
const authRoutes = require("./src/routes/authRoute");
const orderRoutes = require("./src/routes/orderRoute");

const app = express();

connectDB();

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/products", catalogRoutes);
app.use("/api/orders", orderRoutes);

app.get("/", (req, res) => {
  res.send("API is running");
});

const PORT = process.env.PORT || 5050;
app.listen(PORT, () => {
  console.log(`PWS Server is running on port ${PORT}`);
});
