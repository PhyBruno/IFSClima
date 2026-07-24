import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "./mocks/server";
import { ApiError, buildExportUrl, getHistory, getLatest, getSeries } from "../src/api-client";
import {
  historyFixture,
  latestFixture,
  rainSeriesFixture,
  seriesFixture,
} from "./fixtures/readings";

describe("api-client", () => {
  describe("getLatest", () => {
    it("faz GET /api/v1/readings/latest e retorna o payload tipado", async () => {
      const result = await getLatest();

      expect(result).toEqual(latestFixture);
    });

    it("lança ApiError quando a API responde com status não-OK", async () => {
      server.use(
        http.get("/api/v1/readings/latest", () => new HttpResponse(null, { status: 500 })),
      );

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
      server.use(
        http.get("/api/v1/readings/series", () => new HttpResponse(null, { status: 400 })),
      );

      await expect(getSeries("temperature_c", "24h")).rejects.toBeInstanceOf(ApiError);
    });
  });

  describe("getHistory", () => {
    it("faz GET /api/v1/readings sem query quando nenhum parâmetro é passado e retorna o payload tipado", async () => {
      let capturedUrl: URL | undefined;
      server.use(
        http.get("/api/v1/readings", ({ request }) => {
          capturedUrl = new URL(request.url);
          return HttpResponse.json(historyFixture);
        }),
      );

      const result = await getHistory();

      expect(capturedUrl?.search).toBe("");
      expect(result).toEqual(historyFixture);
    });

    it("envia from/to/page/pageSize/order como query string", async () => {
      let capturedUrl: URL | undefined;
      server.use(
        http.get("/api/v1/readings", ({ request }) => {
          capturedUrl = new URL(request.url);
          return HttpResponse.json(historyFixture);
        }),
      );

      await getHistory({
        from: "2026-07-01T00:00:00.000Z",
        to: "2026-07-23T00:00:00.000Z",
        page: 2,
        pageSize: 25,
        order: "asc",
      });

      expect(capturedUrl?.searchParams.get("from")).toBe("2026-07-01T00:00:00.000Z");
      expect(capturedUrl?.searchParams.get("to")).toBe("2026-07-23T00:00:00.000Z");
      expect(capturedUrl?.searchParams.get("page")).toBe("2");
      expect(capturedUrl?.searchParams.get("page_size")).toBe("25");
      expect(capturedUrl?.searchParams.get("order")).toBe("asc");
    });

    it("lança ApiError quando a API responde com status não-OK", async () => {
      server.use(http.get("/api/v1/readings", () => new HttpResponse(null, { status: 400 })));

      await expect(getHistory()).rejects.toBeInstanceOf(ApiError);
    });
  });

  describe("buildExportUrl", () => {
    it("monta a URL de /readings/export com format e sem from/to quando ausentes", () => {
      const url = buildExportUrl({ format: "csv" });

      expect(url).toBe("/api/v1/readings/export?format=csv");
    });

    it("inclui from/to quando informados", () => {
      const url = buildExportUrl({
        from: "2026-07-01T00:00:00.000Z",
        to: "2026-07-23T00:00:00.000Z",
        format: "xlsx",
      });

      const parsed = new URL(url, "http://localhost");
      expect(parsed.pathname).toBe("/api/v1/readings/export");
      expect(parsed.searchParams.get("from")).toBe("2026-07-01T00:00:00.000Z");
      expect(parsed.searchParams.get("to")).toBe("2026-07-23T00:00:00.000Z");
      expect(parsed.searchParams.get("format")).toBe("xlsx");
    });
  });
});
