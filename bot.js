require('dotenv').config();
const axios = require('axios');

const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;

const TEST_TOKENS = [
    "ACtfUWtgvaXrQGNMiohTusi5jcx5RJf5zwu9aAxkpump", // Real
    "BFiGUxnidogqcZAPVPDZRCfhx3nXnFLYqpQUaUGpump", // Real
    "8WXgE4GYHaPjyf4pujqx4293FhxK5u9GkDiFG3pppump" // Token from your screenshot
];

async function runFinalSocialDetector() {
    console.log("💎 JUNNI ELITE: FINAL SOCIAL SNIPER (V19)...\n");

    for (let mint of TEST_TOKENS) {
        try {
            console.log(`🔍 Mint: ${mint}`);

            const assetRes = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint }
            });

            const assetData = assetRes.data.result;
            const uri = assetData.content?.json_uri || "";
            
            // --- BACKUP: Direct JSON Fetch (Yeh kabhi jhoot nahi bolta) ---
            let externalData = {};
            if (uri) {
                try {
                    const jsonRes = await axios.get(uri, { timeout: 2000 });
                    externalData = jsonRes.data;
                } catch (e) { /* IPFS lag */ }
            }

            // --- 🔎 TARGETED DETECTION (No more schema.metaplex garbage) ---
            const fullDump = JSON.stringify({ assetData, externalData }).toLowerCase();

            // Sirf asli patterns ko allow karein
            const hasTG = fullDump.includes("t.me/") || fullDump.includes("telegram.me/");
            const hasX = fullDump.includes("twitter.com/") || fullDump.includes("x.com/");
            
            // Website check: Must have http but NOT be common technical links
            const webMatch = fullDump.match(/https?:\/\/(?!(pump\.fun|ipfs|arweave|schema\.metaplex|github|w3\.org))[a-zA-Z0-9.-]+\.[a-z]{2,}/g);
            const hasWeb = webMatch && webMatch.length > 0;

            console.log(`   ├ Telegram: ${hasTG ? "✅" : "❌"}`);
            console.log(`   ├ Twitter: ${hasX ? "✅" : "❌"}`);
            console.log(`   ├ Website: ${hasWeb ? "✅" : "❌"}`);

            if (hasTG || hasX || hasWeb) {
                console.log(`   🌟 VERDICT: ✅ PASS (Verified Socials Found)\n`);
            } else {
                console.log(`   ❌ VERDICT: FAIL (No Real Socials)\n`);
            }

        } catch (e) {
            console.log(`   ❌ Error: Link detection failed.\n`);
        }
        await new Promise(r => setTimeout(r, 1000));
    }
}

runFinalSocialDetector();
