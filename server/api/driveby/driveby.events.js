/**
 * Driveby model events
 */

'use strict';

import {EventEmitter} from 'events';
var Driveby = require('../../sqldb').DriveByRequest;
var DrivebyEvents = new EventEmitter();

// Set max event listeners (0 == unlimited)
DrivebyEvents.setMaxListeners(0);

// Model events
var events = {
  afterCreate: 'save',
  afterUpdate: 'save',
  afterDestroy: 'remove'
};

// Register the event emitter to the model events
function registerEvents(Driveby) {
  for(var e in events) {
    let event = events[e];
    Driveby.hook(e, emitEvent(event));
  }
}

function emitEvent(event) {
  return function(doc, options, done) {
    DrivebyEvents.emit(event + ':' + doc._id, doc);
    DrivebyEvents.emit(event, doc);
    done(null);
  };
}

registerEvents(Driveby);
export default DrivebyEvents;
