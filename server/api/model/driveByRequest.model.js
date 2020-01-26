'use strict';

export default function(sequelize, DataTypes) {
  return sequelize.define('DriveByRequest', {
    orderNumber: {
        type: DataTypes.STRING,
        allowNull: false,
        primaryKey: true
    },
    customerId: DataTypes.STRING,
    storeName: DataTypes.STRING,
    pickUpTime: DataTypes.STRING,
    pickUpDate: DataTypes.STRING,
    firstName: DataTypes.STRING,
    lastName: DataTypes.STRING,
    emailAddress: DataTypes.STRING,
    phoneNumber: DataTypes.STRING,
    modeOfTransport: DataTypes.STRING,
    transportColor: DataTypes.STRING,
    tileColor: DataTypes.STRING,
    licensePlateNumber: DataTypes.STRING,
    userAvatar: DataTypes.STRING,
    userAvatarS3Key: DataTypes.STRING,
    userAvatarUrlExpiration: DataTypes.DATE,
    originalUserAvatarS3Key: DataTypes.STRING,
    status: DataTypes.STRING,
    isRunningLate: DataTypes.BOOLEAN,
    customerNotification: DataTypes.STRING,
    requestDateTime: DataTypes.DATE,
    reRequestDateTime: DataTypes.DATE,
    actionDateTime: DataTypes.DATE,
    hereNowDateTime: DataTypes.DATE,
    deliveryInProgressDateTime: DataTypes.DATE,
    durationInSeconds: DataTypes.FLOAT,
    distanceInMeters: DataTypes.FLOAT,
    ratingValue: DataTypes.FLOAT,
    ratingText: DataTypes.STRING,
    ratingDateTime: DataTypes.DATE,
    deviceId: DataTypes.STRING,
    deviceType: DataTypes.STRING,
    appStatus: DataTypes.STRING,
    appVersion: DataTypes.STRING,
    notes: DataTypes.STRING,
    locationStatus: DataTypes.STRING,
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE
  },
    {
      freezeTableName: true
    });
}
