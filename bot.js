require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const axios = require('axios');

// --- CONFIGURATION ---
const TELEGRAM_TOKEN = "8758743414:AAGUbb0kA9fPMfU-diX7-lVVal7cxzOTqTM";
const TELEGRAM_CHAT_ID = "8006731872";
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=cad2ea55-0ae1-4005-8b8a-3b04167a57fb`;

// Conflict-proof polling
const bot = new TelegramBot(TELEGRAM_TOKEN, { 
    polling: { autoStart: true, params: { timeout: 10 } } 
});

const alertedMints = new Set();
const CEX_LIST = ["fixedfloat", "changenow", "binance", "okx", "bybit", "kucoin", "gate.io", "mexc", "9wz2n", "66ppj", "5vc9e", "ac56n", "asty", "36vc", "2aqp", "h8sr", "6a7s2", "47s6a", "7xvyf"];

console.log('🛡️ V60 ONLINE: Professional Dev Radar Active');

// --- 🧪 Manual Test Command ---
bot.onText(/\/test (.+)/, async (msg, match) => {
    const testMint = match[1].trim();
    bot.sendMessage(msg.chat.id, `🕵️‍♂️ Deep Forensic Scan: \`${testMint.substring(0,8)}...\``, {parse_mode: 'Markdown'});
    
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
        bot.sendMessage(msg.chat.id, "❌ Error: Token not found.");
    }
});

// --- 🛠️ Forensic Engine ---
async function performForensic(mint, devWallet, isManual = false) {
    try {
        // 1. Metadata & Socials Check
        const asset = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint }
        });
        const tokenName = asset.data.result?.content?.metadata?.name || "Unknown";
        const meta = JSON.stringify(asset.data.result || "").toLowerCase();
        const hasSocials = meta.includes("t.me/") || meta.includes("x.com/") || meta.includes("twitter.com/");

        if (!hasSocials && !isManual) return; // Millions tokens update socials fast

        // 2. Identify Funder & Trace History
        const sigsRes = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [devWallet, { limit: 10 }]
        });
        const genesis = sigsRes.data.result[sigsRes.data.result.length - 1];
        const fundTx = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getTransaction",
            params: [genesis.signature, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]
        });
        
        const funderWallet = fundTx.data.result.transaction.message.accountKeys[0].pubkey;
        const logs = JSON.stringify(fundTx.data.result?.meta?.logMessages || "").toLowerCase();

        // Check if CEX
        const isCEX = CEX_LIST.some(sig => funderWallet.toLowerCase().startsWith(sig) || logs.includes(sig));

        // 3. Warm Wallet Rule: Funder ki history check karo
        const funderHistory = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [funderWallet, { limit: 50 }]
        });
        const txCount = funderHistory.data.result?.length || 0;

        // DECISION LOGIC
        // Alert if: (CEX Verified) OR (History > 10 transactions AND has Socials)
        if (isCEX || (txCount >= 10 && hasSocials)) {
            const devType = isCEX ? "🏛️ ELITE CEX" : "💎 PRO DEV (Warm Wallet)";
            const msg = `🌟 *${devType} SIGNAL*\n\n` +
                        `🏷️ **Name:** \`${tokenName}\`\n` +
                        `📍 **Mint:** \`${mint}\`\n` +
                        `📈 **Funder History:** ${txCount} txns\n\n` +
                        `🔗 [Jupiter Swap](https://jup.ag/swap/SOL-${mint})\n` +
                        `📊 [DexScreener](https://dexscreener.com/solana/${mint})`;

            await bot.sendMessage(TELEGRAM_CHAT_ID, msg, { parse_mode: 'Markdown', disable_web_page_preview: true });
            console.log(`✅ Alert: ${tokenName} | History: ${txCount}`);
        } else if (isManual) {
            bot.sendMessage(TELEGRAM_CHAT_ID, `❌ *SCAN FAILED*\nSocials: ${hasSocials ? "✅" : "❌"}\nHistory: ${txCount} txns (Need 10+)\nCEX: ${isCEX ? "✅" : "❌"}`);
        }
    } catch (e) {
        if (!isManual) alertedMints.delete(mint);
    }
}

// --- 📡 Radar Management ---
function startRadar() {
    const ws = new WebSocket('wss://pumpportal.fun/api/data');
    ws.on('open', () => {
        console.log('📡 Radar Connected...');
        ws.send(JSON.stringify({ "method": "subscribeNewToken" }));
    });
    ws.on('message', async (data) => {
        const event = JSON.parse(data.toString());
        if (event.mint && !alertedMints.has(event.mint)) {
            alertedMints.add(event.mint);
            // 45 Seconds wait taake professional dev metadata/socials update kar le
            setTimeout(() => performForensic(event.mint, event.traderPublicKey), 45000);
        }
    });
    ws.on('close', () => setTimeout(startRadar, 3000));
}

startRadar();
setInterval(() => alertedMints.clear(), 12 * 60 * 60 * 1000);
