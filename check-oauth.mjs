import 'dotenv/config';

const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

console.log('GOOGLE_OAUTH_CLIENT_ID:', clientId ? clientId.substring(0, 20) + '...' : 'NOT SET');
console.log('GOOGLE_OAUTH_CLIENT_SECRET:', clientSecret ? clientSecret.substring(0, 10) + '...' : 'NOT SET');

if (!clientId || !clientSecret) {
  console.error('ERROR: Google OAuth credentials are not set');
  process.exit(1);
}

// Validate format
if (!clientId.endsWith('.apps.googleusercontent.com')) {
  console.error('ERROR: Invalid client ID format');
  process.exit(1);
}

if (!clientSecret.startsWith('GOCSPX-')) {
  console.error('ERROR: Invalid client secret format');
  process.exit(1);
}

console.log('✓ Both Google OAuth credentials are set and have valid format');
