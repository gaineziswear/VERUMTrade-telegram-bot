/**
 * Stablecoin destinations and canonical token contracts are deployment config,
 * never hardcoded in the repository.
 */
export function parseStablecoinNetworkAllowlist(raw = "") {
  return raw.split(",").map(x => x.trim()).filter(Boolean).map(item => {
    const [asset, network, tokenContract, recipient] = item.split(":");
    if (!["USDT", "USDC"].includes(asset) || !network || !tokenContract || !recipient) throw new Error("Expected ASSET:NETWORK:TOKEN_CONTRACT:RECIPIENT");
    return Object.freeze({ asset, network, tokenContract, recipient });
  });
}

export function findAllowedStablecoinRoute(routes, { asset, network }) {
  return routes.find(route => route.asset === asset && route.network === network) ?? null;
}

/** Implement createCheckout, verifyWebhook(rawBody), and fetchPayment in each provider adapter. */
export class BillingProvider {
  async createCheckout() { throw new Error("createCheckout must be implemented"); }
  async verifyWebhook() { throw new Error("verifyWebhook must be implemented"); }
  async fetchPayment() { throw new Error("fetchPayment must be implemented"); }
}