'use strict';

/* globals describe, expect, it, beforeEach */

var app = require('../..');
import request from 'supertest';

var newDriveby;

describe('DriveBy API:', function() {
  describe('POST /api/driveby/request', function() {
    beforeEach(function(done) {
      request(app)
        .post('/api/driveby/request')
        .send({
          name: 'New Driveby',
          info: 'This is the brand new driveby!!!'
        })
        .expect(201)
        .expect('Content-Type', /json/)
        .end((err, res) => {
          if(err) {
            return done(err);
          }
          newDriveby = res.body;
          done();
        });
    });

    it('should respond with the newly created driveby', function() {
      expect(newDriveby.name).to.equal('New Driveby');
      expect(newDriveby.info).to.equal('This is the brand new driveby!!!');
    });
  });
});
