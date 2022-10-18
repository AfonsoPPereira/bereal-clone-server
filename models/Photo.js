import {
    DataTypes,
} from 'sequelize';
import sequelize from '../db.js';
import User from './User.js';

const Photo = sequelize.define('Photo', {
    id: {
        type: DataTypes.CHAR(64),
        primaryKey: true,
    },
    user_id: {
        type: DataTypes.CHAR(64),
        allowNull: false,
    },
    date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    taken_at: {
        type: DataTypes.DATE,
        allowNull: false,
    },
    details: {
        type: DataTypes.JSON,
    },
}, {
    tableName: 'photos',
    underscored: true,
    indexes: [{
        name: 'date_index',
        fields: [{ name: 'date', order: 'DESC' }],
    }, {
        name: 'taken_at_index',
        fields: [{ name: 'taken_at', order: 'DESC' }],
    }, {
        name: 'user_id_date_index',
        fields: ['user_id', 'date'],
        unique: true,
    }],
});

Photo.belongsTo(User, {
    foreignKey: 'user_id',
    targetKey: 'id',
});

export default Photo;
