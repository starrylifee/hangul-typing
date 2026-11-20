const { Firestore } = require('@google-cloud/firestore');
const { OAuth2Client } = require('google-auth-library');
const { projectId, apiKey } = require('../js/fb-config');

let connection, expires = 0;
async function rewardStore() {
  if (connection && Date.now() < expires) return connection;
  const response = await fetch('https://securetoken.googleapis.com/v1/token?key=' + apiKey, {
    method: 'POST', body: new URLSearchParams({
      grant_type: 'refresh_token', refresh_token: process.env.GROWND_WORKER_REFRESH_TOKEN
    })
  });
  if (!response.ok) throw new Error('지급 서버 인증을 확인해 주세요.');
  const token = await response.json();
  const authClient = new OAuth2Client();
  authClient.setCredentials({ access_token: token.id_token });
  connection = new Firestore({ projectId, authClient, preferRest: true });
  expires = Date.now() + (Number(token.expires_in) - 300) * 1000;
  return connection;
}
module.exports = rewardStore;
