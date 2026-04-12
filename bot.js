const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');

console.log('🔍 API DIAGNOSTIC BOT - Testing All Endpoints\n');

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
  console.error('❌ Missing environment variables!');
  process.exit(1);
}

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

async function sendAlert(msg) {
  try {
    await bot.sendMessage(TELEGRAM_CHAT_ID, msg, { parse_mode: 'HTML', disable_web_page_preview: true });
    console.log('✉️  Alert sent');
  } catch (e) {
    console.error('Alert error:', e.message);
  }
}

// Test each API endpoint
async function testPumpFun() {
  console.log('\n🧪 Testing Pump.fun API...');
  const endpoints = [
    'https://frontend-api.pump.fun/tokens/recent?pageSize=10',
    'https://frontend-api.pump.fun/tokens/recent',
    'https://api.pump.fun/tokens/recent',
  ];

  for (const endpoint of endpoints) {
    try {
      console.log(`   Testing: ${endpoint}`);
      const res = await axios.get(endpoint, { 
        timeout: 5000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      console.log(`   ✅ WORKS! Got ${res.data?.length || 'data'}`);
      return { status: 'working', endpoint: endpoint, data: res.data };
    } catch (e) {
      console.log(`   ❌ Failed: ${e.message.split('\n')[0]}`);
    }
  }
  return { status: 'failed' };
}

async function testRaydium() {
  console.log('\n🧪 Testing Raydium API...');
  const endpoints = [
    'https://api.raydium.io/v2/main/pools?pageSize=30',
    'https://api.raydium.io/v2/pools',
    'https://api.raydium.io/v2/sdk/liquidity/pools',
  ];

  for (const endpoint of endpoints) {
    try {
      console.log(`   Testing: ${endpoint}`);
      const res = await axios.get(endpoint, { timeout: 5000 });
      console.log(`   ✅ WORKS! Got ${res.data?.length || 'data'}`);
      return { status: 'working', endpoint: endpoint, data: res.data };
    } catch (e) {
      console.log(`   ❌ Failed: ${e.message.split('\n')[0]}`);
    }
  }
  return { status: 'failed' };
}

async function testDexScreener() {
  console.log('\n🧪 Testing DexScreener API (Solana)...');
  const endpoints = [
    'https://api.dexscreener.com/latest/dex/tokens/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA?chain=solana',
    'https://api.dexscreener.com/latest/dex/pairs/solana',
  ];

  for (const endpoint of endpoints) {
    try {
      console.log(`   Testing: ${endpoint}`);
      const res = await axios.get(endpoint, { timeout: 5000 });
      console.log(`   ✅ WORKS! Got response`);
      return { status: 'working', endpoint: endpoint, data: res.data };
    } catch (e) {
      console.log(`   ❌ Failed: ${e.message.split('\n')[0]}`);
    }
  }
  return { status: 'failed' };
}

async function testDexScreenerBSC() {
  console.log('\n🧪 Testing DexScreener API (BSC)...');
  const endpoints = [
    'https://api.dexscreener.com/latest/dex/tokens?chain=bsc&pageSize=30',
    'https://api.dexscreener.com/latest/dex/pairs/bsc',
  ];

  for (const endpoint of endpoints) {
    try {
      console.log(`   Testing: ${endpoint}`);
      const res = await axios.get(endpoint, { timeout: 5000 });
      console.log(`   ✅ WORKS! Got ${res.data?.pairs?.length || 'data'}`);
      return { status: 'working', endpoint: endpoint, data: res.data };
    } catch (e) {
      console.log(`   ❌ Failed: ${e.message.split('\n')[0]}`);
    }
  }
  return { status: 'failed' };
}

async function testPancakeSwap() {
  console.log('\n🧪 Testing PancakeSwap API...');
  const endpoints = [
    'https://api.pancakeswap.info/api/v2/pairs',
    'https://api.pancakeswap.info/api/v1/pairs',
  ];

  for (const endpoint of endpoints) {
    try {
      console.log(`   Testing: ${endpoint}`);
      const res = await axios.get(endpoint, { timeout: 5000 });
      console.log(`   ✅ WORKS! Got response`);
      return { status: 'working', endpoint: endpoint, data: res.data };
    } catch (e) {
      console.log(`   ❌ Failed: ${e.message.split('\n')[0]}`);
    }
  }
  return { status: 'failed' };
}

async function testSolanaPriceAPI() {
  console.log('\n🧪 Testing Solana Price API (Fallback)...');
  const endpoints = [
    'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
    'https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT',
  ];

  for (const endpoint of endpoints) {
    try {
      console.log(`   Testing: ${endpoint}`);
      const res = await axios.get(endpoint, { timeout: 5000 });
      console.log(`   ✅ WORKS!`);
      return { status: 'working', endpoint: endpoint };
    } catch (e) {
      console.log(`   ❌ Failed: ${e.message.split('\n')[0]}`);
    }
  }
  return { status: 'failed' };
}

// ==================== MAIN DIAGNOSTIC ====================

async function runDiagnostics() {
  console.log('════════════════════════════════════════');
  console.log('🔍 API DIAGNOSTIC TEST');
  console.log('════════════════════════════════════════\n');

  await sendAlert('🔍 <b>API DIAGNOSTIC TEST STARTING</b>\n\nTesting all endpoints...');
  await new Promise(r => setTimeout(r, 1000));

  const results = {
    pump_fun: await testPumpFun(),
    raydium: await testRaydium(),
    dexscreener_solana: await testDexScreener(),
    dexscreener_bsc: await testDexScreenerBSC(),
    pancakeswap: await testPancakeSwap(),
    solana_price: await testSolanaPriceAPI(),
  };

  // Create diagnostic report
  let report = '🔍 <b>DIAGNOSTIC RESULTS</b>\n\n';

  const working = Object.values(results).filter(r => r.status === 'working').length;
  const failed = Object.values(results).filter(r => r.status === 'failed').length;

  report += `<b>Summary:</b>\n`;
  report += `✅ Working: ${working}/6\n`;
  report += `❌ Failed: ${failed}/6\n\n`;

  report += `<b>Detailed Results:</b>\n\n`;

  report += `<b>1. Pump.fun</b>\n`;
  if (results.pump_fun.status === 'working') {
    report += `✅ WORKING\n`;
    report += `Endpoint: ${results.pump_fun.endpoint}\n\n`;
  } else {
    report += `❌ FAILED\n`;
    report += `❌ Try: Using fallback API\n\n`;
  }

  report += `<b>2. Raydium</b>\n`;
  if (results.raydium.status === 'working') {
    report += `✅ WORKING\n`;
    report += `Endpoint: ${results.raydium.endpoint}\n\n`;
  } else {
    report += `❌ FAILED\n`;
    report += `⚠️  May need authentication\n\n`;
  }

  report += `<b>3. DexScreener (Solana)</b>\n`;
  if (results.dexscreener_solana.status === 'working') {
    report += `✅ WORKING\n`;
    report += `Endpoint: ${results.dexscreener_solana.endpoint}\n\n`;
  } else {
    report += `❌ FAILED\n\n`;
  }

  report += `<b>4. DexScreener (BSC)</b>\n`;
  if (results.dexscreener_bsc.status === 'working') {
    report += `✅ WORKING\n`;
    report += `Endpoint: ${results.dexscreener_bsc.endpoint}\n\n`;
  } else {
    report += `❌ FAILED\n\n`;
  }

  report += `<b>5. PancakeSwap</b>\n`;
  if (results.pancakeswap.status === 'working') {
    report += `✅ WORKING\n`;
    report += `Endpoint: ${results.pancakeswap.endpoint}\n\n`;
  } else {
    report += `❌ FAILED\n\n`;
  }

  report += `<b>6. Solana Price (Fallback)</b>\n`;
  if (results.solana_price.status === 'working') {
    report += `✅ WORKING\n`;
    report += `Can use for testing\n\n`;
  } else {
    report += `❌ FAILED\n\n`;
  }

  // Send diagnostic report
  await sendAlert(report);
  await new Promise(r => setTimeout(r, 2000));

  // Recommendations
  let recommendations = '💡 <b>RECOMMENDATIONS</b>\n\n';

  if (working === 0) {
    recommendations += '❌ <b>CRITICAL:</b> No APIs working!\n\n';
    recommendations += '<b>Possible Causes:</b>\n';
    recommendations += '1️⃣ Network blocked on Railway\n';
    recommendations += '2️⃣ All APIs rate limited\n';
    recommendations += '3️⃣ Firewall restrictions\n\n';
    recommendations += '<b>Solutions:</b>\n';
    recommendations += '• Check Railway logs\n';
    recommendations += '• Use VPN/proxy\n';
    recommendations += '• Contact API providers\n';
    recommendations += '• Try self-hosted RPC\n';
  } else if (working >= 4) {
    recommendations += '✅ <b>GOOD:</b> Most APIs working!\n\n';
    recommendations += 'Bot should work fine.\n';
    recommendations += 'May need restart.\n';
  } else {
    recommendations += '⚠️ <b>PARTIAL:</b> Some APIs working\n\n';
    recommendations += 'Bot will work with limited coverage.\n';
    recommendations += 'Results may be incomplete.\n';
  }

  await sendAlert(recommendations);
  await new Promise(r => setTimeout(r, 1000));

  // Next steps
  let nextSteps = '🔧 <b>NEXT STEPS</b>\n\n';
  nextSteps += '1️⃣ Check Railway Logs:\n';
  nextSteps += '   Settings → Logs\n\n';
  nextSteps += '2️⃣ If network blocked:\n';
  nextSteps += '   Try different API endpoints\n\n';
  nextSteps += '3️⃣ If rate limited:\n';
  nextSteps += '   Add delays between requests\n\n';
  nextSteps += '4️⃣ Test locally first:\n';
  nextSteps += '   Run bot on your PC\n';

  await sendAlert(nextSteps);

  console.log('\n════════════════════════════════════════');
  console.log('✅ DIAGNOSTIC COMPLETE');
  console.log('════════════════════════════════════════\n');
  console.log(`Results: ${working}/6 APIs working\n`);

  // Recommendations in console
  if (working === 0) {
    console.log('❌ CRITICAL: No APIs working!');
    console.log('\nPossible causes:');
    console.log('1. Network blocked on Railway');
    console.log('2. All APIs rate limited');
    console.log('3. Firewall restrictions');
    console.log('\nTry:');
    console.log('- Check Railway network settings');
    console.log('- Use alternative API endpoints');
    console.log('- Run bot on your local PC first');
  } else {
    console.log(`✅ ${working} APIs working!`);
    console.log('\nBot should function.');
    console.log('If still no alerts, check:');
    console.log('- API response format');
    console.log('- Data availability');
  }
}

process.on('SIGINT', () => {
  console.log('\n👋 Shutdown');
  process.exit(0);
});

runDiagnostics().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
