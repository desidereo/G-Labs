import { config } from "@/lib/config";
import type { MarketProvider } from "@/lib/providers/types";
import { DemoMarketProvider } from "./demo";
import { YahooMarketProvider } from "./yahoo";

export function getMarketProvider(): MarketProvider {
  if (config.demoMode) return new DemoMarketProvider();
  return new YahooMarketProvider();
}

export { DemoMarketProvider, YahooMarketProvider };
