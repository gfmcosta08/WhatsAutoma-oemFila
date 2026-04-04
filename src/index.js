'use strict';

require('dotenv').config();
const config = require('./config');
const { createApp } = require('./createApp');
const { iniciar } = require('./scheduler');

const app = createApp();

const host = '0.0.0.0';
app.listen(config.port, host, () => {
  console.log(`HTTP em http://${host}:${config.port}`);
  iniciar();
});
