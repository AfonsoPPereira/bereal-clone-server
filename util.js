import { Op } from 'sequelize';
import sequelize from './db.js';
import User from './models/User.js';
import Relationship from './models/Relationship.js';
import Photo from './models/Photo.js';
import instance from './instance.js';
import { BEREAL_AUTH_COOKIE, defaultCookieConfig } from './middlewares/auth.js';

export const sendErrResponse = (res, error) => {
    // console.error(error);
    res.status(error?.response?.status ?? 500).send();
};

export const sendCookie = (res, name, val, options = {}) =>
    res.cookie(name, val, {
        ...defaultCookieConfig,
        ...options
    });

export const getUserAuthInfo = (req) => JSON.parse(req.signedCookies[BEREAL_AUTH_COOKIE]);

const getUserFeedDataCommon = (where) => ({
    attributes: [
        ['target_user_id', 'id'],
        [sequelize.col('User.profile_picture'), 'profilePicture'],
        [sequelize.col('User.username'), 'username']
    ],
    include: [
        {
            model: User,
            foreignKey: 'user_id',
            attributes: []
        },
        {
            model: Photo,
            as: 'photos',
            attributes: [
                'id',
                [sequelize.json('details.photoURL'), 'photoURL'],
                [sequelize.json('details.secondaryPhotoURL'), 'secondaryPhotoURL'],
                [sequelize.json('details.caption'), 'caption'],
                'date',
                [sequelize.fn('unix_timestamp', sequelize.col('taken_at')), 'takenAt']
            ]
        }
    ],
    where,
    order: [['photos', 'taken_at', 'DESC']]
});

export const getLatestUsersFeed = async (userId) =>
    (
        await Relationship.findAll({
            attributes: [
                ['target_user_id', 'id'],
                [sequelize.col('User.profile_picture'), 'profilePicture'],
                [sequelize.col('User.username'), 'username']
            ],
            include: [
                {
                    model: User,
                    foreignKey: 'user_id',
                    attributes: []
                },
                {
                    model: Photo,
                    as: 'photos',
                    attributes: []
                }
            ],
            where: {
                user_id: userId
            },
            order: [['photos', 'taken_at', 'DESC']]
        })
    ).map((el) => el.get({ plain: true }));

export const getFeedData = async (userId) =>
    (await Relationship.findAll(getUserFeedDataCommon({ user_id: userId }))).map((el) =>
        el.get({ plain: true })
    );

export const getUserFeedData = async (userId, username) =>
    (
        await Relationship.findAll(
            getUserFeedDataCommon({
                [Op.and]: [
                    { user_id: userId },
                    sequelize.where(sequelize.col('User.username'), username)
                ]
            })
        )
    ).map((el) => el.get({ plain: true }))[0];

export const storeLatestFeed = (feed) => Photo.bulkCreate(
    feed.map((photo) => ({
        id: photo.id,
        user_id: photo.user.id,
        date: photo.takenAt,
        taken_at: photo.takenAt,
        details: photo
    })),
    { updateOnDuplicate: ['details', 'taken_at'] }
);

export const storeFeedUsers = (feed) =>
    User.bulkCreate(
        feed.map((photo) => ({
            id: photo.user?.id,
            username: photo.user.username,
            profile_picture: photo.user?.profilePicture?.url
        })),
        {
            updateOnDuplicate: ['profile_picture']
        }
    );

export const getAndSetUser = async (accessToken) => {
    const {
        id,
        username,
        phoneNumber,
        fullname,
        profilePicture: { url: profilePicture }
    } = (
        await instance.get('https://mobile.bereal.com/api/person/me', {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        })
    ).data;

    User.upsert({
        id,
        username,
        phone: phoneNumber,
        fullname,
        profile_picture: profilePicture
    });

    return {
        userId: id,
        username,
        phoneNumber,
        fullname,
        profilePicture
    };
};

export const setUsers = (friendsData) =>
    User.bulkCreate(
        friendsData.map((user) => ({
            id: user.id,
            username: user.username,
            fullname: user.fullname,
            profile_picture: user?.profilePicture?.url || null
        })),
        {
            updateOnDuplicate: ['username', 'fullname']
        }
    );

export const setRelationships = (friendsData, userId) =>
    Relationship.bulkCreate(
        [
            {
                user_id: userId,
                target_user_id: userId
            },
            ...friendsData.map((user) => ({
                user_id: userId,
                target_user_id: user?.user?.id ?? user.id
            }))
        ],
        {
            ignoreDuplicates: true,
            fields: ['user_id', 'target_user_id']
        }
    );

export const fetchLatestContent = (accessToken) =>
    instance.get('https://mobile.bereal.com/api/feeds/friends-v1', {
        headers: {
            Authorization: `Bearer ${accessToken}`
        }
    });

export const attemptLoginWithRefreshToken = async (refreshToken) => {
    const { id_token: idToken } = (
        await instance.post(
            // eslint-disable-next-line max-len
            `https://securetoken.googleapis.com/v1/token?key=${process.env.GOOGLE_API_KEY}`,
            {
                grantType: 'refresh_token',
                refreshToken
            }
        )
    ).data;

    const { access_token: accessToken } = (
        await instance.post(
            // eslint-disable-next-line max-len
            'https://auth.bereal.team/token?grant_type=firebase',
            {
                grant_type: 'firebase',
                client_id: process.env.CLIENT_ID,
                client_secret: process.env.CLIENT_SECRET,
                token: idToken
            }
        )
    ).data;

    return { accessToken, idToken };
};

export const saveFeed = async ({ userId, accessToken, refreshToken }, retry = true) => {
    let data = null;
    let newAccessToken = accessToken;

    try {
        data = (await fetchLatestContent(newAccessToken)).data;
    } catch (error) {
        if (retry && refreshToken) {
            newAccessToken = (await attemptLoginWithRefreshToken(refreshToken))?.accessToken;
            data = (await fetchLatestContent(newAccessToken)).data;
        }
    }

    if (!data) return newAccessToken;

    const feed = data.friendsPosts.flatMap(user => user.posts.map(
        post => ({
            user: user.user,
            photoURL: post.primary.url,
            secondaryPhotoURL: post.secondary.url,
            ...post
        })
    ));

    await storeFeedUsers(feed);
    await setRelationships(feed, userId);
    await storeLatestFeed(feed);

    return newAccessToken;
};

export const setSaveFeed = async (req, res) => {
    const feedReq = getUserAuthInfo(req);
    const { userId, refreshToken } = feedReq;
    let { accessToken } = feedReq;

    accessToken = await saveFeed({ userId, refreshToken, accessToken });

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

    return userId;
};
