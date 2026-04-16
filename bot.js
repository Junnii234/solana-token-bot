require('dotenv').config();
const axios = require('axios');

const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;

const TEST_TOKENS = [
    "ACtfUWtgvaXrQGNMiohTusi5jcx5RJf5zwu9aAxkpump", // Real
    "BFiGUxnidogqcZAPVPDZRCfhx3nXnFLYqpQUaUGpump", // Real
    "DiNCVMS3GRSxrWSC4REh7VZeppQ3DEkx8UjJt4u94nHR"  // Rug ❌
];

async function runDevReputationForensic() {
    console.log("🕵️‍♂️ ANALYZING DEV WALLET REPUTATION (V21)...\n");

    for (let mint of TEST_TOKENS) {
        try {
            console.log(`🔍 Token: ${mint}`);

            // 1. Get Dev Wallet
            const sigsRes = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [mint]
            });
            const launchTxSig = sigsRes.data.result[sigsRes.data.result.length - 1].signature;
            const txDetails = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0", id: 1, method: "getTransaction",
                params: [launchTxSig, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]
            });
            const dev = txDetails.data.result.transaction.message.accountKeys[0].pubkey;

            // 2. Scan Dev Wallet History (Pehli 100 transactions)
            const walletSigs = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [dev, { limit: 100 }]
            });
            const txCount = walletSigs.data.result.length;
            
            // 3. Get Genesis (Funding) Tx
            const genesisSig = walletSigs.data.result[walletSigs.data.result.length - 1].signature;
            const fundTx = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0", id: 1, method: "getTransaction",
                params: [genesisSig, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]
            });

            const funder = fundTx.data.result.transaction.message.accountKeys[0].pubkey;
            
            // ⚖️ ELITE CRITERIA
            // 1. Dev must have > 2 pre-launch transactions (Not a 'single-use' rug wallet)
            // 2. Funder must NOT be the dev himself (Self-funding is risky)
            const isReputable = txCount > 2 && txCount < 100; // Professional but fresh
            const isSelfFunded = funder === dev;

            console.log(`   ├ Dev Wallet: ${dev.substring(0,8)}...`);
            console.log(`   ├ Wallet History: ${txCount} TXs`);
            console.log(`   ├ Funded By: ${funder.substring(0,8)}...`);
            console.log(`   └ Status: ${isReputable ? "✅ Active Dev" : "❌ Burner/Rug Wallet"}`);

            if (isReputable && !isSelfFunded) {
                console.log(`   🌟 VERDICT: ✅ ELITE PASS\n`);
            } else {
                let reason = isSelfFunded ? "Self-Funded (Risky)" : "Single-Use Burner Wallet";
                console.log(`   ❌ VERDICT: FAIL (${reason})\n`);
            }

        } catch (e) { console.log(`   ❌ Error: Trace failed.\n`); }
        await new Promise(r => setTimeout(r, 1000));
    }
}
runDevReputationForensic();
