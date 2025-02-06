const request = require("supertest");
const app = require("../service");
const { Role, DB } = require("../database/database.js");

//Anytime you create a test store. Create a global variable and init before all.
let adminAuthToken;
let adminUser;
let regularUser;
let newFranchise;
let regUserFranchise;
let newStore;
let menuItem;
let order;

async function createAdminUser() {
  let user = { password: "toomanysecrets", roles: [{ role: Role.Admin }] };
  user.name = randomName();
  user.email = user.name + "@admin.com";

  await DB.addUser(user);

  user.password = "toomanysecrets";
  return user;
}

function randomName() {
  return Math.random().toString(36).substring(2, 12);
}

if (process.env.VSCODE_INSPECTOR_OPTIONS) {
  jest.setTimeout(60 * 1000 * 5); // 5 minutes
}

beforeAll(async () => {
  regularUser = await {
    name: "pizza diner",
    email: "reg@test.com",
    password: "a",
  };

  newStore = await {
    id: randomName(),
    name: randomName(),
    totalRevenue: 1000,
  };

  regularUser.email = Math.random().toString(36).substring(2, 12) + "@test.com";
  adminUser = await createAdminUser();
  // console.log(adminUser);

  newFranchise = {
    name: randomName(),
    admins: [{ email: adminUser.email }],
    stores: [{ id: randomName(), name: randomName(), totalRevenue: 1000 }],
  };

  regUserFranchise = {
    name: randomName(),
    admins: [{ email: regularUser.email }],
    stores: [{ id: randomName(), name: randomName(), totalRevenue: 1000 }],
  };

  const userLoginRes = await request(app).post("/api/auth").send(regularUser);
  const loginRes = await request(app).put("/api/auth").send(adminUser);
  adminAuthToken = loginRes.body.token;
  regularAuthToken = userLoginRes.body.token;
  console.log("Admin Login Res: ", loginRes.body);
  console.log("User Login Res: ", userLoginRes.body);

  menuItem = {
    title: "Student",
    description: "No topping, no sauce, just carbs",
    image: "pizza9.png",
    price: 0.0001,
  };
});

test("Get Menu", async () => {
  const res = await request(app).get("/api/order/menu");
  expect(res.status).toBe(200);
  expect(res.body).toBeInstanceOf(Array);
});

test("Add Menu Item", async () => {
  const res = await request(app)
    .put("/api/order/menu")
    .set("Authorization", `Bearer ${adminAuthToken}`)
    .send(menuItem);
  console.log(res.body);
  expect(res.status).toBe(200);
});

test("Create and Get Order", async () => {
  order = {
    franchiseId: 1,
    storeId: 1,
    items: [{ menuId: 1, description: "Veggie", price: 0.05 }],
  };
  console.log("Order", order);
  const res = await request(app)
    .post("/api/order")
    .set("Authorization", `Bearer ${adminAuthToken}`)
    .send(order);
  console.log("Order of the body", res.body);
  if (res.status !== 200) {
    console.error("Error creating order:", res.body);
  }
  expect(res.status).toBe(200);

  const getRes = await request(app)
    .get("/api/order")
    .set("Authorization", `Bearer ${adminAuthToken}`);
  console.log(getRes.body);
  expect(getRes.status).toBe(200);
});
