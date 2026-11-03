import { apiErrorSchema } from "@ipo-singh/contracts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ZodError, z } from "zod";
import { HttpError } from "../shared/errors.ts";
import { toErrorResponse } from "./error-handler.ts";

describe("toErrorResponse", () => {
  it("maps validation, missing routes, oversized bodies, and unknown failures", () => {
    const parsed = z.object({ limit: z.number() }).safeParse({ limit: "nope" });
    assert.equal(parsed.success, false);
    if (parsed.success) return;

    const validation = toErrorResponse(new ZodError(parsed.error.issues));
    assert.equal(validation.status, 400);
    assert.equal(validation.body.code, "validation_error");
    assert.equal(validation.body.fieldErrors?.[0]?.field, "limit");
    assert.equal(apiErrorSchema.safeParse(validation.body).success, true);

    const missing = toErrorResponse(new HttpError(404, "not_found", "No matching API route was found."));
    assert.equal(missing.status, 404);
    assert.equal(missing.body.code, "not_found");
    assert.equal(missing.body.fieldErrors, undefined);

    const oversized = toErrorResponse({ type: "entity.too.large", secret: "super-secret-value" });
    assert.equal(oversized.status, 413);
    assert.equal(oversized.body.code, "validation_error");
    assert.equal(JSON.stringify(oversized).includes("super-secret-value"), false);

    const unknown = toErrorResponse(new Error("Bearer super-secret-value"));
    assert.equal(unknown.status, 500);
    assert.deepEqual(unknown.body, {
      code: "unavailable",
      message: "The API could not complete this request.",
    });
    assert.equal(JSON.stringify(unknown).includes("super-secret-value"), false);
    assert.equal("stack" in unknown.body, false);
  });

  it("hides submitted values from production validation errors", () => {
    const parsed = z.string().superRefine((value, context) => {
      context.addIssue({ code: "custom", message: `Rejected ${value}` });
    }).safeParse("ABCDE1234F");
    assert.equal(parsed.success, false);
    if (parsed.success) return;
    const response = toErrorResponse(new ZodError(parsed.error.issues), { production: true });
    assert.equal(response.status, 400);
    assert.equal(response.body.fieldErrors?.[0]?.message, "Invalid value.");
    assert.equal(JSON.stringify(response).includes("ABCDE1234F"), false);
  });
});
