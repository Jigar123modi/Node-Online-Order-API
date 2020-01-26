'use strict';

export default function(sequelize, DataTypes) {
  return sequelize.define('StoreUsers', {
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true
      },
      userName: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
      },
      storeId: DataTypes.INTEGER,
      emailAddress: DataTypes.STRING,
      roleId: DataTypes.INTEGER,
      password: DataTypes.STRING,
      firstName: DataTypes.STRING,
      lastName: DataTypes.STRING,
      userAvatar: DataTypes.STRING,
      userAvatarS3Key: DataTypes.STRING,
      userAvatarUrlExpiration: DataTypes.DATE,
      originalUserAvatarS3Key: DataTypes.STRING,
      isActive: DataTypes.BOOLEAN,
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE
    },
    {
      freezeTableName: true
    });
}
