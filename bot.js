require('dotenv').config();
const axios = require('axios');

const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;

// Known CEX/Exchange Hot Wallets
const CEX_SIGNATURES = ["9Wz2n", "66pPj", "5VC9e", "AC56n", "ASTy", "Bybit", "Binance"];

const TEST_TOKENS = [
    "ACtfUWtgvaXrQGNMiohTusi5jcx5RJf5zwu9aAxkpump", // Real ✅
    "BFiGUxnidogqcZAPVPDZRCfhx3nXnFLYqpQUaUGpump", // Real ✅
    "DiNCVMS3GRSxrWSC4REh7VZeppQ3DEkx8UjJt4u94nHR" ,
    "Feyunx35PGinFaDPe7KsJudTXFKiW49TVMSC1iH9pump"
    // Rug ❌
];

async function runEliteForensic() {
    console.log("🛡️ STARTING IRONCLAD ELITE FORENSIC V23...\n");

    for (let mint of TEST_TOKENS) {
        try {
            console.log(`🔍 Investigating: ${mint}`);

            // --- 1. SOCIAL DETECTION LAYER ---
            const assetRes = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint }
            });
            const assetData = assetRes.data.result;
            const fullDump = JSON.stringify(assetData).toLowerCase();

            const hasTG = fullDump.includes("t.me/") || fullDump.includes("telegram.me/");
            const hasX = fullDump.includes("twitter.com/") || fullDump.includes("x.com/");
            const webMatch = fullDump.match(/https?:\/\/(?!(pump\.fun|ipfs|arweave|schema\.metaplex|github))[a-zA-Z0-9.-]+\.[a-z]{2,}/g);
            const hasWeb = webMatch && webMatch.length > 0;
            const socialScore = (hasTG ? 1 : 0) + (hasX ? 1 : 0) + (hasWeb ? 1 : 0);

            // --- 2. FUNDING & WALLET LAYER ---
            const sigsRes = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [mint]
            });
            const launchTxSig = sigsRes.data.result[sigsRes.data.result.length - 1].signature;
            const txDetails = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0", id: 1, method: "getTransaction",
                params: [launchTxSig, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]
            });
            const dev = txDetails.data.result.transaction.message.accountKeys[0].pubkey;

            const walletSigs = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [dev, { limit: 1000 }]
            });
            const allTxs = walletSigs.data.result;
            const genesis = allTxs[allTxs.length - 1];
            const walletAgeMins = (Date.now() / 1000 - genesis.blockTime) / 60;

            const fundTx = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0", id: 1, method: "getTransaction",
                params: [genesis.signature, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]
            });
            const funder = fundTx.data.result.transaction.message.accountKeys[0].pubkey;
            const isCEX = CEX_SIGNATURES.some(w => funder.startsWith(w)) || fundTx.data.result.meta.logMessages.length < 12;

            // --- 📊 VERDICT LOGIC ---
            console.log(`   ├ Socials: TG:${hasTG ? "✅" : "❌"} X:${hasX ? "✅" : "❌"} Web:${hasWeb ? "✅" : "❌"}`);
            console.log(`   ├ Wallet Age: ${walletAgeMins.toFixed(1)} mins`);
            console.log(`   ├ Funding: ${isCEX ? "✅ Clean/CEX" : "❌ Risky/Internal"}`);

            // Criteria: 
            // 1. Socials must exist (At least 1)
            // 2. Must be CEX funded OR an old established wallet (> 24h)
            const isElite = socialScore >= 1 && (isCEX || walletAgeMins > 1440);

            if (isElite) {
                console.log(`   🌟 FINAL RESULT: ✅ ELITE PASS\n`);
            } else {
                console.log(`   ❌ FINAL RESULT: FAIL\n`);
            }

        } catch (e) {
            console.log(`   ❌ Forensic Error for ${mint}\n`);
        }
        await new Promise(r => setTimeout(r, 1000));
    }
}

runEliteForensic();
