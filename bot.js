require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const axios = require('axios');

const TELEGRAM_TOKEN = "8758743414:AAGUbb0kA9fPMfU-diX7-lVVal7cxzOTqTM";
const TELEGRAM_CHAT_ID = "8006731872";
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=cad2ea55-0ae1-4005-8b8a-3b04167a57fb`;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: { autoStart: true, params: { timeout: 10 } } });
const alertedMints = new Set();

console.log('🛡️ V66 ONLINE: Manual Test + Balanced Rug Shield');

// --- 🧪 MANUAL TEST COMMAND ---
bot.onText(/\/test (.+)/, async (msg, match) => {
    const testMint = match[1].trim();
    bot.sendMessage(msg.chat.id, `🔍 *Manual Forensic Starting...*\nToken: \`${testMint.substring(0,8)}...\``, {parse_mode: 'Markdown'});
    
    try {
        const sigs = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [testMint]
        });
        if (!sigs.data.result.length) throw new Error("Not Found");
        
        const launchSig = sigs.data.result[sigs.data.result.length - 1].signature;
        const tx = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getTransaction",
            params: [launchSig, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]
        });
        const dev = tx.data.result.transaction.message.accountKeys[0].pubkey;
        
        // Run full forensic manually
        performForensic(testMint, dev, true, msg.chat.id);
    } catch (e) {
        bot.sendMessage(msg.chat.id, "❌ Error: Token address invalid ya data nahi mil raha.");
    }
});

// --- 🛠️ BALANCED FORENSIC ENGINE ---
async function performForensic(mint, devWallet, isManual = false, chatId = TELEGRAM_CHAT_ID) {
    try {
        // 1. Socials Check
        const asset = await axios.post(HELIUS_RPC, { jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint } });
        const meta = JSON.stringify(asset.data.result || "").toLowerCase();
        const hasSocials = meta.includes("t.me/") || meta.includes("x.com/") || meta.includes("twitter.com/");
        
        // 2. Budget Check (1.5 SOL)
        const balanceRes = await axios.post(HELIUS_RPC, { jsonrpc: "2.0", id: 1, method: "getBalance", params: [devWallet] });
        const solBalance = balanceRes.data.result.value / 1e9;

        // 3. Holder Check (Max 35% for Top 10)
        const holders = await axios.post(HELIUS_RPC, { jsonrpc: "2.0", id: 1, method: "getTokenLargestAccounts", params: [mint] });
        let top10Supply = 0;
        holders.data.result.value.slice(0, 10).forEach(h => top10Supply += (h.uiAmount / 1000000000) * 100);

        // 4. Dev Sell Check
        const devSigs = await axios.post(HELIUS_RPC, { jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [devWallet, { limit: 15 }] });
        const logs = JSON.stringify(devSigs.data.result).toLowerCase();
        const devDidSell = logs.includes("sell") || logs.includes("withdraw");

        // Logic Criteria
        const passAll = (solBalance >= 0.2) && (top10Supply <= 35) && hasSocials && !devDidSell;

        if (passAll || isManual) {
            const status = passAll ? "✅ PASSED" : "❌ REJECTED";
            const tokenName = asset.data.result?.content?.metadata?.name || "Unknown";
            
            const report = `📊 *FORENSIC REPORT (${status})*\n\n` +
                           `🏷️ **Name:** ${tokenName}\n` +
                           `💰 **Budget:** ${solBalance.toFixed(2)} SOL ${solBalance >= 0.2 ? '✅' : '❌'}\n` +
                           `👥 **Top 10:** ${top10Supply.toFixed(1)}% ${top10Supply <= 35 ? '✅' : '❌'}\n` +
                           `🛡️ **Dev Sell:** ${devDidSell ? '❌ Detected' : '✅ No Sell'}\n` +
                           `🌐 **Socials:** ${hasSocials ? '✅' : '❌'}\n\n` +
                           `🔗 [Jupiter](https://jup.ag/swap/SOL-${mint}) | [DexScreener](https://dexscreener.com/solana/${mint})`;

            await bot.sendMessage(chatId, report, { parse_mode: 'Markdown', disable_web_page_preview: true });
        }
    } catch (e) { console.error("Forensic Error:", e); }
}

// Radar logic
function startRadar() {
    const ws = new WebSocket('wss://pumpportal.fun/api/data');
    ws.on('open', () => ws.send(JSON.stringify({ "method": "subscribeNewToken" })));
    ws.on('message', async (data) => {
        const event = JSON.parse(data.toString());
        if (event.mint && !alertedMints.has(event.mint)) {
            alertedMints.add(event.mint);
            // 60 seconds wait for socials and dev activity
            setTimeout(() => performForensic(event.mint, event.traderPublicKey), 60000);
        }
    });
    ws.on('close', () => setTimeout(startRadar, 3000));
}
startRadar();
