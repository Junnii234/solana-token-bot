require('dotenv').config();
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');

const TELEGRAM_TOKEN = "8758743414:AAGUbb0kA9fPMfU-diX7-lVVal7cxzOTqTM";
const TELEGRAM_CHAT_ID = "8006731872";
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=cad2ea55-0ae1-4005-8b8a-3b04167a57fb`;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });
const CEX_SIGNATURES = ["9Wz2n", "66pPj", "5VC9e", "AC56n", "ASTy", "36vC", "2AQp", "H8sR", "6V9p", "FixedFloat", "ChangeNOW", "Binance", "Bybit", "OKX", "Bitget"];

// ==========================================
// 🧪 TEST AREA: Apna Mint Address Yahan Dalein
// ==========================================
const TEST_MINT = "ACtfUWtgvaXrQGNMiohTusi5jcx5RJf5zwu9aAxkpump"; 
// ==========================================

async function runTest(mint) {
    console.log(`🧪 Starting Test for: ${mint}`);
    try {
        // 1. Socials Check
        const asset = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint }
        });
        const meta = JSON.stringify(asset.data.result || "").toLowerCase();
        const hasSocials = meta.includes("t.me/") || meta.includes("x.com/") || meta.includes("twitter.com/");
        
        console.log(`📡 Socials Found: ${hasSocials ? "✅" : "❌"}`);

        // 2. Dev & CEX Check
        const sigsRes = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [mint]
        });
        const launchSig = sigsRes.data.result[sigsRes.data.result.length - 1].signature;
        
        const tx = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getTransaction",
            params: [launchSig, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]
        });
        
        const devWallet = tx.data.result.transaction.message.accountKeys[0].pubkey;
        const devHistory = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [devWallet, { limit: 100 }]
        });

        const genesis = devHistory.data.result[devHistory.data.result.length - 1];
        const fundTx = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getTransaction",
            params: [genesis.signature, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]
        });

        const logs = JSON.stringify(fundTx.data.result?.meta?.logMessages || "").toLowerCase();
        const isCEX = CEX_SIGNATURES.some(cex => logs.includes(cex.toLowerCase()));

        console.log(`💰 CEX Funding: ${isCEX ? "✅ Verified" : "❌ Personal Wallet"}`);

        if (hasSocials && isCEX) {
            bot.sendMessage(TELEGRAM_CHAT_ID, `🧪 *TEST PASSED!*\nMint: ${mint}\nStatus: Elite ✅`);
        } else {
            console.log("❌ Test Failed: Criteria not met.");
        }
    } catch (e) {
        console.log("⚠️ Error during test:", e.message);
    }
}

runTest(TEST_MINT);
