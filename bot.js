require('dotenv').config();
const axios = require('axios');

// Configuration
const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;

// 🏆 FINAL MOON-TOKEN SIGNATURES (CEX & BRIDGES)
const CEX_SIGNATURES = [
    "9Wz2n", "66pPj", "5VC9e", "AC56n", "ASTy", "36vC", "2AQp", "H8sR", "6V9p",
    "FixedFloat", "ChangeNOW", "SideShift", "StealthEX", "SimpleSwap",
    "Binance", "Bybit", "OKX", "MEXC", "KuCoin", "Bitget", "Gate.io"
];

/**
 * Main Forensic Function
 * @param {string} mint - Token Mint Address
 * @returns {Promise<Object>} - Elite Status and Details
 */
async function performEliteForensic(mint) {
    try {
        // --- STEP 1: DEEP SOCIAL CRAWL ---
        const assetRes = await axios.post(HELIUS_RPC_URL, {
            jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint }
        });
        
        const assetData = assetRes.data.result;
        // Poore metadata ko dump karke links nichorna
        const fullDump = JSON.stringify(assetData).toLowerCase();

        const hasTG = fullDump.includes("t.me/") || fullDump.includes("telegram.me/");
        const hasX = fullDump.includes("twitter.com/") || fullDump.includes("x.com/");
        // Filter out junk links like metaplex, pump.fun internal, etc.
        const webMatch = fullDump.match(/https?:\/\/(?!(pump\.fun|ipfs|arweave|schema\.metaplex|github|w3\.org))[a-zA-Z0-9.-]+\.[a-z]{2,}/g);
        const hasWeb = webMatch && webMatch.length > 0;
        
        const socialScore = (hasTG ? 1 : 0) + (hasX ? 1 : 0) + (hasWeb ? 1 : 0);

        // --- STEP 2: DEV WALLET & GENESIS TRACE ---
        const sigsRes = await axios.post(HELIUS_RPC_URL, {
            jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [mint]
        });
        
        // Sabse pehli transaction (Launch Tx) se Dev nikalna
        const launchTxSig = sigsRes.data.result[sigsRes.data.result.length - 1].signature;
        const txDetails = await axios.post(HELIUS_RPC_URL, {
            jsonrpc: "2.0", id: 1, method: "getTransaction",
            params: [launchTxSig, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]
        });
        
        const dev = txDetails.data.result.transaction.message.accountKeys[0].pubkey;

        // Dev ki history se Genesis (Funding) Tx nikalna
        const walletSigs = await axios.post(HELIUS_RPC_URL, {
            jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [dev, { limit: 1000 }]
        });
        
        const genesis = walletSigs.data.result[walletSigs.data.result.length - 1];
        const walletAgeMins = (Date.now() / 1000 - genesis.blockTime) / 60;

        const fundTx = await axios.post(HELIUS_RPC_URL, {
            jsonrpc: "2.0", id: 1, method: "getTransaction",
            params: [genesis.signature, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]
        });
        
        const funder = fundTx.data.result.transaction.message.accountKeys[0].pubkey;
        const logs = JSON.stringify(fundTx.data.result.meta.logMessages || "").toLowerCase();

        // --- STEP 3: MOON LOGIC (The Elite Verdict) ---
        // CEX check via Address Prefix OR Log Keywords
        const isCEX = CEX_SIGNATURES.some(sig => funder.startsWith(sig) || logs.includes(sig.toLowerCase()));
        
        let isElite = false;
        let reason = "❌ FAIL";

        // Category 1: Professional Launch (Socials + CEX/Bridge)
        if (socialScore >= 1 && isCEX) {
            isElite = true;
            reason = "🌟 ELITE: CEX FUNDED MOON TOKEN";
        } 
        // Category 2: Established Player (Strong Socials + Old Wallet)
        else if (socialScore >= 2 && walletAgeMins > 1440) {
            isElite = true;
            reason = "🌟 ELITE: ESTABLISHED DEV";
        }

        return {
            mint,
            isElite,
            reason,
            metrics: {
                socials: { tg: hasTG, x: hasX, web: hasWeb },
                age: `${walletAgeMins.toFixed(0)} mins`,
                funding: isCEX ? "CLEAN/CEX" : "INTERNAL/RISKY",
                devWallet: dev
            }
        };

    } catch (error) {
        return { mint, isElite: false, reason: "⚠️ Forensic Error: " + error.message };
    }
}

// Example usage with one of your Moon Tokens
(async () => {
    const result = await performEliteForensic("BXnUS5vNFNvnjy2hLx6UCycgH5VvMw8HkC9qfae2pump");
    console.log(result);
})();

module.exports = { performEliteForensic };
