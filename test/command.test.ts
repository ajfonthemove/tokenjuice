import { describe, expect, it } from "vitest";

import {
  isFileContentInspectionCommand,
  isRepositoryInspectionCommand,
  normalizeCommandSignature,
  normalizeExecutionInput,
  tokenizeCommand,
} from "../src/core/command.js";

describe("tokenizeCommand", () => {
  it("keeps quoted path arguments together", () => {
    expect(tokenizeCommand("sed -n '1,80p' 'src/rules/search/rg.json'")).toEqual([
      "sed",
      "-n",
      "1,80p",
      "src/rules/search/rg.json",
    ]);
  });
});

describe("normalizeCommandSignature", () => {
  it("normalizes quoted executable paths", () => {
    expect(normalizeCommandSignature("\"/opt/homebrew/bin/tokenjuice\" wrap --raw -- rg --files")).toBe("tokenjuice");
  });
});

describe("normalizeExecutionInput", () => {
  it("derives argv from command text when argv is missing", () => {
    expect(normalizeExecutionInput({
      toolName: "exec",
      command: "find src -maxdepth 2 -type f",
    }).argv).toEqual(["find", "src", "-maxdepth", "2", "-type", "f"]);
  });
});

describe("isFileContentInspectionCommand", () => {
  it.each([
    { label: "cat", command: "cat README.md" },
    { label: "sed", command: "sed -n '1,80p' src/core/reduce.ts" },
    { label: "head", command: "head -n 20 package.json" },
    { label: "tail", command: "tail -n 20 pnpm-lock.yaml" },
    { label: "nl", command: "nl -ba src/core/codex.ts" },
    { label: "bat", command: "bat README.md" },
    { label: "jq", command: "jq '.version' package.json" },
    { label: "yq", command: "yq '.name' pnpm-workspace.yaml" },
  ])("detects $label as file inspection from command text", ({ command }) => {
    expect(isFileContentInspectionCommand({ command })).toBe(true);
  });

  it("returns false for normal search commands", () => {
    expect(isFileContentInspectionCommand({ command: "rg AssertionError src" })).toBe(false);
  });
});

describe("isRepositoryInspectionCommand", () => {
  it.each([
    "cat README.md",
    "find src/rules -maxdepth 2 -type f",
    "fd codex src",
    "fdfind codex src",
    "ls src/rules",
    "tree src/rules",
    "rg --files src/rules",
    "git ls-files src",
  ])("detects `%s` as repository inspection", (command) => {
    expect(isRepositoryInspectionCommand({ command })).toBe(true);
  });

  it.each([
    "rg AssertionError src",
    "git status --short",
    "pnpm test",
  ])("does not over-match `%s`", (command) => {
    expect(isRepositoryInspectionCommand({ command })).toBe(false);
  });
});
