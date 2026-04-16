require('dotenv').config();
const axios = require('axios');

const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;

const TEST_TOKENS = [
    "ACtfUWtgvaXrQGNMiohTusi5jcx5RJf5zwu9aAxkpump", // Elite ✅
    "BFiGUxnidogqcZAPVPDZRCfhx3nXnFLYqpQUaUGpump", // Elite ✅
    "DiNCVMS3GRSxrWSC4REh7VZeppQ3DEkx8UjJt4u94nHR"  // Rug ❌
];

async function runSocialDetector() {
    console.log("📡 TESTING UNIVERSAL SOCIAL DETECTOR...\n");

    for (let mint of TEST_TOKENS) {
        try {
            console.log(`🔍 Mint: ${mint}`);

            // STEP 1: Get Asset Data via Helius
            const assetRes = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint }
            });

            const assetData = assetRes.data.result;
            const content = assetData.content || {};
            const metadata = content.metadata || {};
            
            // Sab data ko aik lambi string mein badal do taake "search" asan ho
            const fullDataString = JSON.stringify(assetData).toLowerCase();

            // STEP 2: Multi-Layer Detection
            const links = {
                twitter: fullDataString.includes("twitter.com") || fullDataString.includes("x.com"),
                telegram: fullDataString.includes("t.me") || fullDataString.includes("telegram.me"),
                website: fullDataString.includes("http") && !fullDataString.includes("pump.fun") && !fullDataString.includes("ipfs")
            };

            const hasAnySocial = links.twitter || links.telegram || links.website;

            // STEP 3: Extra Depth Check (Metadata Description scan)
            let descriptionSocial = false;
            if (metadata.description) {
                const desc = metadata.description.toLowerCase();
                if (desc.includes("t.me") || desc.includes("twitter") || desc.includes("x.com")) {
                    descriptionSocial = true;
                }
            }

            console.log(`   ├ Twitter: ${links.twitter ? "✅" : "❌"}`);
            console.log(`   ├ Telegram: ${links.telegram ? "✅" : "❌"}`);
            console.log(`   ├ Website: ${links.website ? "✅" : "❌"}`);
            console.log(`   ├ Desc Link: ${descriptionSocial ? "✅" : "❌"}`);

            if (hasAnySocial || descriptionSocial) {
                console.log(`   🌟 VERDICT: ✅ SOCIALS DETECTED\n`);
            } else {
                console.log(`   ❌ VERDICT: GHOST TOKEN (No Socials)\n`);
            }

        } catch (e) {
            console.log(`   ❌ Error: Metadata fail or not found yet.\n`);
        }
        await new Promise(r => setTimeout(r, 1000));
    }
}

runSocialDetector();
