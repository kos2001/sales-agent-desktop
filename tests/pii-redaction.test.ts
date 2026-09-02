import { describe, it, expect } from "vitest";
import { redactPii } from "../src/main/pii-redaction";

describe("redactPii", () => {
  it("masks email addresses", () => {
    const r = redactPii("ping me at jane.doe@example.com please");
    expect(r.text).toBe("ping me at [EMAIL] please");
    expect(r.counts.EMAIL).toBe(1);
    expect(r.total).toBe(1);
  });

  it("masks a Korean resident registration number", () => {
    const r = redactPii("내 주민번호는 900101-1234567 이야");
    expect(r.text).toContain("[RRN]");
    expect(r.text).not.toContain("900101-1234567");
  });

  it("masks a Luhn-valid credit card but leaves other long numbers", () => {
    const card = redactPii("card 4242 4242 4242 4242 expires soon");
    expect(card.text).toContain("[CARD]");
    expect(card.counts.CARD).toBe(1);

    // 16 digits but fails the Luhn check → not a card → untouched.
    const notCard = redactPii("order number 4242424242424241 shipped");
    expect(notCard.text).toContain("4242424242424241");
    expect(notCard.total).toBe(0);
  });

  it("masks Korean mobile numbers", () => {
    const r = redactPii("전화: 010-1234-5678");
    expect(r.text).toBe("전화: [PHONE]");
  });

  it("masks API keys / tokens", () => {
    const r = redactPii(
      "use key sk-abcdef0123456789ABCDEF0123 and AKIAIOSFODNN7EXAMPLE",
    );
    expect(r.text).not.toContain("sk-abcdef");
    expect(r.text).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(r.counts.SECRET).toBe(2);
  });

  it("masks IPv4 addresses with valid octets only", () => {
    const r = redactPii("server at 192.168.0.10 is up");
    expect(r.text).toBe("server at [IP] is up");
    // 999.1.1.1 is not a valid IPv4 → left alone.
    const bad = redactPii("version 999.1.1.1 here");
    expect(bad.text).toContain("999.1.1.1");
  });

  it("leaves non-sensitive text untouched (total 0)", () => {
    const r = redactPii("Refactor the auth module and add tests");
    expect(r.text).toBe("Refactor the auth module and add tests");
    expect(r.total).toBe(0);
    expect(r.counts).toEqual({});
  });

  it("masks multiple distinct types and tallies counts", () => {
    const r = redactPii("mail a@b.com or a@c.com, ip 10.0.0.1");
    expect(r.counts.EMAIL).toBe(2);
    expect(r.counts.IP).toBe(1);
    expect(r.total).toBe(3);
  });
});
