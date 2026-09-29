require('dotenv').config();
const path = require('path');

const dialect = process.env.DB_DIALECT || 'mysql';

const common = {
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  define: {
    timestamps: true,
    underscored: false,
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci'
  }
};

let config;
if (dialect === 'sqlite') {
  config = {
    ...common,
    dialect: 'sqlite',
    storage: path.resolve(process.cwd(), process.env.SQLITE_PATH || './data/dealer.db')
  };
} else {
  config = {
    ...common,
    dialect: 'mysql',
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    database: process.env.DB_NAME || 'dealer_qualification',
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    pool: {
      max: Number(process.env.DB_POOL_MAX) || 10,
      min: Number(process.env.DB_POOL_MIN) || 2,
      acquire: 30000,
      idle: 10000
    },
    timezone: '+08:00'
  };
}

module.exports = config;
