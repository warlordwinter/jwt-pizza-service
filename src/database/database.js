const mysql = require("mysql2/promise");
const bcrypt = require("bcrypt");
const config = require("../config.js");
const { StatusCodeError } = require("../endpointHelper.js");
const { Role } = require("../model/model.js");
const dbModel = require("./dbModel.js");
const Logger = require("../logger.js");

class DB {
  constructor() {
    this.initialized = this.initializeDatabase();
    this.logger = new Logger(config);
    this.maxLoginAttempts = 5;
    this.loginAttempts = new Map();
    this.validRoles = [Role.Diner, Role.Admin, Role.Franchisee];
  }

  async getMenu() {
    const connection = await this.getConnection();
    try {
      const rows = await this.query(connection, `SELECT * FROM menu`);
      this.logger.dbLogger(`SELECT * FROM menu`);
      return rows;
    } finally {
      connection.end();
    }
  }

  async addMenuItem(item) {
    const connection = await this.getConnection();
    try {
      const addResult = await this.query(
        connection,
        `INSERT INTO menu (title, description, image, price) VALUES (?, ?, ?, ?)`,
        [item.title, item.description, item.image, item.price]
      );
      return { ...item, id: addResult.insertId };
    } finally {
      connection.end();
    }
  }

  async addUser(user) {
    const connection = await this.getConnection();
    try {
      const existingUser = await this.query(
        connection,
        `SELECT id FROM user WHERE email = ?`,
        [user.email]
      );
      if (existingUser.length > 0) {
        throw new StatusCodeError("Email already exists", 400);
      }

      if (
        !user.roles ||
        !Array.isArray(user.roles) ||
        user.roles.length === 0
      ) {
        throw new StatusCodeError("At least one role is required", 400);
      }

      const hasAdminRole = user.roles.some((role) => role.role === Role.Admin);
      if (hasAdminRole) {
        throw new StatusCodeError("Unauthorized role assignment", 403);
      }

      for (const role of user.roles) {
        if (!this.validRoles.includes(role.role)) {
          throw new StatusCodeError("Invalid role", 400);
        }
      }

      const hashedPassword = await bcrypt.hash(user.password, 12);

      const userResult = await this.query(
        connection,
        `INSERT INTO user (name, email, password) VALUES (?, ?, ?)`,
        [user.name, user.email, hashedPassword]
      );
      const userId = userResult.insertId;

      for (const role of user.roles) {
        switch (role.role) {
          case Role.Franchisee: {
            const franchiseId = await this.getID(
              connection,
              "name",
              role.object,
              "franchise"
            );
            await this.query(
              connection,
              `INSERT INTO userRole (userId, role, objectId) VALUES (?, ?, ?)`,
              [userId, role.role, franchiseId]
            );
            break;
          }
          default: {
            await this.query(
              connection,
              `INSERT INTO userRole (userId, role, objectId) VALUES (?, ?, ?)`,
              [userId, role.role, 0]
            );
            break;
          }
        }
      }
      return { ...user, id: userId, password: undefined };
    } finally {
      connection.end();
    }
  }

  async getUser(email, password) {
    const connection = await this.getConnection();
    try {
      await this.checkLoginAttempts(email);

      const userResult = await this.query(
        connection,
        `SELECT * FROM user WHERE email = ?`,
        [email]
      );
      const user = userResult[0];

      if (!user || !(await bcrypt.compare(password, user.password))) {
        throw new StatusCodeError("Invalid credentials", 401);
      }

      const roleResult = await this.query(
        connection,
        `SELECT * FROM userRole WHERE userId = ?`,
        [user.id]
      );
      const roles = roleResult.map((r) => {
        return { objectId: r.objectId || undefined, role: r.role };
      });

      this.loginAttempts.delete(email);

      return { ...user, roles: roles, password: undefined };
    } catch (error) {
      throw error;
    } finally {
      connection.end();
    }
  }

  async updateUser(userId, email, password) {
    const connection = await this.getConnection();
    try {
      const fields = [];
      const values = [];

      if (email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          throw new StatusCodeError("Invalid email format", 400);
        }
        fields.push("email = ?");
        values.push(email);
      }

      if (password) {
        if (password.length < 8) {
          throw new StatusCodeError(
            "Password must be at least 8 characters",
            400
          );
        }
        const hashedPassword = await bcrypt.hash(password, 12);
        fields.push("password = ?");
        values.push(hashedPassword);
      }

      if (fields.length > 0) {
        const query = `UPDATE user SET ${fields.join(", ")} WHERE id = ?`;
        values.push(userId);
        await this.query(connection, query, values);
      }

      return this.getUser(email, password);
    } finally {
      connection.end();
    }
  }

  async loginUser(userId, token) {
    token = this.getTokenSignature(token);
    const connection = await this.getConnection();
    try {
      await this.query(
        connection,
        `INSERT INTO auth (token, userId) VALUES (?, ?)`,
        [token, userId]
      );
    } finally {
      connection.end();
    }
  }

  async isLoggedIn(token) {
    token = this.getTokenSignature(token);
    const connection = await this.getConnection();
    try {
      const authResult = await this.query(
        connection,
        `SELECT userId FROM auth WHERE token=?`,
        [token]
      );
      return authResult.length > 0;
    } finally {
      connection.end();
    }
  }

  async logoutUser(token) {
    token = this.getTokenSignature(token);
    const connection = await this.getConnection();
    try {
      await this.query(connection, `DELETE FROM auth WHERE token=?`, [token]);
    } finally {
      connection.end();
    }
  }

  async getOrders(user, page = 1) {
    const connection = await this.getConnection();
    try {
      const offset = this.getOffset(page, config.db.listPerPage);
      const orders = await this.query(
        connection,
        `SELECT id, franchiseId, storeId, date FROM dinerOrder WHERE dinerId=? LIMIT ${offset},${config.db.listPerPage}`,
        [user.id]
      );
      for (const order of orders) {
        let items = await this.query(
          connection,
          `SELECT id, menuId, description, price FROM orderItem WHERE orderId=?`,
          [order.id]
        );
        order.items = items;
      }
      return { dinerId: user.id, orders: orders, page };
    } finally {
      connection.end();
    }
  }

  async addDinerOrder(user, order) {
    const connection = await this.getConnection();
    try {
      const orderResult = await this.query(
        connection,
        `INSERT INTO dinerOrder (dinerId, franchiseId, storeId, date) VALUES (?, ?, ?, now())`,
        [user.id, order.franchiseId, order.storeId]
      );
      const orderId = orderResult.insertId;
      for (const item of order.items) {
        const menuId = await this.getID(connection, "id", item.menuId, "menu");
        await this.query(
          connection,
          `INSERT INTO orderItem (orderId, menuId, description, price) VALUES (?, ?, ?, ?)`,
          [orderId, menuId, item.description, item.price]
        );
      }
      return { ...order, id: orderId };
    } finally {
      connection.end();
    }
  }

  async createFranchise(franchise) {
    const connection = await this.getConnection();
    try {
      for (const admin of franchise.admins) {
        const adminUser = await this.query(
          connection,
          `SELECT id, name FROM user WHERE email=?`,
          [admin.email]
        );
        if (adminUser.length == 0) {
          throw new StatusCodeError(
            `unknown user for franchise admin ${admin.email} provided`,
            404
          );
        }
        admin.id = adminUser[0].id;
        admin.name = adminUser[0].name;
      }

      const franchiseResult = await this.query(
        connection,
        `INSERT INTO franchise (name) VALUES (?)`,
        [franchise.name]
      );
      franchise.id = franchiseResult.insertId;

      for (const admin of franchise.admins) {
        await this.query(
          connection,
          `INSERT INTO userRole (userId, role, objectId) VALUES (?, ?, ?)`,
          [admin.id, Role.Franchisee, franchise.id]
        );
      }

      return franchise;
    } finally {
      connection.end();
    }
  }

  async deleteFranchise(franchiseId) {
    const connection = await this.getConnection();
    try {
      await connection.beginTransaction();
      try {
        await this.query(connection, `DELETE FROM store WHERE franchiseId=?`, [
          franchiseId,
        ]);
        await this.query(connection, `DELETE FROM userRole WHERE objectId=?`, [
          franchiseId,
        ]);
        await this.query(connection, `DELETE FROM franchise WHERE id=?`, [
          franchiseId,
        ]);
        await connection.commit();
      } catch {
        await connection.rollback();
        throw new StatusCodeError("unable to delete franchise", 500);
      }
    } finally {
      connection.end();
    }
  }

  async getFranchises(authUser) {
    const connection = await this.getConnection();
    try {
      const franchises = await this.query(
        connection,
        `SELECT id, name FROM franchise`
      );
      for (const franchise of franchises) {
        if (authUser?.isRole(Role.Admin)) {
          await this.getFranchise(franchise);
        } else {
          franchise.stores = await this.query(
            connection,
            `SELECT id, name FROM store WHERE franchiseId=?`,
            [franchise.id]
          );
        }
      }
      return franchises;
    } finally {
      connection.end();
    }
  }

  async getUserFranchises(userId) {
    const connection = await this.getConnection();
    try {
      let franchiseIds = await this.query(
        connection,
        `SELECT objectId FROM userRole WHERE role='franchisee' AND userId=?`,
        [userId]
      );
      if (franchiseIds.length === 0) {
        return [];
      }

      franchiseIds = franchiseIds.map((v) => v.objectId);
      const placeholders = franchiseIds.map(() => "?").join(",");
      const franchises = await this.query(
        connection,
        `SELECT id, name FROM franchise WHERE id IN (${placeholders})`,
        franchiseIds
      );

      for (const franchise of franchises) {
        await this.getFranchise(franchise);
      }
      return franchises;
    } finally {
      connection.end();
    }
  }

  async getFranchise(franchise) {
    const connection = await this.getConnection();
    try {
      franchise.admins = await this.query(
        connection,
        `SELECT u.id, u.name, u.email FROM userRole AS ur JOIN user AS u ON u.id=ur.userId WHERE ur.objectId=? AND ur.role='franchisee'`,
        [franchise.id]
      );

      franchise.stores = await this.query(
        connection,
        `SELECT s.id, s.name, COALESCE(SUM(oi.price), 0) AS totalRevenue FROM dinerOrder AS do JOIN orderItem AS oi ON do.id=oi.orderId RIGHT JOIN store AS s ON s.id=do.storeId WHERE s.franchiseId=? GROUP BY s.id`,
        [franchise.id]
      );

      return franchise;
    } finally {
      connection.end();
    }
  }

  async createStore(franchiseId, store) {
    const connection = await this.getConnection();
    try {
      const insertResult = await this.query(
        connection,
        `INSERT INTO store (franchiseId, name) VALUES (?, ?)`,
        [franchiseId, store.name]
      );
      return { id: insertResult.insertId, franchiseId, name: store.name };
    } finally {
      connection.end();
    }
  }

  async deleteStore(franchiseId, storeId) {
    const connection = await this.getConnection();
    try {
      await this.query(
        connection,
        `DELETE FROM store WHERE franchiseId=? AND id=?`,
        [franchiseId, storeId]
      );
    } finally {
      connection.end();
    }
  }

  getOffset(currentPage = 1, listPerPage) {
    return (currentPage - 1) * [listPerPage];
  }

  getTokenSignature(token) {
    const parts = token.split(".");
    if (parts.length > 2) {
      return parts[2];
    }
    return "";
  }

  async query(connection, sql, params) {
    const [results] = await connection.execute(sql, params);
    return results;
  }

  async getID(connection, key, value, table) {
    const [rows] = await connection.execute(
      `SELECT id FROM ${table} WHERE ${key}=?`,
      [value]
    );
    if (rows.length > 0) {
      return rows[0].id;
    }
    throw new Error("No ID found");
  }

  async getConnection() {
    await this.initialized;
    return this._getConnection();
  }

  async _getConnection(setUse = true) {
    const connection = await mysql.createConnection({
      host: config.db.connection.host,
      user: config.db.connection.user,
      password: config.db.connection.password,
      connectTimeout: config.db.connection.connectTimeout,
      decimalNumbers: true,
    });
    if (setUse) {
      await connection.query(`USE ${config.db.connection.database}`);
    }
    return connection;
  }

  async initializeDatabase() {
    try {
      const connection = await this._getConnection(false);
      try {
        const dbExists = await this.checkDatabaseExists(connection);
        console.log(
          dbExists ? "Database exists" : "Database does not exist, creating it"
        );

        await connection.query(
          `CREATE DATABASE IF NOT EXISTS ${config.db.connection.database}`
        );
        await connection.query(`USE ${config.db.connection.database}`);

        if (!dbExists) {
          console.log("Successfully created database");
        }

        for (const statement of dbModel.tableCreateStatements) {
          await connection.query(statement);
        }

        if (!dbExists) {
          const defaultAdmin = {
            name: "常用名字",
            email: "a@jwt.com",
            password: "admin",
            roles: [{ role: Role.Admin }],
          };
          this.addUser(defaultAdmin);
        }
      } finally {
        connection.end();
      }
    } catch (err) {
      console.error(
        JSON.stringify({
          message: "Error initializing database",
          exception: err.message,
          connection: config.db.connection,
        })
      );
    }
  }

  async checkDatabaseExists(connection) {
    const [rows] = await connection.execute(
      `SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?`,
      [config.db.connection.database]
    );
    return rows.length > 0;
  }

  async checkLoginAttempts(email) {
    const attempts = this.loginAttempts.get(email) || 0;
    if (attempts >= this.maxLoginAttempts) {
      throw new StatusCodeError(
        "Too many login attempts. Please try again later.",
        429
      );
    }
    this.loginAttempts.set(email, attempts + 1);
    setTimeout(() => {
      const currentAttempts = this.loginAttempts.get(email);
      if (currentAttempts) {
        this.loginAttempts.set(email, currentAttempts - 1);
      }
    }, 15 * 60 * 1000);
  }

  // Track login attempts
  trackLoginAttempt(email) {
    if (!this.loginAttempts.has(email)) {
      this.loginAttempts.set(email, {
        attempts: 0,
        lastAttempt: Date.now(),
      });
    }

    const userAttempts = this.loginAttempts.get(email);
    userAttempts.attempts++;
    userAttempts.lastAttempt = Date.now();

    // Reset attempts after 15 minutes
    if (Date.now() - userAttempts.lastAttempt > 15 * 60 * 1000) {
      userAttempts.attempts = 0;
    }

    return userAttempts.attempts >= this.maxLoginAttempts;
  }

  // Reset login attempts
  resetLoginAttempts(email) {
    if (this.loginAttempts.has(email)) {
      this.loginAttempts.delete(email);
    }
  }

  // Enhanced login method
  async login(email, password) {
    if (this.trackLoginAttempt(email)) {
      throw new Error("Too many login attempts. Please try again later.");
    }

    const user = await this.getUser(email, password);
    if (!user) {
      throw new Error("Invalid credentials");
    }

    // Reset attempts on successful login
    this.resetLoginAttempts(email);
    return user;
  }
}

const db = new DB();
module.exports = { Role, DB: db };
