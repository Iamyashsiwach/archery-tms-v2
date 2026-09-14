import { test } from "node:test";
import assert from "node:assert/strict";

import { safeNext } from "./safe-next.js";

const SITE = "https://tms.example.org";

test("same-site paths and full same-site URLs are kept", () => {
  assert.equal(safeNext("/accept/abc", SITE), "/accept/abc");
  assert.equal(safeNext("/login?next=/x", SITE), "/login?next=/x");
  assert.equal(safeNext("https://tms.example.org/accept/abc", SITE), "/accept/abc");
});

test("anything that leaves the site falls back to the home page", () => {
  for (const hostile of [
    "https://evil.example",
    "//evil.example/accept",
    "/\\evil.example",
    "javascript:alert(1)",
    "https://tms.example.org.evil.example/",
    "http://tms.example.org/accept/abc",
  ]) {
    assert.equal(safeNext(hostile, SITE), "/", hostile);
  }
});

test("missing or non-string values fall back to the home page", () => {
  assert.equal(safeNext(null, SITE), "/");
  assert.equal(safeNext("", SITE), "/");
});
