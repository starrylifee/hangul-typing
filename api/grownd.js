const { initializeApp, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { projectId } = require('../js/fb-config');
const store = require('../server/reward-store');
const { handleRequest, drainQueue, RequestError } = require('../server/reward-requests');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      if (!process.env.CRON_SECRET || req.headers.authorization !== 'Bearer ' + process.env.CRON_SECRET)
        return res.status(401).json({ error: '인증이 필요합니다.' });
      return res.json(await drainQueue(await store()));
    }
    if (req.method !== 'POST') return res.status(405).end();
    const match = /^Bearer (\S+)$/.exec(req.headers.authorization || '');
    if (!match) return res.status(401).json({ error: '로그인이 필요합니다.' });
    if (!getApps().length) initializeApp({ projectId });
    const token = await getAuth().verifyIdToken(match[1]).catch(() => null);
    if (!token) return res.status(401).json({ error: '다시 로그인해 주세요.' });
    return res.json(await handleRequest(await store(), req.body || {}, token.uid));
  } catch (error) {
    if (error instanceof RequestError) return res.status(error.status).json({ error: error.message });
    console.error('Grownd request failed', error.code || error.name);
    return res.status(503).json({ error: '지급 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.' });
  }
};
