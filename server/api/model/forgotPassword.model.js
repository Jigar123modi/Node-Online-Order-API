'use strict';

export default function(sequelize, DataTypes) {
  return sequelize.define('ForgotPassword', {
      forgotPasswordId: {
        type: DataTypes.STRING,
        allowNull: false,
        primaryKey: true
      },
      userId: DataTypes.INTEGER,
      requestDateTime: DataTypes.DATE,
      isPasswordReset: DataTypes.BOOLEAN,
      resetDateTime: DataTypes.DATE,
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE
    },
    {
      freezeTableName: true
    });
}
