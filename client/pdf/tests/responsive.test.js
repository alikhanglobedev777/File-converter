import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const src = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const read = (path) => readFileSync(join(src, path), "utf8");

test("white surfaces and neutral borders replace pale blue page backgrounds", () => {
  const app = read("App.css");
  assert.match(app, /background:\s*#fff;/);
  assert.match(app, /--line:\s*#e5e5e5;/);
  assert.match(app, /--blue:\s*#1769e8;/);
  for (const stylesheet of ["App.css", "components/Navbar.css", "components/Fileconverter.css", "components/auth.css"]) {
    const css = read(stylesheet);
    for (const oldTint of ["#f5f9ff", "#eff6ff", "#eaf4ff", "#eaf3ff", "#f7fbff", "#e2efff", "#e5f1ff"]) {
      assert.ok(!css.toLowerCase().includes(oldTint), `${stylesheet} still contains tinted panel ${oldTint}`);
    }
  }
});

test("navigation fits narrow phones and exposes an accessible drawer", () => {
  const css = read("components/Navbar.css");
  const jsx = read("components/Navbar.jsx");
  assert.match(css, /@media \(max-width: 1000px\)/);
  assert.match(css, /@media \(max-width: 480px\)/);
  assert.match(css, /@media \(max-width: 375px\)/);
  assert.match(jsx, /aria-controls="mobile-sidebar"/);
  assert.match(jsx, /aria-expanded=\{menuOpen\}/);
  assert.match(jsx, /event\.key === "Escape"/);
  assert.match(jsx, /event\.key === "Tab"/);
  assert.match(jsx, /document\.body\.style\.overflow = "hidden"/);
});

test("dashboard, converter and auth have compact single-column layouts", () => {
  assert.match(read("App.css"), /@media \(max-width: 600px\)[\s\S]*?\.tool-grid, \.steps-grid \{ grid-template-columns: 1fr;/);
  assert.match(read("components/Fileconverter.css"), /@media \(max-width: 960px\)[\s\S]*?\.workspace-grid \{ grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(read("components/Fileconverter.css"), /@media \(max-width: 600px\)[\s\S]*?\.workspace-side, \.tool-grid--related \{ grid-template-columns: 1fr;/);
  assert.match(read("components/auth.css"), /@media \(max-width: 960px\)[\s\S]*?\.auth-layout \{ grid-template-columns: minmax\(0, 1fr\);/);
});
