require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const axios = require('axios');

const TELEGRAM_TOKEN = "8758743414:AAGUbb0kA9fPMfU-diX7-lVVal7cxzOTqTM";
const TELEGRAM_CHAT_ID = "8006731872";
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=cad2ea55-0ae1-4005-8b8a-3b04167a57fb`;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const alertedMints = new Set();

// FixedFloat aur Satoshi ke confirmed signatures
const CEX_LIST = [
    "FixedFloat", "ChangeNOW", "Binance", "Bybit", "OKX", "Kucoin", "Gate.io",
    "9Wz2n", "66pPj", "5VC9e", "AC56n", "ASTy", "36vC", "2AQp", "H8sR", 
    "6a7S2", "47S6a" // Satoshi & FixedFloat specific
];

bot.onText(/\/test (.+)/, async (msg, match) => {
    const testMint = match[1];
    bot.sendMessage(msg.chat.id, `🧪 Testing Satoshi-logic for: ${testMint.substring(0,8)}...`);
    
    try {
        const sigs = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [testMint]
        });
        const launchSig = sigs.data.result[sigs.data.result.length - 1].signature;
        const tx = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getTransaction",
            params: [launchSig, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]
        });
        const dev = tx.data.result.transaction.message.accountKeys[0].pubkey;
        performForensic(testMint, dev, true);
    } catch (e) { 
        bot.sendMessage(msg.chat.id, "❌ Forensic error: Could not fetch Dev."); 
    }
});

async function performForensic(mint, devWallet, isManual = false) {
    try {
        // 1. Socials Check
        const asset = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint }
        });
        const meta = JSON.stringify(asset.data.result || "").toLowerCase();
        const hasSocials = meta.includes("t.me/") || meta.includes("x.com/") || meta.includes("twitter.com/");

        // 2. CEX Funding Check (The Fix)
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
        
        // FIXED LOGIC: Multiple ways to match CEX
        const isCEX = CEX_LIST.some(sig => 
            funder.toLowerCase().startsWith(sig.toLowerCase()) || 
            logs.includes(sig.toLowerCase())
        );

        if (isCEX && (hasSocials || isManual)) {
            const status = isManual ? "✅ TEST PASSED" : "🌟 ELITE SIGNAL";
            bot.sendMessage(TELEGRAM_CHAT_ID, `${status}\n\n📍 Mint: \`${mint}\`\n💰 Funding: *CEX Verified* ✅\n🔗 [DexScreener](https://dexscreener.com/solana/${mint})`, {parse_mode: 'Markdown'});
        } else if (isManual) {
            bot.sendMessage(TELEGRAM_CHAT_ID, `❌ TEST FAILED\n\nFunder: \`${funder.substring(0,10)}...\`\nSocials: ${hasSocials ? "✅" : "❌"}\nCEX: ${isCEX ? "✅" : "❌"}`);
        }
    } catch (e) { }
}

function startRadar() {
    const ws = new WebSocket('wss://pumpportal.fun/api/data');
    ws.on('open', () => {
        console.log('🛡️ V54 Active - Use /test [mint]');
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
