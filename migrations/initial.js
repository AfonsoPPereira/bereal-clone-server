import sequelize from '../db';
/* import User from '../models/User';
import Relationship from '../models/Relationship';
import Photo from '../models/Photo'; */

await sequelize.sync({ alter: true });
