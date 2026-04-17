require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const axios = require('axios');

const TELEGRAM_TOKEN = "8758743414:AAGUbb0kA9fPMfU-diX7-lVVal7cxzOTqTM";
const TELEGRAM_CHAT_ID = "8006731872";
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=cad2ea55-0ae1-4005-8b8a-3b04167a57fb`;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: { autoStart: true, params: { timeout: 10 } } });
const alertedMints = new Set();

console.log('🛡️ V65 ONLINE: Balanced Budget (1.5 SOL) + Rug Shield');

async function performForensic(mint, devWallet) {
    try {
        // 1. Socials Check (Must have)
        const asset = await axios.post(HELIUS_RPC, { jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint } });
        const meta = JSON.stringify(asset.data.result || "").toLowerCase();
        const hasSocials = meta.includes("t.me/") || meta.includes("x.com/") || meta.includes("twitter.com/");
        if (!hasSocials) return;

        // 2. Budget Check (Wapas 1.5 SOL par)
        const balanceRes = await axios.post(HELIUS_RPC, { jsonrpc: "2.0", id: 1, method: "getBalance", params: [devWallet] });
        const solBalance = balanceRes.data.result.value / 1e9;
        if (solBalance < 1.5) return; 

        // 3. ANTI-RUG: Top Holders Check (Max 35% among Top 10)
        const holders = await axios.post(HELIUS_RPC, { jsonrpc: "2.0", id: 1, method: "getTokenLargestAccounts", params: [mint] });
        let top10Supply = 0;
        holders.data.result.value.slice(0, 10).forEach(h => top10Supply += (h.uiAmount / 1000000000) * 100);
        if (top10Supply > 35) return; 

        // 4. ANTI-RUG: Dev "Paper Hand" Check (Check if Dev sold already)
        const devSigs = await axios.post(HELIUS_RPC, { jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [devWallet, { limit: 15 }] });
        const logs = JSON.stringify(devSigs.data.result).toLowerCase();
        if (logs.includes("sell") || logs.includes("withdraw")) return;

        // 5. SEND ELITE ALERT
        const tokenName = asset.data.result?.content?.metadata?.name || "Unknown";
        const msg = `💎 *BALANCED GEM SIGNAL (V65)*\n\n` +
                    `🏷️ **Name:** \`${tokenName}\`\n` +
                    `💰 **Dev Budget:** ${solBalance.toFixed(2)} SOL ✅\n` +
                    `👥 **Top 10 Holders:** ${top10Supply.toFixed(1)}% (Safe)\n` +
                    `🛡️ **Anti-Rug:** Verified Clean\n\n` +
                    `🔗 [Jupiter](https://jup.ag/swap/SOL-${mint}) | [DexScreener](https://dexscreener.com/solana/${mint})`;

        await bot.sendMessage(TELEGRAM_CHAT_ID, msg, { parse_mode: 'Markdown', disable_web_page_preview: true });

    } catch (e) { }
}

function startRadar() {
    const ws = new WebSocket('wss://pumpportal.fun/api/data');
    ws.on('open', () => ws.send(JSON.stringify({ "method": "subscribeNewToken" })));
    ws.on('message', async (data) => {
        const event = JSON.parse(data.toString());
        if (event.mint && !alertedMints.has(event.mint)) {
            alertedMints.add(event.mint);
            // 60 Seconds Wait (Ideal for 1.5 SOL tokens)
            setTimeout(() => performForensic(event.mint, event.traderPublicKey), 60000);
        }
    });
    ws.on('close', () => setTimeout(startRadar, 3000));
}

startRadar();
