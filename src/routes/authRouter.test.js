const request = require("supertest");
const app = require("../service");
const AR = require("../routes/authRouter");

const testUser = { name: "pizza diner", email: "reg@test.com", password: "a" };

beforeAll(async () => {
  testUser.email = Math.random().toString(36).substring(2, 12) + "@test.com";
  await request(app).post("/api/auth").send(testUser);
});

test("login", async () => {
  const loginRes = await request(app).put("/api/auth").send(testUser);
  expect(loginRes.status).toBe(200);
  expect(loginRes.body.token).toMatch(
    /^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/
  );
  // eslint-disable-next-line no-unused-vars
  const { password, ...user } = { ...testUser, roles: [{ role: "diner" }] };
  expect(loginRes.body.user).toMatchObject(user);
});

test("bad register", async () => {
  testUser.email = null;
  const regRes = await request(app).post("/api/auth").send(testUser);
  expect(regRes.status).toBe(400);
});

test("register", async () => {
  const testUser = {
    name: "pizza diner",
    email: "reg@test.com",
    password: "a",
  };
  testUser.email = Math.random().toString(36).substring(2, 12) + "@test.com";
  const regRes = await request(app).post("/api/auth").send(testUser);
  expect(regRes.status).toBe(200);
});

test("setAuthToken", async () => {
  let req = { headers: {} };
  let res = {};
  let next = jest.fn();
  await AR.setAuthUser(req, res, next);
  expect(req.user).toBeUndefined();
  expect(next).toHaveBeenCalled();
});

test("Bad AuthToken", async () => {
  const smend = jest.fn();
  const smtatus = jest.fn(() => ({ send: smend }));
  let req = { headers: { send: smend } };
  let res = { status: smtatus };
  let next = jest.fn();
  AR.authRouter.authenticateToken(req, res, next);
  expect(smtatus).toHaveBeenCalledWith(401);
});

test("updateUserBad", async () => {
  const testUser = {
    name: "pizza diner",
    email: "update@test.com",
    password: "a",
  };
  const testUser2 = {
    name: "pizza diner2",
    email: "update@test.com",
    password: "a",
  };

  const registerRes = await request(app).post("/api/auth").send(testUser);
  const registerRes2 = await request(app).post("/api/auth").send(testUser2);
  expect(registerRes.status).toBe(200);
  const userId1 = registerRes.body.user.id;
  const authToken2 = registerRes2.body.token;

  const updatedUser = { email: "updated@test.com", password: "newpassword" };
  updatedUser.role;
  const updateRes = await request(app)
    .put(`/api/auth/${userId1}`)
    .set("Authorization", `Bearer ${authToken2}`)
    .send(null);

  expect(updateRes.status).toBe(403);
});

test("updateUser", async () => {
  const testUser = {
    name: "pizza diner",
    email: "update@test.com",
    password: "a",
  };
  testUser.email = Math.random().toString(36).substring(2, 12) + "@test.com";

  const registerRes = await request(app).post("/api/auth").send(testUser);
  expect(registerRes.status).toBe(200);
  const userId = registerRes.body.user.id;
  const authToken = registerRes.body.token;

  const updatedUser = { email: "updated@test.com", password: "newpassword" };
  const updateRes = await request(app)
    .put(`/api/auth/${userId}`)
    .set("Authorization", `Bearer ${authToken}`)
    .send(updatedUser);

  expect(updateRes.status).toBe(200);
  expect(updateRes.body.email).toBe(updatedUser.email);
});
