require('dotenv').config();
const axios = require('axios');

const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;

const TEST_TOKENS = [
    "7voyyzYZVgZSmpzVqVZekmyZMtz1u7Cn29b84bVpump",
    "ACtfUWtgvaXrQGNMiohTusi5jcx5RJf5zwu9aAxkpump",
    "BFiGUxnidogqcZAPVPDZRCfhx3nXnFLYqpQUaUGpump",
    "GRMRCsJJEEYXChrSDGaAsuK3W8YooF2R69GcdCXDpump",
    "kLqMvUm1p4pRbxU4r8kWCTVAuWMJLtcTJqGb4b5pump"
];

async function runFinalTest() {
    console.log("🎯 STARTING BULLSEYE FORENSIC...\n");

    for (let mint of TEST_TOKENS) {
        try {
            console.log(`🔍 Token: ${mint}`);

            // 1. Get Signatures to find the FIRST transaction (The Launch)
            const sigsRes = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [mint]
            });
            const sigs = sigsRes.data.result || [];
            if (sigs.length === 0) continue;

            // Launch TX hamesha history mein sab se niche hoti hai
            const launchTx = sigs[sigs.length - 1].signature;

            // 2. Fetch Launch Transaction to see who the real Dev is
            const txDetails = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0", id: 1, method: "getTransaction",
                params: [launchTx, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]
            });

            // Pehla account hamesha signer (Dev) hota hai
            const creator = txDetails.data.result.transaction.message.accountKeys[0].pubkey;

            // 3. Wallet Forensic (Funding check)
            const walletSigs = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [creator, { limit: 20 }]
            });
            const txCount = walletSigs.data.result?.length || 0;

            // Logic: Agar history 1-15 TXs hai to Elite Dev hai
            let status = (txCount > 0 && txCount <= 15) ? "✅ PASS (ELITE)" : "❌ FAIL (DIRTY)";

            console.log(`   ├ Found Dev: ${creator}`);
            console.log(`   └ Forensic: ${status} | History: ${txCount} TXs\n`);

        } catch (e) { console.log(`   ❌ Error: ${e.message}\n`); }
        await new Promise(r => setTimeout(r, 1000));
    }
}
runFinalTest();
