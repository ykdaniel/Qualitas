// Simple login API for Vercel serverless functions.
// This lets you demo the app without a real backend.
// Endpoint: POST /api/auth-login
//
// Expected body (application/x-www-form-urlencoded):
//   username=admin@example.com&password=admin

export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ detail: 'Method Not Allowed' });
  }

  let username = '';
  let password = '';

  // Vercel may give body as string (raw) or parsed object depending on content-type.
  if (typeof req.body === 'string') {
    const params = new URLSearchParams(req.body);
    username = params.get('username') || '';
    password = params.get('password') || '';
  } else if (req.body && typeof req.body === 'object') {
    username = req.body.username || '';
    password = req.body.password || '';
  }

  // Very simple demo credential check.
  if (username === 'admin@example.com' && password === 'admin') {
    return res.status(200).json({
      access_token: 'demo-access-token',
      refresh_token: 'demo-refresh-token',
      token_type: 'bearer',
    });
  }

  return res.status(401).json({ detail: 'Invalid username or password' });
}

