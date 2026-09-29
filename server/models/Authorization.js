const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Authorization = sequelize.define('Authorization', {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true
    },
    dealerId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      field: 'dealer_id',
      comment: '所属经销商'
    },
    brand: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: '授权品牌'
    },
    authorizedRegion: {
      type: DataTypes.STRING(200),
      allowNull: true,
      field: 'authorized_region',
      comment: '授权区域'
    },
    validFrom: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'valid_from',
      comment: '有效期开始'
    },
    validTo: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'valid_to',
      comment: '有效期结束'
    },
    status: {
      type: DataTypes.ENUM('active', 'expired', 'revoked'),
      allowNull: false,
      defaultValue: 'active',
      comment: '状态：active 有效 / expired 已过期 / revoked 已撤销'
    },
    remark: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: '备注'
    }
  }, {
    tableName: 'authorizations',
    comment: '品牌授权资质表',
    indexes: [
      { fields: ['dealer_id'] },
      { fields: ['brand'] },
      { fields: ['status'] }
    ]
  });

  return Authorization;
};
