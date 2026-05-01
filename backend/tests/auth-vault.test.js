const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createApp } = require('../app');
const User = require('../models/User');
const Session = require('../models/Session');
const AuditLog = require('../models/AuditLog');

jest.mock('../models/User', () => ({
  findOne: jest.fn(),
  create: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));

jest.mock('../models/Session', () => ({
  create: jest.fn(),
  findById: jest.fn(),
}));

jest.mock('../models/AuditLog', () => ({
  create: jest.fn(),
}));

function extractCsrfToken(setCookieHeaders = []) {
  const csrfCookie = setCookieHeaders.find((c) => c.startsWith('csrf-token='));
  if (!csrfCookie) return '';
  return csrfCookie.split(';')[0].split('=')[1];
}

function mockFindByIdSelect(value) {
  User.findById.mockImplementationOnce(() => ({
    select: jest.fn().mockResolvedValue(value),
  }));
}

function mockSessionFindById(value = {}) {
  Session.findById.mockResolvedValue({
    revokedAt: null,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    save: jest.fn().mockResolvedValue(true),
    ...value,
  });
}

describe('Auth + Vault API automation', () => {
  let app;

  beforeAll(() => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test-secret-key';
    app = createApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    Session.create.mockResolvedValue({ _id: 'session-1' });
    AuditLog.create.mockResolvedValue({ _id: 'audit-1' });
  });

  async function getCsrfSession() {
    const healthRes = await request(app).get('/api/health');
    const cookies = healthRes.headers['set-cookie'] || [];
    const csrfToken = extractCsrfToken(cookies);
    const csrfCookie = cookies.find((c) => c.startsWith('csrf-token='));
    return {
      csrfToken,
      csrfCookie: csrfCookie ? csrfCookie.split(';')[0] : '',
    };
  }

  test('registers a new user successfully', async () => {
    User.findOne.mockResolvedValue(null);
    User.create.mockResolvedValue({
      _id: 'user-1',
      email: 'alice@example.com',
      mfaEnabled: false,
    });

    const { csrfToken, csrfCookie } = await getCsrfSession();

    const res = await request(app)
      .post('/api/auth/register')
      .set('Cookie', csrfCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        email: 'alice@example.com',
        password: 'Str0ng!Pass',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.user.email).toBe('alice@example.com');
    expect(User.create).toHaveBeenCalledWith({
      email: 'alice@example.com',
      passwordHash: 'Str0ng!Pass',
    });
  });

  test('rejects login with invalid credentials', async () => {
    User.findOne.mockResolvedValue({
      _id: 'user-1',
      email: 'alice@example.com',
      comparePassword: jest.fn().mockResolvedValue(false),
    });

    const { csrfToken, csrfCookie } = await getCsrfSession();

    const res = await request(app)
      .post('/api/auth/login')
      .set('Cookie', csrfCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        email: 'alice@example.com',
        password: 'WrongPass1!',
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/Invalid email or password/i);
  });

  test('returns vault blob for authenticated user', async () => {
    const token = jwt.sign({ id: 'user-1', sid: 'session-1' }, process.env.JWT_SECRET, { expiresIn: '1h' });

    mockSessionFindById();
    mockFindByIdSelect({ _id: 'user-1', email: 'alice@example.com' });
    mockFindByIdSelect({
      encryptedVault: 'ciphertext',
      vaultIV: 'iv',
      vaultSalt: 'salt',
    });

    const res = await request(app)
      .get('/api/vault')
      .set('Cookie', `token=${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.vault).toEqual({
      encryptedVault: 'ciphertext',
      vaultIV: 'iv',
      vaultSalt: 'salt',
    });
  });

  test('validates required encrypted fields before saving vault', async () => {
    const token = jwt.sign({ id: 'user-1', sid: 'session-1' }, process.env.JWT_SECRET, { expiresIn: '1h' });

    mockSessionFindById();
    mockFindByIdSelect({ _id: 'user-1', email: 'alice@example.com' });

    const { csrfToken, csrfCookie } = await getCsrfSession();

    const res = await request(app)
      .put('/api/vault')
      .set('Cookie', `token=${token}; ${csrfCookie}`)
      .set('x-csrf-token', csrfToken)
      .send({ encryptedVault: 'abc' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/Missing encrypted vault fields/i);
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });
});
