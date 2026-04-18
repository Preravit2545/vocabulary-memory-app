import https from 'https';

const API_KEY = process.env.DASHSCOPE_API_KEY;
if (!API_KEY) {
  console.error('Error: DASHSCOPE_API_KEY environment variable is not set.');
  console.error('Usage: DASHSCOPE_API_KEY=sk-... node test-model.mjs');
  process.exit(1);
}

const models = ['qwen-plus', 'qwen-max', 'qwen-turbo', 'qwen-long'];

async function testModel(model) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'Say "ok"' }],
      max_tokens: 5,
    });

    const options = {
      hostname: 'dashscope-intl.aliyuncs.com',
      path: '/compatible-mode/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            resolve({ model, status: res.statusCode, error: json.error.message });
          } else {
            resolve({ model, status: res.statusCode, ok: true, reply: json.choices?.[0]?.message?.content });
          }
        } catch {
          resolve({ model, status: res.statusCode, raw: data.substring(0, 100) });
        }
      });
    });

    req.on('error', (e) => resolve({ model, error: e.message }));
    req.write(body);
    req.end();
  });
}

console.log('Testing models with key:', API_KEY.substring(0, 8) + '...\n');

for (const model of models) {
  const result = await testModel(model);
  console.log(JSON.stringify(result));
}
