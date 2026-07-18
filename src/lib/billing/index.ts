/**
 * Stripe Billing Integration for Regula AI.
 *
 * Tiers map to Stripe price IDs (from environment):
 *   STRIPE_STARTER_PRICE_ID      — Starter tier ($49/mo)
 *   STRIPE_PROFESSIONAL_PRICE_ID — Professional tier ($249/mo)
 *   STRIPE_ENTERPRISE_PRICE_ID   — Enterprise tier (custom pricing)
 *
 * When Stripe keys are not configured, functions return graceful errors
 * so the app degrades cleanly rather than crashing.
 */

import Stripe from "stripe";

// ── Tier-to-price mapping ──────────────────────────────────────
export type StripeTier = "starter" | "professional" | "enterprise";

const PRICE_ID_MAP: Record<StripeTier, string | undefined> = {
  starter: process.env.STRIPE_STARTER_PRICE_ID,
  professional: process.env.STRIPE_PROFESSIONAL_PRICE_ID,
  enterprise: process.env.STRIPE_ENTERPRISE_PRICE_ID,
};

export interface CheckoutSessionInput {
  tier: StripeTier;
  tenantId: string;
  tenantName: string;
  userEmail: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSessionResult {
  url?: string;
  sessionId?: string;
  error?: string;
  code?: string;
}

let _stripe: Stripe | null = null;

function getStripe(): Stripe | null {
  if (_stripe) return _stripe;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;

  _stripe = new Stripe(key, {
    // @ts-ignore — apiVersion is required by types but the SDK picks the account default
  } as any);
  return _stripe;
}

/**
 * Create a Stripe Checkout session for a given tier.
 * Returns the session URL to redirect the user to.
 */
export async function createCheckoutSession(
  input: CheckoutSessionInput,
): Promise<CheckoutSessionResult> {
  const stripe = getStripe();
  if (!stripe) {
    return {
      error:
        "Stripe is not configured yet. Please connect your Stripe account in the Finance tab to enable billing.",
      code: "STRIPE_NOT_CONFIGURED",
    };
  }

  const priceId = PRICE_ID_MAP[input.tier];
  if (!priceId) {
    return {
      error: `No price configured for tier "${input.tier}". Set STRIPE_${input.tier.toUpperCase()}_PRICE_ID in environment variables.`,
      code: "PRICE_NOT_CONFIGURED",
    };
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: input.userEmail,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      metadata: {
        tenantId: input.tenantId,
        tenantName: input.tenantName,
        tier: input.tier,
      },
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      allow_promotion_codes: true,
      billing_address_collection: "required",
    });

    return {
      url: session.url ?? undefined,
      sessionId: session.id,
    };
  } catch (err: any) {
    console.error("Stripe checkout error:", err);
    return {
      error: err.message || "Failed to create checkout session.",
      code: "STRIPE_ERROR",
    };
  }
}

/**
 * Verify a Stripe webhook signature.
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
): Stripe.Event | { error: string; code: string } {
  const stripe = getStripe();
  if (!stripe) {
    return {
      error: "Stripe is not configured.",
      code: "STRIPE_NOT_CONFIGURED",
    };
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return {
      error: "Stripe webhook secret is not configured. Set STRIPE_WEBHOOK_SECRET.",
      code: "WEBHOOK_SECRET_MISSING",
    };
  }

  try {
    return stripe.webhooks.constructEvent(payload, signature, secret);
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err);
    return {
      error: `Webhook signature verification failed: ${err.message}`,
      code: "WEBHOOK_VERIFICATION_FAILED",
    };
  }
}

/**
 * Extract customer and subscription details from a Stripe event.
 * Webhook handlers use this to update tenant records.
 */
export interface StripeEventDetails {
  customerId: string;
  subscriptionId: string;
  status: string;
  priceId?: string;
  currentPeriodEnd?: string;
}

export function extractEventDetails(
  event: Stripe.Event,
): StripeEventDetails | null {
  const obj = event.data.object as any;

  const customerId =
    obj.customer ||
    obj.customer_id ||
    event.data.object?.customer ||
    "";

  const subscriptionId = obj.subscription || obj.id || "";

  // Subscription status mapping
  let status = "unknown";
  if (event.type === "checkout.session.completed") {
    status = obj.status === "complete" ? "active" : obj.status || "unknown";
  } else if (event.type === "customer.subscription.updated") {
    status = obj.status || "unknown";
  } else if (event.type === "customer.subscription.deleted") {
    status = "canceled";
  }

  const priceId = obj.items?.data?.[0]?.price?.id || obj.plan?.id || undefined;
  const currentPeriodEnd = obj.current_period_end
    ? new Date(obj.current_period_end * 1000).toISOString()
    : undefined;

  return {
    customerId: typeof customerId === "string" ? customerId : "",
    subscriptionId: typeof subscriptionId === "string" ? subscriptionId : "",
    status,
    priceId,
    currentPeriodEnd,
  };
}

/**
 * Create a Stripe Billing Portal session for a customer to manage their subscription.
 */
export async function createBillingPortalSession(
  customerId: string,
  returnUrl: string,
): Promise<{ url?: string; error?: string; code?: string }> {
  const stripe = getStripe();
  if (!stripe) {
    return {
      error: "Stripe is not configured.",
      code: "STRIPE_NOT_CONFIGURED",
    };
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return { url: session.url };
  } catch (err: any) {
    console.error("Billing portal error:", err);
    return {
      error: err.message || "Failed to create billing portal session.",
      code: "STRIPE_ERROR",
    };
  }
}
