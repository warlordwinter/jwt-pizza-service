const express = require("express");
const { authRouter, setAuthUser } = require("./routes/authRouter.js");
const orderRouter = require("./routes/orderRouter.js");
const franchiseRouter = require("./routes/franchiseRouter.js");
const version = require("./version.json");
const config = require("./config.js");
const metrics = require("./metrics.js");
const Logger = require("./logger.js");

const app = express();

// Initialize logger
const logger = new Logger(config);

// Add logger middleware first to catch all requests

metrics.startSystemMetricsCollection();

// Track available endpoints
metrics.updateAvailableEndpoints("auth", authRouter.endpoints.length);
metrics.updateAvailableEndpoints("order", orderRouter.endpoints.length);
metrics.updateAvailableEndpoints("franchise", franchiseRouter.endpoints.length);

// Add request tracking middleware
app.use(metrics.requestTracker);

app.use(express.json());
app.use(setAuthUser);
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  next();
});

const apiRouter = express.Router();

app.use(logger.httpLogger);
app.use("/api", apiRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/order", orderRouter);
apiRouter.use("/franchise", franchiseRouter);

apiRouter.use("/docs", (req, res) => {
  res.json({
    version: version.version,
    endpoints: [
      ...authRouter.endpoints,
      ...orderRouter.endpoints,
      ...franchiseRouter.endpoints,
    ],
    config: { factory: config.factory.url, db: config.db.connection.host },
  });
});

app.get("/", (req, res) => {
  res.json({
    message: "welcome to JWT Pizza",
    version: version.version,
  });
});

app.use("*", (req, res) => {
  res.status(404).json({
    message: "unknown endpoint",
  });
});

// Default error handler for all exceptions and errors.
app.use((err, req, res, next) => {
  logger.unhandledErrorLogger(err);
  res
    .status(err.statusCode ?? 500)
    .json({ message: err.message, stack: err.stack });
  next();
});

module.exports = app;
