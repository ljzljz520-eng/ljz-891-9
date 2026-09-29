const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Dealer = sequelize.define('Dealer', {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: '经销商名称'
    },
    storeNo: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'store_no',
      comment: '门店编号'
    },
    region: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: '门店所在区域'
    },
    parentAgent: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'parent_agent',
      comment: '上级代理'
    },
    contactPerson: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'contact_person',
      comment: '联系人'
    },
    contactPhone: {
      type: DataTypes.STRING(30),
      allowNull: true,
      field: 'contact_phone',
      comment: '联系电话'
    },
    contactEmail: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'contact_email',
      comment: '联系邮箱（用于接收资质邮件）'
    },
    activatedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'activated_at',
      comment: '开通时间'
    },
    status: {
      type: DataTypes.ENUM('active', 'suspended', 'closed'),
      allowNull: false,
      defaultValue: 'active',
      comment: '状态：active 正常 / suspended 暂停 / closed 关闭'
    },
    remark: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: '备注'
    }
  }, {
    tableName: 'dealers',
    comment: '经销商表',
    indexes: [
      { unique: true, fields: ['name', 'store_no'], name: 'uk_dealer_name_store' },
      { fields: ['store_no'] },
      { fields: ['name'] }
    ]
  });

  return Dealer;
};
