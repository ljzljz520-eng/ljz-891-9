const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');

module.exports = (sequelize) => {
  const Admin = sequelize.define('Admin', {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true
    },
    username: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      comment: '登录用户名'
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'bcrypt 加密密码'
    },
    email: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: '联系邮箱'
    },
    role: {
      type: DataTypes.ENUM('super_admin', 'admin'),
      allowNull: false,
      defaultValue: 'admin',
      comment: '角色：super_admin 超级管理员 / admin 普通管理员'
    },
    status: {
      type: DataTypes.ENUM('active', 'disabled'),
      allowNull: false,
      defaultValue: 'active',
      comment: '账号状态'
    },
    lastLoginAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: '最后登录时间'
    },
    remark: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: '备注'
    }
  }, {
    tableName: 'admins',
    comment: '管理员表',
    hooks: {
      beforeCreate: async (admin) => {
        if (admin.password) {
          admin.password = await bcrypt.hash(admin.password, 10);
        }
      },
      beforeUpdate: async (admin) => {
        if (admin.changed('password')) {
          admin.password = await bcrypt.hash(admin.password, 10);
        }
      }
    }
  });

  Admin.prototype.validatePassword = async function (plainPassword) {
    return bcrypt.compare(plainPassword, this.password);
  };

  Admin.prototype.toSafeJSON = function () {
    const { id, username, email, role, status, lastLoginAt, remark, createdAt, updatedAt } = this;
    return { id, username, email, role, status, lastLoginAt, remark, createdAt, updatedAt };
  };

  return Admin;
};
