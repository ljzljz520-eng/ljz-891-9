const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const QueryLog = sequelize.define('QueryLog', {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true
    },
    dealerId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      field: 'dealer_id',
      comment: '命中的经销商（未命中为空）'
    },
    queryName: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: '查询输入的名称'
    },
    queryStoreNo: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: '查询输入的门店编号'
    },
    hit: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: '是否命中'
    },
    ip: {
      type: DataTypes.STRING(64),
      allowNull: true,
      comment: '查询者 IP'
    },
    userAgent: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'user_agent',
      comment: '浏览器 UA'
    }
  }, {
    tableName: 'query_logs',
    comment: '公开查询日志',
    indexes: [
      { fields: ['dealer_id'] },
      { fields: ['createdAt'] }
    ]
  });

  return QueryLog;
};
