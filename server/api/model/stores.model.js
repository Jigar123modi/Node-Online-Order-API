'use strict';

export default function(sequelize, DataTypes) {
  return sequelize.define('Stores', {
      storeId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        primaryKey: true
      },
      storeName: DataTypes.STRING,
      latitude: DataTypes.STRING,
      longitude: DataTypes.STRING,
      deliveryZone: DataTypes.STRING,
      gmtOffset: DataTypes.STRING,
      wideGeofenceInMeters: DataTypes.INTEGER,
      frequencyOutsideInSecs: DataTypes.INTEGER,
      frequencyInsideInSecs: DataTypes.INTEGER,
      isActive: DataTypes.BOOLEAN,
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE
    },
    {
      freezeTableName: true
    });
}
