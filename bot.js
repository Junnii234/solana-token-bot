require('dotenv').config();
const axios = require('axios');

const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;

const TEST_TOKENS = [
    "DiNCVMS3GRSxrWSC4REh7VZeppQ3DEkx8UjJt4u94nHR", // Rug (Isay FAIL hona chahiye)
    "ACtfUWtgvaXrQGNMiohTusi5jcx5RJf5zwu9aAxkpump", // Elite (Isay PASS hona chahiye)
    "BFiGUxnidogqcZAPVPDZRCfhx3nXnFLYqpQUaUGpump"
    // Elite (Isay PASS hona chahiye)
];

async function runTriForensicTest() {
    console.log("🛡️ STARTING TRI-FORENSIC SHIELD (V11)...\n");

    for (let mint of TEST_TOKENS) {
        try {
            console.log(`🔍 Mint: ${mint}`);

            // 1. Get Metadata (Socials Check) - Slow but necessary
            const assetRes = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint }
            });
            const meta = assetRes.data.result.content?.metadata || {};
            const hasSocials = JSON.stringify(meta).toLowerCase().includes("twitter") || 
                               JSON.stringify(meta).toLowerCase().includes("t.me");

            // 2. Get Dev & Genesis (Time Check)
            const sigsRes = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [mint]
            });
            const launchTx = sigsRes.data.result[sigsRes.data.result.length - 1];
            
            const txDetails = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0", id: 1, method: "getTransaction",
                params: [launchTx.signature, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]
            });
            const dev = txDetails.data.result.transaction.message.accountKeys[0].pubkey;

            const walletSigs = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [dev]
            });
            const genesisTx = walletSigs.data.result[walletSigs.data.result.length - 1];
            const ageMins = (launchTx.blockTime - genesisTx.blockTime) / 60;

            // 3. Funding Check (Was it a direct transfer?)
            const fundTx = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0", id: 1, method: "getTransaction",
                params: [genesisTx.signature, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]
            });
            const funder = fundTx.data.result.transaction.message.accountKeys[0].pubkey;
            const isDirectFund = fundTx.data.result.meta.logMessages.length < 15; // Simple transfer check

            // --- 🚨 FINAL VERDICT ---
            console.log(`   ├ Dev: ${dev}`);
            console.log(`   ├ Age: ${ageMins.toFixed(2)}m | Socials: ${hasSocials ? "✅" : "❌"}`);
            
            // ELITE criteria: Fresh age AND Socials AND Simple funding
            if (ageMins < 120 && hasSocials && isDirectFund) {
                console.log(`   🌟 RESULT: ✅ ELITE PASS\n`);
            } else {
                let reason = !hasSocials ? "Missing Socials" : (ageMins >= 120 ? "Old Wallet" : "Complex Funding/Rug Pattern");
                console.log(`   ❌ RESULT: FAIL (${reason})\n`);
            }

        } catch (e) { console.log(`   ❌ Error: ${e.message}\n`); }
        await new Promise(r => setTimeout(r, 1000));
    }
}
runTriForensicTest();
