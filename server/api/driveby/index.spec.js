'use strict';

/* globals sinon, describe, expect, it */

var proxyquire = require('proxyquire').noPreserveCache();

var drivebyCtrlStub = {
  create: 'drivebyCtrl.newDriveByRequest'
};

var routerStub = {
  get: sinon.spy(),
  put: sinon.spy(),
  patch: sinon.spy(),
  post: sinon.spy(),
  delete: sinon.spy()
};

// require the index with our stubbed out modules
var drivebyIndex = proxyquire('./index.js', {
  express: {
    Router() {
      return routerStub;
    }
  },
  './driveby.controller': drivebyCtrlStub
});

describe('DriveBy API Router:', function() {
  it('should return an express router instance', function() {
    expect(drivebyIndex).to.equal(routerStub);
  });
  describe('POST /api/driveby/request', function() {
    it('should route to driveby.controller.newDriveByRequest', function() {
      expect(routerStub.post
        .withArgs('/', 'drivebyCtrl.newDriveByRequest')
        ).to.have.been.calledOnce;
    });
  });
});
