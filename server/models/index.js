const { Sequelize } = require('sequelize');
const dbConfig = require('../config/database');

const sequelize = new Sequelize(dbConfig);

const Admin = require('./Admin')(sequelize);
const Dealer = require('./Dealer')(sequelize);
const Authorization = require('./Authorization')(sequelize);
const QueryLog = require('./QueryLog')(sequelize);

// 关联关系
Dealer.hasMany(Authorization, { foreignKey: 'dealerId', as: 'authorizations', onDelete: 'CASCADE' });
Authorization.belongsTo(Dealer, { foreignKey: 'dealerId', as: 'dealer' });

Dealer.hasMany(QueryLog, { foreignKey: 'dealerId', as: 'queryLogs', onDelete: 'SET NULL' });
QueryLog.belongsTo(Dealer, { foreignKey: 'dealerId', as: 'dealer' });

const models = {
  sequelize,
  Sequelize,
  Admin,
  Dealer,
  Authorization,
  QueryLog
};

module.exports = models;
