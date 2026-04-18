require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const axios = require('axios');

const TELEGRAM_TOKEN = "8758743414:AAGUbb0kA9fPMfU-diX7-lVVal7cxzOTqTM";
const TELEGRAM_CHAT_ID = "8006731872";
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=cad2ea55-0ae1-4005-8b8a-3b04167a57fb`;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: { autoStart: true } });
const HEADERS = { 'Content-Type': 'application/json' };

console.log('⏱️ V85 ONLINE: The "Pressure Cooker" Tracker (3-Min Delay)...');

async function checkSurvivor(mint, name) {
    try {
        console.log(`🔍 3-Min Forensic Check: ${name} (${mint.substring(0,6)}...)`);
        
        const holdersRes = await axios.post(HELIUS_RPC, { 
            jsonrpc: "2.0", id: 1, method: "getTokenLargestAccounts", params: [mint] 
        }, { headers: HEADERS });
        
        const holders = holdersRes.data.result.value;
        if (!holders || holders.length < 5) return;

        // Pump.fun tokens keep unsold supply in the curve (Top Holder #1)
        const curveSupply = (holders[0].uiAmount / 1000000000) * 100;
        
        // 🛑 FILTER 1: Agar 3 minute baad bhi curve 85% se zyada bhara hua hai, to volume nahi hai
        if (curveSupply > 85) {
            console.log(`❌ REJECTED: ${name} is slow. Curve still at ${curveSupply.toFixed(1)}%`);
            return;
        }

        let top10Sum = 0;
        holders.slice(1, 11).forEach(h => top10Sum += (h.uiAmount / 1000000000) * 100);

        // 🛑 FILTER 2: Safe Distribution Check
        if (top10Sum > 25) {
            console.log(`❌ REJECTED: ${name} has heavy Top 10 (${top10Sum.toFixed(1)}%)`);
            return;
        }

        const report = `🔥 **3-MIN SURVIVOR ALERT (FAST MOVER)** 🔥\n\n` +
                       `🏷️ **Name:** ${name}\n` +
                       `📉 **Curve Remaining:** ${curveSupply.toFixed(1)}% (Draining Fast!) 🚀\n` +
                       `👥 **Real Top 10:** ${top10Sum.toFixed(1)}% ✅\n\n` +
                       `🔗 [DexScreener](https://dexscreener.com/solana/${mint})`;
        
        await bot.sendMessage(TELEGRAM_CHAT_ID, report, { parse_mode: 'Markdown', disable_web_page_preview: true });
        console.log(`✅ ALERT SENT: ${name} is moving fast!`);

    } catch (e) { /* silent error to keep logs clean */ }
}

function startRadar() {
    const ws = new WebSocket('wss://pumpportal.fun/api/data');
    let tokenCount = 0;
    
    ws.on('open', () => {
        console.log('✅ Connected: Catching all new launches...');
        ws.send(JSON.stringify({ "method": "subscribeNewToken" })); // 100% Working Stream
    });

    ws.on('message', async (data) => {
        try {
            const event = JSON.parse(data.toString());
            
            // Check if it's a valid new token event
            if (event.mint && event.name) {
                tokenCount++;
                
                // Har 10 naye tokens ke baad log update hoga
                if (tokenCount % 10 === 0) {
                    console.log(`💓 [Heartbeat] Logged ${tokenCount} new tokens. Waiting for 3-min checks...`);
                }
                
                // Token ko exactly 3 minutes (180,000 miliseconds) ke liye delay mein daal dein
                setTimeout(() => checkSurvivor(event.mint, event.name), 180000);
            }
        } catch (e) {}
    });

    ws.on('error', (err) => console.log('WebSocket Error:', err.message));
    ws.on('close', () => {
        console.log('🔄 Connection closed. Reconnecting...');
        setTimeout(startRadar, 3000);
    });
}

startRadar();
