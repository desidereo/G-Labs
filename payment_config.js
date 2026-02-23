// G-Labs Payment Configuration
// ==========================================
// INSTRUCTIONS:
// 1. Create Payment Links in your Stripe Dashboard for each product below.
// 2. IMPORTANT: In Stripe, click "Advanced options" -> "Add custom field" -> "Text".
//    - Label it: "TradingView Username"
//    - Make it: Required
// 3. Paste the generated URL (e.g., https://buy.stripe.com/...) into the quotes below.

const PAYMENT_CONFIG = {
    // Product 1: BTMM State Engine Pro Multi Asset + Deluxe Package (£150 Lifetime)
    "btmm_lifetime": "https://buy.stripe.com/dRm8wPg3K3g5eYf74m3cc01",

    // Product 2: Magic Lines Single Asset (£9.99/month)
    "magic_lines_single": "https://buy.stripe.com/eVq3cveZG2c18zR3Sa3cc02",

    // Product 3: Magic Lines Deluxe Package (£19.99/month)
    "magic_lines_deluxe": "https://buy.stripe.com/14AeVd6tadUJ2btgEW3cc03",

    // Product 4: Connix Smart Trading Single Asset (£9.99/month)
    "connix_single": "https://buy.stripe.com/eVqeVddVCdUJg2j88q3cc04",

    // Product 5: Connix Deluxe Package (£19.99/month)
    "connix_deluxe": "https://buy.stripe.com/4gM14ndVCcQFcQ7agy3cc05",

    // Product 6: Market Maker Single Asset (£9.99/month)
    "market_maker_single": "https://buy.stripe.com/bJe00j4l203T3fxgEW3cc06",

    // Product 7: Market Maker Deluxe Package (£19.99/month)
    "market_maker_deluxe": "https://buy.stripe.com/00wbJ1aJqeYN6rJagy3cc07",

    // Custom Orders: "Pay what you want" link or specific invoice link
    "custom_order_pay": "https://buy.stripe.com/5kQeVd6taeYNbM3bkC3cc08"
};

// Function to handle checkout clicks
function checkout(productId) {
    const url = PAYMENT_CONFIG[productId];
    if (!url || url.includes("PLACEHOLDER")) {
        alert("Payment link not configured yet. Please check back soon or contact support.");
        console.error(`Missing payment link for: ${productId}`);
        return;
    }
    window.location.href = url;
}
