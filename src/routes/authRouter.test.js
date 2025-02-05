const request = require('supertest');
const app = require('../service');

const testUser = { name: 'pizza diner', email: 'reg@test.com', password: 'a' };
let testUserAuthToken;

beforeAll(async () => {
  testUser.email = Math.random().toString(36).substring(2, 12) + '@test.com';
  const registerRes = await request(app).post('/api/auth').send(testUser);
  const testUserBad = { name: 'pizza diner', email: null , password: 'a' };
  const badRegisterRes = await request(app).post('/api/auth').send(testUserBad);
  testUserAuthToken = registerRes.body.token;
});

test('login', async () => {
  const loginRes = await request(app).put('/api/auth').send(testUser);
  expect(loginRes.status).toBe(200);
  expect(loginRes.body.token).toMatch(/^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/);

  const { password, ...user } = { ...testUser, roles: [{ role: 'diner' }] };
  expect(loginRes.body.user).toMatchObject(user);
});

test('Unauthenticated actions', async() => {
  const badRegisterRes = await request(app).post('/api/auth').send(testUserBad);
  expect(badRegisterRes).toBe(401);
})

test('bad register', async()=>{
  testUser.email = null;
  const regRes = await request(app).post('/api/auth').send(testUser);
  expect(regRes.status).toBe(400);
})

test('register', async() =>{
    const testUser = { name: 'pizza diner', email: 'reg@test.com', password: 'a' };
    testUser.email = Math.random().toString(36).substring(2, 12) + '@test.com';
    const regRes = await request(app).post('/api/auth').send(testUser);
    expect(regRes.status).toBe(200);
});

test('updateUser', async () => {
  const testUser = { name: 'pizza diner', email: 'update@test.com', password: 'a' };
  testUser.email = Math.random().toString(36).substring(2, 12) + '@test.com';
  
  const registerRes = await request(app).post('/api/auth').send(testUser);
  expect(registerRes.status).toBe(200);
  const userId = registerRes.body.user.id;
  const authToken = registerRes.body.token;

  const updatedUser = { email: 'updated@test.com', password: 'newpassword' };
  const updateRes = await request(app)
    .put(`/api/auth/${userId}`)
    .set('Authorization', `Bearer ${authToken}`)
    .send(updatedUser);
  
  expect(updateRes.status).toBe(200);
  expect(updateRes.body.email).toBe(updatedUser.email);
});

