require('dotenv').config();
const axios = require('axios');

const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;

const TEST_TOKENS = [
    "ACtfUWtgvaXrQGNMiohTusi5jcx5RJf5zwu9aAxkpump", // Real
    "BFiGUxnidogqcZAPVPDZRCfhx3nXnFLYqpQUaUGpump", // Real
    "DiNCVMS3GRSxrWSC4REh7VZeppQ3DEkx8UjJt4u94nHR"  // Rug
];

async function runFundingForensic() {
    console.log("🕵️‍♂️ TRACING DEV WALLET ORIGIN...\n");

    for (let mint of TEST_TOKENS) {
        try {
            console.log(`🔍 Token: ${mint}`);

            // 1. Find Dev Wallet (via Launch Tx)
            const sigsRes = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [mint]
            });
            const launchTxSig = sigsRes.data.result[sigsRes.data.result.length - 1].signature;
            
            const txDetails = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0", id: 1, method: "getTransaction",
                params: [launchTxSig, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]
            });
            const dev = txDetails.data.result.transaction.message.accountKeys[0].pubkey;

            // 2. Find Dev's Genesis (Pehli Transaction)
            const walletSigs = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [dev]
            });
            const allSigs = walletSigs.data.result || [];
            const genesisSig = allSigs[allSigs.length - 1].signature;

            const fundTx = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0", id: 1, method: "getTransaction",
                params: [genesisSig, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]
            });

            // 3. Analyze Funding Source
            const funder = fundTx.data.result.transaction.message.accountKeys[0].pubkey;
            const logMessages = fundTx.data.result.meta.logMessages || [];
            const logsJoined = logMessages.join(" ");

            // Pattern Detection
            // Professional CEX usually has simple transfers (fewer logs)
            // Ruggers routing through other wallets have complex logs
            const isSimpleTransfer = logMessages.length < 12;
            
            // Known CEX/Bridge Indicators (Common patterns)
            const isCEX = funder.startsWith("9Wz2") || // Binance
                          funder.startsWith("66pP") || // Bybit
                          logsJoined.includes("Transfer") && isSimpleTransfer;

            console.log(`   ├ Dev Wallet: ${dev}`);
            console.log(`   ├ Funded By: ${funder}`);
            console.log(`   ├ Logs Count: ${logMessages.length}`);
            console.log(`   └ Pattern: ${isCEX ? "✅ Clean/CEX Origin" : "⚠️ Internal/Dirty Route"}`);

            if (isCEX) {
                console.log(`   🌟 VERDICT: ✅ FUNDING VERIFIED\n`);
            } else {
                console.log(`   ❌ VERDICT: RISKY FUNDING\n`);
            }

        } catch (e) {
            console.log(`   ❌ Error: Trace failed.\n`);
        }
        await new Promise(r => setTimeout(r, 1000));
    }
}

runFundingForensic();
