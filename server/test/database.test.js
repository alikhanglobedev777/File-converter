const { test } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { connectDatabase } = require("../config/database");

test("rejects missing, placeholder, and invalid URIs before connecting", async (t) => {
  const connect = t.mock.method(mongoose, "connect", async () => {});
  for (const uri of [undefined, "", "  ", "mongodb+srv://<user>:<password>@<host>/", "https://example.com"]) {
    await assert.rejects(connectDatabase({ MONGO_URI: uri }), /MONGO_URI/);
  }
  assert.equal(connect.mock.callCount(), 0);
});

test("selects the project database when the Atlas URI has no database path", async (t) => {
  const connect = t.mock.method(mongoose, "connect", async () => {});
  await connectDatabase({ MONGO_URI: "mongodb+srv://user:password@cluster.example.com/" });
  assert.equal(connect.mock.calls[0].arguments[1].dbName, "file_converter");
  assert.equal(connect.mock.calls[0].arguments[1].serverSelectionTimeoutMS, 10000);
});

test("supports an explicit database name", async (t) => {
  const connect = t.mock.method(mongoose, "connect", async () => {});
  await connectDatabase({ MONGO_URI: "mongodb://localhost/", MONGO_DB_NAME: " custom_db " });
  assert.equal(connect.mock.calls[0].arguments[1].dbName, "custom_db");
});

test("waits for connection readiness", async (t) => {
  let resolveConnection;
  t.mock.method(mongoose, "connect", () => new Promise((resolve) => { resolveConnection = resolve; }));
  let ready = false;
  const pending = connectDatabase({ MONGO_URI: "mongodb://localhost/" }).then(() => { ready = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(ready, false);
  resolveConnection();
  await pending;
  assert.equal(ready, true);
});

test("connection failures reject without exposing credentials", async (t) => {
  t.mock.method(mongoose, "connect", async () => {
    throw new Error("Failed mongodb+srv://user:private-password@cluster.example.com/");
  });
  await assert.rejects(connectDatabase({ MONGO_URI: "mongodb://localhost/" }), (err) => {
    assert.match(err.message, /MongoDB connection failed/);
    assert.doesNotMatch(err.message, /private-password/);
    return true;
  });
});
