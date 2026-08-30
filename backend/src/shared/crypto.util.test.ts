import { test } from "node:test";
import assert from "node:assert/strict";
import { encrypt, decrypt } from "./crypto.util";

// Butuh TOKEN_ENCRYPTION_KEY di .env (dimuat otomatis lewat config/env -> dotenv/config).

test("encrypt/decrypt round-trips a token", () => {
  const plaintext = "shpat_super_secret_token";
  const encrypted = encrypt(plaintext);
  assert.notEqual(encrypted, plaintext);
  assert.equal(decrypt(encrypted), plaintext);
});

test("different calls produce different ciphertext (random IV)", () => {
  const a = encrypt("same-input");
  const b = encrypt("same-input");
  assert.notEqual(a, b);
});
