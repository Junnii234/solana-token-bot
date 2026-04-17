require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const axios = require('axios');

const TELEGRAM_TOKEN = "8758743414:AAGUbb0kA9fPMfU-diX7-lVVal7cxzOTqTM";
const TELEGRAM_CHAT_ID = "8006731872";
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=cad2ea55-0ae1-4005-8b8a-3b04167a57fb`;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: { autoStart: true, params: { timeout: 10 } } });
const alertedMints = new Set();
const CEX_LIST = ["fixedfloat", "changenow", "binance", "okx", "bybit", "kucoin", "gate.io", "mexc", "9wz2n", "66ppj", "5vc9e", "ac56n", "asty", "36vc", "2aqp", "h8sr", "6a7s2", "47s6a", "7xvyf"];

console.log('🚀 V63 ONLINE: Ultra-Strict + Manual Test Fixed');

// --- 🧪 FIXED MANUAL TEST COMMAND ---
bot.onText(/\/test (.+)/, async (msg, match) => {
    const testMint = match[1].trim();
    bot.sendMessage(msg.chat.id, `🔍 *Manual Forensic Starting...*\nToken: \`${testMint.substring(0,8)}...\``, {parse_mode: 'Markdown'});
    
    try {
        const sigs = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [testMint]
        });
        if (!sigs.data.result.length) throw new Error("No data");
        const launchSig = sigs.data.result[sigs.data.result.length - 1].signature;
        const tx = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getTransaction",
            params: [launchSig, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]
        });
        const dev = tx.data.result.transaction.message.accountKeys[0].pubkey;
        performForensic(testMint, dev, true, msg.chat.id);
    } catch (e) {
        bot.sendMessage(msg.chat.id, "❌ Error: Address invalid ya Solana par nahi mila.");
    }
});

// --- 🛠️ ULTRA-STRICT FORENSIC ENGINE ---
async function performForensic(mint, devWallet, isManual = false, chatId = TELEGRAM_CHAT_ID) {
    try {
        // 1. Socials
        const asset = await axios.post(HELIUS_RPC, { jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint } });
        const meta = JSON.stringify(asset.data.result || "").toLowerCase();
        const hasSocials = meta.includes("t.me/") || meta.includes("x.com/") || meta.includes("twitter.com/");
        
        // 2. Budget (2.5 SOL)
        const balanceRes = await axios.post(HELIUS_RPC, { jsonrpc: "2.0", id: 1, method: "getBalance", params: [devWallet] });
        const solBalance = balanceRes.data.result.value / 1e9;

        // 3. History (50+ txns)
        const sigsRes = await axios.post(HELIUS_RPC, { jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [devWallet, { limit: 5 }] });
        const genesis = sigsRes.data.result[sigsRes.data.result.length - 1];
        const fundTx = await axios.post(HELIUS_RPC, { jsonrpc: "2.0", id: 1, method: "getTransaction", params: [genesis.signature, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }] });
        const funderWallet = fundTx.data.result.transaction.message.accountKeys[0].pubkey;
        const funderHistory = await axios.post(HELIUS_RPC, { jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [funderWallet, { limit: 100 }] });
        const txCount = funderHistory.data.result?.length || 0;

        // Decision Logic
        const passBudget = solBalance >= 2.5;
        const passHistory = txCount >= 50;

        if ((passBudget && passHistory && hasSocials) || isManual) {
            const status = (passBudget && passHistory && hasSocials) ? "✅ PASSED" : "❌ REJECTED";
            const tokenName = asset.data.result?.content?.metadata?.name || "Unknown";
            
            const report = `📊 *FORENSIC REPORT (${status})*\n\n` +
                           `🏷️ **Name:** ${tokenName}\n` +
                           `💰 **Budget:** ${solBalance.toFixed(2)} SOL ${passBudget ? '✅' : '❌ (Need 2.5)'}\n` +
                           `📈 **History:** ${txCount} txns ${passHistory ? '✅' : '❌ (Need 50+)'}\n` +
                           `🌐 **Socials:** ${hasSocials ? '✅' : '❌'}\n\n` +
                           `🔗 [Jupiter](https://jup.ag/swap/SOL-${mint}) | [DexScreener](https://dexscreener.com/solana/${mint})`;

            await bot.sendMessage(chatId, report, { parse_mode: 'Markdown', disable_web_page_preview: true });
        }
    } catch (e) { console.error(e); }
}

// Radar logic as before...
function startRadar() {
    const ws = new WebSocket('wss://pumpportal.fun/api/data');
    ws.on('open', () => ws.send(JSON.stringify({ "method": "subscribeNewToken" })));
    ws.on('message', async (data) => {
        const event = JSON.parse(data.toString());
        if (event.mint && !alertedMints.has(event.mint)) {
            alertedMints.add(event.mint);
            setTimeout(() => performForensic(event.mint, event.traderPublicKey), 60000);
        }
    });
    ws.on('close', () => setTimeout(startRadar, 3000));
}
startRadar();
