require('dotenv').config();
const axios = require('axios');

const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;

// In addresses ko test karein, inka funding pattern farq hoga
const TEST_TOKENS = [
    "7voyyzYZVgZSmpzVqVZekmyZMtz1u7Cn29b84bVpump",
    "ACtfUWtgvaXrQGNMiohTusi5jcx5RJf5zwu9aAxkpump",
    "BFiGUxnidogqcZAPVPDZRCfhx3nXnFLYqpQUaUGpump"
];

async function runFundingTest() {
    console.log("💰 TRACING DEV FUNDING SOURCE...\n");

    for (let mint of TEST_TOKENS) {
        try {
            console.log(`🔍 Token: ${mint}`);

            // 1. Find Creator (via Launch Transaction)
            const sigsRes = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [mint]
            });
            const launchTx = sigsRes.data.result[sigsRes.data.result.length - 1].signature;
            const txDetails = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0", id: 1, method: "getTransaction",
                params: [launchTx, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]
            });
            const creator = txDetails.data.result.transaction.message.accountKeys[0].pubkey;

            // 2. Deep Trace: Find the VERY FIRST transaction of this Dev Wallet
            const walletSigs = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [creator]
            });
            const allSigs = walletSigs.data.result || [];
            const fundingTxSig = allSigs[allSigs.length - 1].signature;

            // 3. Analyze Funding Transaction
            const fundTxDetails = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0", id: 1, method: "getTransaction",
                params: [fundingTxSig, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]
            });

            // Funding kahan se aayi?
            const funder = fundTxDetails.data.result?.transaction.message.accountKeys[0].pubkey;
            const description = fundTxDetails.data.result?.meta?.logMessages?.join(" ") || "";
            
            // Check if it's a CEX (Binance, etc.) or a Personal Wallet
            // Professional pattern: Funded from a known Exchange Hot Wallet
            let isCEX = false;
            const commonExchanges = ["9Wz2", "66pP", "ASTy", "Bybit", "Binance", "OKX"]; 
            if (commonExchanges.some(ex => funder.startsWith(ex) || description.includes(ex))) {
                isCEX = true;
            }

            console.log(`   ├ Dev Wallet: ${creator}`);
            console.log(`   ├ Funded By: ${funder}`);
            console.log(`   └ Source Type: ${isCEX ? "✅ Verified Exchange (ELITE)" : "⚠️ Personal Wallet (RISK)"}`);
            console.log(isCEX ? "   🌟 RESULT: PASS\n" : "   ❌ RESULT: FAIL\n");

        } catch (e) { console.log(`   ❌ Error: ${e.message}\n`); }
        await new Promise(r => setTimeout(r, 1000));
    }
}
runFundingTest();
