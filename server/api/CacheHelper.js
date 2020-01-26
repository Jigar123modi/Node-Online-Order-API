/**
 * Cache helper module for manage in memory cache
 */

'use strict';

const NodeCache = require( "node-cache" );

//Global PubNub object
var storeCache = null;

function CacheHelper() {
  // always initialize all instance properties
  if(!storeCache) {
    storeCache = new NodeCache();
  }
}

// class methods
CacheHelper.prototype.setCache = function(key,valueObj) {
  storeCache.del(key);
  let result = storeCache.set(key, valueObj, 43200);
  return result;
};

CacheHelper.prototype.getCache = function(key) {
  let value = storeCache.get(key);
  if (!value){
    value = null;
  }

  return value;
};

CacheHelper.prototype.delCache = function(key) {
  let value = storeCache.del(key);
  return value;
};

// export the class
module.exports = CacheHelper;
