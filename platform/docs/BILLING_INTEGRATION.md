# Billing integration contract

## Commercial defaults

- Catalog prices are denominated in USD.
- Fiat checkout is provider-neutral. Select the provider after merchant onboarding, supported-country, KYC, settlement and webhook capabilities have been verified.
- USDT and USDC are supported as payment assets, subject to an explicit deployment allowlist of networks, canonical token contracts and receiving addresses.
- No token contract, receiving wallet, exchange rate or confirmation threshold is hardcoded in this repository.

## Stablecoin payment safety

1. Create a unique invoice with a short expiry and a USD-denominated quote.
2. Resolve the exact asset/network/token contract/recipient from the configured allowlist.
3. A chain adapter independently verifies the transaction, token contract, recipient, amount, successful status, finality and confirmation depth.
4. The billing domain rejects incomplete verification, underpayment, overpayment, late payment and duplicate payment references from automatic activation.
5. Overpayments and late payments enter manual reconciliation. Underpayments do not activate VIP.
6. Apply the payment reference and entitlement update in one database transaction with a unique constraint.
7. Keep invoice, payment and entitlement audit records. Never accept a client-supplied transaction hash as proof of payment.

Stablecoins do not provide native recurring card billing. The initial model is a renewable invoice per billing period with reminders and automatic entitlement expiry; do not represent it as an automatic on-chain recurring debit.

## Provider adapter contract

Implement a provider adapter with:
- createCheckout(request), using an idempotency key and USD amount.
- verifyWebhook(headers, rawBody), verifying the provider signature against the exact raw body.
- fetchPayment(reference), retrieving canonical provider-side payment status.

Only a verified provider event can create a payment ledger entry. Provider selection is intentionally pending merchant account and settlement validation.

## Configuration

The allowlist parser expects comma-separated entries:

```text
VERUM_STABLECOIN_ROUTES=USDC:ethereum:<canonical-token-contract>:<receiving-address>,USDT:solana:<canonical-mint>:<receiving-wallet>
```

Use only networks and token contracts that have been verified for the actual receiving wallet and payment processor. Keep this value in deployment secrets/configuration, never commit live addresses or private keys.
