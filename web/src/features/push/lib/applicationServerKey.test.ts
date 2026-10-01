import { describe, expect, it } from "vitest";
import { urlBase64ToUint8Array } from "./applicationServerKey";

describe("urlBase64ToUint8Array", () => {
  it("decodes base64url without padding", () => {
    // "hello" => aGVsbG8 (base64url, padding stripped)
    expect(Array.from(urlBase64ToUint8Array("aGVsbG8"))).toEqual([104, 101, 108, 108, 111]);
  });

  it("maps the url-safe alphabet back (- and _)", () => {
    // bytes 0xfb 0xff 0xbf encode to "-_-_" in base64url ("+/+/" in plain base64)
    expect(Array.from(urlBase64ToUint8Array("-_-_"))).toEqual([0xfb, 0xff, 0xbf]);
  });

  it("decodes a 65-byte uncompressed P-256 point to 65 bytes", () => {
    const point = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)]).toString("base64url");

    const key = urlBase64ToUint8Array(point);

    expect(key).toHaveLength(65);
    expect(key[0]).toBe(4);
  });
});
