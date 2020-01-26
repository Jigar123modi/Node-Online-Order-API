'use strict';

export default function(sequelize, DataTypes) {
  return sequelize.define('StoreUserRoles', {
      roleId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true
      },
      roleName: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
      },
      roleOrder: DataTypes.INTEGER,
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE
    },
    {
      freezeTableName: true
    });
}
