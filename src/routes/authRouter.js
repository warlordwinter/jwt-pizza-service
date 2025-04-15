const express = require("express");
const jwt = require("jsonwebtoken");
const config = require("../config.js");
const { asyncHandler } = require("../endpointHelper.js");
const { DB, Role } = require("../database/database.js");
const metrics = require("../metrics.js");
const bcrypt = require("bcrypt");

const authRouter = express.Router();

authRouter.endpoints = [
  {
    method: "POST",
    path: "/api/auth",
    description: "Register a new user",
    example: `curl -X POST localhost:3000/api/auth -d '{"name":"pizza diner", "email":"d@jwt.com", "password":"diner"}' -H 'Content-Type: application/json'`,
    response: {
      user: {
        id: 2,
        name: "pizza diner",
        email: "d@jwt.com",
        roles: [{ role: "diner" }],
      },
      token: "tttttt",
    },
  },
  {
    method: "PUT",
    path: "/api/auth",
    description: "Login existing user",
    example: `curl -X PUT localhost:3000/api/auth -d '{"email":"a@jwt.com", "password":"admin"}' -H 'Content-Type: application/json'`,
    response: {
      user: {
        id: 1,
        name: "常用名字",
        email: "a@jwt.com",
        roles: [{ role: "admin" }],
      },
      token: "tttttt",
    },
  },
  {
    method: "PUT",
    path: "/api/auth/:userId",
    requiresAuth: true,
    description: "Update user",
    example: `curl -X PUT localhost:3000/api/auth/1 -d '{"email":"a@jwt.com", "password":"admin"}' -H 'Content-Type: application/json' -H 'Authorization: Bearer tttttt'`,
    response: {
      id: 1,
      name: "常用名字",
      email: "a@jwt.com",
      roles: [{ role: "admin" }],
    },
  },
  {
    method: "DELETE",
    path: "/api/auth",
    requiresAuth: true,
    description: "Logout a user",
    example: `curl -X DELETE localhost:3000/api/auth -H 'Authorization: Bearer tttttt'`,
    response: { message: "logout successful" },
  },
];

// Input validation middleware
const validateInput = (req, res, next) => {
  const { name, email, password } = req.body;

  // Basic input validation
  if (!name || !email || !password) {
    return res.status(400).json({ message: "All fields are required" });
  }

  // Email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ message: "Invalid email format" });
  }

  // Password strength validation
  if (password.length < 8) {
    return res
      .status(400)
      .json({ message: "Password must be at least 8 characters" });
  }

  // Sanitize name to prevent XSS and SQL injection
  req.body.name = name.replace(/[<>'"]/g, "");

  next();
};

// Enhanced JWT verification
authRouter.authenticateToken = (req, res, next) => {
  const startTime = new Date();
  const token = readAuthToken(req);

  if (!token) {
    return res.status(401).json({ message: "Authentication required" });
  }

  try {
    // Verify token signature and expiration
    const decoded = jwt.verify(token, config.jwtSecret, {
      algorithms: ["HS256"],
      maxAge: "1h",
    });

    // Additional token validation
    if (!decoded.id || !decoded.email || !decoded.roles) {
      return res.status(401).json({ message: "Invalid token" });
    }

    // Check if token is still valid in database
    if (!DB.isLoggedIn(token)) {
      return res.status(401).json({ message: "Session expired" });
    }

    // Sanitize user data
    req.user = {
      id: decoded.id,
      email: decoded.email,
      roles: decoded.roles.map((role) => ({
        role: role.role,
        objectId: role.objectId || 0,
      })),
    };
    req.user.isRole = (role) => !!req.user.roles.find((r) => r.role === role);

    const endTime = new Date();
    metrics.trackServiceLatency(startTime, endTime);
    next();
  } catch (error) {
    // Generic error message to prevent information leakage
    return res.status(401).json({ message: "Invalid token" });
  }
};

// register
authRouter.post(
  "/",
  validateInput,
  asyncHandler(async (req, res) => {
    const startTime = new Date();
    const { name, email, password } = req.body;

    try {
      const user = await DB.addUser({
        name,
        email,
        password,
        roles: [{ role: Role.Diner }],
      });
      const auth = await setAuth(user);
      const endTime = new Date();
      metrics.trackServiceLatency(startTime, endTime);
      res.json({ user: user, token: auth });
    } catch (error) {
      // Generic error message to prevent information leakage
      res.status(400).json({ message: "Registration failed" });
    }
  })
);

// login
authRouter.put(
  "/",
  validateInput,
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    try {
      const startTime = new Date();
      const user = await DB.getUser(email, password);
      if (!user) {
        // Generic error message to prevent user enumeration
        return res.status(401).json({ message: "Invalid credentials" });
      }
      const auth = await setAuth(user);
      const endTime = new Date();
      metrics.trackServiceLatency(startTime, endTime);
      metrics.incrementAuthenticationCount(true);
      metrics.trackUserActivity(user.id, true);
      res.json({ user: user, token: auth });
    } catch (error) {
      metrics.incrementAuthenticationCount(false);
      // Generic error message
      res.status(401).json({ message: "Invalid credentials" });
    }
  })
);

// logout
authRouter.delete(
  "/",
  authRouter.authenticateToken,
  asyncHandler(async (req, res) => {
    const startTime = new Date();
    metrics.trackUserActivity(req.user.id, false);
    await clearAuth(req);
    const endTime = new Date();
    metrics.trackServiceLatency(startTime, endTime);
    res.json({ message: "logout successful" });
  })
);

// updateUser
authRouter.put(
  "/:userId",
  authRouter.authenticateToken,
  validateInput,
  asyncHandler(async (req, res) => {
    const startTime = new Date();
    const { email, password } = req.body;
    const userId = Number(req.params.userId);
    const user = req.user;

    if (user.id !== userId && !user.isRole(Role.Admin)) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    try {
      const updatedUser = await DB.updateUser(userId, email, password);
      const endTime = new Date();
      metrics.trackServiceLatency(startTime, endTime);
      res.json(updatedUser);
    } catch (error) {
      res.status(400).json({ message: "Update failed" });
    }
  })
);

async function setAuth(user) {
  const startTime = new Date();
  const token = jwt.sign(user, config.jwtSecret);
  const endTime = new Date();
  metrics.trackServiceLatency(startTime, endTime);
  await DB.loginUser(user.id, token);
  return token;
}

async function clearAuth(req) {
  const startTime = new Date();
  const token = readAuthToken(req);
  if (token) {
    await DB.logoutUser(token);
  }
  const endTime = new Date();
  metrics.trackServiceLatency(startTime, endTime);
}

function readAuthToken(req) {
  const startTime = new Date();
  const authHeader = req.headers.authorization;
  if (authHeader) {
    return authHeader.split(" ")[1];
  }
  const endTime = new Date();
  metrics.trackServiceLatency(startTime, endTime);
  return null;
}

module.exports = { authRouter, setAuthUser };
