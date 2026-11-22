import { describe, expect, it } from "vitest";

import { builtInSourceControlDefinitions } from "../registry.ts";

describe("isSameChangeRequest on Azure DevOps", () => {
  it.each([
    "https://org.visualstudio.com/project/_git/repo/pullrequest/42",
    "https://org.visualstudio.com/DefaultCollection/project/_git/repo/pullrequest/42",
  ])("matches the dev.azure.com spelling of %s", (legacy) => {
    expect(
      builtInSourceControlDefinitions.isSameChangeRequest(
        "https://dev.azure.com/org/project/_git/repo/pullrequest/42",
        legacy,
      ),
    ).toBe(true);
  });

  it("keeps different organizations apart", () => {
    expect(
      builtInSourceControlDefinitions.isSameChangeRequest(
        "https://dev.azure.com/org/project/_git/repo/pullrequest/42",
        "https://other.visualstudio.com/project/_git/repo/pullrequest/42",
      ),
    ).toBe(false);
  });
});
