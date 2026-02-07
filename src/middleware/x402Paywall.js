const { ethers } = require("ethers");

/**
 * x402 Payment Protocol Middleware
 *
 * Implements the HTTP 402 Payment Required flow:
 * 1. Client requests a protected resource
 * 2. Server responds 402 with payment instructions
 * 3. Client pays USDC and includes payment proof in X-PAYMENT header
 * 4. Server verifies payment and grants access
 *
 * Payment proof format (X-PAYMENT header):
 *   base64({ txHash, payer, amount, chain })
 */

const USDC_DECIMALS = 6;

// In-memory payment cache (production would use DB)
const verifiedPayments = new Map();

function paywall(amountMicroUsdc) {
  const amountUsdc = (amountMicroUsdc / 10 ** USDC_DECIMALS).toFixed(USDC_DECIMALS);

  return async (req, res, next) => {
    const paymentHeader = req.headers["x-payment"];

    if (!paymentHeader) {
      // No payment - return 402 with payment instructions
      return res.status(402).json({
        error: "Payment Required",
        protocol: "x402",
        version: "1.0",
        payment_instructions: {
          currency: "USDC",
          amount: amountUsdc,
          amount_micro: amountMicroUsdc,
          recipient: process.env.NEXUS_FEE_WALLET || "0x6b892038363B671809CE2f6F13717AA11D9dF252",
          chains: [
            { name: "Base Sepolia", chainId: 84532, usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" },
            { name: "Arbitrum Sepolia", chainId: 421614, usdc: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d" },
          ],
          header: "X-PAYMENT",
          format: "base64(JSON({ txHash, payer, amount, chainId }))",
          description: `Pay ${amountUsdc} USDC to access this endpoint`,
          paymaster: {
            supported: true,
            note: "Use Circle Paymaster on Base/Arbitrum to pay gas in USDC",
          },
        },
      });
    }

    // Verify payment
    try {
      const decoded = JSON.parse(Buffer.from(paymentHeader, "base64").toString());
      const { txHash, payer, amount, chainId } = decoded;

      if (!txHash || !payer || !amount) {
        return res.status(400).json({ error: "Invalid payment proof" });
      }

      // Check if payment already used (prevent replay)
      if (verifiedPayments.has(txHash)) {
        return res.status(400).json({ error: "Payment already used" });
      }

      // Verify amount is sufficient
      const paidAmount = parseFloat(amount);
      if (paidAmount < parseFloat(amountUsdc)) {
        return res.status(402).json({
          error: "Insufficient payment",
          required: amountUsdc,
          received: amount,
        });
      }

      // In production: verify tx on-chain via RPC
      // For demo: accept the payment proof at face value
      verifiedPayments.set(txHash, {
        payer,
        amount,
        chainId,
        endpoint: req.originalUrl,
        timestamp: Date.now(),
      });

      // Attach payment info to request
      req.x402Payment = { txHash, payer, amount, chainId };

      next();
    } catch (err) {
      return res.status(400).json({ error: "Invalid X-PAYMENT header", details: err.message });
    }
  };
}

module.exports = { paywall };
