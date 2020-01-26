/**
 * Dds model events
 */

'use strict';

import {EventEmitter} from 'events';
var Dds = require('../../sqldb').DriveByRequest;
var DdsEvents = new EventEmitter();

// Set max event listeners (0 == unlimited)
DdsEvents.setMaxListeners(0);

// Model events
var events = {
  afterCreate: 'save',
  afterUpdate: 'save',
  afterDestroy: 'remove'
};

// Register the event emitter to the model events
function registerEvents(Dds) {
  for(var e in events) {
    let event = events[e];
    Dds.hook(e, emitEvent(event));
  }
}

function emitEvent(event) {
  return function(doc, options, done) {
    DdsEvents.emit(event + ':' + doc._id, doc);
    DdsEvents.emit(event, doc);
    done(null);
  };
}

registerEvents(Dds);
export default DdsEvents;
