import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/safe-next";

describe("where sign-in returns to", () => {
  it("keeps paths on this site", () => {
    expect(safeNext("/oauth/authorize?client_id=rkc_1&state=x")).toBe("/oauth/authorize?client_id=rkc_1&state=x");
    expect(safeNext("/create")).toBe("/create");
  });

  it("refuses anything that could leave the site", () => {
    for (const bad of ["//evil.com", "/\\evil.com", "/\t/evil.com", "/\n/evil.com", "/\r\n//evil.com", "https://evil.com", "evil.com", "", undefined, ["/a"]]) {
      expect(safeNext(bad)).toBe("/");
    }
  });
});
