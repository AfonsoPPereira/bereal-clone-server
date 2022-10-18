import {
    DataTypes,
} from 'sequelize';
import sequelize from '../db.js';
import User from './User.js';
import Photo from './Photo.js';

const Relationship = sequelize.define('Relationship', {
    id: {
        type: DataTypes.BIGINT,
        autoIncrement: true,
        primaryKey: true,
    },
    user_id: {
        type: DataTypes.CHAR(64),
        allowNull: false,
    },
    target_user_id: {
        type: DataTypes.CHAR(64),
        allowNull: false,
    },
}, {
    tableName: 'relationships',
    underscored: true,
    indexes: [{
        unique: true,
        fields: ['user_id', 'target_user_id'],
    }, {
        unique: true,
        fields: ['target_user_id', 'user_id'],
    }],
});

Relationship.belongsTo(User, {
    foreignKey: 'user_id',
    targetKey: 'id',
});
Relationship.belongsTo(User, {
    foreignKey: 'target_user_id',
    targetKey: 'id',
});

Relationship.hasMany(Photo, {
    as: 'photos',
    sourceKey: 'target_user_id',
    foreignKey: 'user_id',
});

export default Relationship;
