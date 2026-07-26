import { describe, expect, it } from "vitest";
import * as planRoute from "@/app/api/plan/route";
import * as researchRoute from "@/app/api/research/route";

const supportedRouteExports = new Set([
  "GET",
  "HEAD",
  "OPTIONS",
  "POST",
  "PUT",
  "DELETE",
  "PATCH",
  "dynamic",
  "dynamicParams",
  "revalidate",
  "fetchCache",
  "runtime",
  "preferredRegion",
  "maxDuration",
  "generateStaticParams",
]);

describe("Next route module surfaces", () => {
  it.each([
    ["plan", planRoute],
    ["research", researchRoute],
  ])("%s route exposes only supported Next route fields", (_name, routeModule) => {
    const invalidExports = Object.keys(routeModule).filter(
      (exportName) => !supportedRouteExports.has(exportName),
    );

    expect(invalidExports).toEqual([]);
  });
});
