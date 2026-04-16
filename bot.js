require('dotenv').config();
const axios = require('axios');

const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;

const TEST_TOKENS = [
    "7voyyzYZVgZSmpzVqVZekmyZMtz1u7Cn29b84bVpump", // Pass
    "ACtfUWtgvaXrQGNMiohTusi5jcx5RJf5zwu9aAxkpump", // Pass
    "BFiGUxnidogqcZAPVPDZRCfhx3nXnFLYqpQUaUGpump", // Pass
    "GRMRCsJJEEYXChrSDGaAsuK3W8YooF2R69GcdCXDpump", // Fail
    "kLqMvUm1p4pRbxU4r8kWCTVAuWMJLtcTJqGb4b5pump", // Fail
    "DiNCVMS3GRSxrWSC4REh7VZeppQ3DEkx8UjJt4u94nHR", // Fail
    "3vvDYGkavdt1FNoUw1r5YxDTA6SrWRbHtUV72Ltkpump"  // Fail
];

async function runTest() {
    console.log("🛡️ STARTING DEEP TRACE FORENSIC TEST...\n");

    for (let mint of TEST_TOKENS) {
        try {
            console.log(`🔍 Token: ${mint}`);

            // 1. Get Creator from Account Data (Fastest & Reliable)
            const accountInfo = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0", id: 1,
                method: "getAccountInfo",
                params: [mint, { encoding: "jsonParsed" }]
            });

            // Pump.fun metadata is on-chain, let's fetch the signatures to find the VERY FIRST TX (The Launch)
            const sigsRes = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0", id: 1,
                method: "getSignaturesForAddress",
                params: [mint, { limit: 100 }]
            });

            const signatures = sigsRes.data.result || [];
            // Launch transaction is usually the last one in a fresh mint history
            const launchTxSig = signatures[signatures.length - 1]?.signature;

            const txDetails = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0", id: 1,
                method: "getTransaction",
                params: [launchTxSig, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]
            });

            // Asli Creator hamesha woh hota hai jisne Mint Instruction chalayi
            const creator = txDetails.data.result?.transaction.message.accountKeys[0].pubkey || "Unknown";
            
            console.log(`   ├ Found Creator: ${creator}`);

            // 2. SOCIALS CHECK (Via DAS API as Backup)
            const assetRes = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0", id: "docs",
                method: "getAsset",
                params: { id: mint }
            });
            const asset = assetRes.data.result;
            const metaStr = JSON.stringify(asset?.content?.metadata || {}).toLowerCase();
            const hasSocials = metaStr.includes("twitter") || metaStr.includes("t.me") || metaStr.includes("http");

            console.log(`   ├ Socials Detected: ${hasSocials ? "✅" : "❌"}`);

            // 3. FINAL FORENSIC (Signature History)
            const walletSigs = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0", id: 1,
                method: "getSignaturesForAddress",
                params: [creator, { limit: 50 }]
            });
            const sigCount = walletSigs.data.result?.length || 0;

            let status = "❌ FAIL";
            if (hasSocials && sigCount > 0 && sigCount <= 15) {
                status = "🌟 PASS (ELITE)";
            }

            console.log(`   └ Result: ${status} | History: ${sigCount} TXs\n`);

        } catch (e) {
            console.log(`   ❌ Error: ${e.message}\n`);
        }
        await new Promise(r => setTimeout(r, 1000));
    }
}

runTest();
