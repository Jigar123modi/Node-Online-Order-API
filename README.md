# DriveBy-API

This is a [Node.js](nodejs.org) API that used in GyG mobile app, DDS screen, DDS runner app for DriveBy functionality. 
It is using PubNub for socket connection to communicate between web, api and mobile device.

## Getting Started

### Prerequisites

- [Git](https://git-scm.com/)
- [Node.js and npm](nodejs.org) Node >= 4.x.x, npm >= 2.x.x
- [Gulp](http://gulpjs.com/) (`npm install --global gulp`)
- [Amazon Aurora Database](http://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Aurora.Overview.html)

### Developing

1. Run `npm install` to install server dependencies.

2. Run `gulp serve` to start the development server. It should automatically open the client in your browser when ready.

## Build & development

Run `gulp build` for building and `gulp serve` for preview.

## Testing

Running `npm test` will run the unit tests with karma.
