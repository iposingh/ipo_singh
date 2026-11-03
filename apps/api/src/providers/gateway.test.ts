import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { capabilities, providerCapabilitiesSchema } from "./capabilities.ts";
import { createProviderGateway } from "./gateway.ts";
import { createIpoGuruProvider } from "./ipo-guru/adapter.ts";
import { createMockProvider } from "./mock/adapter.ts";
import { fixtureIpoId } from "./mock/fixtures.ts";
import { normalizeProviderPayload } from "./normalize.ts";
import { ProviderNotConnectedError, ProviderPayloadError, ProviderTimeoutError, ProviderUnavailableError, ProviderUnsupportedError } from "./errors.ts";
import { createProvider, createRegisteredProviders } from "./registry.ts";

const now = () => new Date("2026-10-18T10:00:00.000Z");

function gateway(primary = createMockProvider({ now }), fallback: ReturnType<typeof createMockProvider> | null = null) {
  return createProviderGateway({ primary, fallback, now, timeoutMs: 1_000 });
}

describe("provider registry", () => {
  it("selects the configured adapter and keeps IPO Guru disconnected", async () => {
    const registered = createRegisteredProviders({ primary: "ipo-guru", fallback: "mock", timeoutMs: 8_000 });
    assert.equal(registered.primary.key, "ipo-guru");
    assert.equal(registered.fallback?.key, "mock");
    assert.equal(registered.primary.capabilities.listIpos, "unverified");
    assert.equal(createProvider("mock").capabilities.intradayGmp, "unsupported");

    let fetched = false;
    const original = globalThis.fetch;
    globalThis.fetch = () => {
      fetched = true;
      return Promise.reject(new Error("network"));
    };
    try {
      const selected = createProviderGateway({
        primary: registered.primary,
        fallback: registered.fallback,
        now,
      });
      await assert.rejects(
        () => selected.getCurrentGmp(fixtureIpoId),
        (error: unknown) => error instanceof ProviderNotConnectedError && error.fallbackEligible === false,
      );
      assert.equal(fetched, false);
      await assert.rejects(() => registered.primary.listIpos({}), ProviderNotConnectedError);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("rejects an unknown capability and requires every feature to be declared", () => {
    const parsed = providerCapabilitiesSchema.safeParse({ ...capabilities("supported"), vendorPayload: "supported" });
    assert.equal(parsed.success, false);
    const missing = providerCapabilitiesSchema.safeParse({ listIpos: "supported" });
    assert.equal(missing.success, false);
  });
});

describe("provider gateway", () => {
  it("returns synthetic domain data and keeps zero distinct from missing", async () => {
    const cache = gateway();
    const listed = await cache.listIpos({ board: "mainboard" });
    assert.equal(listed.value.length, 1);
    assert.equal(listed.value[0]?.gmpAmountRupees, 0);
    assert.equal(listed.value[0]?.subscriptionTotalTimes, null);
    assert.equal(listed.value[0]?.status, null);
    assert.equal(listed.provenance.sourceName, "Fixture provider");
    assert.equal(listed.provenance.freshness, "fresh");
    assert.equal(cache.lastSuccessfulFetch("mock", "listIpos"), "2026-10-18T10:00:00.000Z");

    const empty = await cache.listIpos({ board: "sme" });
    assert.deepEqual(empty.value, []);

    const details = await cache.getIpoDetails(fixtureIpoId);
    assert.equal(details.value.companyName, "Fixture Polymers");
    assert.equal(details.value.offer.issuePriceRupees, 0);
    assert.equal(details.value.offer.issueSizeRupees, null);
    assert.equal(details.value.subscription, null);

    const gmp = await cache.getCurrentGmp(fixtureIpoId);
    assert.equal(gmp.value.amountRupees, 0);
    const subscription = await cache.getCurrentSubscription(fixtureIpoId);
    assert.equal(subscription.value.retailTimes, 0);
    assert.equal(subscription.value.qibTimes, null);
    const financials = await cache.getCompanyFinancials(fixtureIpoId);
    assert.equal(financials.value[0]?.profitAfterTaxRupees, 0);
    assert.equal(financials.value[0]?.revenueRupees, null);
    const listing = await cache.getListingInformation(fixtureIpoId);
    assert.equal(listing.value.issuePriceRupees, 0);
    assert.equal(listing.value.listingPriceRupees, null);
    assert.equal(listing.value.gainPercent, null);
    const registrar = await cache.getRegistrarDetails(fixtureIpoId);
    assert.equal(registrar.value.name, "Fixture Registrar");
    const history = await cache.getGmpHistory(fixtureIpoId);
    assert.equal(history.value.observations[0]?.amountRupees, 0);
    assert.equal(history.value.observations[0]?.session, "daily");
    const subscriptionHistory = await cache.getSubscriptionHistory(fixtureIpoId);
    assert.equal(subscriptionHistory.value.observations[0]?.retailTimes, 0);
    assert.equal(subscriptionHistory.value.observations[0]?.employeeTimes, null);
  });

  it("does not call a fallback for an unsupported feature", async () => {
    let fallbackCalls = 0;
    const fallback = createMockProvider({
      now,
      capabilities: { intradayGmp: "supported" },
    });
    const guarded = {
      ...fallback,
      getIntradayGmp(ipoId: string) {
        fallbackCalls += 1;
        return fallback.getIntradayGmp(ipoId);
      },
    };
    const selected = gateway(createMockProvider({ now }), guarded);
    await assert.rejects(() => selected.getIntradayGmp(fixtureIpoId), ProviderUnsupportedError);
    assert.equal(fallbackCalls, 0);
    assert.equal(selected.lastSuccessfulFetch("mock", "intradayGmp"), null);
  });

  it("rejects a malformed payload without replacing it from the fallback", async () => {
    const selected = gateway(
      createMockProvider({ now, behavior: { currentGmp: "malformed" } }),
      createMockProvider({ now, gmpAmountRupees: 15, sourceName: "Fallback fixture" }),
    );
    await assert.rejects(
      () => selected.getCurrentGmp(fixtureIpoId),
      (error: unknown) => error instanceof ProviderPayloadError && error.fields.includes("amountRupees"),
    );
    assert.equal(selected.lastSuccessfulFetch("mock", "currentGmp"), null);
  });

  it("uses the fallback result alone after a timeout or provider failure", async () => {
    const fallback = createMockProvider({ now, gmpAmountRupees: 15, sourceName: "Fallback fixture" });
    const timedOut = createProviderGateway({
      primary: createMockProvider({ now, behavior: { currentGmp: "timeout" } }),
      fallback,
      now,
    });
    const replaced = await timedOut.getCurrentGmp(fixtureIpoId);
    assert.equal(replaced.value.amountRupees, 15);
    assert.equal(replaced.provenance.sourceName, "Fallback fixture");
    assert.equal(replaced.value.percent, 0);

    const unavailable = createProviderGateway({
      primary: createMockProvider({ now, behavior: { currentGmp: "unavailable" } }),
      fallback,
      now,
    });
    assert.equal((await unavailable.getCurrentGmp(fixtureIpoId)).value.amountRupees, 15);

    let selectedCalls = 0;
    const hanging = createProviderGateway({
      primary: createMockProvider({ now, behavior: { currentGmp: "hang" } }),
      fallback,
      now,
      timeoutMs: 5_000,
      scheduleTimeout(_ms, onFire) {
        if (selectedCalls === 0) onFire();
        selectedCalls += 1;
        return () => undefined;
      },
    });
    const fromDeadline = await hanging.getCurrentGmp(fixtureIpoId);
    assert.equal(fromDeadline.value.amountRupees, 15);
    assert.equal(fromDeadline.provenance.sourceName, "Fallback fixture");
  });

  it("does not fall back to an unverified provider", async () => {
    const selected = createProviderGateway({
      primary: createMockProvider({ now, behavior: { currentGmp: "unavailable" } }),
      fallback: createIpoGuruProvider(),
      now,
    });
    await assert.rejects(() => selected.getCurrentGmp(fixtureIpoId), ProviderUnavailableError);
  });

  it("rejects freshness that disagrees with the observation time and keeps a real zero", async () => {
    const primary = createMockProvider({ now });
    primary.getCurrentGmp = () =>
      Promise.resolve({
        source: { sourceName: "Fixture provider", retrievedAt: now().toISOString(), sourceUpdatedAt: null },
        value: {
          amountRupees: 0,
          percent: 0,
          indicativeImpliedPriceRupees: 0,
          observedAt: null,
          freshness: "fresh",
        },
      });
    await assert.rejects(
      () => gateway(primary).getCurrentGmp(fixtureIpoId),
      (error: unknown) => error instanceof ProviderPayloadError && error.fields.includes("freshness"),
    );
    const parsed = normalizeProviderPayload(
      "currentGmp",
      {
        amountRupees: 0,
        percent: 0,
        indicativeImpliedPriceRupees: 0,
        observedAt: null,
        freshness: "missing",
      },
      "mock",
    );
    assert.equal(parsed.amountRupees, 0);
    assert.equal(parsed.observedAt, null);
  });

  it("reports a timeout from the adapter type", async () => {
    const selected = gateway(createMockProvider({ now, behavior: { gmpHistory: "timeout" } }));
    await assert.rejects(() => selected.getGmpHistory(fixtureIpoId), ProviderTimeoutError);
  });
});
