import { test, expect } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { laptopOperationFeedback } from "../lib/laptop-operation-feedback";
import {
  claimLaptopOperation,
  finishLaptopOperation,
  laptopOperation,
} from "../lib/server/laptop-operations";
import { conversationOperation } from "../lib/server/conversation-maintenance";

test("saved link history describes handoff, preserves uncertainty and never re-executes", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "nexus-feedback-"));
  const prior = process.env.GW_SYNC_DATA_DIR;
  process.env.GW_SYNC_DATA_DIR = dir;
  try {
    const claim = claimLaptopOperation(
      "open-web-link",
      "feedback-link-request",
      10000,
      "a".repeat(64),
    );
    finishLaptopOperation(
      claim.receipt.id,
      "complete",
      "Handoff recorded; page load not verified.",
    );
    const before = laptopOperation(claim.receipt.id);
    const history = conversationOperation("recent");
    expect(history.answer).toContain(
      "Open a reviewed web link: Handed to Windows",
    );
    expect(history.answer).not.toContain("open-web-link: complete");
    const detail = conversationOperation(claim.receipt.id);
    expect(detail).toMatchObject({
      operationDetail: { status: "Handed to Windows", detail: before.message },
    });
    expect(JSON.stringify(detail)).toContain(
      "does not verify that the page loaded",
    );
    expect(laptopOperation(claim.receipt.id)).toEqual(before);
    expect(
      claimLaptopOperation(
        "open-web-link",
        "feedback-link-request",
        10000,
        "a".repeat(64),
      ).execute,
    ).toBe(false);
    for (const outcome of [
      "unknown",
      "running",
      "not-started",
      "needs-attention",
    ] as const) {
      const feedback = laptopOperationFeedback({ ...before, outcome });
      expect(feedback.status).not.toBe("Handed to Windows");
      if (outcome === "unknown")
        expect(feedback.nextStep).toContain("will not run again");
      if (outcome === "running")
        expect(feedback.nextStep).toContain("does not repeat");
    }
    expect(
      laptopOperationFeedback({ ...before, action: "check-connections" })
        .status,
    ).toBe("Operation finished");
  } finally {
    if (prior === undefined) delete process.env.GW_SYNC_DATA_DIR;
    else process.env.GW_SYNC_DATA_DIR = prior;
    await rm(dir, { recursive: true, force: true });
  }
});
