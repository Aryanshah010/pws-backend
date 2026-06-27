const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    // Connects using the URI string loaded from your hidden .env file
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`MongoDB Connected successfully: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Database Connection Error: ${error.message}`);
    process.exit(1); // Terminates the process if connection fails
  }
}; 

module.exports = connectDB;
