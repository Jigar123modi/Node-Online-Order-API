'use strict';

/* globals sinon, describe, expect, it */

var proxyquire = require('proxyquire').noPreserveCache();

var ddsCtrlStub = {
  show: 'ddsCtrl.ddsStartup'
};

var routerStub = {
  get: sinon.spy(),
  put: sinon.spy(),
  patch: sinon.spy(),
  post: sinon.spy(),
  delete: sinon.spy()
};

// require the index with our stubbed out modules
var ddsIndex = proxyquire('./index.js', {
  express: {
    Router() {
      return routerStub;
    }
  },
  './dds.controller': ddsCtrlStub
});

describe('Dds API Router:', function() {
  it('should return an express router instance', function() {
    expect(ddsIndex).to.equal(routerStub);
  });
  describe('GET /api/dds/startup/:storeName', function() {
    it('should route to dds.controller.ddsStartup', function() {
      expect(routerStub.get
        .withArgs('/:storeName', 'ddsCtrl.ddsStartup')
        ).to.have.been.calledOnce;
    });
  });
});
