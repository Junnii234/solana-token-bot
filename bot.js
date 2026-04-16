require('dotenv').config();
const axios = require('axios');

const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;

const TEST_TOKENS = [
    "7voyyzYZVgZSmpzVqVZekmyZMtz1u7Cn29b84bVpump", // Elite ✅
    "ACtfUWtgvaXrQGNMiohTusi5jcx5RJf5zwu9aAxkpump", // Elite ✅
    "BFiGUxnidogqcZAPVPDZRCfhx3nXnFLYqpQUaUGpump"  // Elite ✅
];

async function runEliteTest() {
    console.log("💎 TRACING ELITE FUNDING PATTERNS...\n");

    for (let mint of TEST_TOKENS) {
        try {
            console.log(`🔍 Mint: ${mint}`);

            // 1. Get Dev via Launch Signature (Instant On-Chain)
            const sigsRes = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [mint]
            });
            const launchTx = sigsRes.data.result[sigsRes.data.result.length - 1].signature;
            const txDetails = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0", id: 1, method: "getTransaction",
                params: [launchTx, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]
            });
            const dev = txDetails.data.result.transaction.message.accountKeys[0].pubkey;

            // 2. Trace Dev's FIRST EVER transaction
            const walletSigs = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [dev]
            });
            const allSigs = walletSigs.data.result || [];
            const fundingSig = allSigs[allSigs.length - 1].signature;

            const fundDetails = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0", id: 1, method: "getTransaction",
                params: [fundingSig, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]
            });

            // --- 🛡️ THE ELITE FUNDING PATTERN ---
            // Pattern 1: Funding aayi naye wallet mein
            // Pattern 2: Wallet ki total history choti hai (Professional Fresh Start)
            const isFresh = allSigs.length <= 60; 
            
            // Check if it's a Simple Transfer (Typical of CEX withdrawals)
            const isSimpleTransfer = fundDetails.data.result.meta.logMessages.length < 15;

            console.log(`   ├ Dev: ${dev}`);
            console.log(`   ├ Wallet History: ${allSigs.length} TXs`);
            
            if (isFresh && isSimpleTransfer) {
                console.log(`   🌟 RESULT: ✅ ELITE PASS (Professional Fresh Funding)\n`);
            } else {
                console.log(`   ❌ RESULT: FAIL (Old/Dirty Wallet)\n`);
            }

        } catch (e) { console.log(`   ❌ Error: ${e.message}\n`); }
        await new Promise(r => setTimeout(r, 1000));
    }
}
runEliteTest();
