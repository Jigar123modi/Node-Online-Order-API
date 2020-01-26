'use strict';

/* globals describe, expect, it, beforeEach */

var app = require('../..');
import request from 'supertest';

var newDds;

describe('DDS API:', function() {
  describe('GET /api/dds/startup/:storeName', function() {
    var dds;

    beforeEach(function(done) {
      request(app)
        .get(`/api/dds/startup/${newDds.storeName}`)
        .expect(200)
        .expect('Content-Type', /json/)
        .end((err, res) => {
          if(err) {
            return done(err);
          }
          dds = res.body;
          done();
        });
    });
    it('should respond with JSON array', function() {
      expect(dds).to.be.instanceOf(Array);
    });
  });
});
