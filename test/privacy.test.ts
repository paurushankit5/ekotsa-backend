import { test } from "node:test";
import assert from "node:assert/strict";
import { Joi } from "../src/utils/validate.js";
import { guardianDecisionSchema, guardianVerificationSchema, privacyFields } from "../src/modules/privacy/privacy.schema.js";
import { assertCurrentNotice, getNotice, getNotices, NOTICE_KEYS } from "../src/modules/privacy/notices.js";
import { UnsubscribeToken } from "../src/modules/privacy/marketing.service.js";
import { AnonId } from "../src/modules/privacy/choices.service.js";
import { holdExclusion } from "../src/modules/privacy/legal-holds.service.js";

const formSchema = Joi.object({ email: Joi.string().required(), ...privacyFields });
const validate = (value: unknown) => formSchema.validate(value, { abortEarly: false, stripUnknown: true });
const guardian = { name: "Parent Person", email: "parent@example.com", relationship: "PARENT", declaration: true };
const v = getNotice("contact").version;

test("age category and notice version are mandatory on every personal-data form", () => {
  assert.match(validate({ email: "a@example.com", noticeVersion: v }).error!.message, /18 or older/);
  assert.match(validate({ email: "a@example.com", ageCategory: "ADULT" }).error!.message, /privacy notice/);
});

test("adults pass without guardian details, and stray guardian data is stripped", () => {
  const { error, value } = validate({ email: "a@example.com", ageCategory: "ADULT", noticeVersion: v, guardian });
  assert.equal(error, undefined);
  assert.equal(value.guardian, undefined);
});

test("under-18 submissions require guardian details and the declaration", () => {
  const base = { email: "kid@example.com", ageCategory: "MINOR", noticeVersion: v };
  assert.ok(validate(base).error);
  assert.ok(validate({ ...base, guardian: { ...guardian, declaration: false } }).error);
  assert.ok(validate({ ...base, guardian: { ...guardian, relationship: "FRIEND" } }).error);
  assert.equal(validate({ ...base, guardian }).error, undefined);
});

test("guardian approval requires the declaration; decline does not", () => {
  const token = "x".repeat(43);
  assert.ok(guardianDecisionSchema.validate({ token, decision: "APPROVE" }).error);
  assert.equal(guardianDecisionSchema.validate({ token, decision: "APPROVE", guardianDeclaration: true }).error, undefined);
  assert.equal(guardianDecisionSchema.validate({ token, decision: "DECLINE" }).error, undefined);
});

test("staff guardian verification needs a method and a note", () => {
  assert.ok(guardianVerificationSchema.validate({ decision: "VERIFIED", note: "checked on video call" }).error);
  assert.equal(guardianVerificationSchema.validate({ decision: "VERIFIED", method: "VIDEO_CALL_ID_CHECK", note: "Checked ID on video call" }).error, undefined);
  assert.ok(guardianVerificationSchema.validate({ decision: "REJECTED", note: "" }).error);
});

test("every notice is itemised, versioned and free of compliance claims", () => {
  const { operator, notices } = getNotices();
  assert.equal(notices.length, NOTICE_KEYS.length);
  assert.match(operator.address, /Patna 800023/);
  for (const n of notices) {
    assert.ok(n.items.length > 0 && n.version && n.summary && n.recipients, n.key);
    const text = JSON.stringify(n);
    assert.doesNotMatch(text, /complian|DPDP|GDPR|Standard Contractual/i, `${n.key} must not claim legal compliance`);
  }
});

test("a stale notice version is rejected", () => {
  assert.doesNotThrow(() => assertCurrentNotice("signup", getNotice("signup").version));
  assert.throws(() => assertCurrentNotice("signup", "2000-01-01"), /updated/);
  assert.throws(() => assertCurrentNotice("signup", undefined), /updated/);
});

test("unsubscribe tokens are opaque, authenticated and round-trip", () => {
  const token = UnsubscribeToken.create("Person@Example.com");
  assert.doesNotMatch(token, /person|example/i);
  assert.deepEqual(UnsubscribeToken.read(token), { email: "person@example.com", expired: false });
  const tampered = token.slice(0, -2) + (token.endsWith("A") ? "BB" : "AA");
  assert.equal(UnsubscribeToken.read(tampered), null);
  assert.equal(UnsubscribeToken.read("not-a-token"), null);
});

test("anonymous choice IDs are signed", () => {
  const { id, cookie } = AnonId.issue();
  assert.equal(AnonId.verify(cookie), id);
  assert.equal(AnonId.verify(`${id}.forged-signature-xxxxx`), null);
  assert.equal(AnonId.verify(undefined), null);
});

test("retention skips records under an active legal hold", () => {
  const sql = holdExclusion("users", "u");
  assert.match(sql, /NOT EXISTS/);
  assert.match(sql, /"releasedAt" IS NULL/);
  assert.match(sql, /'USER'/);
  assert.match(sql, /u\.id/);
});
