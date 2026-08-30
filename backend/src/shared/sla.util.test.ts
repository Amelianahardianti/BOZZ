import { test } from "node:test";
import assert from "node:assert/strict";
import { classifySla, computeSlaDeadline } from "./sla.util";

test("classifySla detects instant/same_day keywords, defaults to reguler", () => {
  assert.equal(classifySla("GrabExpress Instant"), "instant");
  assert.equal(classifySla("JNE Same Day"), "same_day");
  assert.equal(classifySla("JNE Reguler"), "reguler");
  assert.equal(classifySla(undefined), "reguler");
});

test("computeSlaDeadline adds the right number of hours", () => {
  const receivedAt = new Date("2026-01-01T00:00:00Z");
  assert.equal(computeSlaDeadline(receivedAt, "instant").toISOString(), "2026-01-01T03:00:00.000Z");
  assert.equal(computeSlaDeadline(receivedAt, "same_day").toISOString(), "2026-01-01T06:00:00.000Z");
});
