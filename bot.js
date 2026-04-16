require('dotenv').config();
const axios = require('axios');

const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;

const TEST_TOKENS = [
    "7voyyzYZVgZSmpzVqVZekmyZMtz1u7Cn29b84bVpump", // Elite ✅
    "ACtfUWtgvaXrQGNMiohTusi5jcx5RJf5zwu9aAxkpump", // Elite ✅
    "DiNCVMS3GRSxrWSC4REh7VZeppQ3DEkx8UjJt4u94nHR"  // Rug ❌
];

async function runUltimateTest() {
    console.log("🔥 JUNNI'S NO-BYPASS FORENSIC ACTIVE...\n");

    for (let mint of TEST_TOKENS) {
        try {
            console.log(`🔍 Mint: ${mint}`);

            // STEP 1: Get Launch TX & Dev (Instant)
            const sigsRes = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [mint]
            });
            const launchSig = sigsRes.data.result[sigsRes.data.result.length - 1].signature;
            
            const txDetails = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0", id: 1, method: "getTransaction",
                params: [launchSig, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]
            });
            const dev = txDetails.data.result.transaction.message.accountKeys[0].pubkey;

            // STEP 2: Trace Funding (Was it an Exchange?)
            const walletSigs = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [dev]
            });
            const fundingSig = walletSigs.data.result[walletSigs.data.result.length - 1].signature;
            const fundTx = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0", id: 1, method: "getTransaction",
                params: [fundingSig, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]
            });

            // Funding Analysis
            const funder = fundTx.data.result.transaction.message.accountKeys[0].pubkey;
            // Pattern: Exchange transfers usually have high volume/clean logs
            const isCEXPattern = fundTx.data.result.meta.logMessages.length < 10; 

            // STEP 3: Socials via Metadata (Direct Blockchain Read)
            const assetRes = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint }
            });
            const metadata = assetRes.data.result.content?.metadata || {};
            const hasSocials = JSON.stringify(metadata).toLowerCase().includes("twitter") || 
                               JSON.stringify(metadata).toLowerCase().includes("t.me");

            console.log(`   ├ Dev: ${dev.substring(0,8)}...`);
            console.log(`   ├ Funding: ${isCEXPattern ? "✅ CEX/Fresh" : "❌ Personal/Internal"}`);
            console.log(`   ├ Socials: ${hasSocials ? "✅ Verified" : "❌ None"}`);

            // ⚖️ ELITE VERDICT
            if (hasSocials && isCEXPattern) {
                console.log(`   🌟 RESULT: ✅ ELITE PASS\n`);
            } else {
                console.log(`   ❌ RESULT: FAIL\n`);
            }

        } catch (e) { console.log(`   ❌ Error: ${e.message}\n`); }
        await new Promise(r => setTimeout(r, 1000));
    }
}
runUltimateTest();
