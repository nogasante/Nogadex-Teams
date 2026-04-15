import test from "node:test";
import assert from "node:assert/strict";
import { getAllowedOrigins, isAllowedOrigin } from "./runtimeConfig.js";

const ENV_KEYS = ["CORS_ALLOWED_ORIGINS", "FRONTEND_ORIGIN", "NODE_ENV"] as const;
const originalEnv = {
  CORS_ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS,
  FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN,
  NODE_ENV: process.env.NODE_ENV,
};

function resetEnv() {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
}

test.beforeEach(() => {
  resetEnv();
});

test.after(() => {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

test("uses explicit CORS_ALLOWED_ORIGINS and normalizes whitespace/trailing slash", () => {
  process.env.CORS_ALLOWED_ORIGINS = " https://app.example.com/ ,http://localhost:3000 ";

  assert.deepEqual(getAllowedOrigins(), ["https://app.example.com", "http://localhost:3000"]);
  assert.equal(isAllowedOrigin("https://app.example.com/"), true);
  assert.equal(isAllowedOrigin("http://localhost:3000"), true);
  assert.equal(isAllowedOrigin("https://other.example.com"), false);
});

test("falls back to FRONTEND_ORIGIN when explicit list is missing", () => {
  process.env.FRONTEND_ORIGIN = "https://frontend.example.com/";

  assert.deepEqual(getAllowedOrigins(), ["https://frontend.example.com"]);
  assert.equal(isAllowedOrigin("https://frontend.example.com"), true);
  assert.equal(isAllowedOrigin("https://frontend.example.com/"), true);
});

test("uses local defaults outside production when no env origins are provided", () => {
  process.env.NODE_ENV = "development";

  assert.deepEqual(getAllowedOrigins(), ["http://localhost:5173", "http://127.0.0.1:5173"]);
  assert.equal(isAllowedOrigin(undefined), true);
});

test("denies all implicit origins in production when no explicit config exists", () => {
  process.env.NODE_ENV = "production";

  assert.deepEqual(getAllowedOrigins(), []);
  assert.equal(isAllowedOrigin(undefined), false);
  assert.equal(isAllowedOrigin("http://localhost:5173"), false);
});
