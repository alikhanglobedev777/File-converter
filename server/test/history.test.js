const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { app } = require('../server');
const User = require('../model/user');
const ConversionHistory = require('../model/conversion-history');
const { recordConversion, retentionDays, displayFilename } = require('../services/conversion-history');

const userA = new mongoose.Types.ObjectId();
const userB = new mongoose.Types.ObjectId();
const recordA = new mongoose.Types.ObjectId();
const recordB = new mongoose.Types.ObjectId();
const original = {
  findById: User.findById,
  create: ConversionHistory.create,
  find: ConversionHistory.find,
  countDocuments: ConversionHistory.countDocuments,
  deleteOne: ConversionHistory.deleteOne,
  deleteMany: ConversionHistory.deleteMany,
};
let server;
let base;

function auth(id) { return { Authorization: `Bearer ${jwt.sign({ id: String(id) }, process.env.JWT_SECRET)}` }; }
const records = [
  { _id: recordA, userId: userA, filename: 'a.pdf', status: 'success', createdAt: new Date() },
  { _id: recordB, userId: userB, filename: 'b.pdf', status: 'failed', createdAt: new Date() },
];

test('retention accepts only whole days (1–365), and names are sanitized', () => {
  assert.equal(retentionDays('30'), 30);
  assert.equal(retentionDays('365'), 365);
  for (const value of ['0', '-1', '366', '1.5', 'abc', '']) assert.equal(retentionDays(value), 30);
  assert.equal(displayFilename('C:\\documents\\private.pdf'), 'private.pdf');
  assert.equal(displayFilename('../../a\u0000.pdf'), 'a.pdf');
});

test('guest requests do not save history; logged-in requests save only metadata and failures are nonfatal', async () => {
  let received;
  ConversionHistory.create = async value => { received = value; };
  await recordConversion({ files: [{ originalname: 'guest.pdf' }], service: 'pdf-to-word', status: 'success' });
  assert.equal(received, undefined);
  await recordConversion({ user: { _id: userA }, files: [{ originalname: 'private.pdf', size: 12 }], service: 'pdf-to-word', outputFormat: 'docx', status: 'success' });
  assert.equal(String(received.userId), String(userA));
  assert.equal(received.filename, 'private.pdf');
  assert.equal(received.fileCount, 1);
  assert.equal(received.fileSize, 12);
  assert.equal(received.status, 'success');
  assert.equal(received.outputFormat, 'docx');
  assert.ok(received.expiresAt > new Date());
  assert.equal('file' in received, false);
  ConversionHistory.create = async () => { throw new Error('db unavailable'); };
  await assert.doesNotReject(recordConversion({ user: { _id: userA }, files: [{ originalname: 'a.pdf' }], service: 'pdf-to-word', status: 'failed' }));
  ConversionHistory.create = original.create;
});

test('authenticated history routes isolate accounts, reject invalid requests, and support deletion', async () => {
  process.env.JWT_SECRET ||= 'unit-tests-use-a-random-secret-over-32-characters';
  User.findById = id => ({ select: async () => ({ _id: new mongoose.Types.ObjectId(id) }) });
  ConversionHistory.find = ({ userId }) => {
    const docs = records.filter(r => String(r.userId) === String(userId));
    const chain = {
      sort() { return chain; }, skip(start) { chain.start = start; return chain; }, limit(n) { chain.count = n; return chain; },
      async lean() { return docs.slice(chain.start || 0, (chain.start || 0) + (chain.count || 20)); },
    };
    return chain;
  };
  ConversionHistory.countDocuments = async ({ userId, status }) => records.filter(r => String(r.userId) === String(userId) && (!status || r.status === status)).length;
  ConversionHistory.deleteOne = async ({ _id, userId }) => {
    const i = records.findIndex(r => String(r._id) === String(_id) && String(r.userId) === String(userId));
    if (i < 0) return { deletedCount: 0 };
    records.splice(i, 1); return { deletedCount: 1 };
  };
  ConversionHistory.deleteMany = async ({ userId }) => {
    const before = records.length;
    for (let i = records.length - 1; i >= 0; i--) if (String(records[i].userId) === String(userId)) records.splice(i, 1);
    return { deletedCount: before - records.length };
  };
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api/history`;
  const unauthorized = await fetch(base);
  assert.equal(unauthorized.status, 401);
  const invalid = await fetch(base, { headers: { Authorization: 'Bearer invalid-token' } });
  assert.equal(invalid.status, 401);
  const first = await fetch(base, { headers: auth(userA) });
  assert.equal(first.status, 200);
  const firstData = await first.json();
  assert.equal(firstData.total, 1);
  assert.equal(firstData.successful, 1);
  assert.equal(firstData.failed, 0);
  assert.deepEqual(firstData.items.map(x => x.filename), ['a.pdf']);
  assert.equal(firstData.retentionDays, 30);
  const other = await fetch(base, { headers: auth(userB) });
  assert.deepEqual((await other.json()).items.map(x => x.filename), ['b.pdf']);
  const invalidId = await fetch(`${base}/not-an-id`, { method: 'DELETE', headers: auth(userA) });
  assert.equal(invalidId.status, 400);
  const denied = await fetch(`${base}/${recordB}`, { method: 'DELETE', headers: auth(userA) });
  assert.equal(denied.status, 404);
  const deleted = await fetch(`${base}/${recordA}`, { method: 'DELETE', headers: auth(userA) });
  assert.equal(deleted.status, 200);
  const clearOther = await fetch(base, { method: 'DELETE', headers: auth(userB) });
  assert.equal((await clearOther.json()).deletedCount, 1);
  const cors = await fetch(base, { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'DELETE' } });
  assert.match(cors.headers.get('access-control-allow-methods') || '', /DELETE/);
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  User.findById = original.findById;
  Object.assign(ConversionHistory, {
    create: original.create, find: original.find, countDocuments: original.countDocuments,
    deleteOne: original.deleteOne, deleteMany: original.deleteMany,
  });
});
