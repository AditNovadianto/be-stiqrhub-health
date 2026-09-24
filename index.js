import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { db } from "./config/db.js";
import authUserRoute from "./routes/authUserRoute.js";
import authCustomerRoute from "./routes/authCustomerRoute.js";
import providerRoute from "./routes/providerRoute.js";
import serviceRoute from "./routes/serviceRoute.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Test database SQL connection
async function testDBConnection() {
  try {
    await db.query("SELECT 1");
    console.log("✅ Database SQL connected successfully!");
    return true;
  } catch (error) {
    console.error("❌ Failed to connect to the database:", error.message);
    return false;
  }
}

testDBConnection();
//

app.get("/", (req, res) => {
  res.send("Welcome to the StiqrHub Health 2026 API");
});

app.use(authUserRoute);
app.use(authCustomerRoute);
app.use(providerRoute);
app.use(serviceRoute);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
