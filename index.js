import * as dotenv from 'dotenv';

import express from 'express';
import compression from 'compression';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import router from './router.js';
import apiKeyAuth from './middlewares/apiKeyAuth.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 8888;

app.use(cors({ origin: true, credentials: true }));
app.use(compression());
app.use(helmet());
app.use(express.json());
app.use(cookieParser(process.env?.COOKIE_SECRET));

app.disable('x-powered-by');
/* app.set('etag', false); */

app.use(apiKeyAuth());

app.use('/api/v1', router);

app.listen(port, '0.0.0.0', () => {
    // eslint-disable-next-line no-console
    console.log(`App listening on port ${port}`);
});
