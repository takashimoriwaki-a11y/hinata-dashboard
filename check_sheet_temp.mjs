import { google } from 'googleapis';
import 'dotenv/config';

const SPREADSHEET_ID = '1iK46lv6sbEHsV4BgkeX6FEJRE-WRUCeqTgAM_vdqEig';

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });

try {
  const res = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sheetNames = res.data.sheets?.map(s => s.properties?.title) ?? [];
  console.log('Sheet tabs:', JSON.stringify(sheetNames));
  
  // 最初のシートのA1:J3を確認
  if (sheetNames.length > 0) {
    const valRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetNames[0]}!A1:J3`,
    });
    console.log('First sheet sample:', JSON.stringify(valRes.data.values));
  }
} catch (err) {
  console.error('Error:', err.message);
}
