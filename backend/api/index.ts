// Entry point khusus Vercel (serverless) -- bungkus Express app yang
// sama persis dipakai `npm start`/Render, jadi satu app, dua cara jalan.
import serverless from 'serverless-http';
import { app } from '../src/app';

export default serverless(app);
