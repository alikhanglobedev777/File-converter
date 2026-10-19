import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getService, serviceGroups, services } from "../src/data/services.js";

const project = join(dirname(fileURLToPath(import.meta.url)), "..");

test("every conversion endpoint is represented by one distinct tool", () => {
  assert.equal(services.length, 13);
  assert.equal(new Set(services.map((tool) => tool.id)).size, 13);
  for (const tool of services) {
    assert.match(tool.id, /^[a-z]+(?:-[a-z]+)*$/);
    assert.equal(getService(tool.id), tool);
    assert.ok(tool.title && tool.description && tool.detail && tool.outputLabel);
    assert.ok(Array.isArray(tool.points) && tool.points.length === 3);
  }
});

test("navigation groups cover all tools exactly once", () => {
  const ids = serviceGroups.flatMap((group) => group.ids);
  assert.deepEqual(new Set(ids), new Set(services.map((tool) => tool.id)));
  assert.equal(ids.length, services.length);
  for (const group of serviceGroups) {
    for (const id of group.ids) assert.equal(getService(id).category, group.title);
  }
});

test("upload metadata agrees with the backend's per-route limits", () => {
  for (const tool of services) {
    if (tool.multiple) {
      assert.ok(tool.minFiles >= 1);
      assert.ok(tool.maxFiles >= tool.minFiles);
    } else {
      assert.ok(tool.input === ".pdf" || tool.input === ".xlsx,.xls");
    }
  }
  assert.deepEqual([getService("pdf-merger").minFiles, getService("pdf-merger").maxFiles], [2, 10]);
  assert.deepEqual([getService("zip-maker").minFiles, getService("zip-maker").maxFiles], [1, 20]);
  assert.deepEqual([getService("image-to-pdf").minFiles, getService("image-to-pdf").maxFiles], [1, 30]);
});

test("the matching stylesheet exists for the converter's case-sensitive import", () => {
  const component = readFileSync(join(project, "src/components/FileConverter.jsx"), "utf8");
  assert.match(component, /import "\.\/Fileconverter\.css"/);
  assert.ok(existsSync(join(project, "src/components/Fileconverter.css")));
});

test("the main HTML entrypoint loads the branded asset, not the Vite default", () => {
  const html = readFileSync(join(project, "index.html"), "utf8");
  assert.match(html, /\/favicon\.svg/);
  assert.doesNotMatch(html, /vite\.svg/);
  assert.ok(existsSync(join(project, "public/favicon.svg")));
});
