require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const axios = require('axios');

const TELEGRAM_TOKEN = "8758743414:AAGUbb0kA9fPMfU-diX7-lVVal7cxzOTqTM";
const TELEGRAM_CHAT_ID = "8006731872";
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=cad2ea55-0ae1-4005-8b8a-3b04167a57fb`;

// Polling true ki hai taake aapki command sun sake
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const alertedMints = new Set();

const CEX_LIST = ["FixedFloat", "ChangeNOW", "Binance", "Bybit", "OKX", "Kucoin", "Gate.io", "9Wz2n", "66pPj", "5VC9e", "AC56n", "ASTy", "36vC", "2AQp", "H8sR"];
const VERIFIED_WALLETS = ["6a7S2", "47S6a"]; 

// --- 🧪 TEST COMMAND HANDLER ---
bot.onText(/\/test (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const testMint = match[1];
    bot.sendMessage(chatId, `🔍 Manual Test Started for: \`${testMint}\`...`, {parse_mode: 'Markdown'});
    
    // Test ke liye hum dev wallet khud dhoondenge
    const dev = await getDevWallet(testMint);
    performForensic(testMint, dev, true); 
});

async function getDevWallet(mint) {
    try {
        const sigs = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [mint]
        });
        const launchSig = sigs.data.result[sigs.data.result.length - 1].signature;
        const tx = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getTransaction",
            params: [launchSig, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]
        });
        return tx.data.result.transaction.message.accountKeys[0].pubkey;
    } catch (e) { return null; }
}

// --- 🛠️ FORENSIC ENGINE ---
async function performForensic(mint, devWallet, isManual = false) {
    try {
        if (!devWallet) return;

        // 1. Socials
        const asset = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint }
        });
        const meta = JSON.stringify(asset.data.result || "").toLowerCase();
        const hasSocials = meta.includes("t.me/") || meta.includes("x.com/") || meta.includes("twitter.com/");

        // 2. CEX Check
        const sigsRes = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [devWallet, { limit: 100 }]
        });
        const sigs = sigsRes.data.result || [];
        const genesis = sigs[sigs.length - 1];
        const fundTx = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getTransaction",
            params: [genesis.signature, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]
        });
        
        const logs = JSON.stringify(fundTx.data.result?.meta?.logMessages || "").toLowerCase();
        const funder = fundTx.data.result?.transaction?.message?.accountKeys[0]?.pubkey || "";
        const isCEX = CEX_LIST.some(cex => logs.includes(cex.toLowerCase())) || 
                      VERIFIED_WALLETS.some(w => funder.includes(w));

        // Result Notification
        if (isCEX && hasSocials) {
            const status = isManual ? "✅ TEST PASSED (Elite Status)" : "🌟 NEW ELITE SIGNAL";
            bot.sendMessage(TELEGRAM_CHAT_ID, `${status}\n\n📍 Mint: \`${mint}\`\n💰 Fund: Verified ✅\n🔗 [DexScreener](https://dexscreener.com/solana/${mint})`, {parse_mode: 'Markdown'});
        } else if (isManual) {
            bot.sendMessage(TELEGRAM_CHAT_ID, `❌ TEST FAILED\nReason: ${!hasSocials ? "No Socials" : "Not CEX Funded"}`);
        }
    } catch (e) { if(isManual) bot.sendMessage(TELEGRAM_CHAT_ID, "⚠️ Forensic Error during test."); }
}

// --- 📡 LIVE RADAR ---
function startRadar() {
    const ws = new WebSocket('wss://pumpportal.fun/api/data');
    ws.on('open', () => {
        console.log('🛡️ V52 Online - Use /test [mint] in Telegram');
        ws.send(JSON.stringify({ "method": "subscribeNewToken" }));
    });
    ws.on('message', async (data) => {
        const event = JSON.parse(data.toString());
        if (event.mint && !alertedMints.has(event.mint)) {
            alertedMints.add(event.mint);
            performForensic(event.mint, event.traderPublicKey);
        }
    });
    ws.on('close', () => setTimeout(startRadar, 3000));
}

startRadar();
