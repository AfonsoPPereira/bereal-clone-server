export const BEREAL_AUTH_COOKIE = 'bereal-auth';
export const BEREAL_USER_INFO_COOKIE = 'bereal-user-info';

export const defaultCookieConfig = {
    secure: process.env.NODE_ENV !== 'development',
    signed: true,
    domain: process.env.DOMAIN || null
};

const auth = () => (req, res, next) => {
    try {
        const { userId, refreshToken, accessToken } = JSON.parse(
            req.signedCookies[BEREAL_AUTH_COOKIE]
        );

        if (!userId || !refreshToken || !accessToken) {
            throw new Error();
        }

        return next();
    } catch (error) {
        return res.status(403).send();
    }
};

export default auth;
