import express from "express";
import cors from "cors";
import routes from "./routes";

const app = express();

// Allow requests from your deployed frontend
app.use(
  cors({
    origin: [
      "https://do-fo-done-1.onrender.com",
      "https://do-fo-done.onrender.com",
    ],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  })
);

app.use(express.json());

// API routes
app.use("/api", routes);

export default app;