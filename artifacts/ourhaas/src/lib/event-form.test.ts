import { describe, expect, it } from "vitest";
import { CreateEventBody, UpdateEventBody } from "@workspace/api-zod";
import { eventFormSchema } from "./event-form";

const event = {
  title: "Community gathering", date: "2032-06-15", time: "",
  location: "", description: "", category: "Community", zeffyUrl: "",
};
const schemas = [eventFormSchema, CreateEventBody, UpdateEventBody];

describe("event registration link validation parity", () => {
  it.each([
    "", " \t\r\n", "\u00a0\u2003",
    "https://www.zeffy.com/en-US/ticketing/test",
    " \thttps://www.zeffy.com/en-US/ticketing/test\r\n",
    "\u00a0https://zeffy.com/en-CA/ticketing/test?source=haas#form\u2003",
    ` https://zeffy.com/${"x".repeat(1982)} `,
  ])("normalizes accepted links identically: %j", (zeffyUrl) => {
    for (const schema of schemas) {
      expect(schema.parse({ ...event, zeffyUrl }).zeffyUrl).toBe(zeffyUrl.trim());
    }
  });

  it.each([
    "http://www.zeffy.com/pay", "//zeffy.com/pay", "javascript:alert(1)",
    "ftp://zeffy.com/pay", "https://evil.example/pay",
    "https://zeffy.com.evil.example/pay", "https://www.zeffy.com@evil.example/pay",
    "https://user:password@zeffy.com/pay", "https://forms.zeffy.com/pay",
    "https://zeffy.com:443/pay", "https://zeffy.com/pay with spaces",
    "https://zeffy.com/\nnext", " https://evil.example/pay ",
    `https://zeffy.com/${"x".repeat(1983)}`, null, 123,
  ])("rejects invalid links identically: %j", (zeffyUrl) => {
    for (const schema of schemas) {
      const result = schema.safeParse({ ...event, zeffyUrl });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues[0].path).toEqual(["zeffyUrl"]);
    }
  });

  it("keeps omitted API links distinct from explicit blank form values", () => {
    const { zeffyUrl: _unused, ...withoutLink } = event;
    for (const schema of [CreateEventBody, UpdateEventBody]) {
      expect(schema.parse(withoutLink)).not.toHaveProperty("zeffyUrl");
      expect(schema.parse({ ...withoutLink, zeffyUrl: undefined }).zeffyUrl).toBeUndefined();
      expect(schema.parse({ ...withoutLink, zeffyUrl: "  " }).zeffyUrl).toBe("");
    }
    expect(eventFormSchema.safeParse(withoutLink).success).toBe(false);
    expect(eventFormSchema.safeParse({ ...withoutLink, zeffyUrl: undefined }).success).toBe(false);
    expect(eventFormSchema.parse({ ...withoutLink, zeffyUrl: "" }).zeffyUrl).toBe("");
  });
});

describe("event calendar validation parity", () => {
  it.each([
    "0000-02-29", "0001-01-01", "0096-02-29", "1900-02-28",
    "2000-02-29", "2032-02-29", "2100-02-28", "2400-02-29",
    "2032-01-01", "2032-04-30", "2032-12-31", "9999-12-31",
  ])("accepts and preserves calendar day %s in the form, create and update schemas", (date) => {
    for (const schema of schemas) {
      expect(schema.parse({ ...event, date }).date).toBe(date);
    }
  });

  it.each([
    "", "not-a-date", "1900-02-29", "2100-02-29", "2031-02-29",
    "2032-02-30", "2032-04-31", "2032-00-01", "2032-13-01",
    "2032-01-00", "2032-01-32", "2032-1-01", "2032-01-1",
    "32-01-01", "12032-01-01", "-001-01-01", "2032-01-01T00:00:00Z",
    " 2032-01-01", "2032-01-01 ", "2032-01-01\n", null, 20320101, undefined,
  ])("rejects invalid calendar day %j identically", (date) => {
    const results = schemas.map((schema) => schema.safeParse({ ...event, date }));
    for (const result of results) {
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues[0].path).toEqual(["date"]);
    }
  });

  it.each(["", " ", "\t\r\n", "\u00a0\u2003", "x".repeat(201), null, 123, undefined])(
    "rejects invalid required title %j identically", (title) => {
      for (const schema of schemas) {
        const result = schema.safeParse({ ...event, title });
        expect(result.success).toBe(false);
        if (!result.success) expect(result.error.issues[0].path).toEqual(["title"]);
      }
    },
  );

  it.each(["Community gathering", "  Community gathering \t", "x".repeat(200), ` ${"x".repeat(200)} `])(
    "normalizes accepted title consistently", (title) => {
      for (const schema of schemas) {
        expect(schema.parse({ ...event, title }).title).toBe(title.trim());
      }
    },
  );
});
