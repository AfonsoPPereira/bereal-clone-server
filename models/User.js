import { DataTypes } from 'sequelize';
import sequelize from '../db.js';

const User = sequelize.define(
    'User',
    {
        id: {
            type: DataTypes.CHAR(64),
            primaryKey: true
        },
        username: {
            type: DataTypes.CHAR(64),
            allowNull: false
        },
        phone: {
            type: DataTypes.CHAR(32)
        },
        fullname: {
            type: DataTypes.CHAR(64)
        },
        profile_picture: {
            type: DataTypes.TEXT
        }
    },
    {
        tableName: 'users',
        underscored: true,
        indexes: [
            {
                fields: ['username'],
                unique: true
            },
            {
                fields: ['phone'],
                unique: true
            }
        ]
    }
);

export default User;
