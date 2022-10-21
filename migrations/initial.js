// import sequelize from '../db.js';
import User from '../models/User.js';
import Relationship from '../models/Relationship.js';
import Photo from '../models/Photo.js';

await User.sync({ force: true });
await Relationship.sync({ force: true });
await Photo.sync({ force: true });
