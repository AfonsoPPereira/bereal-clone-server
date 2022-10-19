import { Op } from 'sequelize';
import sequelize from './db.js';
import User from './models/User.js';
import Relationship from './models/Relationship.js';
import Photo from './models/Photo.js';
import instance from './instance.js';
import { BEREAL_AUTH_COOKIE } from './middlewares/auth.js';

export const sendErrResponse = (res, error) => {
    res.status(error?.response?.status ?? 403).send();
};

export const getUserAuthInfo = (req) => JSON.parse(req.signedCookies[BEREAL_AUTH_COOKIE]);

const getDataByUserQuery = (where) => ({
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

export const getDataByUser = async (userId) =>
    (await Relationship.findAll(getDataByUserQuery({ user_id: userId }))).map((el) =>
        el.get({ plain: true })
    );

export const getDataByUserForUser = async (userId, username) =>
    (
        await Relationship.findAll(
            getDataByUserQuery({
                [Op.and]: [
                    { user_id: userId },
                    sequelize.where(sequelize.col('User.username'), username)
                ]
            })
        )
    ).map((el) => el.get({ plain: true }))[0];

export const storeLatestFeed = (data) => {
    const date = new Date(data[data.length - 1].takenAt._seconds * 1000);

    return Photo.bulkCreate(
        data.map((photo) => ({
            id: photo.id,
            user_id: photo.ownerID,
            date,
            taken_at: new Date(photo.takenAt._seconds * 1000),
            details: photo
        })),
        {
            updateOnDuplicate: ['details']
        }
    );
};

export const storeLatestProfilePictures = (data) =>
    User.bulkCreate(
        data.map((user) => ({
            id: user.id,
            username: user.userName,
            profile_picture: user?.user?.profilePicture?.url
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
                target_user_id: user.id
            }))
        ],
        {
            ignoreDuplicates: true,
            fields: ['user_id', 'target_user_id']
        }
    );

export const fetchLatestContent = (accessToken) =>
    instance.get('https://mobile.bereal.com/api/feeds/friends', {
        headers: {
            Authorization: `Bearer ${accessToken}`
        }
    });

export const attemptLoginWithRefreshToken = (refreshToken) =>
    instance.post(`https://securetoken.googleapis.com/v1/token?key=${process.env.GOOGLE_API_KEY}`, {
        grantType: 'refresh_token',
        refreshToken
    });

export const saveFeed = async ({ accessToken, refreshToken }, retry = true) => {
    let feed = null;
    let newAccessToken = accessToken;

    try {
        feed = (await fetchLatestContent(newAccessToken)).data;
    } catch (error) {
        if (retry && refreshToken) {
            newAccessToken = (await attemptLoginWithRefreshToken(refreshToken)).data.access_token;
            feed = (await fetchLatestContent(newAccessToken)).data;
        }
    }

    if (feed) {
        storeLatestProfilePictures(feed);
        await storeLatestFeed(feed);
    }

    return newAccessToken;
};
