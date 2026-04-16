require('dotenv').config();
const axios = require('axios');

const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;

const TEST_TOKENS = [
    "DiNCVMS3GRSxrWSC4REh7VZeppQ3DEkx8UjJt4u94nHR",
    "7voyyzYZVgZSmpzVqVZekmyZMtz1u7Cn29b84bVpump",
    "ACtfUWtgvaXrQGNMiohTusi5jcx5RJf5zwu9aAxkpump",
    "BFiGUxnidogqcZAPVPDZRCfhx3nXnFLYqpQUaUGpump"
];

async function runGenesisTest() {
    console.log("🚀 STARTING GENESIS TRACE (NO MORE 1000 TX LIMIT)...\n");

    for (let mint of TEST_TOKENS) {
        try {
            console.log(`🔍 Mint: ${mint}`);

            // 1. Find Dev via Launch Transaction
            const sigsRes = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [mint]
            });
            const launchTx = sigsRes.data.result[sigsRes.data.result.length - 1];
            const launchTime = launchTx.blockTime;

            const txDetails = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0", id: 1, method: "getTransaction",
                params: [launchTx.signature, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]
            });
            const dev = txDetails.data.result.transaction.message.accountKeys[0].pubkey;

            // 2. Find Dev's Genesis (First ever transaction)
            const walletSigs = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [dev]
            });
            const allSigs = walletSigs.data.result || [];
            const genesisTx = allSigs[allSigs.length - 1];
            const genesisTime = genesisTx.blockTime;

            // 🛡️ THE ELITE LOGIC: "The Life Span Test"
            // Agar wallet launch se sirf 1 ghanta pehle paida hua hai, to woh ELITE hai.
            const walletAgeMinutes = (launchTime - genesisTime) / 60;

            console.log(`   ├ Dev: ${dev}`);
            console.log(`   ├ Wallet Age: ${walletAgeMinutes.toFixed(2)} Minutes`);

            if (walletAgeMinutes < 120) { // Under 2 hours = Fresh/Professional
                console.log(`   🌟 RESULT: ✅ ELITE PASS (Fresh Professional Wallet)\n`);
            } else {
                console.log(`   ❌ RESULT: FAIL (Old/Recycled Wallet - ${walletAgeMinutes.toFixed(0)} mins old)\n`);
            }

        } catch (e) { console.log(`   ❌ Error: ${e.message}\n`); }
        await new Promise(r => setTimeout(r, 1000));
    }
}
runGenesisTest();
