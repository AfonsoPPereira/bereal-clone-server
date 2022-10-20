import axios from 'axios';
import * as dotenv from 'dotenv';

import express from 'express';
import instance from './instance.js';
import auth, {
    BEREAL_AUTH_COOKIE,
    BEREAL_USER_INFO_COOKIE,
    defaultCookieConfig
} from './middlewares/auth.js';
import {
    getAndSetUser,
    getDataByUser,
    getDataByUserForUser,
    getUserAuthInfo,
    saveFeed,
    sendErrResponse,
    setRelationships,
    setUsers
} from './util.js';

dotenv.config();

const router = express.Router();

const sendCookie = (res, name, val, options = {}) =>
    res.cookie(name, val, {
        ...defaultCookieConfig,
        ...options
    });

const logout = (res) => {
    res.clearCookie(BEREAL_AUTH_COOKIE, defaultCookieConfig);
    res.clearCookie(BEREAL_USER_INFO_COOKIE, defaultCookieConfig);
};

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
        const feedReq = getUserAuthInfo(req);
        const { userId, refreshToken } = feedReq;
        let { accessToken } = feedReq;

        accessToken = await saveFeed({ refreshToken, accessToken });

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

        res.json(await getDataByUser(userId));
    } catch (error) {
        logout(res);

        sendErrResponse(res, error);
    }
});

router.get('/user/:username', auth(), async (req, res) => {
    try {
        const { userId, accessToken } = getUserAuthInfo(req);
        const user = await getDataByUserForUser(userId, req.params.username);
        if (!user) throw new Error();

        await saveFeed({ accessToken }, false);

        res.json(user);
    } catch (error) {
        res.sendStatus(404);
    }
});

router.post('/logout', auth(), (req, res) => {
    try {
        logout(res);
        res.json(null);
    } catch (error) {
        sendErrResponse(res, error);
    }
});

router.get('/download', auth(), async (req, res) => {
    const url = req.query?.url;
    const arrayBuffer = await axios.get(url, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(arrayBuffer.data, 'base64');

    res.writeHead(200, {
        'Content-Type': 'image/png',
        'Content-Length': buffer.length,
        'Content-Disposition': 'attachment'
    });
    res.end(buffer);
});

export default router;
