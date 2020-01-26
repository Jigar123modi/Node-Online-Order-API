/**
 * Amazon S3 Bucket helper module for upload files to amazon s3 bucket
 */

'use strict';

import AWS from 'aws-sdk';
import awsConfig from 'aws-config';
import config from '../config/environment';
import moment from 'moment';
import sharp from 'sharp';

function AwsS3Helper() {
  AWS.config = awsConfig({
    region: config.awsS3Bucket.region,                    // explicitly set AWS region
    sslEnabled: true,                                     // override whether SSL is enabled
    maxRetries: 3,                                        // override the number of retries for a request
    accessKeyId: config.awsS3Bucket.accessKeyId,          // can omit access key and secret key
    secretAccessKey: config.awsS3Bucket.secretAccessKey,  // if relying on a profile or IAM
    timeout: 15000                                        // optional timeout in ms. Will use AWS_TIMEOUT
  });
}

// class methods
AwsS3Helper.prototype.createAndUploadThumbnail = function(bucketName, imageName, imageFile) {
  return new Promise(function (resolve, reject) {
    var s3Bucket = new AWS.S3({params: {Bucket: bucketName}});
    var inputBuffer = imageFile.data;

    sharp(inputBuffer)
      .resize(250, 250)
      .max()
      .toBuffer()
      .then(buffer => {
        var s3data = {
          Key: imageName,
          Body: buffer,
          ContentType: imageFile.type
        };

        s3Bucket.putObject(s3data, function (err, data) {
          if (err) {
            return reject(err);
          } else {
            return resolve(data);
          }
        });
      })
      .catch(err => {
        console.log(err);
      });
  })
};

// class methods
AwsS3Helper.prototype.UploadFile = function(bucketName, imageName, imageFile) {
  return new Promise(function (resolve, reject) {
    var s3Bucket = new AWS.S3({params: {Bucket: bucketName}});
    var s3data = {
      Key: imageName,
      Body: imageFile.data,
      ContentType: imageFile.type
    };

    s3Bucket.putObject(s3data, function (err, data) {
      if (err) {
        return reject(err);
      } else {
        return resolve(data);
      }
    });
  });
};

// class methods
AwsS3Helper.prototype.getFileUrl = function(bucketName, imageName) {
  return new Promise(function (resolve, reject) {
    var s3Bucket = new AWS.S3({params: {Bucket: bucketName}});
    var expiresTimeInSeconds = 60 * 60 * 24 * 7; //7 days
    var urlExpiration = moment(Date.now()).add(expiresTimeInSeconds, 'seconds');
    var urlParams = {Bucket: bucketName, Key: imageName, Expires: expiresTimeInSeconds};
    s3Bucket.getSignedUrl('getObject', urlParams, function (err, url) {
      if (err) {
        return reject(err);
      }
      else {
        return resolve({url, urlExpiration});
      }
    });
  });
};

// class methods
AwsS3Helper.prototype.checkBucketExistsOrCreate = function(bucketName) {
  return new Promise(function (resolve, reject) {
    try {
      var s3Bucket = new AWS.S3({params: {Bucket: bucketName}});
      // This operation checks to see if a bucket exists
      var params = {
        Bucket: bucketName
      };
      s3Bucket.headBucket(params, function (err, data) {
        if (err) { // an error occurred
          //If bucket not exists create new bucket with that bucketName
          this.createBucket(bucketName)
            .then(function (data) {
              return resolve(data);
            })
            .catch(function (err) {
              return reject(err);
            });
        }
        else { // successful response
          return resolve(data);
        }
      });
    }
    catch (ex) {
      return reject({err: ex});
    }
  });
};

// class methods
AwsS3Helper.prototype.getBucketList = function() {
  // Create S3 service object
  var s3 = new AWS.S3();
  // Call S3 to list current buckets
  s3.listBuckets(function (err, data) {
    if (err) {
      console.log("Error", err);
    } else {
      console.log("Bucket List", data.Buckets);
    }
  });
};

// class methods
AwsS3Helper.prototype.createBucket = function(bucketName) {
  return new Promise(function (resolve, reject) {
    // Create S3 service object
    var s3 = new AWS.S3();
    // Create the parameters for calling createBucket
    var bucketParams = {
      Bucket: bucketName
    };

    // Call S3 to create the bucket
    s3.createBucket(bucketParams, function (err, data) {
      if (err) {
        return reject(err);
      } else {
        return resolve(data);
      }
    });
  });
};

// export the class
module.exports = AwsS3Helper;
