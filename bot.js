require('dotenv').config();
const axios = require('axios');

const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;

// Known Exchange/CEX Main Wallets (Binance, Bybit, etc.)
const CEX_WALLETS = ["9Wz2n", "66pPj", "5VC9e", "AC56n"]; 

async function runTrueEliteForensic(mint) {
    try {
        console.log(`🔍 Forensic for: ${mint}`);

        // 1. Get Dev Wallet via Launch
        const sigsRes = await axios.post(HELIUS_RPC_URL, {
            jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [mint]
        });
        const launchTx = sigsRes.data.result[sigsRes.data.result.length - 1];
        const txDetails = await axios.post(HELIUS_RPC_URL, {
            jsonrpc: "2.0", id: 1, method: "getTransaction",
            params: [launchTx.signature, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]
        });
        const dev = txDetails.data.result.transaction.message.accountKeys[0].pubkey;

        // 2. Find GENESIS (Pehli transaction kab hui)
        const walletSigs = await axios.post(HELIUS_RPC_URL, {
            jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [dev, { limit: 1000 }]
        });
        const allTxs = walletSigs.data.result;
        const genesis = allTxs[allTxs.length - 1];
        const walletAgeMinutes = (Date.now() / 1000 - genesis.blockTime) / 60;

        // 3. Trace Funder
        const fundTx = await axios.post(HELIUS_RPC_URL, {
            jsonrpc: "2.0", id: 1, method: "getTransaction",
            params: [genesis.signature, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]
        });
        const funder = fundTx.data.result.transaction.message.accountKeys[0].pubkey;
        
        // --- ⚖️ VERDICT LOGIC ---
        const isCEXFunded = CEX_WALLETS.some(w => funder.startsWith(w)) || fundTx.data.result.meta.logMessages.length < 10;
        const isBurner = walletAgeMinutes < 15; // 15 mins se purana wallet burner nahi hota

        console.log(`   ├ Dev: ${dev.substring(0,8)}...`);
        console.log(`   ├ Age: ${walletAgeMinutes.toFixed(2)} Minutes`);
        console.log(`   ├ Funded By: ${funder.substring(0,8)}...`);

        if (isCEXFunded && !isBurner) {
            console.log(`   🌟 RESULT: ✅ ELITE PASS (Fresh Professional)\n`);
        } else if (walletAgeMinutes > 1440) { // More than 24 hours old
            console.log(`   🌟 RESULT: ✅ ELITE PASS (Established Wallet)\n`);
        } else {
            console.log(`   ❌ RESULT: FAIL (Risky/Burner)\n`);
        }

    } catch (e) { console.log(`   ❌ Forensic Error: ${e.message}\n`); }
}
