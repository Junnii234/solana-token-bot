require('dotenv').config();
const axios = require('axios');

const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;

// In tokens par 100% PASS hona chahiye
const TEST_TOKENS = [
    "7voyyzYZVgZSmpzVqVZekmyZMtz1u7Cn29b84bVpump",
    "ACtfUWtgvaXrQGNMiohTusi5jcx5RJf5zwu9aAxkpump",
    "BFiGUxnidogqcZAPVPDZRCfhx3nXnFLYqpQUaUGpump"
];

async function runFundingForensic() {
    console.log("💰 TRACING SMART MONEY FUNDING...\n");

    for (let mint of TEST_TOKENS) {
        try {
            console.log(`🔍 Mint: ${mint}`);

            // 1. Get Dev Wallet (via Launch Signature)
            const sigsRes = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [mint]
            });
            const launchTx = sigsRes.data.result[sigsRes.data.result.length - 1].signature;
            const txDetails = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0", id: 1, method: "getTransaction",
                params: [launchTx, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]
            });
            const dev = txDetails.data.result.transaction.message.accountKeys[0].pubkey;

            // 2. Trace VERY FIRST transaction of Dev Wallet (Funding)
            const walletSigs = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [dev]
            });
            const allSigs = walletSigs.data.result || [];
            const fundingSig = allSigs[allSigs.length - 1].signature;

            const fundDetails = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0", id: 1, method: "getTransaction",
                params: [fundingSig, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]
            });

            // 3. Identify Funder
            const funder = fundDetails.data.result.transaction.message.accountKeys[0].pubkey;
            
            // Known CEX/Exchange Hot Wallets (Binance, Bybit, OKX, etc.)
            const isCEX = funder.startsWith("9Wz2") || // Binance
                          funder.startsWith("66pP") || // Bybit
                          funder.startsWith("ASTy") || // MEXC
                          funder.startsWith("5VCV");   // Kraken

            console.log(`   ├ Dev: ${dev}`);
            console.log(`   ├ Funded By: ${funder}`);
            
            if (isCEX || allSigs.length < 50) {
                console.log(`   🌟 RESULT: ✅ ELITE PASS (Exchange Funded or Fresh)\n`);
            } else {
                console.log(`   ❌ RESULT: FAIL (Dirty Personal Funding)\n`);
            }

        } catch (e) { console.log(`   ❌ Error: ${e.message}\n`); }
        await new Promise(r => setTimeout(r, 1000));
    }
}
runFundingForensic();
