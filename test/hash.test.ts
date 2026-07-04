import { describe, expect, it } from "vitest";

import { hashContents, rollupHash } from "../src/core/hash.js";

describe("hashContents", () => {
  it("prefixes the digest with the algorithm name", () => {
    expect(hashContents("hello")).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("is deterministic for identical string input", () => {
    expect(hashContents("hello")).toBe(hashContents("hello"));
  });

  it("differs for different content", () => {
    expect(hashContents("hello")).not.toBe(hashContents("world"));
  });

  it("produces the same digest for a string and the equivalent UTF-8 bytes", () => {
    const text = "café";
    expect(hashContents(text)).toBe(hashContents(Buffer.from(text, "utf8")));
  });

  it("hashes raw binary bytes without corruption", () => {
    const bytes = Buffer.from([0x00, 0xff, 0x10]);
    const otherBytes = Buffer.from([0x00, 0xff, 0x11]);
    expect(hashContents(bytes)).not.toBe(hashContents(otherBytes));
  });
});

describe("rollupHash", () => {
  it("is order-independent across differently-ordered equivalent maps", () => {
    const a = rollupHash({ "a.md": "sha256:aaa", "b.md": "sha256:bbb" });
    const b = rollupHash({ "b.md": "sha256:bbb", "a.md": "sha256:aaa" });
    expect(a).toBe(b);
  });

  it("differs when a file hash changes", () => {
    const a = rollupHash({ "a.md": "sha256:aaa" });
    const b = rollupHash({ "a.md": "sha256:zzz" });
    expect(a).not.toBe(b);
  });

  it("differs when the file set changes even if hashes overlap", () => {
    const a = rollupHash({ "a.md": "sha256:aaa" });
    const b = rollupHash({ "a.md": "sha256:aaa", "b.md": "sha256:bbb" });
    expect(a).not.toBe(b);
  });

  it("returns a well-formed hash for an empty file set", () => {
    expect(rollupHash({})).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});
