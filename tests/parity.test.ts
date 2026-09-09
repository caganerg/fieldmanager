import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { scryptSync, timingSafeEqual } from "node:crypto";

import { expect, test } from "bun:test";

import { sanitizeMessages } from "@/lib/ai";
import { normalizeUsername, validatePassword, validateUsername } from "@/lib/auth";
import { sanitizeDocument } from "@/lib/field-data";
import { getPolygonArea } from "@/lib/geo";
import { methodLabel as irrigationMethodLabel, type IrrigationMethod } from "@/lib/irrigation";
import { methodLabel as protectionMethodLabel, type ProtectionMethod } from "@/lib/protection";
import { rateMeasurement, soilParameter, type SoilMeasurementKey } from "@/lib/soil";

/**
 * The fixtures in `shared/fixtures`, run against this side.
 *
 * `cargo test -p fieldmanager-domain` runs the same files against the Rust
 * half. That is the whole point of them: `sanitizeData` is one definition
 * today and two while the backend moves, and two definitions of the same thing
 * drift silently unless something fails when they do. A new edge case becomes
 * a fixture, and then both sides fail until both sides agree.
 *
 * A fixture names the function it exercises, and a name neither side knows is
 * a failure rather than a skip — a fixture nobody runs is worse than no
 * fixture, because it reads like coverage.
 */

const FIXTURES = path.join(import.meta.dir, "..", "shared", "fixtures");

interface Fixture {
  function: string;
  tolerance?: number;
  cases: Record<string, unknown>[];
}

function apply(fn: string, input: unknown): unknown {
  switch (fn) {
    case "sanitizeDocument":
      return sanitizeDocument(input);
    case "sanitizeMessages":
      return sanitizeMessages(input);
    case "normalizeUsername":
      return normalizeUsername(input);
    case "validateUsername":
      return validateUsername(typeof input === "string" ? input : "");
    case "validatePassword":
      return validatePassword(typeof input === "string" ? input : "");
    case "polygonArea":
      return getPolygonArea(input as [number, number][]);
    case "rateMeasurement": {
      const { key, value } = input as { key: SoilMeasurementKey; value: string };
      return rateMeasurement(soilParameter(key), value);
    }
    case "methodLabel": {
      const { kind, method } = input as { kind: string; method: string };
      return kind === "irrigation"
        ? irrigationMethodLabel(method as IrrigationMethod)
        : protectionMethodLabel(method as ProtectionMethod);
    }
    default:
      throw new Error(
        `no TypeScript side for the fixture function \`${fn}\`: implement it here and in ` +
          `backend/crates/domain/tests/parity.rs, or the fixture is only pretending to be covered`
      );
  }
}

/**
 * Deep equality with three concessions, each deliberate: the key *order* of an
 * object is compared as well as its contents, because the document is compared
 * byte for byte against what the other side writes; a fixture may ask for a
 * timestamp near now rather than a fixed one; and a fixture may set a
 * tolerance, which is what the area calculation needs because two runtimes'
 * `sin` need not agree in the last bit.
 */
function compare(expected: unknown, actual: unknown, tolerance: number | undefined, at: string): void {
  if (expected === "~now") {
    const parsed = typeof actual === "string" ? Date.parse(actual) : NaN;
    if (Number.isNaN(parsed) || Math.abs(parsed - Date.now()) >= 60_000) {
      throw new Error(`${at}: ${JSON.stringify(actual)} is not a timestamp within a minute of now`);
    }
    return;
  }
  if (expected === "~nowMs") {
    if (typeof actual !== "number" || Math.abs(actual - Date.now()) >= 60_000) {
      throw new Error(`${at}: ${JSON.stringify(actual)} is not a time within a minute of now`);
    }
    return;
  }

  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) throw new Error(`${at}: expected an array`);
    if (expected.length !== actual.length) {
      throw new Error(`${at}: expected ${expected.length} entries, found ${actual.length}`);
    }
    expected.forEach((entry, index) => compare(entry, actual[index], tolerance, `${at}[${index}]`));
    return;
  }

  if (expected && typeof expected === "object") {
    if (!actual || typeof actual !== "object" || Array.isArray(actual)) {
      throw new Error(`${at}: expected an object`);
    }
    const expectedKeys = Object.keys(expected as Record<string, unknown>);
    const actualKeys = Object.keys(actual as Record<string, unknown>);
    if (expectedKeys.length !== actualKeys.length) {
      throw new Error(`${at}: expected keys ${expectedKeys.join(", ")}, found ${actualKeys.join(", ")}`);
    }
    expectedKeys.forEach((key, index) => {
      if (key !== actualKeys[index]) {
        throw new Error(`${at}: expected the key \`${key}\`, found \`${actualKeys[index]}\``);
      }
      compare(
        (expected as Record<string, unknown>)[key],
        (actual as Record<string, unknown>)[key],
        tolerance,
        `${at}.${key}`
      );
    });
    return;
  }

  if (typeof expected === "number" && typeof actual === "number" && tolerance !== undefined) {
    const scale = Math.max(Math.abs(expected), 1);
    if (Math.abs(expected - actual) > tolerance * scale) {
      throw new Error(`${at}: ${actual} is not within ${tolerance} of ${expected}`);
    }
    return;
  }

  if (expected !== actual) {
    throw new Error(`${at}: expected ${JSON.stringify(expected)}, found ${JSON.stringify(actual)}`);
  }
}

/** Verification only: writing a hash here is the Rust half's job as well. */
function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltPart, hashPart] = stored.split("$");
  if (scheme !== "scrypt" || !saltPart || !hashPart) return false;
  const expected = Buffer.from(hashPart, "base64");
  const derived = scryptSync(password, Buffer.from(saltPart, "base64"), expected.length);
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

const files = readdirSync(FIXTURES)
  .filter((name) => name.endsWith(".json"))
  .sort();

test("there are fixtures to run", () => {
  expect(files.length).toBeGreaterThan(0);
});

for (const file of files) {
  const fixture = JSON.parse(readFileSync(path.join(FIXTURES, file), "utf8")) as Fixture;

  if (fixture.function === "scrypt") {
    // A hash written by either side must verify on both, or the migration
    // locks every account out of an installation at once.
    for (const entry of fixture.cases) {
      const { name, password, wrongPassword, nodeHash, rustHash } = entry as Record<string, string>;
      test(`${file} — ${name}`, () => {
        for (const stored of [nodeHash, rustHash]) {
          expect(verifyPassword(password, stored)).toBe(true);
          expect(verifyPassword(wrongPassword, stored)).toBe(false);
        }
      });
    }
    continue;
  }

  for (const entry of fixture.cases) {
    const { name, input, expected } = entry as { name: string; input: unknown; expected: unknown };
    test(`${file} — ${name}`, () => {
      // Through JSON first, so that an optional left as `undefined` is absent
      // here exactly as it is absent from the file.
      const actual = JSON.parse(JSON.stringify(apply(fixture.function, input) ?? null));
      compare(expected, actual, fixture.tolerance, fixture.function);
    });
  }
}
