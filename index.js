import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { db } from "./config/db.js";
import authUserRoute from "./routes/authUserRoute.js";
import authCustomerRoute from "./routes/authCustomerRoute.js";
import authProviderUserRoute from "./routes/authProviderUserRoute.js";
import providerRoute from "./routes/providerRoute.js";
import serviceRoute from "./routes/serviceRoute.js";
import detailServiceRoute from "./routes/detailServiceRoute.js";
import orderRoute from "./routes/orderRoute.js";
import healthPassesRoute from "./routes/healthPassesRoute.js";
import balanceRoute from "./routes/balanceRoute.js";
import providerCategoryRoute from "./routes/providerCategoryRoute.js";
import providerRoleRoute from "./routes/providerRoleRoute.js";

import danaRoute from "./3rd/routes/danaRoute.js";
import danaPaymentRoute from "./3rd/routes/danaPaymentRoute.js";
import { finishNotify } from "./3rd/controllers/danaPaymentController.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(
  express.json({
    verify: (req, res, buffer) => {
      req.rawBody = buffer.toString("utf8");
    },
  }),
);

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
app.use(authProviderUserRoute);
app.use(providerRoute);
app.use(serviceRoute);
app.use(detailServiceRoute);
app.use(orderRoute);
app.use(healthPassesRoute);
app.use(balanceRoute);
app.use(providerCategoryRoute);
app.use(providerRoleRoute);

app.use("/api/dana", danaRoute);
app.use("/api/dana/payment", danaPaymentRoute);

app.post("/v1.0/debit/notify", finishNotify);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
