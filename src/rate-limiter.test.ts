import { describe, it, mock, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { RateLimiter } from "./rate-limiter.js";

describe("RateLimiter", () => {
  let mockDate: ReturnType<typeof mock.fn>;
  let currentTime: number;

  beforeEach(() => {
    currentTime = 1_000_000;
    mockDate = mock.fn(() => currentTime);
    mock.method(Date, "now", mockDate);
  });

  afterEach(() => {
    mock.restoreAll();
  });

  it("allows calls within the limit", () => {
    const limiter = new RateLimiter(3, 60);
    assert.equal(limiter.check(), true);
    limiter.record();
    assert.equal(limiter.check(), true);
    limiter.record();
    assert.equal(limiter.check(), true);
  });

  it("blocks calls exceeding the limit", () => {
    const limiter = new RateLimiter(2, 60);
    limiter.record();
    limiter.record();
    assert.equal(limiter.check(), false);
  });

  it("allows calls again after the window slides", () => {
    const limiter = new RateLimiter(2, 60);
    limiter.record();
    limiter.record();
    assert.equal(limiter.check(), false);

    // Advance time past the window
    currentTime += 61_000;
    assert.equal(limiter.check(), true);
  });

  it("returns 0 wait time when under the limit", () => {
    const limiter = new RateLimiter(5, 60);
    assert.equal(limiter.waitTime(), 0);
  });

  it("returns positive wait time when limit is exceeded", () => {
    const limiter = new RateLimiter(1, 60);
    limiter.record();
    const wait = limiter.waitTime();
    assert.ok(wait > 0);
    assert.ok(wait <= 60_000);
  });

  it("handles a window of 1 second", () => {
    const limiter = new RateLimiter(1, 1);
    limiter.record();
    assert.equal(limiter.check(), false);

    currentTime += 1_001;
    assert.equal(limiter.check(), true);
  });
});
