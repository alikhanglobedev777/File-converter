const { test } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { app, startServer } = require("../server");

function configureTestEnvironment(t) {
  const original = { MONGO_URI: process.env.MONGO_URI, JWT_SECRET: process.env.JWT_SECRET };
  process.env.MONGO_URI = "mongodb://localhost/test";
  process.env.JWT_SECRET = "test-only-secret-with-at-least-32-characters";
  t.after(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test("HTTP listener starts only after the database connects", async (t) => {
  configureTestEnvironment(t);
  let resolveConnection;
  t.mock.method(mongoose, "connect", () => new Promise((resolve) => { resolveConnection = resolve; }));
  const listen = t.mock.method(app, "listen", () => "test-server");
  const pending = startServer();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(listen.mock.callCount(), 0);
  resolveConnection();
  assert.equal(await pending, "test-server");
  assert.equal(listen.mock.callCount(), 1);
});

test("a failed database connection never opens the HTTP listener", async (t) => {
  configureTestEnvironment(t);
  t.mock.method(mongoose, "connect", async () => { throw new Error("unreachable"); });
  const listen = t.mock.method(app, "listen", () => {});
  await assert.rejects(startServer(), /MongoDB connection failed/);
  assert.equal(listen.mock.callCount(), 0);
});

test("missing JWT configuration fails before database or HTTP startup", async (t) => {
  configureTestEnvironment(t);
  delete process.env.JWT_SECRET;
  const connect = t.mock.method(mongoose, "connect", async () => {});
  const listen = t.mock.method(app, "listen", () => {});
  await assert.rejects(startServer(), /JWT_SECRET/);
  assert.equal(connect.mock.callCount(), 0);
  assert.equal(listen.mock.callCount(), 0);
});
