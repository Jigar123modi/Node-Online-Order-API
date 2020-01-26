'use strict';

export default function(sequelize, DataTypes) {
  return sequelize.define('Locations', {
      id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true
      },
      orderNumber: DataTypes.STRING,
      customerId: DataTypes.STRING,
      latitude: DataTypes.STRING,
      longitude: DataTypes.STRING,
      sequence: DataTypes.INTEGER,
      durationInSeconds: DataTypes.FLOAT,
      distanceInMeters: DataTypes.FLOAT,
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE
    },
    {
      freezeTableName: true
    });
}
