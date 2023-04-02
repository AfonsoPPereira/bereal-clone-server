import axios from 'axios';
import * as dotenv from 'dotenv';

import express from 'express';
import instance from './instance.js';
import auth, { BEREAL_AUTH_COOKIE, BEREAL_USER_INFO_COOKIE } from './middlewares/auth.js';
import {
    getAndSetUser,
    getFeedData,
    getUserFeedData,
    getUserAuthInfo,
    saveFeed,
    sendCookie,
    sendErrResponse,
    setRelationships,
    setSaveFeed,
    setUsers,
    getLatestUsersFeed
} from './util.js';

dotenv.config();

const router = express.Router();

router.post('/request-code', async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        const { vonageRequestId } = (
            await instance.post('https://auth.bereal.team/api/vonage/request-code', {
                deviceId: '1',
                phoneNumber
            })
        ).data;

        sendCookie(
            res,
            BEREAL_AUTH_COOKIE,
            JSON.stringify({ vonageRequestId }),

            {
                httpOnly: true
            }
        );

        res.json(null);
    } catch (error) {
        sendErrResponse(res, error);
    }
});

router.post('/login', async (req, res) => {
    try {
        const { vonageRequestId } = getUserAuthInfo(req);
        const { code } = req.body;
        const { token: tempToken, uid: userId } = (
            await instance.post('https://auth.bereal.team/api/vonage/check-code', {
                vonageRequestId,
                code
            })
        ).data;

        const { idToken: accessToken, refreshToken } = (
            await instance.post(
                // eslint-disable-next-line max-len
                `https://www.googleapis.com/identitytoolkit/v3/relyingparty/verifyCustomToken?key=${process.env.GOOGLE_API_KEY}`,
                {
                    token: tempToken,
                    returnSecureToken: true
                }
            )
        ).data;

        instance
            .get('https://mobile.bereal.com/api/relationships/friends', {
                headers: {
                    Authorization: `Bearer ${accessToken}`
                }
            })
            .then(({ data: { data: friendsData } }) => {
                setUsers(friendsData);
                setRelationships(friendsData, userId);
            });

        const { username, profilePicture } = await getAndSetUser(accessToken);

        sendCookie(
            res,
            BEREAL_USER_INFO_COOKIE,
            JSON.stringify({
                username,
                profilePicture,
                loggedInAt: Date.now()
            }),
            {
                signed: false
            }
        );

        sendCookie(
            res,
            BEREAL_AUTH_COOKIE,
            JSON.stringify({
                userId,
                accessToken,
                refreshToken
            }),
            {
                httpOnly: true
            }
        );

        res.json(null);
    } catch (error) {
        sendErrResponse(res, error);
    }
});

router.get('/feed', auth(), async (req, res) => {
    try {
        const userId = await setSaveFeed(req, res);

        res.json(await getFeedData(userId));
    } catch (error) {
        sendErrResponse(res, error);
    }
});

router.get('/users', auth(), async (req, res) => {
    try {
        const userId = await setSaveFeed(req, res);

        res.json(await getLatestUsersFeed(userId));
    } catch (error) {
        sendErrResponse(res, error);
    }
});

router.get('/user/:username', auth(), async (req, res) => {
    try {
        const { userId, accessToken } = getUserAuthInfo(req);
        const user = await getUserFeedData(userId, req.params.username);
        if (!user) throw new Error();

        await saveFeed({ accessToken }, false);

        res.json(user);
    } catch (error) {
        res.sendStatus(404);
    }
});

router.get('/download', auth(), async (req, res) => {
    const url = req.query?.url;
    const arrayBuffer = await axios.get(url, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(arrayBuffer.data, 'binary');
    const extension = arrayBuffer.headers?.['content-type'] || 'image/png';

    res.writeHead(200, {
        'Content-Type': extension,
        'Content-Length': buffer.length,
        'Content-Disposition': 'attachment'
    });
    res.end(buffer);
});

export default router;
