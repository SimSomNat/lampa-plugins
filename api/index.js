export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const targetUrl = req.query.url;
  if (!targetUrl || !/rezka/i.test(targetUrl)) {
    return res.status(400).json({ ok: false, message: 'Invalid URL' });
  }

  try {
    const headers = {};
    if (req.headers['user-agent']) headers['User-Agent'] = req.headers['user-agent'];
    if (req.headers['accept-language']) headers['Accept-Language'] = req.headers['accept-language'];
    if (req.headers['x-cookie']) headers['Cookie'] = req.headers['x-cookie'];
    headers['Referer'] = req.headers['x-referer'] || 'https://rezka.ag/';

    if (targetUrl.includes('/ajax/')) {
      headers['X-Requested-With'] = 'XMLHttpRequest';
    }

    const response = await fetch(targetUrl, { headers });
    const bodyText = await response.text();
    const isAnubis = bodyText.includes('Anubis') || bodyText.includes('techaro.lol');
    const blocked = response.status === 403 || response.status === 404 || isAnubis;

    return res.status(200).json({
      ok: !blocked && response.ok,
      status: response.status,
      url: targetUrl,
      blocked,
      reason: isAnubis ? 'anubis' : response.status === 403 ? 'forbidden' : null,
      message: blocked ? `Rezka status ${response.status}` : null,
      body: blocked ? bodyText.slice(0, 2000) : bodyText
    });
  } catch (err) {
    return res.status(502).json({ ok: false, status: 502, blocked: true, message: err.message, body: '' });
  }
}
