import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "./mocks/server";
import { ApiError, getLatest, getSeries } from "../src/api-client";
import { latestFixture, rainSeriesFixture, seriesFixture } from "./fixtures/readings";

describe("api-client", () => {
  describe("getLatest", () => {
    it("faz GET /api/v1/readings/latest e retorna o payload tipado", async () => {
      const result = await getLatest();

      expect(result).toEqual(latestFixture);
    });

    it("lança ApiError quando a API responde com status não-OK", async () => {
      server.use(http.get("/api/v1/readings/latest", () => new HttpResponse(null, { status: 500 })));

      await expect(getLatest()).rejects.toBeInstanceOf(ApiError);
    });
  });

  describe("getSeries", () => {
    it("envia metric e range como query string e retorna o payload tipado", async () => {
      let capturedUrl: URL | undefined;
      server.use(
        http.get("/api/v1/readings/series", ({ request }) => {
          capturedUrl = new URL(request.url);
          return HttpResponse.json(seriesFixture);
        }),
      );

      const result = await getSeries("temperature_c", "24h");

      expect(capturedUrl?.searchParams.get("metric")).toBe("temperature_c");
      expect(capturedUrl?.searchParams.get("range")).toBe("24h");
      expect(result).toEqual(seriesFixture);
    });

    it("retorna buckets com sum preenchido quando metric=rain_mm", async () => {
      server.use(http.get("/api/v1/readings/series", () => HttpResponse.json(rainSeriesFixture)));

      const result = await getSeries("rain_mm", "24h");

      expect(result.buckets[0]?.sum).toBe(0.4);
    });

    it("lança ApiError quando a API responde com status não-OK", async () => {
      server.use(http.get("/api/v1/readings/series", () => new HttpResponse(null, { status: 400 })));

      await expect(getSeries("temperature_c", "24h")).rejects.toBeInstanceOf(ApiError);
    });
  });
});
