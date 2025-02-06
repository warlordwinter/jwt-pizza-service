const request = require("supertest");
const app = require("../service");
const { Role, DB } = require("../database/database.js");

//Anytime you create a test store. Create a global variable and init before all.
let adminAuthToken;
let regularAuthToken;
let adminUser;
let regularUser;
let newFranchise;
let regUserFranchise;
let newStore;

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
});

// test("Create Store", async()=>{
//     await request(app).post('/:franchiseId/store')
// })

test("Create Franchise", async () => {
  const regRes = await request(app)
    .post("/api/franchise")
    .set("Authorization", `Bearer ${adminAuthToken}`)
    .send(newFranchise);
  console.log(regRes.body);
  expect(regRes.status).toBe(200);
});

test("Bad Create Franchise", async () => {
  // adminUser.roles = [{ role: Role.user }];
  const regRes = await request(app)
    .post("/api/franchise")
    .set("Authorization", `Bearer ${regularAuthToken}`)
    .send(newFranchise);
  console.log(regRes.body);
  expect(regRes.status).toBe(403);
});

test("Get Franchises", async () => {
  const getFranchisesRes = await request(app)
    .get("/")
    .set("Authorization", `Bearer ${adminAuthToken}`);
  expect(getFranchisesRes.status).toBe(200);
});

test("Create, Get, and Delete Store", async () => {
  const regFranRes = await request(app)
    .post("/api/franchise")
    .set("Authorization", `Bearer ${adminAuthToken}`)
    .send(regUserFranchise);
  console.log(regFranRes.body);
  console.log("Franchise Id: ", regFranRes.body.id);
  expect(regFranRes.status).toBe(200);

  const getFranchisesRes = await request(app)
    .get(`/api/franchise/${regFranRes.body.id}`)
    .set("Authorization", `Bearer ${adminAuthToken}`);
  expect(getFranchisesRes.status).toBe(200);

  const createStoreRes = await request(app)
    .post(`/api/franchise/${regFranRes.body.id}/store`)
    .set("Authorization", `Bearer ${adminAuthToken}`)
    .send(newStore);
  console.log(createStoreRes.body);
  expect(createStoreRes.status).toBe(200);

  const deleteStoreRes = await request(app)
    .delete(`/api/franchise/${regFranRes.body.id}/store/${newStore.id}`)
    .set("Authorization", `Bearer ${adminAuthToken}`);
  console.log(deleteStoreRes.body);
  expect(deleteStoreRes.status).toBe(200);

  const deleteFranchiseRes = await request(app)
    .delete(`/api/franchise/${regFranRes.body.id}`)
    .set("Authorization", `Bearer ${adminAuthToken}`);
  console.log(deleteFranchiseRes.body);
  expect(deleteFranchiseRes.status).toBe(200);
});
